import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { provas, questoes, respostasAlunos, resultados } from "@/db/schema";

export type DashboardFilters = { escolaNome: string | null; turmaNome: string | null };

const round1 = (n: number) => Math.round(n * 10) / 10;

export type DashboardData = {
  metrics: {
    provasAplicadas: number;
    participantes: number;
    notaMedia: number | null;
    taxaAcertos: number | null;
  };
  series: {
    provaId: number;
    titulo: string;
    data: string;
    participantes: number;
    mediaPercentual: number;
    taxaAcertos: number;
  }[];
  distribution: { faixa: string; alunos: number }[];
  comparison: { name: string; media: number; alunos: number }[];
  hardest: {
    questaoId: number;
    numero: number;
    pergunta: string;
    provaTitulo: string;
    erros: number;
    total: number;
    rate: number;
  }[];
  perProva: {
    provaId: number;
    titulo: string;
    data: string;
    participantes: number;
    notaMedia: number | null;
    taxaAcertos: number | null;
  }[];
  recent: {
    alunoNome: string;
    alunoTurma: string;
    escolaNome: string;
    nota: number;
    percentual: number;
    criadoEm: string;
  }[];
};

/**
 * Dashboard por escola e/ou turma: métricas agregadas, linha progressiva
 * (média por prova ao longo do tempo), distribuição de notas, comparativo,
 * questões com maior índice de erro e resultados recentes.
 */
