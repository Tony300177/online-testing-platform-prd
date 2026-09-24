import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { turmas } from "@/db/schema";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turmas ativas de uma escola específica (ano letivo atual). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const escolaId = searchParams.get("escolaId") ?? "";

  if (!UUID_RE.test(escolaId)) {
    return NextResponse.json({ error: "Escola não informada." }, { status: 400 });
  }

  const rows = await db
    .select({ id: turmas.id, nome: turmas.nome, ano: turmas.ano, turno: turmas.turno })
    .from(turmas)
    .where(
      and(eq(turmas.escolaId, escolaId), eq(turmas.anoLetivo, ANO_LETIVO), eq(turmas.ativo, true))
    )
    .orderBy(asc(turmas.nome));

  return NextResponse.json({ ok: true, turmas: rows });
}
