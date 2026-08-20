import { and, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { provas, resultados } from "@/db/schema";
import { getSessionAluno } from "@/lib/auth";
import { isExamClosed, notYetOpen } from "@/lib/utils";

function turmaInProva(turma: string, nomeTurma: string): boolean {
  return turma
    .split(",")
    .map((t) => t.trim())
    .some((t) => t.toLowerCase() === nomeTurma.toLowerCase());
}

/** Painel do aluno: provas publicadas para a turma em que ele está matriculado. */
export async function GET() {
  const session = await getSessionAluno();
  if (!session) return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });

  const list = await db
    .select()
    .from(provas)
    .where(
      and(
        inArray(provas.status, ["active", "finished"]),
        or(eq(provas.escolaId, session.escolaId), eq(provas.turmaId, session.turmaId))
      )
    )
    .orderBy(desc(provas.createdAt));

  const minhas = list.filter(
    (p) => p.turmaId === session.turmaId || turmaInProva(p.turma, session.turmaNome)
  );

  const ids = minhas.map((p) => p.id);
  const res = ids.length
    ? await db.select().from(resultados).where(and(inArray(resultados.provaId, ids), eq(resultados.alunoId, session.aluno.id)))
    : [];

  const byProva = new Map<number, (typeof res)[number]>();
  for (const r of res) byProva.set(r.provaId, r);

  return NextResponse.json({
    ok: true,
    aluno: { nome: session.aluno.nome, turma: session.turmaNome, escola: session.escolaNome },
    provas: minhas.map((p) => {
      const resultado = byProva.get(p.id);
      return {
        id: p.id,
        titulo: p.titulo,
        disciplina: p.disciplina,
        turma: p.turma,
        instrucoes: p.instrucoes,
        dataInicio: p.dataInicio ? p.dataInicio.toISOString() : null,
        dataFim: p.dataFim ? p.dataFim.toISOString() : null,
        tempoMinutos: p.tempoMinutos,
        status: p.status,
        codigo: p.codigo,
        arquivoNome: p.arquivoNome,
        closed: isExamClosed(p),
        notOpen: notYetOpen(p),
        submitted: Boolean(resultado),
        submittedAt: resultado?.criadoEm.toISOString() ?? null,
        acertos: resultado ? Number(resultado.acertos) : null,
        erros: resultado ? Number(resultado.erros) : null,
        nota: resultado ? Number(resultado.nota) : null,
        percentual: resultado ? Number(resultado.percentual) : null,
      };
    }),
  });
}