import { asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alunos,
  alternativas,
  provas,
  questoes,
  respostasAlunos,
  resultados,
  type User,
} from "@/db/schema";
import { stripMarkdown } from "@/lib/markdown";
import { buildCsv, formatDateTime, formatScore, LETTERS } from "@/lib/utils";

export type ExportFilters = {
  provaId?: number;
  school?: string;
  studentClass?: string;
  search?: string;
};

export type ExportRow = {
  id: number;
  provaId: number;
  provaTitulo: string;
  codigo: string | null;
  alunoNome: string;
  alunoTurma: string;
  escolaNome: string;
  numeroChamada: number | null;
  score: number | null;
  correctCount: number;
  erros: number;
  percentual: number | null;
  submittedAt: Date;
};

/** Busca os resultados conforme filtros, respeitando a permissão do usuário. */
export async function fetchExportData(
  user: User,
  filters: ExportFilters
): Promise<{ rows: ExportRow[]; prova: (typeof provas.$inferSelect) | null; questions: (typeof questoes.$inferSelect)[] }> {
  const conditions = [];
  let allowedProvaIds: number[] | null = null;

  if (user.role === "teacher") {
    const own = await db.select({ id: provas.id }).from(provas).where(eq(provas.professorId, user.id));
    allowedProvaIds = own.map((e) => e.id);
    if (allowedProvaIds.length === 0) return { rows: [], prova: null, questions: [] };
    if (filters.provaId) {
      if (!allowedProvaIds.includes(filters.provaId)) return { rows: [], prova: null, questions: [] };
      conditions.push(eq(resultados.provaId, filters.provaId));
    } else {
      conditions.push(inArray(resultados.provaId, allowedProvaIds));
    }
  } else if (filters.provaId) {
    conditions.push(eq(resultados.provaId, filters.provaId));
  }

  if (filters.school) conditions.push(eq(resultados.escolaNome, filters.school));
  if (filters.studentClass) conditions.push(eq(resultados.alunoTurma, filters.studentClass));
  if (filters.search) conditions.push(ilike(resultados.alunoNome, `%${filters.search}%`));

  const rows = await db
    .select({
      id: resultados.id,
      provaId: resultados.provaId,
      provaTitulo: provas.titulo,
      codigo: provas.codigo,
      alunoNome: resultados.alunoNome,
      alunoTurma: resultados.alunoTurma,
      escolaNome: resultados.escolaNome,
      numeroChamada: alunos.numeroChamada,
      score: resultados.nota,
      correctCount: resultados.acertos,
      erros: resultados.erros,
      percentual: resultados.percentual,
      submittedAt: resultados.criadoEm,
    })
    .from(resultados)
    .innerJoin(provas, eq(resultados.provaId, provas.id))
    .leftJoin(alunos, eq(resultados.alunoId, alunos.id))
    .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` and `)}` : undefined)
    .orderBy(desc(resultados.criadoEm));

  let prova = null;
  let qs: (typeof questoes.$inferSelect)[] = [];
  if (filters.provaId) {
    const [found] = await db.select().from(provas).where(eq(provas.id, filters.provaId)).limit(1);
    prova = found ?? null;
    qs = await db
      .select()
      .from(questoes)
      .where(eq(questoes.provaId, filters.provaId))
      .orderBy(asc(questoes.ordem));
  }

  return {
    rows: rows.map((r) => ({ ...r, score: r.score === null ? null : Number(r.score), percentual: r.percentual === null ? null : Number(r.percentual) })),
    prova,
    questions: qs,
  };
}

/** Monta as linhas do CSV (com colunas por questão quando filtrado por uma prova). */
export async function buildSubmissionCsv(
  user: User,
  filters: ExportFilters
): Promise<{ csv: string; filename: string }> {
  const { rows, prova, questions: qs } = await fetchExportData(user, filters);

  const header: string[] = [
    "Aluno",
    "Nº chamada",
    "Turma",
    "Escola",
    "Prova",
    "Nota (0-10)",
    "Acertos",
    "Erros",
    "Enviada em",
  ];
  if (prova && qs.length > 0) {
    qs.forEach((q, i) => header.push(`Q${i + 1} — ${q.tipo === "multiple" ? "alternativa" : "dissertativa"}`));
  }

  const body: (string | number)[][] = rows.map((r) => {
    const base: (string | number)[] = [
      r.alunoNome,
      r.numeroChamada === null ? "" : String(r.numeroChamada).padStart(3, "0"),
      r.alunoTurma,
      r.escolaNome,
      r.provaTitulo,
      r.score === null ? "" : r.score.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      r.correctCount,
      r.erros,
      formatDateTime(r.submittedAt),
    ];
    return base;
  });

  if (prova && qs.length > 0 && rows.length > 0) {
    const provaId = filters.provaId as number;
    const ans = await db
      .select({
        resultadoId: respostasAlunos.resultadoId,
        questaoId: respostasAlunos.questaoId,
        alternativaId: respostasAlunos.alternativaId,
        textoResposta: respostasAlunos.textoResposta,
        letra: alternativas.letra,
      })
      .from(respostasAlunos)
      .leftJoin(alternativas, eq(alternativas.id, respostasAlunos.alternativaId))
      .where(eq(respostasAlunos.provaId, provaId));

    const byResultado = new Map<number, Map<number, (typeof ans)[number]>>();
    for (const a of ans) {
      if (a.resultadoId === null) continue;
      if (!byResultado.has(a.resultadoId)) byResultado.set(a.resultadoId, new Map());
      byResultado.get(a.resultadoId)!.set(a.questaoId, a);
    }
    rows.forEach((r, idx) => {
      const map = byResultado.get(r.id);
      for (const q of qs) {
        const a = map?.get(q.id);
        let value = "";
        if (a) {
          if (q.tipo === "multiple" && a.letra) {
            value = a.letra;
          } else if (a.textoResposta) {
            value = a.textoResposta.replace(/[\r\n]+/g, " ");
          }
        }
        body[idx].push(value);
      }
    });
  }

  const csv = buildCsv(body.length > 0 ? [header, ...body] : [header]);
  const suffix = prova ? `-${prova.codigo ?? prova.id}` : "";
  const name = `respostas${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  return { csv, filename: name };
}

