import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { respostasAlunos, questoes, provas, escolas, turmas, alunos, professores } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { Target, Download, School, Users, UserCheck, Settings, BarChart3, Filter } from "lucide-react";
import Link from "next/link";
import FiltrosHabilidades from "./FiltrosHabilidades";

export const dynamic = "force-dynamic";

export default async function AdminHabilidadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const provaId = typeof sp.provaId === "string" ? sp.provaId : "";
  const escolaId = typeof sp.escolaId === "string" ? sp.escolaId : "";
  const turmaId = typeof sp.turmaId === "string" ? sp.turmaId : "";
  const etnia = typeof sp.etnia === "string" ? sp.etnia : "";
  const sexo = typeof sp.sexo === "string" ? sp.sexo : "";
  const bairro = typeof sp.bairro === "string" ? sp.bairro : "";
  const professorId = typeof sp.professorId === "string" ? sp.professorId : "";
  const alunoNome = typeof sp.alunoNome === "string" ? sp.alunoNome : "";

  // Buscar opções dos filtros
  const [provasRows, escolasList, turmasList, etniasList, sexosList, bairrosList, professoresList] = await Promise.all([
    db.select({ id: provas.id, titulo: provas.titulo }).from(provas).orderBy(provas.id),
    db.select({ id: escolas.id, nome: escolas.nome }).from(escolas).orderBy(escolas.nome),
    db.select({ id: turmas.id, nome: turmas.nome }).from(turmas).where(escolaId ? eq(turmas.escolaId, escolaId) : sql`1=1`).orderBy(turmas.nome),
    db.selectDistinct({ etnia: alunos.etnia }).from(alunos).where(sql`${alunos.etnia} IS NOT NULL`).orderBy(alunos.etnia),
    db.selectDistinct({ sexo: alunos.sexo }).from(alunos).where(sql`${alunos.sexo} IS NOT NULL`).orderBy(alunos.sexo),
    db.selectDistinct({ bairro: alunos.bairro }).from(alunos).where(sql`${alunos.bairro} IS NOT NULL`).orderBy(alunos.bairro),
    db.select({ id: professores.id, nome: professores.nome }).from(professores).orderBy(professores.nome),
  ]);

  // Resolver nomes de escola e turma antes de construir conditions
  let escolaNome = "";
  if (escolaId) {
    const [esc] = await db.select({ nome: escolas.nome }).from(escolas).where(eq(escolas.id, escolaId)).limit(1);
    escolaNome = esc?.nome ?? "";
  }
  let turmaNome = "";
  if (turmaId) {
    const [tur] = await db.select({ nome: turmas.nome }).from(turmas).where(eq(turmas.id, turmaId)).limit(1);
    turmaNome = tur?.nome ?? "";
  }

  const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
  if (provaId) conditions.push(eq(respostasAlunos.provaId, Number(provaId)));
  if (escolaNome) conditions.push(eq(respostasAlunos.escolaNome, escolaNome));
  if (turmaNome) conditions.push(eq(respostasAlunos.alunoTurma, turmaNome));
  if (etnia) conditions.push(sql`a.etnia = ${etnia}`);
  if (sexo) conditions.push(sql`a.sexo = ${sexo}`);
  if (bairro) conditions.push(sql`a.bairro = ${bairro}`);
  if (professorId) conditions.push(sql`t.professor_id = ${professorId}`);
  if (alunoNome) conditions.push(sql`a.nome ILIKE ${'%' + alunoNome + '%'}`);

  const { rows } = await db.execute(sql`
    SELECT
      ra.aluno_nome AS "alunoNome",
      ra.aluno_turma AS "alunoTurma",
      ra.escola_nome AS "escolaNome",
      ra.correta,
      p.disciplina,
      unnest(q.habilidade) AS habilidade
    FROM respostas_alunos ra
    INNER JOIN questoes q ON q.id = ra.questao_id
    INNER JOIN provas p ON p.id = ra.prova_id
    LEFT JOIN alunos a ON a.id = ra.aluno_id
    LEFT JOIN turmas t ON t.id = ra.turma_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ra.aluno_turma, ra.aluno_nome, p.disciplina
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
      {/* Filtros */}
      <FiltrosHabilidades
        provaId={provaId}
        escolaId={escolaId}
        turmaId={turmaId}
        etnia={etnia}
        sexo={sexo}
        bairro={bairro}
        professorId={professorId}
        alunoNome={alunoNome}
        provasRows={provasRows}
        escolasList={escolasList}
        turmasList={turmasList}
        etniasList={etniasList}
        sexosList={sexosList}
        bairrosList={bairrosList}
        professoresList={professoresList}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Target className="h-6 w-6 text-indigo-600" />
            Habilidades por Aluno
          </h1>
          <p className="mt-1 text-sm text-slate-500">Desempenho dos alunos por habilidade avaliada.</p>
        </div>
        <div className="flex gap-2">
          {data.length > 0 && (
            <a href={csvHref} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              CSV
            </a>
          )}
        </div>
      </div>

      {/* Navegação dos Dashboards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/habilidades/analise" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600"><BarChart3 className="h-5 w-5" /></div>
          <div><p className="text-sm font-bold text-slate-800">Análise por Habilidade</p><p className="text-[11px] text-slate-500">Oportunidades, gráficos e alunos</p></div>
        </Link>
        <Link href="/admin/habilidades/dashboard/geral" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600"><School className="h-5 w-5" /></div>
          <div><p className="text-sm font-bold text-slate-800">Dashboard Geral</p><p className="text-[11px] text-slate-500">Visão consolidada por escola</p></div>
        </Link>
        <Link href="/admin/habilidades/dashboard/turma" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Users className="h-5 w-5" /></div>
          <div><p className="text-sm font-bold text-slate-800">Dashboard Turma</p><p className="text-[11px] text-slate-500">Ranking e média da turma</p></div>
        </Link>
        <Link href="/admin/habilidades/config" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Settings className="h-5 w-5" /></div>
          <div><p className="text-sm font-bold text-slate-800">Configurar Limiares</p><p className="text-[11px] text-slate-500">Ajustar thresholds de desempenho</p></div>
        </Link>
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