export async function getSchoolTurmaDashboard(f: DashboardFilters): Promise<DashboardData> {
  const where = and(
    f.escolaNome ? eq(resultados.escolaNome, f.escolaNome) : undefined,
    f.turmaNome ? eq(resultados.alunoTurma, f.turmaNome) : undefined
  );

  const rows = await db
    .select({
      provaId: resultados.provaId,
      alunoNome: resultados.alunoNome,
      alunoTurma: resultados.alunoTurma,
      escolaNome: resultados.escolaNome,
      nota: resultados.nota,
      percentual: resultados.percentual,
      acertos: resultados.acertos,
      erros: resultados.erros,
      criadoEm: resultados.criadoEm,
    })
    .from(resultados)
    .where(where)
    .orderBy(desc(resultados.criadoEm));

  const provaIds = Array.from(new Set(rows.map((r) => r.provaId)));
  const provasMeta = provaIds.length
    ? await db
        .select({ id: provas.id, titulo: provas.titulo, createdAt: provas.createdAt, dataFim: provas.dataFim })
        .from(provas)
        .where(inArray(provas.id, provaIds))
    : [];
  const metaById = new Map(provasMeta.map((p) => [p.id, p]));
  const metaDate = (p: { id: number; titulo: string; createdAt: Date; dataFim: Date | null }) =>
    p.dataFim?.toISOString() ?? p.createdAt.toISOString();

  const distinctAlunos = new Set(
    rows.map((r) => `${r.escolaNome}::${r.alunoTurma}::${r.alunoNome}`)
  ).size;

  const total = rows.length;
  const sumPct = rows.reduce((s, r) => s + Number(r.percentual), 0);
  const sumAcertos = rows.reduce((s, r) => s + Number(r.acertos), 0);
  const sumErros = rows.reduce((s, r) => s + Number(r.erros), 0);

  // Linha progressiva: média percentual por prova, ordenada por data
  const byProva = new Map<number, { sum: number; n: number; acertos: number; erros: number }>();
  for (const r of rows) {
    const e = byProva.get(r.provaId) ?? { sum: 0, n: 0, acertos: 0, erros: 0 };
    e.sum += Number(r.percentual);
    e.n += 1;
    e.acertos += Number(r.acertos);
    e.erros += Number(r.erros);
    byProva.set(r.provaId, e);
  }
  const series = Array.from(byProva.entries())
    .map(([pid, e]) => {
      const meta = metaById.get(pid);
      return {
        provaId: pid,
        titulo: meta?.titulo ?? `Prova #${pid}`,
        data: meta ? metaDate(meta) : "",
        participantes: e.n,
        mediaPercentual: round1(e.sum / e.n),
        taxaAcertos: e.acertos + e.erros > 0 ? round1((e.acertos / (e.acertos + e.erros)) * 100) : 0,
      };
    })
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""));

  // Distribuição de notas por faixa (0–10)
  const buckets = [
    { min: 0, max: 1.99, label: "0–2" },
    { min: 2, max: 3.99, label: "2–4" },
    { min: 4, max: 5.99, label: "4–6" },
    { min: 6, max: 7.99, label: "6–8" },
    { min: 8, max: 10, label: "8–10" },
  ];
  const distribution = buckets.map((b) => ({
    faixa: b.label,
    alunos: rows.filter((r) => Number(r.nota) >= b.min && Number(r.nota) <= b.max).length,
  }));

  // Comparativo: por escola (sem filtro) | por turma (escola selecionada) | por prova (turma selecionada)
  const comparisonRows = rows.map((r) => {
    if (f.turmaNome) {
      const meta = metaById.get(r.provaId);
      return { name: meta?.titulo ?? `Prova #${r.provaId}`, nota: Number(r.nota) };
    }
    if (f.escolaNome) return { name: r.alunoTurma || "Sem turma", nota: Number(r.nota) };
    return { name: r.escolaNome || "Sem escola", nota: Number(r.nota) };
  });
  const cmpMap = new Map<string, { sum: number; n: number }>();
  for (const c of comparisonRows) {
    const e = cmpMap.get(c.name) ?? { sum: 0, n: 0 };
    e.sum += c.nota;
    e.n += 1;
    cmpMap.set(c.name, e);
  }
  const comparison = Array.from(cmpMap.entries())
    .map(([name, e]) => ({ name, media: round1(e.sum / e.n), alunos: e.n }))
    .sort((a, b) => b.media - a.media);

  // Questões com maior índice de erro no escopo
  const hardWhere = and(
    f.escolaNome ? eq(respostasAlunos.escolaNome, f.escolaNome) : undefined,
    f.turmaNome ? eq(respostasAlunos.alunoTurma, f.turmaNome) : undefined,
    sql`${respostasAlunos.correta} is not null`
  );
  const hardAgg = await db
    .select({
      questaoId: respostasAlunos.questaoId,
      erros: sql<number>`count(*) filter (where not ${respostasAlunos.correta})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(respostasAlunos)
    .where(hardWhere)
    .groupBy(respostasAlunos.questaoId);

  const qIds = hardAgg.map((r) => r.questaoId);
  const qMeta = qIds.length
    ? await db
        .select({
          id: questoes.id,
          numero: questoes.numero,
          pergunta: questoes.pergunta,
          provaId: questoes.provaId,
        })
        .from(questoes)
        .where(inArray(questoes.id, qIds))
    : [];
  const qMetaMap = new Map(qMeta.map((q) => [q.id, q]));
  const hardest = hardAgg
    .map((r) => {
      const m = qMetaMap.get(r.questaoId);
      const total = Number(r.total);
      const erros = Number(r.erros);
      const provaMeta = m ? metaById.get(m.provaId) : undefined;
      return {
        questaoId: r.questaoId,
        numero: m?.numero ?? 0,
        pergunta: m?.pergunta ?? "",
        provaTitulo: provaMeta?.titulo ?? "",
        erros,
        total,
        rate: total > 0 ? round1((erros / total) * 100) : 0,
      };
    })
    .filter((h) => h.total > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  // Desempenho por prova (tabela numérica da linha progressiva)
  const perProva = series.map((s) => ({
    provaId: s.provaId,
    titulo: s.titulo,
    data: s.data,
    participantes: s.participantes,
    notaMedia: s.mediaPercentual / 10,
    taxaAcertos: s.taxaAcertos,
  }));

  // Resultados recentes
  const recent = rows.slice(0, 15).map((r) => ({
    alunoNome: r.alunoNome,
    alunoTurma: r.alunoTurma,
    escolaNome: r.escolaNome,
    nota: Number(r.nota),
    percentual: Number(r.percentual),
    criadoEm: r.criadoEm.toISOString(),
  }));

  return {
    metrics: {
      provasAplicadas: provaIds.length,
      participantes: distinctAlunos,
      notaMedia: total > 0 ? round1(sumPct / total / 10) : null,
      taxaAcertos: sumAcertos + sumErros > 0 ? round1((sumAcertos / (sumAcertos + sumErros)) * 100) : null,
    },
    series,
    distribution,
    comparison,
    hardest,
    perProva,
    recent,
  };
}