/** Perguntas com maior índice de erro (múltipla escolha) para o relatório. */
export async function hardestQuestions(provaId?: number): Promise<
  { questionId: number; provaTitulo: string; prompt: string; errors: number; total: number; rate: number }[]
> {
  const where = provaId
    ? [eq(questoes.provaId, provaId), eq(questoes.tipo, "multiple")]
    : [eq(questoes.tipo, "multiple")];

  const rows = await db
    .select({
      questionId: questoes.id,
      provaTitulo: provas.titulo,
      prompt: questoes.pergunta,
      isCorrect: respostasAlunos.correta,
    })
    .from(respostasAlunos)
    .innerJoin(questoes, eq(respostasAlunos.questaoId, questoes.id))
    .innerJoin(provas, eq(questoes.provaId, provas.id))
    .where(where.length > 0 ? sql`${sql.join(where, sql` and `)}` : undefined);

  const stats = new Map<
    number,
    { questionId: number; provaTitulo: string; prompt: string; errors: number; total: number }
  >();
  for (const r of rows) {
    const s = stats.get(r.questionId) ?? {
      questionId: r.questionId,
      provaTitulo: r.provaTitulo,
      prompt: r.prompt,
      errors: 0,
      total: 0,
    };
    s.total += 1;
    if (r.isCorrect === false) s.errors += 1;
    stats.set(r.questionId, s);
  }

  return Array.from(stats.values())
    .filter((s) => s.total >= 1)
    .map((s) => ({ ...s, rate: Math.round((s.errors / s.total) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .slice(0, 8)
    .map((s) => ({ ...s, prompt: stripMarkdown(s.prompt) }));
}

export function scoreLabel(score: number | null): string {
  return score === null ? "—" : formatScore(score);
}

export { LETTERS };
