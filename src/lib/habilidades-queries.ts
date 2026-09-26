import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chaveComparacao,
  identidadeHabilidade,
  normalizarCodigo,
  type HabilidadeCategoria,
  type HabilidadeComponente,
  type HabilidadeEtapa,
} from "@/lib/habilidades-catalogo";

/* ============================================================
 * Consultas ao catálogo de habilidades (somente servidor)
 * ============================================================ */

export type HabilidadeRow = {
  id: number;
  codigo: string;
  descricao: string;
  etapa: HabilidadeEtapa;
  ano: number;
  componente: HabilidadeComponente;
  categoria: HabilidadeCategoria | null;
  ativo: boolean;
  questoesCount: number;
  criadoEm: Date;
  atualizadoEm: Date;
};

export type HabilidadeAtivaRow = Pick<
  HabilidadeRow,
  "id" | "codigo" | "descricao" | "etapa" | "ano" | "componente" | "categoria"
>;

export type HabilidadeFiltros = {
  busca?: string;
  etapa?: string;
  ano?: number;
  componente?: string;
  categoria?: string;
  ativo?: "true" | "false" | "todos";
  semVinculo?: boolean;
  somenteSemDescricao?: boolean;
};

const QUESTOES_POR_CODIGO = sql`
  SELECT u.codigo, count(DISTINCT qc.id)::int AS total
  FROM questoes qc
  CROSS JOIN LATERAL unnest(COALESCE(qc.habilidade, ARRAY[]::text[])) AS u(codigo)
  GROUP BY u.codigo
`;

/** Lista o catálogo com a contagem de questões que usam cada habilidade. */
export async function listarHabilidades(filtros: HabilidadeFiltros = {}): Promise<HabilidadeRow[]> {
  const cond: ReturnType<typeof sql>[] = [];
  const busca = filtros.busca?.trim();
  if (busca) cond.push(sql`(h.codigo ILIKE ${"%" + busca + "%"} OR h.descricao ILIKE ${"%" + busca + "%"})`);
  if (filtros.etapa) cond.push(sql`h.etapa = ${filtros.etapa}`);
  if (filtros.ano) cond.push(sql`h.ano = ${filtros.ano}`);
  if (filtros.componente) cond.push(sql`h.componente = ${filtros.componente}`);
  if (filtros.categoria) cond.push(sql`h.categoria = ${filtros.categoria}`);
  if (filtros.ativo === "true") cond.push(sql`h.ativo = TRUE`);
  else if (filtros.ativo === "false") cond.push(sql`h.ativo = FALSE`);
  if (filtros.semVinculo) cond.push(sql`COALESCE(q.total, 0) = 0`);
  if (filtros.somenteSemDescricao) cond.push(sql`btrim(h.descricao) = ''`);

  const { rows } = await db.execute(sql`
    SELECT
      h.id AS "id",
      h.codigo AS "codigo",
      h.descricao AS "descricao",
      h.etapa AS "etapa",
      h.ano AS "ano",
      h.componente AS "componente",
      h.categoria AS "categoria",
      h.ativo AS "ativo",
      h.criado_em AS "criadoEm",
      h.atualizado_em AS "atualizadoEm",
      COALESCE(q.total, 0) AS "questoesCount"
    FROM habilidades h
    LEFT JOIN (${QUESTOES_POR_CODIGO}) q ON q.codigo = h.codigo
    ${cond.length > 0 ? sql`WHERE ${sql.join(cond, sql` AND `)}` : sql``}
    ORDER BY h.etapa, h.ano, h.componente, h.codigo
  `);
  return rows as unknown as HabilidadeRow[];
}

