import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { escolas, provas, respostasAlunos, questoes, desempenhoThresholds } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { Target, School, AlertCircle, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

function classificarDesempenho(pct: number, t: { verdeMin: number; amareloMin: number; laranjaMin: number }) {
  if (pct >= t.verdeMin) return "verde";
  if (pct >= t.amareloMin) return "amarelo";
  if (pct >= t.laranjaMin) return "laranja";
  return "vermelho";
}
function getCor(c: string) {
  switch (c) {
    case "verde": return { bg: "bg-emerald-100", text: "text-emerald-800", label: "Satisfatório" };
    case "amarelo": return { bg: "bg-amber-100", text: "text-amber-800", label: "Em desenvolvimento" };
    case "laranja": return { bg: "bg-orange-100", text: "text-orange-800", label: "Necessita acompanhamento" };
    default: return { bg: "bg-rose-100", text: "text-rose-800", label: "Necessita intervenção" };
  }
}

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

  const [thresholdRow] = await db
    .select()
    .from(desempenhoThresholds)
    .where(sql`escola_id IS NULL`)
    .limit(1);
  const thresholds = thresholdRow ?? { verdeMin: 80, amareloMin: 60, laranjaMin: 40 };

  const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
  if (provaId) conditions.push(eq(respostasAlunos.provaId, Number(provaId)));

  const { rows } = await db.execute(sql`
    SELECT
      ra.escola_nome AS "escolaNome",
      q.disciplina,
      unnest(q.habilidade) AS habilidade,
      ra.correta
    FROM respostas_alunos ra
    INNER JOIN questoes q ON q.id = ra.questao_id
    INNER JOIN provas p ON p.id = ra.prova_id
    WHERE ${sql.join(conditions, sql` AND `)}
  `);

  type Count = { total: number; acertos: number };
  const map: Record<string, Record<string, Record<string, Count>>> = {};

  for (const r of rows as any[]) {
    const escola = r.escolaNome ?? "—";
    const disc = r.disciplina ?? "—";
    const hab = r.habilidade;
    if (!map[escola]) map[escola] = {};
    if (!map[escola][disc]) map[escola][disc] = {};
    if (!map[escola][disc][hab]) map[escola][disc][hab] = { total: 0, acertos: 0 };
    map[escola][disc][hab].total++;
    if (r.correta) map[escola][disc][hab].acertos++;
  }

  const escolasData = Object.entries(map).map(([escolaNome, disciplinas]) => {
    const discData = Object.entries(disciplinas).map(([disciplina, habs]) => {
      const habData = Object.entries(habs).map(([habilidade, c]) => {
        const pct = c.total > 0 ? Math.round((c.acertos / c.total) * 100) : 0;
        const classif = classificarDesempenho(pct, thresholds);
        return { habilidade, total: c.total, acertos: c.acertos, percentual: pct, classificacao: classif, ...getCor(classif) };
      }).sort((a, b) => a.percentual - b.percentual);

      const totalGeral = habData.reduce((s, h) => s + h.total, 0);
      const acertosGeral = habData.reduce((s, h) => s + h.acertos, 0);
      const mediaDisc = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
      const classifDisc = classificarDesempenho(mediaDisc, thresholds);
      return { disciplina, media: mediaDisc, classificacao: classifDisc, ...getCor(classifDisc), habilidades: habData };
    });

    const allHabs = discData.flatMap(d => d.habilidades);
    const totalGeral = allHabs.reduce((s, h) => s + h.total, 0);
    const acertosGeral = allHabs.reduce((s, h) => s + h.acertos, 0);
    const mediaGeral = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
    const classifGeral = classificarDesempenho(mediaGeral, thresholds);

    const topDificuldade = [...allHabs]
      .sort((a, b) => a.percentual - b.percentual)
      .slice(0, 5)
      .map(h => ({ habilidade: h.habilidade, percentual: h.percentual, disciplina: discData.find(d => d.habilidades.some(h2 => h2.habilidade === h.habilidade))?.disciplina }));

    return { escolaNome, mediaGeral, classificacaoGeral: classifGeral, ...getCor(classifGeral), disciplinas: discData, topDificuldade };
  });

  const ICONS = {
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

      <div className="mb-6 flex flex-wrap gap-2">
        {(["verde", "amarelo", "laranja", "vermelho"] as const).map((k) => (
          <span key={k} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${{
            verde: "bg-emerald-100 text-emerald-800",
            amarelo: "bg-amber-100 text-amber-800",
            laranja: "bg-orange-100 text-orange-800",
            vermelho: "bg-rose-100 text-rose-800",
          }[k]}`}>
            {ICONS[k]} {
              k === "verde" ? `Satisfatório (≥${thresholds.verdeMin}%)` :
              k === "amarelo" ? `Em desenvolvimento (${thresholds.amareloMin}–${thresholds.verdeMin - 1}%)` :
              k === "laranja" ? `Acompanhamento (${thresholds.laranjaMin}–${thresholds.amareloMin - 1}%)` :
              `Intervenção (0–${thresholds.laranjaMin - 1}%)`
            }
          </span>
        ))}
      </div>

      {escolasData.length === 0 ? (
        <p className="text-center text-slate-400 py-12">Nenhum dado de habilidade encontrado para os filtros selecionados.</p>
      ) : (
        <div className="space-y-6">
          {escolasData.map((escola: any) => (
            <section key={escola.escolaNome} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className={`px-5 py-4 border-b border-slate-100 ${escola.bg} bg-opacity-50`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                      <School className="h-5 w-5 text-indigo-600" />
                      {escola.escolaNome}
                    </h2>
                    <p className="text-sm text-slate-500">
                      Média geral: <span className="font-semibold">{escola.mediaGeral}%</span> —
                      <span className={escola.text}> {escola.label}</span> {ICONS[escola.classificacaoGeral as keyof typeof ICONS]}
                    </p>
                  </div>
                </div>
              </div>

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