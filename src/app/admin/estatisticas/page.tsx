import Link from "next/link";
import { BarChart3, ClipboardList, FileDown, FileText, School, Users, UserRound } from "lucide-react";
import FiltrosBar from "@/components/admin/filtros-bar";
import { SerieChart } from "@/components/admin/serie-chart";
import { fetchEstatisticas, fetchOpcoesFiltros, parseAlunoFilters } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminEstatisticasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  const filters = parseAlunoFilters(params);
  const [opcoes, stats] = await Promise.all([fetchOpcoesFiltros(), fetchEstatisticas(filters)]);

  const exportHref = params.toString() ? `/api/admin/alunos?${params.toString()}&formato=csv` : "/api/admin/alunos?formato=csv";
  const pdfHref = params.toString() ? `/api/exports/relatorio-alunos?${params.toString()}` : "/api/exports/relatorio-alunos";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <BarChart3 className="h-6 w-6 text-indigo-600" /> Estatísticas da base escolar
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Distribuição de alunos por etnia, gênero, bairro, turma e professor.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileDown className="h-3.5 w-3.5" /> Exportar Excel (CSV)
          </Link>
          <Link
            href={pdfHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" /> Relatório PDF
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <FiltrosBar action="/admin/estatisticas" opcoes={opcoes} valores={filters} />
      </div>

      {/* Métricas */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigMetric icon={<Users className="h-5 w-5" />} tone="bg-indigo-100 text-indigo-700" label="Alunos (escopo)" value={String(stats.totalAlunos)} />
        <BigMetric icon={<ClipboardList className="h-5 w-5" />} tone="bg-emerald-100 text-emerald-700" label="Turmas" value={String(stats.totalTurmas)} />
        <BigMetric icon={<UserRound className="h-5 w-5" />} tone="bg-violet-100 text-violet-700" label="Professores" value={String(stats.totalProfessores)} />
        <BigMetric icon={<School className="h-5 w-5" />} tone="bg-amber-100 text-amber-700" label="Escolas" value={String(stats.totalEscolas)} />
      </div>

      {/* Gráficos */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Alunos por etnia" subtitle="Cor/raça declarada (IBGE)">
          <SerieChart data={stats.porEtnia} color="#auto" />
        </ChartCard>
        <ChartCard title="Alunos por gênero" subtitle="Sexo declarado">
          <SerieChart data={stats.porGenero} color="#0ea5e9" />
        </ChartCard>
        <ChartCard title="Alunos por bairro" subtitle="Top 12 bairros de residência">
          <SerieChart data={stats.porBairro} color="#10b981" />
        </ChartCard>
        <ChartCard title="Matrículas por professor" subtitle="Top 12 professores por quantidade de alunos">
          <SerieChart data={stats.porProfessor} color="#f59e0b" />
        </ChartCard>
      </div>

      {/* Turmas */}
      <section className="mt-8">
        <ChartCard title="Matrículas por turma" subtitle="Quantidade de alunos por turma no escopo selecionado">
          <SerieChart data={stats.porTurma} color="#6366f1" />
        </ChartCard>
      </section>
    </div>
  );
}

function BigMetric({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
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