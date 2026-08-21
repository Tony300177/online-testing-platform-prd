import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { provas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getHabilidadesAnalise, type HabilidadeFilters } from "@/lib/habilidades-stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });

    // Professores só podem analisar as próprias provas.
    let allowedProvaIds: number[] | undefined;
    if (user.role === "teacher") {
      const own = await db.select({ id: provas.id }).from(provas).where(eq(provas.professorId, user.id));
      allowedProvaIds = own.map((p) => p.id);
    }

    const sp = new URL(req.url).searchParams;
    const filters: HabilidadeFilters = { allowedProvaIds };
    if (sp.get("provaId")) filters.provaId = Number(sp.get("provaId"));
    if (sp.get("turmaId")) filters.turmaId = sp.get("turmaId")!;
    if (sp.get("habilidade")) filters.habilidade = sp.get("habilidade")!;
    if (sp.get("alunoId")) filters.alunoId = sp.get("alunoId")!;
    if (sp.get("periodoInicio")) filters.periodoInicio = sp.get("periodoInicio")!;
    if (sp.get("periodoFim")) filters.periodoFim = sp.get("periodoFim")!;

    const data = await getHabilidadesAnalise(filters);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao calcular análise por habilidades.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
