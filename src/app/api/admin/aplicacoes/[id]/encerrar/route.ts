import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aplicacoes, provas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

/** Encerra uma aplicação (finaliza a aplicação e todas as réplicas das turmas). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const aplicacaoId = Number(id);
  if (!Number.isInteger(aplicacaoId)) return NextResponse.json({ error: "Aplicação inválida." }, { status: 400 });

  const [aplicacao] = await db
    .update(aplicacoes)
    .set({ status: "finished" })
    .where(eq(aplicacoes.id, aplicacaoId))
    .returning({ id: aplicacoes.id });

  if (!aplicacao) return NextResponse.json({ error: "Aplicação não encontrada." }, { status: 404 });

  await db.update(provas).set({ status: "finished" }).where(eq(provas.aplicacaoId, aplicacaoId));

  return NextResponse.json({ ok: true });
}