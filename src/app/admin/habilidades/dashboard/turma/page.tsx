"use client";

import { useEffect, useState } from "react";
import { Target, Users, TrendingUp, CheckCircle, AlertTriangle, AlertCircle, XCircle } from "lucide-react";
import Link from "next/link";

type Count = { total: number; acertos: number };
type HabInfo = { habilidade: string; percentual: number; total: number; acertos: number; classificacao: string; bg: string; text: string; label: string; icon: string; disciplina?: string };
type DiscInfo = { disciplina: string; media: number; classificacao: string; bg: string; text: string; label: string; habilidades: HabInfo[] };
type AlunoData = { posicao?: number; label?: string; alunoNome: string; alunoTurma: string; alunoId: string; mediaGeral: number; classificacaoGeral: string; bg: string; text: string; disciplinas: DiscInfo[] };

export default function DashboardTurmaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, setData] = useState<{ turma: any; ranking: AlunoData[]; topDificuldade: HabInfo[]; thresholds: any } | null>(null);
  const [turmaId, setTurmaId] = useState("");
  const [escolaId, setEscolaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sp, setSp] = useState<Record<string, string | string[] | undefined>>({});

  useEffect(() => { searchParams.then(setSp); }, [searchParams]);

  const fetchData = async (tid: string) => {
    if (!tid) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/habilidades/dashboard/turma?turmaId=${tid}${escolaId ? `&escolaId=${escolaId}` : ""}`);
      const json = await r.json();
      if (json.ok) setData(json.data);
    } catch {}
    setLoading(false);
  };

  const ICONS: Record<string, React.ReactNode> = {
    verde: <CheckCircle className="h-4 w-4 text-emerald-600" />,
    amarelo: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    laranja: <AlertCircle className="h-4 w-4 text-orange-600" />,
    vermelho: <XCircle className="h-4 w-4 text-rose-600" />,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Users className="h-6 w-6 text-indigo-600" />
            Dashboard da Turma
          </h1>
          <p className="mt-1 text-sm text-slate-500">Média, ranking e habilidades da turma.</p>
        </div>
        <Link href="/admin/habilidades" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          ← Voltar
        </Link>
      </div>

      {data && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className={`rounded-xl px-4 py-3 text-center ${data.turma.bg}`}>
              <p className={`text-2xl font-bold ${data.turma.text}`}>{data.turma.media}%</p>
              <p className="text-[11px] text-slate-500">Média da Turma</p>
              <p className={`text-xs font-semibold ${data.turma.text}`}>{data.turma.label} {ICONS[data.turma.classificacao]}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Top 10 Habilidades Mais Difíceis</h3>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.topDificuldade.map((h, i) => (
                  <span key={i} className="rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-medium text-rose-700 border border-rose-100">
                    {h.habilidade} ({h.percentual}%) — {h.disciplina}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
          {/* Ranking */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Ranking dos Alunos</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.ranking.map((a, i) => (
                <Link
                  key={a.alunoId}
                  href={`/admin/habilidades/dashboard/aluno?alunoId=${a.alunoId}&alunoNome=${encodeURIComponent(a.alunoNome)}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-indigo-50/50 transition"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {a.posicao}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{a.alunoNome}</p>
                    <p className="text-[11px] text-slate-500">{a.alunoTurma}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">{a.mediaGeral}%</p>
                    <p className={`text-[10px] font-semibold ${a.text}`}>{a.label}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Detalhamento por Aluno */}
          <div className="space-y-4 max-h-[80vh] overflow-y-auto">
            {data.ranking.map((a) => (
              <div key={a.alunoId} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-800">{a.alunoNome}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${a.bg} ${a.text}`}>
                    {a.mediaGeral}%
                  </span>
                </div>
                {a.disciplinas.map((d) => (
                  <div key={d.disciplina} className="mt-2">
                    <p className="text-[11px] font-semibold text-slate-600">{d.disciplina} — {d.media}%</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.habilidades.map((h) => (
                        <span key={h.habilidade} className={`rounded px-2 py-0.5 text-[9px] font-semibold ${h.bg} ${h.text}`}>
                          {h.habilidade} {h.percentual}%
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}