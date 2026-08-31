import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { provas, escolas, turmas, alunos, professores } from "@/db/schema";
import {
  getHabilidadesAnalise,
  getHabilidadesFilterOptions,
  type HabilidadeFilters,
} from "@/lib/habilidades-stats";
import HabilidadesAnaliseView from "@/components/admin/habilidades-analise-view";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function str(sp: SP, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : "";
}

export default async function HabilidadesAnalisePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(["admin", "teacher"]);

  // Professores só analisam as próprias provas (segurança).
  let allowedProvaIds: number[] | undefined;
  if (user.role === "teacher") {
    const own = await db.select({ id: provas.id }).from(provas).where(eq(provas.professorId, user.id));
    allowedProvaIds = own.map((p) => p.id);
  }

  const sp = await searchParams;
  const escolaId = str(sp, "escolaId");
  const provaId = str(sp, "provaId");
  const turmaId = str(sp, "turmaId");
  const habilidade = str(sp, "habilidade");
  const alunoId = str(sp, "alunoId");
  const periodoInicio = str(sp, "periodoInicio");
  const periodoFim = str(sp, "periodoFim");
  const etnia = str(sp, "etnia");
  const sexo = str(sp, "sexo");
  const bairro = str(sp, "bairro");
  const professorId = str(sp, "professorId");
  const alunoNome = str(sp, "alunoNome");

  const filters: HabilidadeFilters = { allowedProvaIds };
  if (provaId) filters.provaId = Number(provaId);
  if (turmaId) filters.turmaId = turmaId;
  if (habilidade) filters.habilidade = habilidade;
  if (alunoId) filters.alunoId = alunoId;
  if (periodoInicio) filters.periodoInicio = periodoInicio;
  if (periodoFim) filters.periodoFim = periodoFim;
  if (etnia) filters.etnia = etnia;
  if (sexo) filters.sexo = sexo;
  if (bairro) filters.bairro = bairro;
  if (professorId) filters.professorId = professorId;
  if (alunoNome) filters.alunoNome = alunoNome;

  // Buscar escolas e turmas (filtrar turmas por escola se selecionada)
  const escolasList = await db.select({ id: escolas.id, nome: escolas.nome }).from(escolas).orderBy(escolas.nome);
  const turmasConditions = escolaId ? [eq(turmas.escolaId, escolaId)] : [];
  const turmasList = await db
    .select({ id: turmas.id, nome: turmas.nome, escolaId: turmas.escolaId })
    .from(turmas)
    .where(turmasConditions.length ? turmasConditions[0] : sql`1=1`)
    .orderBy(turmas.nome);

  // Buscar opções para os novos filtros
  const [etniasList, sexosList, bairrosList, professoresList] = await Promise.all([
    db.selectDistinct({ etnia: alunos.etnia }).from(alunos).where(sql`${alunos.etnia} IS NOT NULL`).orderBy(alunos.etnia),
    db.selectDistinct({ sexo: alunos.sexo }).from(alunos).where(sql`${alunos.sexo} IS NOT NULL`).orderBy(alunos.sexo),
    db.selectDistinct({ bairro: alunos.bairro }).from(alunos).where(sql`${alunos.bairro} IS NOT NULL`).orderBy(alunos.bairro),
    db.select({ id: professores.id, nome: professores.nome }).from(professores).orderBy(professores.nome),
  ]);

  const [options, analise] = await Promise.all([
    getHabilidadesFilterOptions(allowedProvaIds),
    getHabilidadesAnalise(filters),
  ]);

  // Opções de habilidade para o filtro (restritas à prova selecionada quando houver)
  const habConditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
  if (filters.provaId) habConditions.push(sql`q.prova_id = ${filters.provaId}`);
  else if (allowedProvaIds) {
    habConditions.push(
      allowedProvaIds.length > 0
        ? sql`q.prova_id IN (${sql.join(allowedProvaIds.map((id) => sql`${id}`), sql`, `)})`
        : sql`false`
    );
  }
  const habRows = await db.execute<{ habilidade: string }>(sql`
    SELECT DISTINCT unnest(q.habilidade) AS habilidade
    FROM questoes q
    WHERE ${sql.join(habConditions, sql` AND `)}
    ORDER BY 1
  `);

  // Alunos disponíveis conforme filtros atuais (para o select de aluno)
  const alunosConditions = [];
  if (filters.provaId) alunosConditions.push(sql`ra.prova_id = ${filters.provaId}`);
  if (filters.turmaId) alunosConditions.push(sql`ra.turma_id = ${filters.turmaId}`);
  if (allowedProvaIds) {
    alunosConditions.push(
      allowedProvaIds.length > 0
        ? sql`ra.prova_id IN (${sql.join(allowedProvaIds.map((id) => sql`${id}`), sql`, `)})`
        : sql`false`
    );
  }
  const alunosRows =
    alunosConditions.length > 0
      ? await db.execute<{ alunoId: string; alunoNome: string; alunoTurma: string }>(sql`
          SELECT DISTINCT ra.aluno_id::text AS "alunoId", ra.aluno_nome AS "alunoNome", ra.aluno_turma AS "alunoTurma"
          FROM respostas_alunos ra
          WHERE ra.aluno_id IS NOT NULL AND ${sql.join(alunosConditions, sql` AND `)}
          ORDER BY ra.aluno_nome
        `)
      : { rows: [] };

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ escolaId, provaId, turmaId, habilidade, alunoId, periodoInicio, periodoFim, etnia, sexo, bairro, professorId, alunoNome })) {
    if (v) query.set(k, v);
  }

  const provaTitulo = options.provas.find((p) => String(p.id) === provaId)?.titulo;
  const turmaNome = turmasList.find((t) => t.id === turmaId)?.nome;
  const escolaNome = escolasList.find((e) => e.id === escolaId)?.nome;

  return (
    <div>
      {/* Filtros */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Escola</label>
          <select name="escolaId" defaultValue={escolaId} onChange={(e) => { const form = e.currentTarget.form; if (form) form.submit(); }} className="max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todas as escolas</option>
            {escolasList.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Avaliação</label>
          <select name="provaId" defaultValue={provaId} className="max-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todas as avaliações</option>
            {options.provas.map((p) => (
              <option key={p.id} value={p.id}>{p.titulo}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Turma</label>
          <select name="turmaId" defaultValue={turmaId} onChange={(e) => { const form = e.currentTarget.form; if (form) form.submit(); }} className="max-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todas as turmas</option>
            {turmasList.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Etnia</label>
          <select name="etnia" defaultValue={etnia} className="max-w-[150px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todas</option>
            {etniasList.map((e: { etnia: string | null }) => e.etnia && (
              <option key={e.etnia} value={e.etnia}>{e.etnia}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Gênero</label>
          <select name="sexo" defaultValue={sexo} className="max-w-[130px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todos</option>
            {sexosList.map((s: { sexo: string | null }) => s.sexo && (
              <option key={s.sexo} value={s.sexo}>{s.sexo}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Bairro</label>
          <select name="bairro" defaultValue={bairro} className="max-w-[150px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todos</option>
            {bairrosList.map((b: { bairro: string | null }) => b.bairro && (
              <option key={b.bairro} value={b.bairro}>{b.bairro}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Professor</label>
          <select name="professorId" defaultValue={professorId} className="max-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todos</option>
            {professoresList.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Buscar por nome</label>
          <input type="text" name="alunoNome" defaultValue={alunoNome} placeholder="Nome do aluno..." className="max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Habilidade</label>
          <select name="habilidade" defaultValue={habilidade} className="max-w-[170px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todas</option>
            {(habRows.rows as unknown as { habilidade: string }[]).map((h) => (
              <option key={h.habilidade} value={h.habilidade}>{h.habilidade}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Aluno</label>
          <select name="alunoId" defaultValue={alunoId} className="max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Todos os alunos</option>
            {(alunosRows.rows as unknown as { alunoId: string; alunoNome: string; alunoTurma: string }[]).map((a) => (
              <option key={a.alunoId} value={a.alunoId}>{a.alunoNome} — {a.alunoTurma}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Período (de)</label>
          <input type="date" name="periodoInicio" defaultValue={periodoInicio} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Período (até)</label>
          <input type="date" name="periodoFim" defaultValue={periodoFim} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
          Filtrar
        </button>
        <a href="/admin/habilidades/analise" className="px-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
          Limpar
        </a>
      </form>

      <HabilidadesAnaliseView data={analise} query={query.toString()} filtrosInfo={{ provaTitulo, turmaNome, escolaNome }} />
    </div>
  );
}
