import { NextResponse } from "next/server";
import { getSessionAluno } from "@/lib/auth";

/** Dados do aluno logado (usado pelo painel e pela tela da prova). */
export async function GET() {
  const session = await getSessionAluno();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  return NextResponse.json({
    ok: true,
    aluno: {
      id: session.aluno.id,
      nome: session.aluno.nome,
      turmaId: session.turmaId,
      turma: session.turmaNome,
      escolaId: session.escolaId,
      escola: session.escolaNome,
    },
  });
}