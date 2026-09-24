import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { escolas } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Lista pública de escolas ativas (tela de acesso do aluno — cascade escola → turma → aluno). */
export async function GET() {
  const rows = await db
    .select({ id: escolas.id, codigo: escolas.codigo, nome: escolas.nome })
    .from(escolas)
    .where(eq(escolas.ativo, true))
    .orderBy(asc(escolas.codigo), asc(escolas.nome));

  return NextResponse.json({ ok: true, escolas: rows });
}
