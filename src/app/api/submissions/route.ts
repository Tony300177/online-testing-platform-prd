import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  alunos,
  alternativas,
  escolas,
  matriculas,
  provas,
  questoes,
  respostasAlunos,
  resultados,
  turmas,
} from "@/db/schema";
import { isExamClosed, normalize } from "@/lib/utils";

const ANO_LETIVO = 2026;

type AnswerInput = { questaoId: number; alternativaId?: number | null; textoResposta?: string };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Recebe as respostas do aluno, corrige automaticamente múltipla escolha e salva o resultado. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};

  const codigo = asText(body.codigo).toUpperCase();
  const alunoId = typeof body.alunoId === "string" ? body.alunoId.trim() : "";
  const turmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";

  if (!codigo) return NextResponse.json({ error: "Código da prova inválido." }, { status: 400 });

  // Identificação pela matrícula real (escola/turma/aluno do banco escolar)
  let studentName = asText(body.studentName);
  let studentClass = asText(body.studentClass);
  let school = asText(body.school);

  if (alunoId && turmaId) {
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
    studentName = mat.alunoNome;
    studentClass = mat.turmaNome;
    school = mat.escolaNome;
  } else {
    if (studentName.length < 3) {
      return NextResponse.json({ error: "Preencha seu nome completo." }, { status: 400 });
    }
    if (!studentClass) return NextResponse.json({ error: "Informe a sua turma." }, { status: 400 });
    if (!school) return NextResponse.json({ error: "Informe a sua escola." }, { status: 400 });
  }

  const [prova] = await db.select().from(provas).where(eq(provas.codigo, codigo)).limit(1);
  if (!prova || prova.status === "draft") {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }
  if (isExamClosed(prova)) {
    return NextResponse.json({ error: "O prazo para envio desta prova foi encerrado." }, { status: 403 });
  }

  // Impede duplicidade: mesmo aluno (matrícula ou nome normalizado) na mesma prova
  if (alunoId) {
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
  } else {
    const existing = await db.select().from(resultados).where(eq(resultados.provaId, prova.id));
    const duplicate = existing.some(
      (s) =>
        normalize(s.alunoNome) === normalize(studentName) &&
        normalize(s.alunoTurma) === normalize(studentClass) &&
        normalize(s.escolaNome) === normalize(school)
    );
    if (duplicate) {
      return NextResponse.json(
        { error: "Você já enviou esta prova. Cada aluno pode enviar apenas uma vez." },
        { status: 409 }
      );
    }
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
      const alternativaId = Number.isInteger(given?.alternativaId) ? (given!.alternativaId as number) : null;
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

  const resultadoId = await db.transaction(async (tx) => {
    const [res] = await tx
      .insert(resultados)
      .values({
        provaId: prova.id,
        alunoId: alunoId || null,
        alunoNome: studentName,
        alunoTurma: studentClass,
        escolaNome: school,
        acertos,
        erros,
        nota: String(nota),
        percentual: String(percentual),
      })
      .returning({ id: resultados.id });

    await tx.insert(respostasAlunos).values(
      rows.map((r) => ({
        provaId: prova.id,
        alunoId: alunoId || null,
        turmaId: turmaId || null,
        alunoNome: studentName,
        alunoTurma: studentClass,
        escolaNome: school,
        resultadoId: res.id,
        ...r,
      }))
    );
    return res.id;
  });

  return NextResponse.json({ ok: true, resultadoId, acertos, erros, nota, percentual });
}