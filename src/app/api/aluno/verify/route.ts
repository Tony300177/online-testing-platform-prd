import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, matriculas } from "@/db/schema";
import { resolverEscopoCodigo } from "@/lib/acesso-prova";
import { ALUNO_SESSION_COOKIE, ALUNO_SESSION_MAX_AGE, createAlunoSessionToken } from "@/lib/auth";
import { checarLimite, chavePorIp } from "@/lib/rate-limit";

const ANO_LETIVO = 2026;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confere a senha do aluno e abre a sessão.
 *
 * Antes devolvia só um booleano, o que virava oráculo de senha (a mesma senha
 * padrão da rede): dava para testar combinações sem criar sessão e sem limite
 * de tentativas. Agora:
 *  - a resposta é a sessão, e o número de tentativas é limitado por IP;
 *  - o aluno precisa estar matriculado na turma **e** a turma precisa estar no
 *    escopo do código informado — sem isso, um código válido + um UUID adivinhado
 *    abria sessão de qualquer aluno da rede.
 */
export async function POST(req: Request) {
  const limite = checarLimite(chavePorIp(req, "aluno-verify"), 10);
  if (!limite.ok) {
    return NextResponse.json(
      { ok: false, error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const alunoId = typeof body.alunoId === "string" ? body.alunoId.trim() : "";
  const senha = typeof body.senha === "string" ? body.senha : "";
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  const turmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";

  if (!alunoId || !senha) {
    return NextResponse.json(
      { ok: false, error: "Informe seu nome e a senha." },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(alunoId)) {
    return NextResponse.json({ ok: false, error: "Seleção inválida. Recarregue a página." }, { status: 400 });
  }

  // Erro único para tudo que falha: aluno inexistente, senha errada, sem matrícula
  // ou fora do escopo. Separar os casos confirmaria a existência de uma matrícula.
  const erroGenerico = { ok: false, error: "Nome ou senha inválidos." };

  if (codigo) {
    const escopo = await resolverEscopoCodigo(codigo);
    if (!escopo.ok || !UUID_RE.test(turmaId) || !escopo.turmaIds.includes(turmaId)) {
      return NextResponse.json(erroGenerico, { status: 401 });
    }
  }

  // Matrícula ativa no ano letivo. Quando há código, exigida também na turma dele.
  const matricula = await db
    .select({ alunoId: matriculas.alunoId })
    .from(matriculas)
    .where(
      and(
        eq(matriculas.alunoId, alunoId),
        eq(matriculas.anoLetivo, ANO_LETIVO),
        eq(matriculas.status, "ativo"),
        ...(codigo ? [eq(matriculas.turmaId, turmaId)] : [])
      )
    )
    .limit(1);
  if (matricula.length === 0) {
    return NextResponse.json(erroGenerico, { status: 401 });
  }

  const [aluno] = await db
    .select({ id: alunos.id, senhaHash: alunos.senhaHash })
    .from(alunos)
    .where(eq(alunos.id, alunoId))
    .limit(1);
  if (!aluno?.senhaHash || !(await bcrypt.compare(senha, aluno.senhaHash))) {
    return NextResponse.json(erroGenerico, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ALUNO_SESSION_COOKIE, createAlunoSessionToken(aluno.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ALUNO_SESSION_MAX_AGE,
  });
  return res;
}
