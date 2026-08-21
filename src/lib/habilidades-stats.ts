import { sql } from "drizzle-orm";
import { db } from "@/db";
import { desempenhoThresholds } from "@/db/schema";
import {
  CLASSIFICACAO_COR,
  CLASSIFICACAO_LABEL,
  classificarPorLimiar,
  type Classificacao,
} from "@/lib/habilidades-shared";

export { CLASSIFICACAO_COR, CLASSIFICACAO_LABEL, type Classificacao };

/* ============================================================
 * ANÁLISE DE DESEMPENHO POR HABILIDADES
 *
 * Regra fundamental de contagem: cada ocorrência da habilidade
 * em cada questão e cada aluno é uma "oportunidade".
 * Ex.: H1 em 3 questões × 30 alunos = 90 oportunidades.
 *
 * Classificação de cada resposta:
 *   - ACERTO ............ correta = true
 *   - ERRO .............. respondida e correta = false
 *   - NÃO RESPONDEU ..... sem alternativa marcada e sem texto
 *                         (NÃO é contado como erro)
 * ============================================================ */

export type HabilidadeFilters = {
  provaId?: number;
  turmaId?: string;
  habilidade?: string;
  alunoId?: string;
  periodoInicio?: string; // YYYY-MM-DD
  periodoFim?: string; // YYYY-MM-DD
  /** Restrição de acesso (professor só vê as próprias provas). */
  allowedProvaIds?: number[];
};

export type ResultadoTipo = "acerto" | "erro" | "nao_respondeu";

export type QuestaoBreakdown = {
  questaoId: number;
  numero: number;
  pergunta: string;
  provaTitulo: string;
  total: number;
  acertos: number;
  erros: number;
  naoRespondeu: number;
  pctAcerto: number | null;
};

export type AlunoBreakdown = {
  alunoId: string | null;
  alunoNome: string;
  alunoTurma: string;
  questoes: number;
  acertos: number;
  erros: number;
  naoRespondeu: number;
  aproveitamento: number | null;
  classificacao: Classificacao;
};

export type HabilidadeAgg = {
  habilidade: string;
  disciplinas: string[];
  questoesCount: number;
  total: number;
  acertos: number;
  erros: number;
  naoRespondeu: number;
  pctAcerto: number | null;
  pctErro: number | null;
  classificacao: Classificacao;
};

export type HabilidadeResumo = {
  totalHabilidades: number;
  totalQuestoes: number;
  totalOportunidades: number;
  totalAlunos: number;
  totalAcertos: number;
  totalErros: number;
  totalNaoRespondeu: number;
  mediaAcerto: number | null;
  melhor: { habilidade: string; pctAcerto: number } | null;
  pior: { habilidade: string; pctAcerto: number } | null;
};

export type HabilidadeAnalise = {
  resumo: HabilidadeResumo;
  habilidades: HabilidadeAgg[];
  questoesPorHabilidade: Record<string, QuestaoBreakdown[]>;
  alunosPorHabilidade: Record<string, AlunoBreakdown[]>;
  thresholds: { verdeMin: number; amareloMin: number };
};

type RawRow = {
  habilidade: string;
  questaoId: number;
  numero: number;
  pergunta: string;
  provaTitulo: string;
  disciplina: string;
  alunoId: string | null;
  alunoNome: string;
  alunoTurma: string;
  resultado: ResultadoTipo;
};

function classificar(pct: number | null, thresholds: { verdeMin: number; amareloMin: number }): Classificacao {
  return classificarPorLimiar(pct, thresholds);
}

function emptyAnalise(thresholds: { verdeMin: number; amareloMin: number }): HabilidadeAnalise {
  return {
    resumo: {
      totalHabilidades: 0,
      totalQuestoes: 0,
      totalOportunidades: 0,
      totalAlunos: 0,
      totalAcertos: 0,
      totalErros: 0,
      totalNaoRespondeu: 0,
      mediaAcerto: null,
      melhor: null,
      pior: null,
    },
    habilidades: [],
    questoesPorHabilidade: {},
    alunosPorHabilidade: {},
    thresholds,
  };
}

async function getThresholds(): Promise<{ verdeMin: number; amareloMin: number }> {
  const [row] = await db.select().from(desempenhoThresholds).limit(1);
  return { verdeMin: row?.verdeMin ?? 80, amareloMin: row?.amareloMin ?? 60 };
}

/**
 * Análise completa por habilidade.
 * Considera cada ocorrência da habilidade em cada questão × cada aluno.
 * Percentuais são calculados sobre o TOTAL de oportunidades,
 * mantendo "Não respondeu" como categoria separada (nunca somada aos erros).
 */
