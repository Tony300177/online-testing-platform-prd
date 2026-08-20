import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alunos, escolas, matriculas, turmas, users, type Aluno, type User } from "@/db/schema";

const ANO_LETIVO = 2026;

export const SESSION_COOKIE = "avalialab_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export const ALUNO_SESSION_COOKIE = "avalialab_aluno_session";
export const ALUNO_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

/** Senha padrão compartilhada dos alunos (pode ser trocada por variável de ambiente). */
export const STUDENT_DEFAULT_PASSWORD = process.env.STUDENT_DEFAULT_PASSWORD || "123456";

const SECRET =
  process.env.SESSION_SECRET || "avalialab-dev-secret-troque-em-producao";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Gera um token de sessão assinado (HMAC) no formato userId.timestamp.assinatura */
export function createSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Verifica a assinatura do token e retorna o userId ou null. */
export function verifySessionToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  const userId = Number(parts[0]);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

/** Gera um token de sessão do aluno (uuid.timestamp.assinatura). */
export function createAlunoSessionToken(alunoUuid: string): string {
  const payload = `${alunoUuid}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Verifica a assinatura e retorna o uuid do aluno ou null. */
export function verifyAlunoSessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  const uuid = parts[0];
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
