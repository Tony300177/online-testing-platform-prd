import { NextResponse } from "next/server";
import { and, eq, ilike, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { provas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const condicao = () =>
  or(
    ilike(provas.titulo, "%teste%"),
    eq(provas.status, "finished"),
    lt(provas.dataFim, new Date())
  );

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Acesso restrito a administradores" }, { status: 403 });
  }

  try {
    const alvo = await db
      .select({ id: provas.id, titulo: provas.titulo })
      .from(provas)
      .where(condicao());

    const ids = alvo.map((p) => p.id);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, excluidas: 0, provas: [] });
    }

    const resultado = await db
      .delete(provas)
      .where(and(condicao()));

    const excluidas = Number(resultado.rowCount ?? 0) || ids.length;

    return NextResponse.json({
      ok: true,
      excluidas,
      provas: alvo.map((p) => p.titulo),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
