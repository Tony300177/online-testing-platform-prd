import { NextResponse } from "next/server";
import { count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { provas, questoes } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

/** Lista provas do banco de provas (exclui réplicas de aplicações) com contagem de questões. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const rows = await db
    .select({
      id: provas.id,
      titulo: provas.titulo,
      disciplina: provas.disciplina,
      status: provas.status,
    })
    .from(provas)
    .where(isNull(provas.aplicacaoId))
    .orderBy(desc(provas.createdAt));

  const qCounts = await db
    .select({ provaId: questoes.provaId, total: count() })
    .from(questoes)
    .groupBy(questoes.provaId);

  const qMap = new Map(qCounts.map((c) => [c.provaId, Number(c.total)]));

  return NextResponse.json({
    ok: true,
    provas: rows.map((p) => ({ ...p, totalQuestoes: qMap.get(p.id) ?? 0 })),
  });
}