/** Catálogo enxuto para os seletores de prova (só habilidades ativas). */
export async function listarHabilidadesAtivas(filtros: HabilidadeFiltros = {}): Promise<HabilidadeAtivaRow[]> {
  const cond: ReturnType<typeof sql>[] = [sql`h.ativo = TRUE`];
  if (filtros.etapa) cond.push(sql`h.etapa = ${filtros.etapa}`);
  if (filtros.ano) cond.push(sql`h.ano = ${filtros.ano}`);
  if (filtros.componente) cond.push(sql`h.componente = ${filtros.componente}`);
  if (filtros.categoria) cond.push(sql`h.categoria = ${filtros.categoria}`);
  const busca = filtros.busca?.trim();
  if (busca) cond.push(sql`(h.codigo ILIKE ${"%" + busca + "%"} OR h.descricao ILIKE ${"%" + busca + "%"})`);

  const { rows } = await db.execute(sql`
    SELECT
      h.id AS "id",
      h.codigo AS "codigo",
      h.descricao AS "descricao",
      h.etapa AS "etapa",
      h.ano AS "ano",
      h.componente AS "componente",
      h.categoria AS "categoria"
    FROM habilidades h
    WHERE ${sql.join(cond, sql` AND `)}
    ORDER BY h.etapa, h.ano, h.componente, h.codigo
  `);
  return rows as unknown as HabilidadeAtivaRow[];
}

/** Números das questões da prova que ainda não têm nenhuma habilidade vinculada. */
export async function listarQuestoesSemHabilidade(provaId: number): Promise<number[]> {
  const { rows } = await db.execute<{ numero: number }>(sql`
    SELECT q.numero AS "numero"
    FROM questoes q
    WHERE q.prova_id = ${provaId}
      AND (q.habilidade IS NULL OR cardinality(q.habilidade) = 0)
    ORDER BY q.numero
  `);
  return rows.map((r) => Number(r.numero));
}

/** Detecta códigos informados que não existem no catálogo (usados nas questões). */
export async function codigosForaDoCatalogo(codigos: string[]): Promise<string[]> {
  const normalizados = [...new Set(codigos.map(normalizarCodigo).filter(Boolean))];
  if (normalizados.length === 0) return [];
  const { rows } = await db.execute<{ codigo: string }>(sql`
    SELECT DISTINCT u.codigo AS "codigo"
    FROM unnest(ARRAY[${sql.join(normalizados.map((codigo) => sql`${codigo}`), sql`, `)}]::text[]) AS u(codigo)
    LEFT JOIN habilidades h ON h.codigo = u.codigo
    WHERE h.id IS NULL
    ORDER BY 1
  `);
  return rows.map((r) => r.codigo);
}

/** Habilidade com o mesmo código (para checar unicidade). */
export async function habilidadePorCodigo(codigo: string): Promise<{ id: number } | null> {
  const { rows } = await db.execute<{ id: number }>(sql`
    SELECT h.id AS "id" FROM habilidades h WHERE h.codigo = ${normalizarCodigo(codigo)} LIMIT 1
  `);
  return rows[0] ?? null;
}

/**
 * Habilidade com a mesma identidade BNCC, mesmo com grafia diferente do ano
 * (ex.: `EF35LP03` e `EF05LP03` são a mesma competência). Evita que uma segunda
 * grafia do mesmo código BNCC entre no catálogo e fruture as estatísticas.
 */
export async function habilidadePorIdentidade(
  codigo: string,
  ignorarId?: number
): Promise<{ id: number; codigo: string } | null> {
  const identidade = identidadeHabilidade(codigo);
  if (!identidade) return null;
  const { rows } = await db.execute<{ id: number; codigo: string }>(sql`
    SELECT h.id AS "id", h.codigo AS "codigo"
    FROM habilidades h
    WHERE left(h.codigo, 2)
          || substring(h.codigo from 4 for 1)
          || substring(h.codigo from 5 for 2)
          || substring(h.codigo from 7 for 2) = ${identidade}
      ${ignorarId !== undefined ? sql`AND h.id <> ${ignorarId}` : sql``}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

/** Habilidade com descrição equivalente (para evitar duplicidade de texto). */
export async function habilidadePorDescricao(
  descricao: string,
  ignorarId?: number
): Promise<{ id: number; codigo: string } | null> {
  const chave = chaveComparacao(descricao);
  if (!chave) return null;
  const { rows } = await db.execute<{ id: number; codigo: string; descricao: string }>(sql`
    SELECT h.id AS "id", h.codigo AS "codigo", h.descricao AS "descricao"
    FROM habilidades h
    WHERE h.descricao <> ''
      ${ignorarId ? sql`AND h.id <> ${ignorarId}` : sql``}
  `);
  const alvo = rows.find((r) => chaveComparacao(r.descricao) === chave);
  return alvo ? { id: alvo.id, codigo: alvo.codigo } : null;
}
