import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos } from "@/db/schema";

/** Verifica a senha do aluno antes de liberar o acesso à prova (identificação por matrícula). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) ?? {};
  const alunoId = typeof body.alunoId === "string" ? body.alunoId.trim() : "";
  const senha = typeof body.senha === "string" ? body.senha : "";

  if (!alunoId || !senha) {
    return NextResponse.json({ ok: false, error: "Informe seu nome e sua senha." }, { status: 400 });
  }

  let aluno: typeof alunos.$inferSelect | undefined;
  try {
    [aluno] = await db.select().from(alunos).where(eq(alunos.id, alunoId)).limit(1);
  } catch {
    aluno = undefined;
  }
  if (!aluno) {
    return NextResponse.json({ ok: false, error: "Aluno não encontrado." }, { status: 401 });
  }
  if (!aluno.senhaHash || !(await bcrypt.compare(senha, aluno.senhaHash))) {
    return NextResponse.json({ ok: false, error: "Senha inválida. Verifique com o professor." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}