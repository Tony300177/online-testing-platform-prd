import { sql } from "drizzle-orm";
import { db } from "@/db";
import { alternativas, provas, questoes, respostasAlunos, resultados } from "@/db/schema";

export type DistributionBucket = { faixa: string; alunos: number };

export type GroupStat = { name: string; media: number; alunos: number };

export type ScoreDistribution = DistributionBucket[];

export type ClassStat = GroupStat;

export type SchoolStat = GroupStat;

export type AdminStats = {
  totalExamsApplied: number;
  totalSubmissions: number;
  avgScore: number | null;
  correctRate: number | null;
  distribution: ScoreDistribution;
  byClass: ClassStat[];
  bySchool: SchoolStat[];
};

export async function getAdminStats(): Promise<AdminStats> {
  const [totalExamsApplied] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(provas)
    .where(sql`${provas.status} in ('active','finished')`);

  const [totalSubmissions] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resultados);

  const [avgScore] = await db
    .select({ avg: sql<number | null>`round(avg(${resultados.nota})::numeric, 2)` })
    .from(resultados);

  const [correctRate] = await db
    .select({
      rate: sql<number | null>`round(100.0 * sum(${resultados.acertos})::numeric / nullif(sum(${resultados.acertos}) + sum(${resultados.erros}), 0), 1)`,
    })
    .from(resultados);

  const buckets = [
    { min: 0, max: 1.99, label: "0–2" },
    { min: 2, max: 3.99, label: "2–4" },
    { min: 4, max: 5.99, label: "4–6" },
    { min: 6, max: 7.99, label: "6–8" },
    { min: 8, max: 10, label: "8–10" },
  ];
  const distribution: ScoreDistribution = [];
  for (const b of buckets) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resultados)
      .where(sql`${resultados.nota} >= ${b.min} and ${resultados.nota} <= ${b.max}`);
    distribution.push({ faixa: b.label, alunos: row?.count ?? 0 });
  }

  const byClass = await db
    .select({
      name: resultados.alunoTurma,
      avgScore: sql<number>`round(avg(${resultados.nota})::numeric, 2)`,
      count: sql<number>`count(*)::int`,
    })
    .from(resultados)
    .groupBy(resultados.alunoTurma)
    .orderBy(sql`avg(${resultados.nota}) desc`);

  const bySchool = await db
    .select({
      name: resultados.escolaNome,
      avgScore: sql<number>`round(avg(${resultados.nota})::numeric, 2)`,
      count: sql<number>`count(*)::int`,
    })
    .from(resultados)
    .groupBy(resultados.escolaNome)
    .orderBy(sql`avg(${resultados.nota}) desc`);

  return {
    totalExamsApplied: totalExamsApplied.count,
    totalSubmissions: totalSubmissions.count,
    avgScore: avgScore?.avg ?? null,
    correctRate: correctRate?.rate ?? null,
    distribution,
    byClass: byClass.map((r) => ({ name: r.name ?? "Sem turma", media: Number(r.avgScore), alunos: r.count })),
    bySchool: bySchool.map((r) => ({
      name: r.name ?? "Sem escola",
      media: Number(r.avgScore),
      alunos: r.count,
    })),
  };
}

export type ProvaStats = {
  totalSubmissions: number;
  avgScore: number | null;
  correctRate: number | null;
  distribution: ScoreDistribution;
  byClass: ClassStat[];
};

