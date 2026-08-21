"use client";

import { useEffect, useState } from "react";
import { Target, TrendingUp, TrendingDown, CheckCircle, AlertTriangle, AlertCircle, XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DashboardAlunoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchParams.then((sp) => {
      const p: Record<string, string> = {};
      for (const [k, v] of Object.entries(sp)) { if (typeof v === "string") p[k] = v; }
      if (p.alunoId || p.alunoNome) {
        fetch(`/api/admin/habilidades/dashboard/aluno?${new URLSearchParams(p)}`)
          .then(r => r.json())
          .then(json => { if (json.ok) setData(json.data); setLoading(false); })
          .catch(() => setLoading(false));
      } else setLoading(false);
    });
  }, [searchParams]);

  const ICONS: Record<string, React.ReactNode> = {
    verde: <CheckCircle className="h-4 w-4 text-emerald-600" />,
    amarelo: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    laranja: <AlertCircle className="h-4 w-4 text-orange-600" />,
    vermelho: <XCircle className="h-4 w-4 text-rose-600" />,
  };

  if (loading) return <div className="text-center py-12 text-slate-400">Carregando...</div>;
  if (!data?.aluno) return (
    <div className="text-center py-12 text-slate-400">
      <Target className="mx-auto h-12 w-12 mb-4" />
      <p>Nenhum dado encontrado para este aluno.</p>
      <Link href="/admin/habilidades" className="mt-4 inline-block text-indigo-600 hover:underline text-sm">Voltar</Link>
    </div>
  );

  const { aluno, historico, habilidadesDesenvolvidas, habilidadesComDificuldade } = data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Target className="h-6 w-6 text-indigo-600" /> Perfil do Aluno
          </h1>
          <p className="mt-1 text-sm text-slate-500">{aluno.alunoNome} — {aluno.alunoTurma} — {aluno.escolaNome}</p>
        </div>
        <Link href="/admin/habilidades" className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className={`rounded-xl border p-5 text-center ${aluno.bg}`}>
          <p className={`text-3xl font-bold ${aluno.text}`}>{aluno.mediaGeral}%</p>
          <p className="text-sm text-slate-600 mt-1">Média Geral</p>
          <p className={`text-xs font-semibold ${aluno.text}`}>{aluno.label} {ICONS[aluno.classificacaoGeral]}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 mb-2">
            <TrendingUp className="h-4 w-4" /> Desenvolvidas
          </h3>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {habilidadesDesenvolvidas?.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma</p>
            ) : habilidadesDesenvolvidas?.map((h: any) => (
              <span key={h.habilidade} className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${h.bg} ${h.text}`}>
                {h.habilidade} ({h.percentual}%)
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 mb-2">
            <TrendingDown className="h-4 w-4" /> Com Dificuldade
          </h3>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {habilidadesComDificuldade?.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma</p>
            ) : habilidadesComDificuldade?.map((h: any) => (
              <span key={h.habilidade} className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${h.bg} ${h.text}`}>
                {h.habilidade} ({h.percentual}%)
              </span>
            ))}
          </div>
        </div>
      </div>

      <h2 className="text-lg font-bold text-slate-800 mb-3">Histórico por Prova</h2>
      {historico?.length === 0 ? (
        <p className="text-slate-400">Nenhuma prova respondida ainda.</p>
      ) : (
        <div className="space-y-4">
          {historico?.map((prova: any) => (
            <div key={prova.provaId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className={`px-5 py-3 border-b border-slate-100 flex items-center justify-between ${prova.bg}`}>
                <h3 className="font-semibold text-slate-800">{prova.provaTitulo}</h3>
                <span className={`text-sm font-bold ${prova.text}`}>{prova.mediaGeral}% — {prova.label} {ICONS[prova.classificacaoGeral]}</span>
              </div>
              <div className="p-5 space-y-3">
                {prova.disciplinas?.map((d: any) => (
                  <div key={d.disciplina}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-700">{d.disciplina}</span>
                      <span className={`text-xs font-bold ${d.text}`}>{d.media}% — {d.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.habilidades?.map((h: any) => (
                        <span key={h.habilidade} className={`rounded px-2 py-0.5 text-[9px] font-semibold ${h.bg} ${h.text}`}>
                          {h.habilidade} {h.percentual}%
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}