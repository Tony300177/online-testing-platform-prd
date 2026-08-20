import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { provas, resultados } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Lista os resultados de uma prova (professor dono ou admin). */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const [prova] = await db.select().from(provas).where(eq(provas.id, id)).limit(1);
  if (!prova) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (user.role !== "admin" && user.id !== prova.professorId) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(resultados)
    .where(eq(resultados.provaId, id))
    .orderBy(desc(resultados.criadoEm));

  return NextResponse.json({
    ok: true,
    prova: { id: prova.id, titulo: prova.titulo, codigo: prova.codigo },
    resultados: rows.map((s) => ({
      ...s,
      criadoEm: s.criadoEm.toISOString(),
      nota: Number(s.nota),
      percentual: Number(s.percentual),
    })),
  });
}