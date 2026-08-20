import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { respostasAlunos, questoes, provas } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { Target, Download } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminHabilidadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const provaId = typeof sp.provaId === "string" ? sp.provaId : "";

  const provasRows = await db.select({ id: provas.id, titulo: provas.titulo }).from(provas).orderBy(provas.id);

  const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
  if (provaId) {
    conditions.push(eq(respostasAlunos.provaId, Number(provaId)));
  }

  const { rows } = await db.execute(sql`
    SELECT
      ra.aluno_nome AS "alunoNome",
      ra.aluno_turma AS "alunoTurma",
      ra.escola_nome AS "escolaNome",
      ra.correta,
      q.disciplina,
      unnest(q.habilidade) AS habilidade
    FROM respostas_alunos ra
    INNER JOIN questoes q ON q.id = ra.questao_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ra.aluno_turma, ra.aluno_nome, q.disciplina
  `);

  // Agrupar: aluno -> disciplina -> habilidade -> {total, acertos}
  type HCount = { total: number; acertos: number };
  type DiscHabs = Record<string, HCount>;
  type AlunoData = { alunoNome: string; alunoTurma: string; escolaNome: string; disciplinas: Record<string, DiscHabs> };
  const map: Record<string, AlunoData> = {};

  for (const r of rows as any[]) {
    const key = `${r.alunoNome}|${r.alunoTurma}`;
    if (!map[key]) {
      map[key] = { alunoNome: r.alunoNome, alunoTurma: r.alunoTurma, escolaNome: r.escolaNome, disciplinas: {} };
    }
    const d = r.disciplina ?? "—";
    if (!map[key].disciplinas[d]) map[key].disciplinas[d] = {};
    const h = r.habilidade;
    if (!map[key].disciplinas[d][h]) map[key].disciplinas[d][h] = { total: 0, acertos: 0 };
    map[key].disciplinas[d][h].total++;
    if (r.correta) map[key].disciplinas[d][h].acertos++;
  }

  const data = Object.values(map).sort((a, b) => a.alunoTurma.localeCompare(b.alunoTurma) || a.alunoNome.localeCompare(b.alunoNome));

  // Coletar todas as habilidades únicas por disciplina para o header
  const allHabs: Record<string, string[]> = {};
  for (const aluno of data) {
    for (const [disc, habs] of Object.entries(aluno.disciplinas)) {
      if (!allHabs[disc]) allHabs[disc] = [];
      for (const h of Object.keys(habs)) {
        if (!allHabs[disc].includes(h)) allHabs[disc].push(h);
      }
    }
  }

  const csvHref = `/api/admin/habilidades${provaId ? `?provaId=${provaId}` : ""}&formato=csv`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Target className="h-6 w-6 text-indigo-600" />
            Habilidades por Aluno
          </h1>
          <p className="mt-1 text-sm text-slate-500">Desempenho dos alunos por habilidade avaliada.</p>
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
          {data.length > 0 && (
            <a href={csvHref} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              CSV
            </a>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="mt-8 text-center text-slate-400">Nenhuma resposta com habilidade encontrada{provaId ? " para esta prova" : ""}.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {Object.entries(allHabs).map(([disc, habs]) => (
            <div key={disc} className="mb-6">
              <h2 className="sticky left-0 bg-slate-50 px-4 py-2 text-sm font-bold text-indigo-700 border-b border-slate-200">{disc}</h2>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold text-slate-600">Aluno</th>
                    <th className="sticky left-[160px] z-10 bg-slate-50 px-3 py-2 font-semibold text-slate-600">Turma</th>
                    {habs.map((h) => (
                      <th key={h} className="px-3 py-2 text-center font-semibold text-slate-600 min-w-[80px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.filter((a) => a.disciplinas[disc]).map((aluno) => (
                    <tr key={`${aluno.alunoNome}|${aluno.alunoTurma}`} className="border-b border-slate-50 hover:bg-indigo-50/30">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{aluno.alunoNome}</td>
                      <td className="sticky left-[160px] z-10 bg-white px-3 py-2 text-slate-600 whitespace-nowrap">{aluno.alunoTurma}</td>
                      {habs.map((h) => {
                        const info = aluno.disciplinas[disc]?.[h];
                        if (!info) return <td key={h} className="px-3 py-2 text-center text-slate-300">—</td>;
                        const pct = info.total > 0 ? Math.round((info.acertos / info.total) * 100) : 0;
                        const color = pct >= 70 ? "text-emerald-700 bg-emerald-50" : pct >= 40 ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50";
                        return (
                          <td key={h} className={`px-3 py-2 text-center font-semibold rounded-lg ${color}`}>
                            {info.acertos}/{info.total} ({pct}%)
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
