import { BarChart3, ClipboardList, FileDown, FileText, Target, TrendingUp, Users } from "lucide-react";
import { DistributionChart, GroupComparisonChart, LegendHint } from "@/components/dashboard-charts";
import { hardestQuestions } from "@/lib/exports";
import { getAdminStats } from "@/lib/stats";
import { formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const stats = await getAdminStats();
  const hardest = await hardestQuestions();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard executivo</h1>
          <p className="mt-1 text-sm text-slate-500">
            Visão consolidada de todas as provas e respostas da plataforma.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/exports/csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileDown className="h-3.5 w-3.5" /> Exportar Excel (CSV)
          </a>
          <a
            href="/api/exports/pdf"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" /> Exportar PDF
          </a>
        </div>
      </div>

      {/* Métricas principais */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigMetric
          icon={<ClipboardList className="h-6 w-6" />}
          tone="bg-indigo-100 text-indigo-700"
          label="Provas aplicadas"
          value={String(stats.totalExamsApplied)}
          hint="ativas e finalizadas"
        />
        <BigMetric
          icon={<Users className="h-6 w-6" />}
          tone="bg-emerald-100 text-emerald-700"
          label="Alunos participantes"
          value={String(stats.totalSubmissions)}
          hint="provas enviadas"
        />
        <BigMetric
          icon={<TrendingUp className="h-6 w-6" />}
          tone="bg-violet-100 text-violet-700"
          label="Nota média geral"
          value={stats.avgScore === null ? "—" : formatScore(stats.avgScore)}
          hint="escala de 0 a 10"
        />
        <BigMetric
          icon={<Target className="h-6 w-6" />}
          tone="bg-amber-100 text-amber-700"
          label="Taxa média de acertos"
          value={stats.correctRate === null ? "—" : `${stats.correctRate.toLocaleString("pt-BR")}%`}
          hint="múltipla escolha"
        />
      </div>

      {/* Gráficos */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Distribuição de notas por faixa" subtitle="Quantidade de alunos em cada faixa de nota">
          <DistributionChart data={stats.distribution} />
        </ChartCard>
        <ChartCard title="Desempenho médio por turma" subtitle="Nota média das turmas (múltipla escolha)">
          {stats.byClass.length === 0 ? (
            <EmptyChart />
          ) : (
            <GroupComparisonChart data={stats.byClass.slice(0, 10)} color="#6366f1" />
          )}
        </ChartCard>
        <ChartCard
          title="Comparativo entre escolas"
          subtitle="Nota média de cada escola"
          className="lg:col-span-2"
        >
          {stats.bySchool.length === 0 ? (
            <EmptyChart />
          ) : (
            <GroupComparisonChart data={stats.bySchool.slice(0, 12)} color="#0ea5e9" />
          )}
          <LegendHint />
        </ChartCard>
      </div>

      {/* Questões com maior índice de erro */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Questões com maior índice de erro</h2>
            <p className="text-sm text-slate-500">Pontos de atenção pedagógica em toda a plataforma</p>
          </div>
          <BarChart3 className="h-5 w-5 text-slate-300" />
        </div>
        {hardest.length === 0 ? (
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
                {hardest.map((h) => (
                  <tr key={h.questionId} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                    <td className="max-w-[260px] truncate px-4 py-3 font-medium text-slate-800">{h.prompt}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-500">{h.provaTitulo}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {h.errors} <span className="text-slate-400">de {h.total}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                        {h.rate}%
                      </span>
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
