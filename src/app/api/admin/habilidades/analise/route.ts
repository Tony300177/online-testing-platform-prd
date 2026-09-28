import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireApiAdmin } from "@/lib/auth";
import { getHabilidadesAnalise, type HabilidadeFilters } from "@/lib/habilidades-stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireApiAdmin();
  if ("response" in guard) return guard.response;
  try {
    const sp = new URL(req.url).searchParams;
    const filters: HabilidadeFilters = {};
    if (sp.get("provaId")) filters.provaId = Number(sp.get("provaId"));
    if (sp.get("turmaId")) filters.turmaId = sp.get("turmaId")!;
    if (sp.get("habilidade")) filters.habilidade = sp.get("habilidade")!;
    if (sp.get("alunoId")) filters.alunoId = sp.get("alunoId")!;
    if (sp.get("periodoInicio")) filters.periodoInicio = sp.get("periodoInicio")!;
    if (sp.get("periodoFim")) filters.periodoFim = sp.get("periodoFim")!;
    if (sp.get("etnia")) filters.etnia = sp.get("etnia")!;
    if (sp.get("sexo")) filters.sexo = sp.get("sexo")!;
    if (sp.get("bairro")) filters.bairro = sp.get("bairro")!;
    if (sp.get("professorId")) filters.professorId = sp.get("professorId")!;
    if (sp.get("alunoNome")) filters.alunoNome = sp.get("alunoNome")!;

    const data = await getHabilidadesAnalise(filters);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao calcular análise por habilidades.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
