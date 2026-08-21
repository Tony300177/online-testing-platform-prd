import { NextResponse } from "next/server";
import { db } from "@/db";
import { desempenhoThresholds } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const escolaId = searchParams.get("escolaId");

    const rows = await db
      .select()
      .from(desempenhoThresholds)
      .where(escolaId ? eq(desempenhoThresholds.escolaId, escolaId) : sql`escola_id IS NULL`)
      .orderBy(desempenhoThresholds.escolaId);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { escolaId, verdeMin, amareloMin, laranjaMin } = body;

    if (verdeMin === undefined || amareloMin === undefined || laranjaMin === undefined) {
      return NextResponse.json({ ok: false, error: "verdeMin, amareloMin e laranjaMin são obrigatórios" }, { status: 400 });
    }
    if (!(verdeMin > amareloMin && amareloMin > laranjaMin && laranjaMin >= 0 && verdeMin <= 100)) {
      return NextResponse.json({ ok: false, error: "Limiares devem seguir: 0 ≤ laranjaMin < amareloMin < verdeMin ≤ 100" }, { status: 400 });
    }

    const [row] = await db
      .insert(desempenhoThresholds)
      .values({
        escolaId: escolaId || null,
        verdeMin,
        amareloMin,
        laranjaMin,
      })
      .onConflictDoUpdate({
        target: desempenhoThresholds.escolaId,
        set: { verdeMin, amareloMin, laranjaMin, atualizadoEm: new Date() },
      })
      .returning();

    return NextResponse.json({ ok: true, data: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, verdeMin, amareloMin, laranjaMin } = body;

    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });

    const updates: Record<string, number> = {};
    if (verdeMin !== undefined) updates.verdeMin = verdeMin;
    if (amareloMin !== undefined) updates.amareloMin = amareloMin;
    if (laranjaMin !== undefined) updates.laranjaMin = laranjaMin;

    const [current] = await db.select().from(desempenhoThresholds).where(eq(desempenhoThresholds.id, id)).limit(1);
    if (!current) return NextResponse.json({ ok: false, error: "Registro não encontrado" }, { status: 404 });

    const vMin = updates.verdeMin ?? current.verdeMin;
    const aMin = updates.amareloMin ?? current.amareloMin;
    const lMin = updates.laranjaMin ?? current.laranjaMin;

    if (!(vMin > aMin && aMin > lMin && lMin >= 0 && vMin <= 100)) {
      return NextResponse.json({ ok: false, error: "Limiares devem seguir: 0 ≤ laranjaMin < amareloMin < verdeMin ≤ 100" }, { status: 400 });
    }

    const [row] = await db
      .update(desempenhoThresholds)
      .set({ ...updates, atualizadoEm: new Date() })
      .where(eq(desempenhoThresholds.id, id))
      .returning();

    return NextResponse.json({ ok: true, data: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}