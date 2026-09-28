import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, escolas, matriculas, turmas, users, type Aluno, type User } from "@/db/schema";

const ANO_LETIVO = 2026;

export const SESSION_COOKIE = "avalialab_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export const ALUNO_SESSION_COOKIE = "avalialab_aluno_session";
export const ALUNO_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

/**
 * Lê uma variável de ambiente obrigatória. Sem valor, o processo não sobe: é
 * preferível falhar no boot a emitir um segredo previsível em silêncio.
 */
function requiredEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} ausente. ${hint}`);
  }
  return value;
}

/**
 * Senha padrão dos alunos, usada na importação para gerar o hash inicial.
 * OBRIGATÓRIA: sem valor definido nada é importado com uma senha previsível.
 * Trocar a variável não muda a senha de quem já foi importado — o hash está em
 * `alunos.senha_hash`.
 */
export const STUDENT_DEFAULT_PASSWORD = requiredEnv(
  "STUDENT_DEFAULT_PASSWORD",
  "Defina no .env.local uma senha forte; evite valores previsiveis como \"123456\" ou \"admin\"."
);

/**
 * Segredo de assinatura das sessões. Sem fallback proposital: um segredo padrão
 * allowlistaria forjar cookie de administrador a partir do código-fonte.
 */
const SECRET = requiredEnv(
  "SESSION_SECRET",
  "Gere com `openssl rand -base64 48` e defina no .env.local."
);

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Gera um token de sessão assinado (HMAC) no formato userId.timestamp.assinatura */
export function createSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Confere a assinatura do token e que ele não expirou. Retorna o id ou null. */
function verifySignedToken(token: string, maxAgeSeconds: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

  // Expiração validada no servidor: o maxAge do cookie não é garantia de nada,
  // já que o token pode ser reapresentado com um cookie novo.
  const age = Date.now() - issuedAt;
  if (age < 0 || age > maxAgeSeconds * 1000) return null;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  return parts[0];
}

/** Verifica a assinatura e a idade do token; retorna o userId ou null. */
export function verifySessionToken(token: string): number | null {
  const raw = verifySignedToken(token, SESSION_MAX_AGE);
  if (raw === null) return null;
  const userId = Number(raw);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

/** Gera um token de sessão do aluno (uuid.timestamp.assinatura). */
export function createAlunoSessionToken(alunoUuid: string): string {
  const payload = `${alunoUuid}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Verifica a assinatura e a idade do token; retorna o uuid do aluno ou null. */
export function verifyAlunoSessionToken(token: string): string | null {
  const uuid = verifySignedToken(token, ALUNO_SESSION_MAX_AGE);
  if (uuid === null) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : null;
}

/** Carrega o usuário logado a partir do cookie de sessão (ou null). */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export type AlunoSession = {
  aluno: Aluno;
  turmaId: string;
  turmaNome: string;
  escolaId: string;
  escolaNome: string;
};

/** Carrega o aluno logado (aluno + turma/ano letivo atual + escola) ou null. */
export async function getSessionAluno(): Promise<AlunoSession | null> {
  const store = await cookies();
  const token = store.get(ALUNO_SESSION_COOKIE)?.value;
  if (!token) return null;
  const alunoUuid = verifyAlunoSessionToken(token);
  if (!alunoUuid) return null;

  const [row] = await db
    .select({
      aluno: alunos,
      turmaId: matriculas.turmaId,
      turmaNome: turmas.nome,
      escolaId: turmas.escolaId,
      escolaNome: escolas.nome,
    })
    .from(alunos)
    .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
    .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
    .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
    .where(
      and(
        eq(alunos.id, alunoUuid),
        eq(matriculas.anoLetivo, ANO_LETIVO),
        eq(matriculas.status, "ativo")
      )
    )
    .limit(1);

  return row ? { aluno: row.aluno, turmaId: row.turmaId, turmaNome: row.turmaNome, escolaId: row.escolaId, escolaNome: row.escolaNome } : null;
}

export type Role = "admin" | "teacher";

/** Exige usuário logado em páginas; redireciona para /login se não houver sessão. */
export async function requireUser(allowed?: Role[]): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (allowed && !allowed.includes(user.role as Role)) redirect("/");
  return user;
}

/** Exige aluno logado; redireciona para /aluno (login) se não houver sessão. */
export async function requireAluno(): Promise<AlunoSession> {
  const aluno = await getSessionAluno();
  if (!aluno) redirect("/aluno");
  return aluno;
}

export type SessionGuard = { user: User } | { response: NextResponse };

function unauthorized(message: string): { response: NextResponse } {
  return { response: NextResponse.json({ error: message }, { status: 401 }) };
}

/**
 * Guarda para route handlers: exige usuário logado e, opcionalmente, uma das roles
 * permitidas. Usar no topo de toda API que devolve dados de professores/admins.
 * `requireUser` redireciona e por isso não serve em handlers.
 */
export async function requireApiUser(allowed?: Role[]): Promise<SessionGuard> {
  const user = await getSessionUser();
  if (!user) return unauthorized("Não autorizado.");
  if (allowed && !allowed.includes(user.role as Role)) return unauthorized("Não autorizado.");
  return { user };
}

/** Atalho para as rotas exclusivas de administração. */
export function requireApiAdmin(): Promise<SessionGuard> {
  return requireApiUser(["admin"]);
}

/** Extrai o usuário de uma guarda já validada, ou null se a resposta for um 401. */
export function guardUser(guard: SessionGuard): User | null {
  return "user" in guard ? guard.user : null;
}
