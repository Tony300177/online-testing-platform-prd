import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !password) {
    return NextResponse.json({ error: "Informe nome e senha." }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.name, name)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
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
