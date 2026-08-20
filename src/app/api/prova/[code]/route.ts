import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alternativas, provas, questoes, resultados } from "@/db/schema";
import { getSessionAluno } from "@/lib/auth";
import { isExamClosed, notYetOpen } from "@/lib/utils";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Endpoint público usado pela tela do aluno.
 * Nunca expõe a alternativa correta das questões.
 * Se o aluno estiver logado, devolve a identidade e o resultado já enviado (se houver).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const [prova] = await db.select().from(provas).where(eq(provas.codigo, code)).limit(1);

  if (!prova || prova.status === "draft") {
    return NextResponse.json({ ok: false, error: "Prova não encontrada. Verifique o código." }, { status: 404 });
  }

  const session = await getSessionAluno();
  const aluno = session
    ? { id: session.aluno.id, nome: session.aluno.nome, turmaId: session.turmaId, turma: session.turmaNome, escola: session.escolaNome }
    : null;

  const closed = isExamClosed(prova);
  const notOpen = notYetOpen(prova);
  const baseExam = {
    id: prova.id,
    titulo: prova.titulo,
    disciplina: prova.disciplina,
    turma: prova.turma,
    instrucoes: prova.instrucoes,
    dataInicio: prova.dataInicio ? prova.dataInicio.toISOString() : null,
    dataFim: prova.dataFim ? prova.dataFim.toISOString() : null,
    tempoMinutos: prova.tempoMinutos,
    arquivoNome: prova.arquivoNome,
  };

  // Aluno logado que já enviou: devolve o resultado em vez das questões.
  if (aluno) {
    const [resultado] = await db
      .select()
      .from(resultados)
      .where(and(eq(resultados.provaId, prova.id), eq(resultados.alunoId, aluno.id)))
      .limit(1);
    if (resultado) {
      return NextResponse.json({
        ok: true,
        closed,
        notOpen,
        alreadySubmitted: true,
        aluno,
        exam: baseExam,
        result: {
          acertos: Number(resultado.acertos),
          erros: Number(resultado.erros),
          nota: Number(resultado.nota),
          percentual: Number(resultado.percentual),
        },
      });
    }
  }

  if (closed) {
    return NextResponse.json(
      {
        ok: true,
        closed: true,
        notOpen: false,
        aluno,
        exam: baseExam,
      },
      { status: 200 }
    );
  }

  const qs = await db
    .select()
    .from(questoes)
    .where(eq(questoes.provaId, prova.id))
    .orderBy(asc(questoes.ordem));

  const qIds = qs.map((q) => q.id);
  const allAlts =
    qIds.length > 0
      ? await db
          .select({ id: alternativas.id, questaoId: alternativas.questaoId, letra: alternativas.letra, texto: alternativas.texto })
          .from(alternativas)
          .where(inArray(alternativas.questaoId, qIds))
      : [];
  const altByQuestao = new Map<number, (typeof allAlts)[number][]>();
  for (const a of allAlts) {
    if (!altByQuestao.has(a.questaoId)) altByQuestao.set(a.questaoId, []);
    altByQuestao.get(a.questaoId)!.push(a);
  }

  return NextResponse.json({
    ok: true,
    closed: false,
    notOpen,
    aluno,
    exam: baseExam,
    questions: qs.map((q) => ({
      id: q.id,
      numero: q.numero,
      pergunta: q.pergunta,
      tipo: q.tipo,
      valor: Number(q.valor),
      ordem: q.ordem,
      alternativas: (altByQuestao.get(q.id) ?? []).map((a) => ({ id: a.id, letra: a.letra, texto: a.texto })),
    })),
  });
}