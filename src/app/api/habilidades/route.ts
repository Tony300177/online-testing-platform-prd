import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listarHabilidadesAtivas, type HabilidadeFiltros } from "@/lib/habilidades-queries";

export const dynamic = "force-dynamic";

/** Catálogo de habilidades (somente leitura) usado nos seletores de prova. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const ano = searchParams.get("ano");
    const filtros: HabilidadeFiltros = {
      busca: searchParams.get("q") ?? undefined,
      etapa: searchParams.get("etapa") ?? undefined,
      ano: ano ? Number(ano) : undefined,
      componente: searchParams.get("componente") ?? undefined,
      categoria: searchParams.get("categoria") ?? undefined,
    };

    const habilidades = await listarHabilidadesAtivas(filtros);
    return NextResponse.json({ ok: true, habilidades });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao carregar o catálogo de habilidades.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
