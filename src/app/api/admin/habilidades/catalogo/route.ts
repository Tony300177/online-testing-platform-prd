import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import {
  habilidadePorCodigo,
  habilidadePorDescricao,
  listarHabilidades,
  type HabilidadeFiltros,
} from "@/lib/habilidades-queries";
import { parseHabilidadePayload } from "@/lib/habilidades-catalogo";

export const dynamic = "force-dynamic";

/** Lista o catálogo de habilidades (admin). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const ano = searchParams.get("ano");
    const situacao = searchParams.get("situacao");
    const filtros: HabilidadeFiltros = {
      busca: searchParams.get("q") ?? undefined,
      etapa: searchParams.get("etapa") ?? undefined,
      ano: ano ? Number(ano) : undefined,
      componente: searchParams.get("componente") ?? undefined,
      categoria: searchParams.get("categoria") ?? undefined,
      ativo: situacao === "inativo" ? "false" : situacao === "todos" ? "todos" : "true",
      semVinculo: searchParams.get("semVinculo") === "1",
      somenteSemDescricao: searchParams.get("pendentes") === "1",
    };

    const habilidades = await listarHabilidades(filtros);
    return NextResponse.json({ ok: true, habilidades });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao listar habilidades.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Cadastra uma habilidade. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Apenas administradores cadastram habilidades." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseHabilidadePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join(" "), errors: parsed.errors }, { status: 400 });
  }
  const value = parsed.value;

  const existente = await habilidadePorCodigo(value.codigo!);
  if (existente) {
    return NextResponse.json(
      { error: `Já existe uma habilidade cadastrada com o código ${value.codigo}.` },
      { status: 409 }
    );
  }
  const duplicada = await habilidadePorDescricao(value.descricao!);
  if (duplicada) {
    return NextResponse.json(
      { error: `Já existe uma habilidade com a mesma descrição (${duplicada.codigo}).` },
      { status: 409 }
    );
  }

  const { rows } = await db.execute(sql`
    INSERT INTO habilidades (codigo, descricao, etapa, ano, componente, categoria, criado_por)
    VALUES (${value.codigo}, ${value.descricao}, ${value.etapa}, ${value.ano}, ${value.componente}, ${value.categoria}, ${user.id})
    RETURNING id
  `);

  return NextResponse.json({ ok: true, id: rows[0]?.id ?? null });
}
