import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import {
  habilidadePorCodigo,
  habilidadePorDescricao,
  habilidadePorIdentidade,
} from "@/lib/habilidades-queries";
import {
  erroCoerenciaCodigo,
  normalizarCodigo,
  parseHabilidadePayload,
  type HabilidadeEtapa,
} from "@/lib/habilidades-catalogo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function contarQuestoes(codigo: string): Promise<number> {
  const { rows } = await db.execute<{ total: number }>(sql`
    SELECT count(DISTINCT q.id)::int AS "total"
    FROM questoes q
    CROSS JOIN LATERAL unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
    WHERE u.codigo = ${codigo}
  `);
  return Number(rows[0]?.total ?? 0);
}

async function carregarHabilidade(id: number) {
  const { rows } = await db.execute<{
    id: number;
    codigo: string;
    descricao: string;
    etapa: string;
    ano: number;
    componente: string;
    categoria: string | null;
    ativo: boolean;
  }>(sql`
    SELECT
      h.id AS "id",
      h.codigo AS "codigo",
      h.descricao AS "descricao",
      h.etapa AS "etapa",
      h.ano AS "ano",
      h.componente AS "componente",
      h.categoria AS "categoria",
      h.ativo AS "ativo"
    FROM habilidades h
    WHERE h.id = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

/** Detalhe de uma habilidade. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Habilidade não encontrada." }, { status: 404 });

  const habilidade = await carregarHabilidade(id);
  if (!habilidade) return NextResponse.json({ error: "Habilidade não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, habilidade });
}

/** Edita uma habilidade (descrição, classificação, situação). */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Apenas administradores editam habilidades." }, { status: 403 });

  const id = Number((await params).id);
  const atual = await carregarHabilidade(id);
  if (!atual) return NextResponse.json({ error: "Habilidade não encontrada." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseHabilidadePayload(body, { parcial: true });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join(" "), errors: parsed.errors }, { status: 400 });
  }
  const value = parsed.value;

  // Código é a identidade usada nas questões já criadas: não pode mudar se houver vínculo
  const novoCodigo = value.codigo ? normalizarCodigo(value.codigo) : atual.codigo;
  const novaEtapa = (value.etapa ?? atual.etapa) as HabilidadeEtapa;
  const novoAno = value.ano ?? atual.ano;
  if (novoCodigo !== atual.codigo) {
    // Coerência entre o novo código e a etapa/ano que ficarão gravados
    const incoerente = erroCoerenciaCodigo(novoCodigo, novaEtapa, novoAno);
    if (incoerente) {
      return NextResponse.json({ error: incoerente }, { status: 400 });
    }
    const vinculadas = await contarQuestoes(atual.codigo);
    if (vinculadas > 0) {
      return NextResponse.json(
        { error: `O código não pode ser alterado: esta habilidade já está vinculada a ${vinculadas} questão(ões).` },
        { status: 409 }
      );
    }
    const existente = await habilidadePorCodigo(novoCodigo);
    if (existente) {
      return NextResponse.json({ error: `Já existe uma habilidade com o código ${novoCodigo}.` }, { status: 409 });
    }
    // Não criar uma segunda grafia para a mesma competência BNCC
    const mesmaIdentidade = await habilidadePorIdentidade(novoCodigo);
    if (mesmaIdentidade) {
      return NextResponse.json(
        { error: `Esta competência já está cadastrada com o código ${mesmaIdentidade.codigo}; use esse código em vez de ${novoCodigo}.` },
        { status: 409 }
      );
    }
  }

  if (value.descricao && value.descricao.toLowerCase() !== atual.descricao.toLowerCase()) {
    const duplicada = await habilidadePorDescricao(value.descricao, id);
    if (duplicada) {
      return NextResponse.json(
        { error: `Já existe uma habilidade com a mesma descrição (${duplicada.codigo}).` },
        { status: 409 }
      );
    }
  }

  const ativo = typeof body.ativo === "boolean" ? body.ativo : atual.ativo;

  const { rows } = await db.execute(sql`
    UPDATE habilidades SET
      codigo = ${novoCodigo},
      descricao = ${value.descricao ?? atual.descricao},
      etapa = ${novaEtapa},
      ano = ${novoAno},
      componente = ${value.componente ?? atual.componente},
      categoria = ${value.categoria !== undefined ? value.categoria : atual.categoria},
      ativo = ${ativo},
      atualizado_em = now()
    WHERE id = ${id}
    RETURNING id
  `);

  if (rows.length === 0) return NextResponse.json({ error: "Habilidade não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}

/**
 * Inativa a habilidade (padrão) ou exclui de vez quando não há vínculo.
 * Nunca há exclusão física de habilidade em uso: isso quebraria o histórico
 * de desempenho já calculado.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Apenas administradores editam habilidades." }, { status: 403 });

  const id = Number((await params).id);
  const atual = await carregarHabilidade(id);
  if (!atual) return NextResponse.json({ error: "Habilidade não encontrada." }, { status: 404 });

  const vinculadas = await contarQuestoes(atual.codigo);
  const forcarExclusao = new URL(req.url).searchParams.get("force") === "1";

  if (vinculadas > 0 || !forcarExclusao) {
    await db.execute(sql`UPDATE habilidades SET ativo = FALSE, atualizado_em = now() WHERE id = ${id}`);
    return NextResponse.json({
      ok: true,
      inativada: true,
      message:
        vinculadas > 0
          ? `Habilidade inativada: ela continua válida para as ${vinculadas} questão(ões) que já a utilizam.`
          : "Habilidade inativada.",
    });
  }

  await db.execute(sql`DELETE FROM habilidades WHERE id = ${id}`);
  return NextResponse.json({ ok: true, excluida: true });
}