export async function getHabilidadesAnalise(filters: HabilidadeFilters = {}): Promise<HabilidadeAnalise> {
  const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
  if (filters.provaId) conditions.push(sql`ra.prova_id = ${filters.provaId}`);
  if (filters.turmaId) conditions.push(sql`ra.turma_id = ${filters.turmaId}`);
  if (filters.habilidade) conditions.push(sql`${filters.habilidade} = ANY(q.habilidade)`);
  if (filters.alunoId) conditions.push(sql`ra.aluno_id = ${filters.alunoId}`);
  if (filters.periodoInicio) conditions.push(sql`ra.respondida_em >= ${filters.periodoInicio}::date`);
  if (filters.periodoFim) conditions.push(sql`ra.respondida_em < (${filters.periodoFim}::date + interval '1 day')`);
  if (filters.allowedProvaIds) {
    if (filters.allowedProvaIds.length === 0) {
      return emptyAnalise(await getThresholds());
    }
    conditions.push(sql`ra.prova_id IN (${sql.join(filters.allowedProvaIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  // Cada linha vira N linhas (uma por ocorrência de habilidade na questão),
  // garantindo que cada ocorrência seja contada individualmente.
  const { rows } = await db.execute<RawRow>(sql`
    SELECT
      unnest(q.habilidade) AS "habilidade",
      q.id AS "questaoId",
      q.numero AS "numero",
      q.pergunta AS "pergunta",
      p.titulo AS "provaTitulo",
      COALESCE(NULLIF(p.disciplina, ''), '—') AS "disciplina",
      ra.aluno_id::text AS "alunoId",
      ra.aluno_nome AS "alunoNome",
      ra.aluno_turma AS "alunoTurma",
      CASE
        WHEN ra.correta THEN 'acerto'
        WHEN ra.alternativa_id IS NULL AND COALESCE(ra.texto_resposta, '') = '' THEN 'nao_respondeu'
        ELSE 'erro'
      END AS "resultado"
    FROM respostas_alunos ra
    INNER JOIN questoes q ON q.id = ra.questao_id
    INNER JOIN provas p ON p.id = ra.prova_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY 1, q.numero, ra.aluno_nome
  `);

  const data = rows as unknown as RawRow[];
  const thresholds = await getThresholds();

  /* ---------- Agregação por habilidade ---------- */
  type Acc = {
    disciplinas: Set<string>;
    questoes: Map<number, QuestaoBreakdown>;
    alunos: Map<string, AlunoBreakdown & { key: string }>;
    total: number;
    acertos: number;
    erros: number;
    naoRespondeu: number;
  };

  const byHab = new Map<string, Acc>();
  const globalQuestoes = new Set<number>();
  const globalAlunos = new Set<string>();

  for (const r of data) {
    let acc = byHab.get(r.habilidade);
    if (!acc) {
      acc = { disciplinas: new Set(), questoes: new Map(), alunos: new Map(), total: 0, acertos: 0, erros: 0, naoRespondeu: 0 };
      byHab.set(r.habilidade, acc);
    }
    acc.disciplinas.add(r.disciplina);
    acc.total++;
    if (r.resultado === "acerto") acc.acertos++;
    else if (r.resultado === "erro") acc.erros++;
    else acc.naoRespondeu++;

    // Por questão
    let qacc = acc.questoes.get(r.questaoId);
    if (!qacc) {
      qacc = {
        questaoId: r.questaoId,
        numero: r.numero,
        pergunta: r.pergunta,
        provaTitulo: r.provaTitulo,
        total: 0,
        acertos: 0,
        erros: 0,
        naoRespondeu: 0,
        pctAcerto: null,
      };
      acc.questoes.set(r.questaoId, qacc);
      globalQuestoes.add(r.questaoId);
    }
    qacc.total++;
    if (r.resultado === "acerto") qacc.acertos++;
    else if (r.resultado === "erro") qacc.erros++;
    else qacc.naoRespondeu++;

    // Por aluno (cada resposta da mesma habilidade conta individualmente)
    const akey = `${r.alunoId ?? r.alunoNome}|${r.alunoTurma}`;
    globalAlunos.add(akey);
    let aacc = acc.alunos.get(akey);
    if (!aacc) {
      aacc = {
        key: akey,
        alunoId: r.alunoId,
        alunoNome: r.alunoNome,
        alunoTurma: r.alunoTurma,
        questoes: 0,
        acertos: 0,
        erros: 0,
        naoRespondeu: 0,
        aproveitamento: null,
        classificacao: "intervencao",
      };
      acc.alunos.set(akey, aacc);
    }
    aacc.questoes++;
    if (r.resultado === "acerto") aacc.acertos++;
    else if (r.resultado === "erro") aacc.erros++;
    else aacc.naoRespondeu++;
  }

  const round1 = (v: number) => Math.round(v * 10) / 10;

  const habilidades: HabilidadeAgg[] = [...byHab.entries()].map(([hab, acc]) => {
    const pctAcerto = acc.total > 0 ? round1((acc.acertos / acc.total) * 100) : null;
    const pctErro = acc.total > 0 ? round1((acc.erros / acc.total) * 100) : null;
    return {
      habilidade: hab,
      disciplinas: [...acc.disciplinas],
      questoesCount: acc.questoes.size,
      total: acc.total,
      acertos: acc.acertos,
      erros: acc.erros,
      naoRespondeu: acc.naoRespondeu,
      pctAcerto,
      pctErro,
      classificacao: classificar(pctAcerto, thresholds),
    };
  });
  habilidades.sort((a, b) => b.total - a.total || a.habilidade.localeCompare(b.habilidade));

  // Finalizar breakdowns
  const questoesPorHabilidade: Record<string, QuestaoBreakdown[]> = {};
  const alunosPorHabilidade: Record<string, AlunoBreakdown[]> = {};

  for (const [hab, acc] of byHab.entries()) {
    const qs = [...acc.questoes.values()];
    for (const q of qs) q.pctAcerto = q.total > 0 ? round1((q.acertos / q.total) * 100) : null;
    qs.sort((a, b) => a.numero - b.numero);
    questoesPorHabilidade[hab] = qs;

    const als = [...acc.alunos.values()].map(({ key: _key, ...a }) => {
      a.aproveitamento = a.questoes > 0 ? round1((a.acertos / a.questoes) * 100) : null;
      a.classificacao = classificar(a.aproveitamento, thresholds);
      return a;
    });
    als.sort((a, b) => (b.aproveitamento ?? 0) - (a.aproveitamento ?? 0) || a.alunoNome.localeCompare(b.alunoNome));
    alunosPorHabilidade[hab] = als;
  }

  // Resumo geral (cards)
  const totalOportunidades = habilidades.reduce((s, h) => s + h.total, 0);
  const totalAcertos = habilidades.reduce((s, h) => s + h.acertos, 0);
  const comPct = habilidades.filter((h) => h.pctAcerto !== null);
  const ordenadas = [...comPct].sort((a, b) => (b.pctAcerto ?? 0) - (a.pctAcerto ?? 0));

  const resumo: HabilidadeResumo = {
    totalHabilidades: habilidades.length,
    totalQuestoes: globalQuestoes.size,
    totalOportunidades,
    totalAlunos: globalAlunos.size,
    totalAcertos,
    totalErros: habilidades.reduce((s, h) => s + h.erros, 0),
    totalNaoRespondeu: habilidades.reduce((s, h) => s + h.naoRespondeu, 0),
    mediaAcerto: totalOportunidades > 0 ? round1((totalAcertos / totalOportunidades) * 100) : null,
    melhor: ordenadas.length > 0 ? { habilidade: ordenadas[0].habilidade, pctAcerto: ordenadas[0].pctAcerto! } : null,
    pior: ordenadas.length > 0
      ? { habilidade: ordenadas[ordenadas.length - 1].habilidade, pctAcerto: ordenadas[ordenadas.length - 1].pctAcerto! }
      : null,
  };

  return { resumo, habilidades, questoesPorHabilidade, alunosPorHabilidade, thresholds };
}

/** Opções para os filtros da tela de análise. */
export async function getHabilidadesFilterOptions(allowedProvaIds?: number[]): Promise<{
  provas: { id: number; titulo: string }[];
  turmas: { id: string; nome: string }[];
}> {
  const provaCond = allowedProvaIds
    ? allowedProvaIds.length > 0
      ? sql`AND p.id IN (${sql.join(allowedProvaIds.map((id) => sql`${id}`), sql`, `)})`
      : sql`AND false`
    : sql``;
  const provasRows = await db.execute<{ id: number; titulo: string }>(sql`
    SELECT DISTINCT p.id, p.titulo
    FROM provas p
    INNER JOIN questoes q ON q.prova_id = p.id
    WHERE q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0 ${provaCond}
    ORDER BY p.id DESC
  `);
  const turmasRows = await db.execute<{ id: string; nome: string }>(sql`
    SELECT DISTINCT t.id, t.nome
    FROM turmas t
    ORDER BY t.nome
  `);
  return {
    provas: (provasRows.rows as unknown as { id: number; titulo: string }[]) ?? [],
    turmas: (turmasRows.rows as unknown as { id: string; nome: string }[]) ?? [],
  };
}
