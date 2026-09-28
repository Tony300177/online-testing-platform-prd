import bcrypt from "bcryptjs";
import { and, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, matriculas, turmas } from "@/db/schema";
import { ALUNO_SESSION_COOKIE, ALUNO_SESSION_MAX_AGE, createAlunoSessionToken } from "@/lib/auth";
import { checarLimite, chavePorIp } from "@/lib/rate-limit";

const ANO_LETIVO = 2026;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Login do aluno: escola → turma → nome → senha.
 *
 * O nome é informado como texto, não escolhido de uma lista: a lista de alunos
 * da turma era pública e permitia enumerar a rede (nome + número de chamada de
 * todos). O backend resolve o aluno dentro da turma selecionada e compara o
 * hash bcrypt — nunca confiando nos IDs enviados.
 */
export async function POST(req: Request) {
  const limite = checarLimite(chavePorIp(req, "aluno-login"), 10);
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const escolaId = typeof body.escolaId === "string" ? body.escolaId.trim() : "";
  const turmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const senha = typeof body.senha === "string" ? body.senha : "";

  if (!escolaId || !turmaId || !nome || !senha) {
    return NextResponse.json(
      { error: "Selecione escola e turma, informe seu nome completo e a senha." },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(escolaId) || !UUID_RE.test(turmaId)) {
    return NextResponse.json({ error: "Seleção inválida. Recarregue a página." }, { status: 400 });
  }

  // Erro único para tudo que falha aqui: nome desconhecido, senha errada, aluno
  // de outra turma ou de outra escola. Separar os casos viraria um oráculo que
  // confirma a existência de uma matrícula.
  const erroGenerico = { error: "Nome ou senha inválidos." };

  // 1) A turma existe e pertence à escola informada.
  const [turma] = await db.select().from(turmas).where(eq(turmas.id, turmaId)).limit(1);
  if (!turma || turma.escolaId !== escolaId) {
    return NextResponse.json(erroGenerico, { status: 401 });
  }

  // 2) Candidatos: apenas alunos matriculados e ativos nesta turma no ano letivo.
  const candidatos = await db
    .select({
      id: alunos.id,
      nome: alunos.nome,
      senhaHash: alunos.senhaHash,
    })
    .from(alunos)
    .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
    .where(
      and(
        eq(matriculas.turmaId, turmaId),
        eq(matriculas.anoLetivo, ANO_LETIVO),
        eq(matriculas.status, "ativo"),
        ilike(alunos.nome, nome)
      )
    );

  if (candidatos.length === 0) {
    return NextResponse.json(erroGenerico, { status: 401 });
  }

  // 3) Senha. Só depois de casar o hash é que a resposta distingue sucesso.
  let aluno: { id: string; nome: string } | undefined;
  for (const c of candidatos) {
    if (c.senhaHash && (await bcrypt.compare(senha, c.senhaHash))) {
      aluno = { id: c.id, nome: c.nome };
      break;
    }
  }
  if (!aluno) {
    return NextResponse.json(erroGenerico, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, nome: aluno.nome, redirectTo: "/aluno/painel" });
  res.cookies.set(ALUNO_SESSION_COOKIE, createAlunoSessionToken(aluno.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ALUNO_SESSION_MAX_AGE,
  });
  return res;
}
