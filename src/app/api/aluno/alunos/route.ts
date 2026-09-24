import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, matriculas } from "@/db/schema";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Alunos matriculados ativamente em uma turma específica (ano letivo atual). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const turmaId = searchParams.get("turmaId") ?? "";

  if (!UUID_RE.test(turmaId)) {
    return NextResponse.json({ error: "Turma não informada." }, { status: 400 });
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
