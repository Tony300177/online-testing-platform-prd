import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, matriculas, turmas } from "@/db/schema";
import { ALUNO_SESSION_COOKIE, ALUNO_SESSION_MAX_AGE, createAlunoSessionToken } from "@/lib/auth";

const ANO_LETIVO = 2026;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Login do aluno em cascata: escola → turma → aluno → senha.
 * O backend confirma as relações (aluno matriculado na turma e turma pertencente
 * à escola) e compara a senha (hash bcrypt) — nunca confiando só nos IDs enviados.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};
  const escolaId = typeof body.escolaId === "string" ? body.escolaId.trim() : "";
  const turmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";
  const alunoId = typeof body.alunoId === "string" ? body.alunoId.trim() : "";
  const senha = typeof body.senha === "string" ? body.senha : "";

  if (!escolaId || !turmaId || !alunoId || !senha) {
    return NextResponse.json(
      { error: "Selecione escola, turma e aluno e informe a senha." },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(escolaId) || !UUID_RE.test(turmaId) || !UUID_RE.test(alunoId)) {
    return NextResponse.json({ error: "Seleção inválida. Recarregue a página." }, { status: 400 });
  }

  const [aluno] = await db.select().from(alunos).where(eq(alunos.id, alunoId)).limit(1);
  if (!aluno) {
    return NextResponse.json({ error: "Nome ou senha inválidos." }, { status: 401 });
  }

  // 1) O aluno realmente pertence à turma selecionada (matrícula ativa no ano letivo).
  const [matricula] = await db
    .select()
    .from(matriculas)
    .where(
      and(
        eq(matriculas.alunoId, alunoId),
        eq(matriculas.turmaId, turmaId),
        eq(matriculas.anoLetivo, ANO_LETIVO),
        eq(matriculas.status, "ativo")
      )
    )
    .limit(1);
  if (!matricula) {
    return NextResponse.json(
      { error: "O aluno selecionado não está matriculado nesta turma." },
      { status: 401 }
    );
  }

  // 2) A turma realmente pertence à escola selecionada.
  const [turma] = await db.select().from(turmas).where(eq(turmas.id, turmaId)).limit(1);
  if (!turma || turma.escolaId !== escolaId) {
    return NextResponse.json(
      { error: "A turma selecionada não pertence à escola escolhida." },
      { status: 401 }
    );
  }

  // 3) Senha corresponde ao aluno.
  if (!aluno.senhaHash || !(await bcrypt.compare(senha, aluno.senhaHash))) {
    return NextResponse.json({ error: "Nome ou senha inválidos." }, { status: 401 });
  }

  const token = createAlunoSessionToken(aluno.id);
  const res = NextResponse.json({ ok: true, nome: aluno.nome, redirectTo: "/aluno/painel" });
  res.cookies.set(ALUNO_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ALUNO_SESSION_MAX_AGE,
  });
  return res;
}