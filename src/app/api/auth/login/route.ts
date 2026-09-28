import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { checarLimite, chavePorIp } from "@/lib/rate-limit";

/** Limite apertado: é o login de professor/admin, alvo natural de força bruta. */
const TENTATIVAS_POR_MINUTO = 8;

export async function POST(req: Request) {
  const limite = checarLimite(chavePorIp(req, "staff-login"), TENTATIVAS_POR_MINUTO);
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas de acesso. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !password) {
    return NextResponse.json({ error: "Informe nome e senha." }, { status: 400 });
  }

  // Mesmo erro para usuário inexistente e senha errada, e o bcrypt só roda quando
  // existe alguém com esse nome — assim a resposta não revela quem existe.
  const [user] = await db.select().from(users).where(eq(users.name, name)).limit(1);
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
  const senhaConfere = await bcrypt.compare(password, hash);
  if (!user || !senhaConfere) {
    return NextResponse.json({ error: "Nome ou senha inválidos." }, { status: 401 });
  }

  const token = createSessionToken(user.id);
  const res = NextResponse.json({
    ok: true,
    role: user.role,
    name: user.name,
    redirectTo: user.role === "admin" ? "/admin" : "/professor",
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
