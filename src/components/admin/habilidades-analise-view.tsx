"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  FileText,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  CLASSIFICACAO_COR,
  CLASSIFICACAO_LABEL,
  type Classificacao,
} from "@/lib/habilidades-shared";
import type { AlunoBreakdown, HabilidadeAgg, HabilidadeAnalise } from "@/lib/habilidades-stats";
import { buildCsv } from "@/lib/utils";

const PIE_COLORS = { acertos: "#10b981", erros: "#f43f5e", naoRespondeu: "#94a3b8" };

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function ClassBadge({ classificacao }: { classificacao: Classificacao }) {
  const cor = CLASSIFICACAO_COR[classificacao];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cor.bg} ${cor.text}`}>
      {CLASSIFICACAO_LABEL[classificacao]}
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <p className="text-[11px] font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 truncate text-xl font-bold text-slate-800" title={value}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function PieDesempenho({ acertos, erros, naoRespondeu }: { acertos: number; erros: number; naoRespondeu: number }) {
  const data = [
    { name: "Acertos", value: acertos, color: PIE_COLORS.acertos },
    { name: "Erros", value: erros, color: PIE_COLORS.erros },
    ...(naoRespondeu > 0 ? [{ name: "Não respondeu", value: naoRespondeu, color: PIE_COLORS.naoRespondeu }] : []),
  ];
  const total = acertos + erros + naoRespondeu;
  if (total === 0) return <p className="py-8 text-center text-sm text-slate-400">Sem dados.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={80}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [`${value} (${pct(total > 0 ? (Number(value) / total) * 100 : null)})`, String(name)]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function HabilidadesAnaliseView({
  data,
  query,
  filtrosInfo,
}: {
  data: HabilidadeAnalise;
  query: string;
  filtrosInfo: { provaTitulo?: string; turmaNome?: string; escolaNome?: string };
}) {
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const { resumo, habilidades, questoesPorHabilidade, alunosPorHabilidade, thresholds } = data;

  const ordenadas = useMemo(
    () => [...habilidades].filter((h) => h.pctAcerto !== null).sort((a, b) => (b.pctAcerto ?? 0) - (a.pctAcerto ?? 0)),
    [habilidades]
  );

  const porDisciplina = useMemo(() => {
    const grupos: Record<string, HabilidadeAgg[]> = {};
    for (const h of habilidades) {
      for (const d of h.disciplinas) {
        if (!grupos[d]) grupos[d] = [];
        grupos[d].push(h);
      }
    }
    for (const d of Object.keys(grupos)) {
      grupos[d].sort((a, b) => b.total - a.total || a.habilidade.localeCompare(b.habilidade));
    }
    return grupos;
  }, [habilidades]);

  function downloadCsv() {
    const header = ["Habilidade", "Disciplina", "Questões", "Total de oportunidades", "Acertos", "Erros", "Não respondeu", "% Acerto", "% Erro", "Classificação"];
    const rows: (string | number)[][] = habilidades.map((h) => [
      h.habilidade,
      h.disciplinas.join(" / "),
      h.questoesCount,
      h.total,
      h.acertos,
      h.erros,
      h.naoRespondeu,
      h.pctAcerto ?? "",
      h.pctErro ?? "",
      CLASSIFICACAO_LABEL[h.classificacao],
    ]);
    const blob = new Blob([buildCsv([header, ...rows])], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-habilidades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const detalhe = selecionada ? habilidades.find((h) => h.habilidade === selecionada) : null;

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/habilidades" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Habilidades
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Target className="h-6 w-6 text-indigo-600" />
            Análise por Habilidades
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada ocorrência da habilidade em cada questão × cada aluno é contada individualmente.
            {filtrosInfo.escolaNome ? ` Escola: ${filtrosInfo.escolaNome}.` : ""}
            {filtrosInfo.provaTitulo ? ` Avaliação: ${filtrosInfo.provaTitulo}.` : ""}
            {filtrosInfo.turmaNome ? ` Turma: ${filtrosInfo.turmaNome}.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadCsv}
            disabled={habilidades.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <a
            href={`/api/admin/habilidades/analise/pdf${query ? `?${query}` : ""}`}
            className={habilidades.length === 0 ? "pointer-events-none flex items-center gap-1.5 rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-white" : "flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"}
          >
            <FileText className="h-4 w-4" /> Relatório PDF
          </a>
        </div>
      </div>

      {/* Cards de indicadores */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={<Target className="h-4 w-4" />} label="Habilidades" value={String(resumo.totalHabilidades)} />
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Questões" value={String(resumo.totalQuestoes)} />
        <KpiCard icon={<BarChart3 className="h-4 w-4" />} label="Respostas" value={String(resumo.totalOportunidades)} sub={`${resumo.totalAcertos} acertos · ${resumo.totalErros} erros`} />
        <KpiCard icon={<Award className="h-4 w-4" />} label="Média geral" value={pct(resumo.mediaAcerto)} />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Melhor desempenho"
          value={resumo.melhor ? resumo.melhor.habilidade : "—"}
          sub={resumo.melhor ? pct(resumo.melhor.pctAcerto) : undefined}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Menor desempenho"
          value={resumo.pior ? resumo.pior.habilidade : "—"}
          sub={resumo.pior ? pct(resumo.pior.pctAcerto) : undefined}
        />
      </div>

      {habilidades.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-400">
          Nenhuma resposta encontrada para os filtros selecionados.
        </p>
      ) : (
        <>
          {/* Análise geral da turma */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {Object.entries(porDisciplina).map(([disciplina, habs]) => {
              const ordenadasDisc = [...habs].filter((h) => h.pctAcerto !== null).sort((a, b) => (b.pctAcerto ?? 0) - (a.pctAcerto ?? 0));
              return (
                <div key={disciplina} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                    <TrendingUp className="h-4 w-4" /> {disciplina} — Melhores desempenhos
                  </h2>
                  <ul className="mt-3 space-y-1.5">
                    {ordenadasDisc.slice(0, 5).map((h) => (
                      <li key={h.habilidade}>
                        <button onClick={() => setSelecionada(h.habilidade)} className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-sm transition hover:bg-emerald-100/70">
                          <span className="font-semibold text-emerald-900">{h.habilidade}</span>
                          <span className="font-bold text-emerald-700">{pct(h.pctAcerto)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {Object.entries(porDisciplina).map(([disciplina, habs]) => {
              const ordenadasDisc = [...habs].filter((h) => h.pctAcerto !== null).sort((a, b) => (b.pctAcerto ?? 0) - (a.pctAcerto ?? 0));
              return (
                <div key={disciplina + "-pior"} className="rounded-xl border border-rose-200 bg-rose-50/60 p-5">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-rose-800">
                    <TrendingDown className="h-4 w-4" /> {disciplina} — Precisam de maior atenção
                  </h2>
                  <ul className="mt-3 space-y-1.5">
                    {[...ordenadasDisc].reverse().slice(0, 5).map((h) => (
                      <li key={h.habilidade}>
                        <button onClick={() => setSelecionada(h.habilidade)} className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-sm transition hover:bg-rose-100/70">
                          <span className="font-semibold text-rose-900">{h.habilidade}</span>
                          <span className="font-bold text-rose-700">{pct(h.pctAcerto)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Tabelas por disciplina */}
          {Object.entries(porDisciplina).map(([disciplina, habs]) => (
            <div key={disciplina} className="mt-6">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-800">
                <Target className="h-5 w-5 text-indigo-600" />
                {disciplina}
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Habilidade</th>
                      <th className="px-3 py-3 text-center font-semibold">Questões</th>
                      <th className="px-3 py-3 text-center font-semibold">Total</th>
                      <th className="px-3 py-3 text-center font-semibold text-emerald-700">Acertos</th>
                      <th className="px-3 py-3 text-center font-semibold text-rose-700">Erros</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-500">Não resp.</th>
                      <th className="px-3 py-3 text-center font-semibold">% Acerto</th>
                      <th className="px-3 py-3 text-center font-semibold">% Erro</th>
                      <th className="px-4 py-3 font-semibold">Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {habs.map((h) => (
                      <tr
                        key={disciplina + "-" + h.habilidade}
                        onClick={() => setSelecionada(selecionada === h.habilidade ? null : h.habilidade)}
                        className={`cursor-pointer border-b border-slate-50 transition hover:bg-indigo-50/40 ${selecionada === h.habilidade ? "bg-indigo-50/70" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                            {h.habilidade}
                            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${selecionada === h.habilidade ? "rotate-180" : ""}`} />
                          </span>
                          <p className="text-[11px] text-slate-400">{h.disciplinas.join(", ")}</p>
                        </td>
                        <td className="px-3 py-3 text-center">{h.questoesCount}</td>
                        <td className="px-3 py-3 text-center font-semibold">{h.total}</td>
                        <td className="px-3 py-3 text-center font-semibold text-emerald-700">{h.acertos}</td>
                        <td className="px-3 py-3 text-center font-semibold text-rose-600">{h.erros}</td>
                        <td className="px-3 py-3 text-center text-slate-500">{h.naoRespondeu}</td>
                        <td className="px-3 py-3 text-center font-bold text-slate-800">{pct(h.pctAcerto)}</td>
                        <td className="px-3 py-3 text-center text-slate-600">{pct(h.pctErro)}</td>
                        <td className="px-4 py-3"><ClassBadge classificacao={h.classificacao} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Percentuais calculados sobre o total de oportunidades (questões da habilidade × alunos). Respostas em branco são
            contadas como &quot;Não respondeu&quot;, separadamente dos erros. Classificação: ≥{thresholds.verdeMin}% satisfatório ·
            ≥{thresholds.amareloMin}% atenção · abaixo necessita intervenção (limiares configuráveis).
          </p>

          {/* Detalhamento da habilidade selecionada */}
          {detalhe && (
            <DetalheHabilidade
              habilidade={detalhe}
              questoes={questoesPorHabilidade[detalhe.habilidade] ?? []}
              alunos={alunosPorHabilidade[detalhe.habilidade] ?? []}
              thresholds={thresholds}
              onClose={() => setSelecionada(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function DetalheHabilidade({
  habilidade: h,
  questoes,
  alunos,
  thresholds,
  onClose,
}: {
  habilidade: HabilidadeAgg;
  questoes: HabilidadeAnalise["questoesPorHabilidade"][string];
  alunos: AlunoBreakdown[];
  thresholds: { verdeMin: number; amareloMin: number };
  onClose: () => void;
}) {
  const cor = CLASSIFICACAO_COR[h.classificacao];
  return (
    <section id="detalhe-habilidade" className="mt-8 scroll-mt-24 rounded-2xl border border-indigo-200 bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Target className="h-5 w-5 text-indigo-600" />
            {h.habilidade} — Desempenho da habilidade
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{h.disciplinas.join(", ")}</p>
        </div>
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50">
          Fechar
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        {/* Indicadores */}
        <div className="space-y-2 text-sm">
          {[
            ["Questões que avaliaram", String(h.questoesCount)],
            ["Total de oportunidades", String(h.total)],
            ["Acertos", String(h.acertos)],
            ["Erros", String(h.erros)],
            ["Não respondeu", String(h.naoRespondeu)],
            ["Aproveitamento", pct(h.pctAcerto)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5">
              <span className="text-slate-500">{label}</span>
              <span className={`font-bold ${label === "Aproveitamento" ? cor.text : "text-slate-800"}`}>{value}</span>
            </div>
          ))}
          <ClassBadge classificacao={h.classificacao} />
        </div>

        {/* Gráfico de pizza */}
        <div className="rounded-xl border border-slate-200 p-3">
          <PieDesempenho acertos={h.acertos} erros={h.erros} naoRespondeu={h.naoRespondeu} />
        </div>

        {/* Análise por questão */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <BarChart3 className="h-4 w-4 text-indigo-500" /> Questões que avaliam {h.habilidade}
          </h3>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <th className="px-2.5 py-2 font-semibold">Questão</th>
                  <th className="px-2.5 py-2 text-center font-semibold">Total</th>
                  <th className="px-2.5 py-2 text-center font-semibold">Acertos</th>
                  <th className="px-2.5 py-2 text-center font-semibold">% Acerto</th>
                </tr>
              </thead>
              <tbody>
                {questoes.map((q) => (
                  <tr key={q.questaoId} className="border-b border-slate-50 last:border-0">
                    <td className="max-w-[180px] px-2.5 py-2">
                      <p className="font-bold text-slate-700">Q{q.numero}</p>
                      <p className="truncate text-[10px] text-slate-400" title={q.pergunta}>{q.pergunta || q.provaTitulo}</p>
                    </td>
                    <td className="px-2.5 py-2 text-center">{q.total}</td>
                    <td className="px-2.5 py-2 text-center text-emerald-700">{q.acertos}</td>
                    <td className={`px-2.5 py-2 text-center font-bold ${(q.pctAcerto ?? 0) >= thresholds.verdeMin ? "text-emerald-700" : (q.pctAcerto ?? 0) >= thresholds.amareloMin ? "text-amber-600" : "text-rose-600"}`}>
                      {pct(q.pctAcerto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Desempenho por aluno */}
      <h3 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-bold text-slate-700">
        <CheckCircle2 className="h-4 w-4 text-indigo-500" /> Desempenho individual — somente as {h.questoesCount} questão(ões) de {h.habilidade}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Aluno</th>
              <th className="px-3 py-2.5 font-semibold">Turma</th>
              <th className="px-3 py-2.5 text-center font-semibold">Questões {h.habilidade}</th>
              <th className="px-3 py-2.5 text-center font-semibold text-emerald-700">Acertos</th>
              <th className="px-3 py-2.5 text-center font-semibold text-rose-600">Erros</th>
              <th className="px-3 py-2.5 text-center font-semibold text-slate-500">Não resp.</th>
              <th className="px-3 py-2.5 text-center font-semibold">Aproveitamento</th>
              <th className="px-4 py-2.5 font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody>
            {alunos.map((a) => (
              <tr key={`${a.alunoId}-${a.alunoNome}-${a.alunoTurma}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-medium text-slate-800">{a.alunoNome}</td>
                <td className="px-3 py-2.5 text-slate-500">{a.alunoTurma}</td>
                <td className="px-3 py-2.5 text-center">{a.questoes}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-emerald-700">{a.acertos}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-rose-600">{a.erros}</td>
                <td className="px-3 py-2.5 text-center text-slate-500">{a.naoRespondeu}</td>
                <td className="px-3 py-2.5 text-center font-bold text-slate-800">{pct(a.aproveitamento)}</td>
                <td className="px-4 py-2.5"><ClassBadge classificacao={a.classificacao} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