export async function getProvaStats(provaId: number): Promise<ProvaStats> {
  const [totalSubmissions] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resultados)
    .where(sql`${resultados.provaId} = ${provaId}`);

  const [avgScore] = await db
    .select({ avg: sql<number | null>`round(avg(${resultados.nota})::numeric, 2)` })
    .from(resultados)
    .where(sql`${resultados.provaId} = ${provaId}`);

  const [correctRate] = await db
    .select({
      rate: sql<number | null>`round(100.0 * sum(${resultados.acertos})::numeric / nullif(sum(${resultados.acertos}) + sum(${resultados.erros}), 0), 1)`,
    })
    .from(resultados)
    .where(sql`${resultados.provaId} = ${provaId}`);

  const byClass = await db
    .select({
      name: resultados.alunoTurma,
      avgScore: sql<number>`round(avg(${resultados.nota})::numeric, 2)`,
      count: sql<number>`count(*)::int`,
    })
    .from(resultados)
    .where(sql`${resultados.provaId} = ${provaId}`)
    .groupBy(resultados.alunoTurma)
    .orderBy(sql`avg(${resultados.nota}) desc`);

  return {
    totalSubmissions: totalSubmissions.count,
    avgScore: avgScore?.avg ?? null,
    correctRate: correctRate?.rate ?? null,
    distribution: [],
    byClass: byClass.map((r) => ({ name: r.name ?? "Sem turma", media: Number(r.avgScore), alunos: r.count })),
  };
}

/** Contagem de acertos/erros por questão de uma prova. */
export type QuestionStat = {
  questaoId: number;
  numero: number;
  pergunta: string;
  tipo: string;
  valor: number;
  acertos: number;
  erros: number;
};

export async function getQuestionStats(provaId: number): Promise<QuestionStat[]> {
  const qs = await db
    .select()
    .from(questoes)
    .where(sql`${questoes.provaId} = ${provaId}`)
    .orderBy(questoes.ordem);

  const rows = await db
    .select({
      questaoId: respostasAlunos.questaoId,
      acertos: sql<number>`count(*) filter (where ${respostasAlunos.correta})::int`,
      erros: sql<number>`count(*) filter (where not ${respostasAlunos.correta})::int`,
    })
    .from(respostasAlunos)
    .where(sql`${respostasAlunos.provaId} = ${provaId} and ${respostasAlunos.correta} is not null`)
    .groupBy(respostasAlunos.questaoId);

  const byId = new Map(rows.map((r) => [r.questaoId, r]));

  return qs.map((q) => {
    const r = byId.get(q.id) ?? { acertos: 0, erros: 0 };
    return {
      questaoId: q.id,
      numero: q.numero,
      pergunta: q.pergunta,
      tipo: q.tipo,
      valor: Number(q.valor),
      acertos: Number(r.acertos),
      erros: Number(r.erros),
    };
  });
}

/** Distribuição de notas por faixa de uma prova. */
export async function getDistribution(provaId: number): Promise<ScoreDistribution> {
  const buckets = [
    { min: 0, max: 1.99, label: "0–2" },
    { min: 2, max: 3.99, label: "2–4" },
    { min: 4, max: 5.99, label: "4–6" },
    { min: 6, max: 7.99, label: "6–8" },
    { min: 8, max: 10, label: "8–10" },
  ];
  const distribution: ScoreDistribution = [];
  for (const b of buckets) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(resultados)
      .where(sql`${resultados.provaId} = ${provaId} and ${resultados.nota} >= ${b.min} and ${resultados.nota} <= ${b.max}`);
    distribution.push({ faixa: b.label, alunos: row?.count ?? 0 });
  }
  return distribution;
}

/** Total de respostas marcadas para uma alternativa (análise de distratores). */
export async function getAlternativaCounts(provaId: number): Promise<
  { questaoId: number; alternativaId: number | null; letra: string; texto: string; count: number }[]
> {
  const rows = await db
    .select({
      questaoId: respostasAlunos.questaoId,
      alternativaId: respostasAlunos.alternativaId,
      letra: alternativas.letra,
      texto: alternativas.texto,
      count: sql<number>`count(*)::int`,
    })
    .from(respostasAlunos)
    .leftJoin(alternativas, sql`${alternativas.id} = ${respostasAlunos.alternativaId}`)
    .where(sql`${respostasAlunos.provaId} = ${provaId} and ${respostasAlunos.alternativaId} is not null`)
    .groupBy(respostasAlunos.questaoId, respostasAlunos.alternativaId, alternativas.letra, alternativas.texto);

  return rows.map((r) => ({
    questaoId: r.questaoId,
    alternativaId: r.alternativaId,
    letra: r.letra ?? "—",
    texto: r.texto ?? "—",
    count: Number(r.count),
  }));
}