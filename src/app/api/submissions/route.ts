import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  alunos,
  alternativas,
  aplicacoes,
  escolas,
  matriculas,
  provas,
  questoes,
  respostasAlunos,
  resultados,
  turmas,
} from "@/db/schema";
import { isExamClosed } from "@/lib/utils";
import { getSessionAluno } from "@/lib/auth";

const ANO_LETIVO = 2026;

type AnswerInput = { questaoId: number; alternativaId?: number | null; textoResposta?: string };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Identifica violação de unicidade do Postgres (SQLSTATE 23505). */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "23505"
  );
}

/** Recebe as respostas do aluno, corrige automaticamente múltipla escolha e salva o resultado. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};

  const codigo = asText(body.codigo).toUpperCase();
  const submittedAlunoId = typeof body.alunoId === "string" ? body.alunoId.trim() : "";
  const submittedTurmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";

  if (!codigo) return NextResponse.json({ error: "Código da prova inválido." }, { status: 400 });

  // Identidade do aluno: sessão do aluno OU par (alunoId, turmaId) conferido no
  // banco escolar. Não existe mais envio com nome/turma/escola em texto livre —
  // antes, qualquer um podia forjar o resultado de outra pessoa.
  const sessao = await getSessionAluno();
  const alunoId = sessao?.aluno.id ?? submittedAlunoId;
  const turmaId = sessao?.turmaId ?? submittedTurmaId;

  if (!alunoId || !turmaId) {
    return NextResponse.json(
      { error: "Identifique-se para enviar a prova. Recarregue a página e entre com seu nome e senha." },
      { status: 401 }
    );
  }

  const [mat] = await db
    .select({
      alunoNome: alunos.nome,
      turmaNome: turmas.nome,
      escolaNome: escolas.nome,
    })
    .from(matriculas)
    .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
    .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
    .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
    .where(
      and(
        eq(matriculas.alunoId, alunoId),
        eq(matriculas.turmaId, turmaId),
        eq(matriculas.anoLetivo, ANO_LETIVO),
        eq(matriculas.status, "ativo")
      )
    )
    .limit(1);
  if (!mat) {
    return NextResponse.json(
      { error: "Matrícula não encontrada para o aluno/turma informados. Verifique com o professor." },
      { status: 400 }
    );
  }

  const studentName = mat.alunoNome;
  const studentClass = mat.turmaNome;
  const school = mat.escolaNome;

  const [provaEncontrada] = await db.select().from(provas).where(eq(provas.codigo, codigo)).limit(1);

  // Código de aplicação: resolve a réplica da aplicação para a turma do aluno
  let prova = provaEncontrada;
  if (!prova) {
    const [aplicacao] = await db.select().from(aplicacoes).where(eq(aplicacoes.codigo, codigo)).limit(1);
    if (aplicacao && turmaId) {
      [prova] = await db
        .select()
        .from(provas)
        .where(and(eq(provas.aplicacaoId, aplicacao.id), eq(provas.turmaId, turmaId)))
        .limit(1);
    }
  }

  if (!prova || prova.status === "draft") {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }
  if (isExamClosed(prova)) {
    return NextResponse.json({ error: "O prazo para envio desta prova foi encerrado." }, { status: 403 });
  }

  // Impede duplicidade. A unicidade real é garantida pelo índice
  // resultados_prova_aluno_uniq; a checagem abaixo só evita a ida desnecessária ao banco.
  const [duplicate] = await db
    .select({ id: resultados.id })
    .from(resultados)
    .where(and(eq(resultados.provaId, prova.id), eq(resultados.alunoId, alunoId)))
    .limit(1);
  if (duplicate) {
    return NextResponse.json(
      { error: "Você já enviou esta prova. Cada aluno pode enviar apenas uma vez." },
      { status: 409 }
    );
  }

  const qs = await db
    .select()
    .from(questoes)
    .where(eq(questoes.provaId, prova.id))
    .orderBy(asc(questoes.ordem));

  const qIds = qs.map((q) => q.id);
  const alts = qIds.length > 0 ? await db.select().from(alternativas).where(inArray(alternativas.questaoId, qIds)) : [];
  const altsByQuestao = new Map<number, (typeof alts)[number][]>();
  for (const a of alts) {
    if (!altsByQuestao.has(a.questaoId)) altsByQuestao.set(a.questaoId, []);
    altsByQuestao.get(a.questaoId)!.push(a);
  }
  const correctByQuestao = new Map<number, number>();
  for (const a of alts) {
    if (a.correta) correctByQuestao.set(a.questaoId, a.id);
  }

  const rawAnswers = Array.isArray(body.answers) ? (body.answers as AnswerInput[]) : [];
  const byQuestion = new Map<number, AnswerInput>();
  for (const a of rawAnswers) {
    if (typeof a.questaoId === "number") byQuestion.set(a.questaoId, a);
  }

  // Instante da submissão sempre do servidor. O cliente não pode escolher o
  // horário: o histórico de quando cada aluno respondeu é a base dos relatórios.
  const submittedAt = new Date();

  let acertos = 0;
  let erros = 0;
  let valorCorreto = 0;
  let valorTotal = 0;
  const rows: {
    questaoId: number;
    alternativaId: number | null;
    textoResposta: string | null;
    correta: boolean | null;
  }[] = [];

  for (const q of qs) {
    const given = byQuestion.get(q.id);
    if (q.tipo === "multiple") {
      const valor = Number(q.valor) || 1;
      valorTotal += valor;
      const enviada = Number.isInteger(given?.alternativaId) ? (given!.alternativaId as number) : null;
      // A alternativa precisa pertencer a esta questão: sem esta checagem um ID
      // válido de outra questão era gravado como resposta (FK aceita).
      const alternativaId =
        enviada !== null && altsByQuestao.get(q.id)?.some((a) => a.id === enviada) ? enviada : null;
      const correta = alternativaId !== null && correctByQuestao.get(q.id) === alternativaId;
      if (alternativaId !== null) {
        if (correta) {
          acertos += 1;
          valorCorreto += valor;
        } else {
          erros += 1;
        }
      }
      rows.push({ questaoId: q.id, alternativaId, textoResposta: null, correta: alternativaId === null ? false : correta });
    } else {
      const text = asText(given?.textoResposta).slice(0, 10000);
      rows.push({ questaoId: q.id, alternativaId: null, textoResposta: text || null, correta: null });
    }
  }

  const percentual = valorTotal > 0 ? round2((valorCorreto / valorTotal) * 100) : 0;
  const nota = round2(percentual / 10);

  let resultadoId: number;
  try {
    resultadoId = await db.transaction(async (tx) => {
      const [res] = await tx
        .insert(resultados)
        .values({
          provaId: prova.id,
          alunoId,
          alunoNome: studentName,
          alunoTurma: studentClass,
          escolaNome: school,
          acertos,
          erros,
          nota: String(nota),
          percentual: String(percentual),
          criadoEm: submittedAt,
        })
        .returning({ id: resultados.id });

      await tx.insert(respostasAlunos).values(
        rows.map((r) => ({
          provaId: prova.id,
          alunoId,
          turmaId,
          alunoNome: studentName,
          alunoTurma: studentClass,
          escolaNome: school,
          resultadoId: res.id,
          respondidaEm: submittedAt,
          ...r,
        }))
      );
      return res.id;
    });
  } catch (e) {
    // Duas submissões simultâneas: a checagem acima não fecha a corrida, o índice
    // resultados_prova_aluno_uniq fecha (23505 = unique_violation).
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: "Você já enviou esta prova. Cada aluno pode enviar apenas uma vez." },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true, resultadoId, acertos, erros, nota, percentual });
}