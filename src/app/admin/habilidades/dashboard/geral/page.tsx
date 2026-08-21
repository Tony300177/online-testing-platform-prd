import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { escolas, provas } from "@/db/schema";
import { Target, TrendingUp, Users, School, AlertCircle, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminHabilidadesDashboardGeralPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const provaId = typeof sp.provaId === "string" ? sp.provaId : "";

  const [escolasRows, provasRows] = await Promise.all([
    db.select({ id: escolas.id, nome: escolas.nome }).from(escolas).orderBy(escolas.nome),
    db.select({ id: provas.id, titulo: provas.titulo }).from(provas).orderBy(provas.id),
  ]);

  const apiUrl = `/api/admin/habilidades/dashboard/geral${provaId ? `?provaId=${provaId}` : ""}${escolasRows.length === 1 ? `&escolaId=${escolasRows[0].id}` : ""}`;
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}${apiUrl}`, { cache: "no-store" });
  const json = await res.json();

  if (!json.ok || !json.data) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Target className="mx-auto h-12 w-12 text-slate-300 mb-4" />
        <p className="text-lg">Erro ao carregar dashboard</p>
        <p className="text-sm mt-1">{json.error || "Sem dados"}</p>
      </div>
    );
  }

  const { data: escolasData, thresholds } = json;

  const ICONS = {
    verde: <CheckCircle className="h-4 w-4 text-emerald-600" />,
    amarelo: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    laranja: <AlertCircle className="h-4 w-4 text-orange-600" />,
    vermelho: <XCircle className="h-4 w-4 text-rose-600" />,
  };

  const LABELS = {
    verde: "Satisfatório (80-100%)",
    amarelo: "Em desenvolvimento (60-79%)",
    laranja: "Necessita acompanhamento (40-59%)",
    vermelho: "Necessita intervenção (0-39%)",
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Target className="h-6 w-6 text-indigo-600" />
            Dashboard Geral — Habilidades
          </h1>
          <p className="mt-1 text-sm text-slate-500">Visão consolidada por escola e disciplina.</p>
        </div>
        <div className="flex gap-2">
          <form method="get" className="flex items-center gap-2">
            <select name="provaId" defaultValue={provaId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">Todas as provas</option>
              {provasRows.map((p) => (
                <option key={p.id} value={p.id}>{p.titulo}</option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Filtrar</button>
          </form>
          <Link href="/admin/habilidades/config" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Limiares
          </Link>
        </div>
      </div>

      {/* Resumo dos Limiares */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["verde", "amarelo", "laranja", "vermelho"] as const).map((k) => (
          <span key={k} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${{
            verde: "bg-emerald-100 text-emerald-800",
            amarelo: "bg-amber-100 text-amber-800",
            laranja: "bg-orange-100 text-orange-800",
            vermelho: "bg-rose-100 text-rose-800",
          }[k]}`}>
            {ICONS[k]} {LABELS[k]}
          </span>
        ))}
      </div>

      {escolasData.length === 0 ? (
        <p className="text-center text-slate-400 py-12">Nenhum dado de habilidade encontrado para os filtros selecionados.</p>
      ) : (
        <div className="space-y-6">
          {escolasData.map((escola: any) => (
            <section key={escola.escolaNome} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Cabeçalho da Escola */}
              <div className={`px-5 py-4 border-b border-slate-100 ${escola.bg} bg-opacity-50`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                      <School className="h-5 w-5 text-indigo-600" />
                      {escola.escolaNome}
                    </h2>
                    <p className="text-sm text-slate-500">
                      Média geral: <span className="font-semibold">{escola.mediaGeral}%</span> —
                      <span className={escola.text}>{escola.label}</span> {ICONS[escola.classificacaoGeral as keyof typeof ICONS]}
                    </p>
                  </div>
                </div>
              </div>

              {/* Top 5 Dificuldades */}
              {escola.topDificuldade.length > 0 && (
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Habilidades com maior dificuldade</h3>
                  <div className="flex flex-wrap gap-2">
                    {escola.topDificuldade.map((h: any, i: number) => (
                      <span key={`${escola.escolaNome}-${h.habilidade}`} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-100">
                        <span className="rounded-full bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">{i + 1}</span>
                        {h.habilidade} ({h.percentual}%) — {h.disciplina}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Disciplinas */}
              <div className="p-5">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {escola.disciplinas.map((disc: any) => (
                    <div key={`${escola.escolaNome}-${disc.disciplina}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-slate-800">{disc.disciplina}</h4>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${disc.bg} ${disc.text}`}>
                          {ICONS[disc.classificacao as keyof typeof ICONS]} {disc.media}%
                        </span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {disc.habilidades.map((h: any) => (
                          <div key={`${escola.escolaNome}-${disc.disciplina}-${h.habilidade}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-slate-50">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 truncate">{h.habilidade}</p>
                              <p className="text-[11px] text-slate-500">{h.acertos}/{h.total} acertos</p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${h.bg} ${h.text}`}>
                              {ICONS[h.classificacao as keyof typeof ICONS]} {h.percentual}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}