import Link from "next/link";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { FileDown, FileText, FilterX, ListChecks, Search } from "lucide-react";
import { db } from "@/db";
import { alunos, provas, resultados } from "@/db/schema";
import { formatDateTime, formatScore } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LIMIT = 200;

export default async function AdminRespostasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const school = typeof sp.escola === "string" ? sp.escola : "";
  const studentClass = typeof sp.turma === "string" ? sp.turma : "";
  const provaId = typeof sp.prova === "string" && sp.prova ? Number(sp.prova) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  // Opções dos filtros
  const schoolRows = await db
    .selectDistinct({ school: resultados.escolaNome })
    .from(resultados)
    .orderBy(asc(resultados.escolaNome));
  const classRows = await db
    .selectDistinct({ studentClass: resultados.alunoTurma })
    .from(resultados)
    .orderBy(asc(resultados.alunoTurma));
  const provaRows = await db
    .select({ id: provas.id, titulo: provas.titulo })
    .from(provas)
    .orderBy(asc(provas.titulo));

  // Filtros ativos
  const conditions = [];
  if (school) conditions.push(eq(resultados.escolaNome, school));
  if (studentClass) conditions.push(eq(resultados.alunoTurma, studentClass));
  if (provaId) conditions.push(eq(resultados.provaId, provaId));
  if (q) conditions.push(ilike(resultados.alunoNome, `%${q}%`));

  const rows = await db
    .select({
      id: resultados.id,
      provaId: resultados.provaId,
      provaTitulo: provas.titulo,
      alunoNome: resultados.alunoNome,
      alunoTurma: resultados.alunoTurma,
      escolaNome: resultados.escolaNome,
      numeroChamada: alunos.numeroChamada,
      nota: resultados.nota,
      acertos: resultados.acertos,
      erros: resultados.erros,
      criadoEm: resultados.criadoEm,
    })
    .from(resultados)
    .innerJoin(provas, eq(resultados.provaId, provas.id))
    .leftJoin(alunos, eq(resultados.alunoId, alunos.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(resultados.criadoEm))
    .limit(LIMIT);

  const exportQuery = new URLSearchParams();
  if (provaId) exportQuery.set("examId", String(provaId));
  if (school) exportQuery.set("school", school);
  if (studentClass) exportQuery.set("class", studentClass);
  if (q) exportQuery.set("search", q);
  const qs = exportQuery.toString();

  const hasFilters = Boolean(school || studentClass || provaId || q);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Central de respostas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Todas as provas enviadas pelos alunos, com filtros por escola, turma e prova.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/exports/csv?${qs}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileDown className="h-3.5 w-3.5" /> Excel (CSV)
          </a>
          <a
            href={`/api/exports/pdf?${qs}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </a>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Buscar aluno</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Nome do aluno..."
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <SelectField name="prova" label="Prova" defaultValue={provaId ? String(provaId) : ""} options={[
            { value: "", label: "Todas as provas" },
            ...provaRows.map((e) => ({ value: String(e.id), label: e.titulo })),
          ]} />
          <SelectField name="escola" label="Escola" defaultValue={school} options={[
            { value: "", label: "Todas as escolas" },
            ...schoolRows.map((s) => ({ value: s.school, label: s.school })),
          ]} />
          <SelectField name="turma" label="Turma" defaultValue={studentClass} options={[
            { value: "", label: "Todas as turmas" },
            ...classRows.map((c) => ({ value: c.studentClass, label: c.studentClass })),
          ]} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <ListChecks className="h-4 w-4" /> Aplicar filtros
          </button>
          {hasFilters && (
            <Link
              href="/admin/respostas"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <FilterX className="h-4 w-4" /> Limpar filtros
            </Link>
          )}
          <p className="ml-auto text-xs text-slate-400">
            {rows.length} {rows.length === 1 ? "resposta encontrada" : "respostas encontradas"}
            {rows.length >= LIMIT && " (últimas 200)"}
          </p>
        </div>
      </form>

      {/* Tabela */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Nº</th>
              <th className="px-4 py-3 font-semibold">Aluno</th>
              <th className="px-4 py-3 font-semibold">Turma</th>
              <th className="px-4 py-3 font-semibold">Escola</th>
              <th className="px-4 py-3 font-semibold">Prova</th>
              <th className="px-4 py-3 font-semibold">Nota</th>
              <th className="px-4 py-3 font-semibold">Acertos</th>
              <th className="px-4 py-3 font-semibold">Enviada em</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma resposta encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 transition hover:bg-indigo-50/30">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {r.numeroChamada === null ? "—" : String(r.numeroChamada).padStart(3, "0")}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.alunoNome}</td>
                  <td className="px-4 py-3 text-slate-600">{r.alunoTurma}</td>
                  <td className="px-4 py-3 text-slate-600">{r.escolaNome}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">
                    <Link
                      href={`/professor/exames/${r.provaId}`}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {r.provaTitulo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-indigo-700">{formatScore(Number(r.nota))}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.acertos + r.erros > 0 ? `${r.acertos}/${r.acertos + r.erros}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(r.criadoEm)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/respostas/${r.id}`}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Ver prova →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}