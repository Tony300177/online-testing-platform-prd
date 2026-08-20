import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos } from "@/db/schema";
import { ALUNO_SESSION_COOKIE, ALUNO_SESSION_MAX_AGE, createAlunoSessionToken } from "@/lib/auth";

/** Login do aluno: usuário = nome completo, senha = padrão compartilhada (hash por aluno). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const senha = typeof body.senha === "string" ? body.senha : "";

  if (!nome || !senha) {
    return NextResponse.json({ error: "Informe seu nome e sua senha." }, { status: 400 });
  }

  const matches = await db.select().from(alunos).where(eq(alunos.nome, nome)).limit(2);
  if (matches.length === 0) {
    return NextResponse.json({ error: "Nome não encontrado. Verifique com o professor." }, { status: 401 });
  }
  if (matches.length > 1) {
    return NextResponse.json(
      { error: "Há mais de um aluno com esse nome. Fale com o professor para acessar." },
      { status: 401 }
    );
  }

  const aluno = matches[0];
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