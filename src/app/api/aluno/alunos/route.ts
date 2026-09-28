import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, matriculas } from "@/db/schema";
import { resolverEscopoCodigo } from "@/lib/acesso-prova";
import { checarLimite, chavePorIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Alunos de uma turma, para a identificação na tela da prova.
 *
 * Esta é a rota mais sensível do login: sem ela, qualquer pessoa com um UUID de
 * turma listava nome e número de chamada de todos os alunos da rede. Exige o
 * código de uma aplicação liberada — o mesmo acesso que o professor distribui na
 * prova — e devolve somente as turmas daquele código.
 */
export async function GET(req: Request) {
  const limite = checarLimite(chavePorIp(req, "aluno-alunos"), 30);
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde um instante e tente novamente." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const turmaId = searchParams.get("turmaId") ?? "";
  const codigo = searchParams.get("codigo") ?? "";

  if (!UUID_RE.test(turmaId)) {
    return NextResponse.json({ error: "Turma não informada." }, { status: 400 });
  }

  const escopo = await resolverEscopoCodigo(codigo);
  if (!escopo.ok || !escopo.turmaIds.includes(turmaId)) {
    return NextResponse.json({ error: "Código da prova inválido ou fora do prazo." }, { status: 403 });
  }

  const rows = await db
    .select({ id: alunos.id, nome: alunos.nome, numeroChamada: alunos.numeroChamada })
    .from(matriculas)
    .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
    .where(
      and(
        eq(matriculas.turmaId, turmaId),
        eq(matriculas.anoLetivo, ANO_LETIVO),
        eq(matriculas.status, "ativo")
      )
    )
    .orderBy(asc(alunos.numeroChamada), asc(alunos.nome));

  return NextResponse.json({ ok: true, alunos: rows });
}
