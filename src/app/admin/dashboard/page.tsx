import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  BarChart3,
  ClipboardList,
  Filter,
  School,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  DistributionChart,
  GroupComparisonChart,
  LegendHint,
  ProgressionChart,
} from "@/components/dashboard-charts";
import { db } from "@/db";
import { escolas, turmas } from "@/db/schema";
import { getSchoolTurmaDashboard } from "@/lib/dashboard";
import { formatDateTime, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchoolTurmaDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const escola = typeof sp.escola === "string" ? sp.escola.trim() : "";
  const turma = typeof sp.turma === "string" ? sp.turma.trim() : "";

  const escolasList = await db
    .select({ id: escolas.id, nome: escolas.nome })
    .from(escolas)
    .orderBy(asc(escolas.nome));
  const selectedEscola = escolasList.find((e) => e.nome === escola) ?? null;
  const turmasList = selectedEscola
    ? await db
        .select({ id: turmas.id, nome: turmas.nome })
        .from(turmas)
        .where(eq(turmas.escolaId, selectedEscola.id))
        .orderBy(asc(turmas.nome))
    : [];
  const turmaValida = turma && turmasList.some((t) => t.nome === turma) ? turma : "";

  const data = await getSchoolTurmaDashboard({ escolaNome: escola || null, turmaNome: turmaValida || null });

  const scopeLabel = turmaValida ? `${escola} · ${turmaValida}` : escola ? escola : "Todas as escolas";
  const comparativoLabel = turmaValida
    ? "Desempenho por prova"
    : escola
      ? "Comparativo entre turmas"
      : "Comparativo entre escolas";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <School className="h-6 w-6 text-indigo-600" /> Dashboard por turma e escola
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Linha progressiva, diagnósticas e estatísticas do escopo: <strong>{scopeLabel}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
          <Filter className="h-3.5 w-3.5" /> Filtrar por escola e turma
        </div>
      </div>

      {/* Filtros */}
      <form
        method="get"
        action="/admin/dashboard"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">Escola</label>
          <select
            name="escola"
            defaultValue={escola}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Todas as escolas</option>
            {escolasList.map((e) => (
              <option key={e.id} value={e.nome}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">Turma</label>
          <select
            name="turma"
            defaultValue={turmaValida}
            disabled={!selectedEscola}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Todas as turmas</option>
            {turmasList.map((t) => (
              <option key={t.id} value={t.nome}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <Filter className="h-4 w-4" /> Aplicar
          </button>
          {(escola || turmaValida) && (
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-4 w-4" /> Limpar
            </Link>
          )}
        </div>
      </form>

      {/* Métricas */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigMetric
          icon={<ClipboardList className="h-6 w-6" />}
          tone="bg-indigo-100 text-indigo-700"
          label="Provas aplicadas"
          value={String(data.metrics.provasAplicadas)}
          hint={`em ${scopeLabel}`}
        />
        <BigMetric
          icon={<Users className="h-6 w-6" />}
          tone="bg-emerald-100 text-emerald-700"
          label="Alunos participantes"
          value={String(data.metrics.participantes)}
          hint="alunos distintos"
        />
        <BigMetric
          icon={<TrendingUp className="h-6 w-6" />}
          tone="bg-violet-100 text-violet-700"
          label="Nota média"
          value={data.metrics.notaMedia === null ? "—" : formatScore(data.metrics.notaMedia)}
          hint="escala de 0 a 10"
        />
        <BigMetric
          icon={<Target className="h-6 w-6" />}
          tone="bg-amber-100 text-amber-700"
          label="Taxa média de acertos"
          value={data.metrics.taxaAcertos === null ? "—" : `${data.metrics.taxaAcertos.toLocaleString("pt-BR")}%`}
          hint="múltipla escolha"
        />
      </div>

      {/* Linha progressiva + Distribuição */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Linha progressiva"
          subtitle="Evolução da média percentual por prova aplicada (barras = participantes)"
          className="lg:col-span-2"
        >
          {data.series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ProgressionChart
              data={data.series.map((s) => ({ titulo: s.titulo, participantes: s.participantes, mediaPercentual: s.mediaPercentual }))}
            />
          )}
        </ChartCard>
        <ChartCard title="Distribuição de notas por faixa" subtitle="Quantidade de alunos em cada faixa">
          <DistributionChart data={data.distribution} />
        </ChartCard>
        <ChartCard title={comparativoLabel} subtitle="Nota média (0 a 10) do grupo">
          {data.comparison.length === 0 ? (
            <EmptyChart />
          ) : (
            <GroupComparisonChart data={data.comparison.slice(0, 12)} color={turmaValida ? "#0ea5e9" : escola ? "#10b981" : "#6366f1"} />
          )}
          <LegendHint />
        </ChartCard>
      </div>

      {/* Diagnósticas: questões com maior índice de erro */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Diagnóstica — questões com maior índice de erro</h2>
            <p className="text-sm text-slate-500">Pontos de atenção pedagógica do escopo selecionado</p>
          </div>
          <BarChart3 className="h-5 w-5 text-slate-300" />
        </div>
        {data.hardest.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            Ainda não há respostas suficientes para calcular os índices de erro.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Questão</th>
                  <th className="px-4 py-3 font-semibold">Prova</th>
                  <th className="px-4 py-3 font-semibold">Erros</th>
                  <th className="px-4 py-3 font-semibold">% de erro</th>
                  <th className="w-48 px-4 py-3 font-semibold">Intensidade</th>
                </tr>
              </thead>
              <tbody>
                {data.hardest.map((h) => (
                  <tr key={h.questaoId} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                    <td className="max-w-[260px] truncate px-4 py-3 font-medium text-slate-800">
                      {h.numero}. {h.pergunta}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-500">{h.provaTitulo}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {h.erros} <span className="text-slate-400">de {h.total}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">{h.rate}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(h.rate, 4)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Desempenho por prova */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-slate-900">Estatística por prova</h2>
        <p className="text-sm text-slate-500">Números que compõem a linha progressiva</p>
        {data.perProva.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            Nenhuma prova aplicada no escopo selecionado.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Prova</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Participantes</th>
                  <th className="px-4 py-3 font-semibold">Nota média</th>
                  <th className="px-4 py-3 font-semibold">Taxa de acertos</th>
                </tr>
              </thead>
              <tbody>
                {data.perProva.map((p) => (
                  <tr key={p.provaId} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                    <td className="max-w-[280px] truncate px-4 py-3 font-medium text-slate-800">{p.titulo}</td>
                    <td className="px-4 py-3 text-slate-500">{p.data ? formatDateTime(p.data) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.participantes}</td>
                    <td className="px-4 py-3 text-slate-600">{p.notaMedia === null ? "—" : formatScore(p.notaMedia)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                        {p.taxaAcertos === null ? "—" : `${p.taxaAcertos.toLocaleString("pt-BR")}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Resultados recentes */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-slate-900">Resultados recentes</h2>
        <p className="text-sm text-slate-500">Últimos envios do escopo selecionado</p>
        {data.recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            Nenhum resultado registrado ainda.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Aluno</th>
                  <th className="px-4 py-3 font-semibold">Turma</th>
                  <th className="px-4 py-3 font-semibold">Escola</th>
                  <th className="px-4 py-3 font-semibold">Acertos</th>
                  <th className="px-4 py-3 font-semibold">Nota</th>
                  <th className="px-4 py-3 font-semibold">Enviado em</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.alunoNome}</td>
                    <td className="px-4 py-3 text-slate-600">{r.alunoTurma}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-500">{r.escolaNome}</td>
                    <td className="px-4 py-3 text-slate-600">{r.nota === 0 ? "—" : `${r.percentual.toLocaleString("pt-BR")}%`}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                        {formatScore(r.nota)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(r.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BigMetric({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className ?? ""}`}>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mb-3 text-xs text-slate-400">{subtitle}</p>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
      Sem dados suficientes
    </div>
  );
}