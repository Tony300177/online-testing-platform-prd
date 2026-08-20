import Link from "next/link";
import { FileDown, FileText, Users } from "lucide-react";
import FiltrosBar from "@/components/admin/filtros-bar";
import { fetchAlunosDetalhados, fetchOpcoesFiltros, parseAlunoFilters } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAlunosPage({
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
  const [opcoes, alunos] = await Promise.all([fetchOpcoesFiltros(), fetchAlunosDetalhados(filters)]);

  const exportHref = params.toString() ? `/api/admin/alunos?${params.toString()}&formato=csv` : "/api/admin/alunos?formato=csv";
  const pdfHref = params.toString() ? `/api/exports/relatorio-alunos?${params.toString()}` : "/api/exports/relatorio-alunos";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Users className="h-6 w-6 text-indigo-600" /> Alunos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Base escolar com filtros por turma, etnia, gênero, bairro e professor.
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
        <FiltrosBar action="/admin/alunos" opcoes={opcoes} valores={filters} />
      </div>

      <p className="mt-5 text-sm text-slate-500">
        <strong className="text-slate-800">{alunos.length}</strong> aluno(s) encontrado(s)
      </p>

      {alunos.length === 0 ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          Nenhum aluno encontrado com os filtros selecionados.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">Nº</th>
                <th className="px-4 py-3 font-semibold">Aluno</th>
                <th className="px-4 py-3 font-semibold">Turma</th>
                <th className="px-4 py-3 font-semibold">Escola</th>
                <th className="px-4 py-3 font-semibold">Professor</th>
                <th className="px-4 py-3 font-semibold">Sexo</th>
                <th className="px-4 py-3 font-semibold">Etnia</th>
                <th className="px-4 py-3 font-semibold">Bairro</th>
                <th className="px-4 py-3 font-semibold">Nascimento</th>
              </tr>
            </thead>
            <tbody>
              {alunos.map((a) => (
                <tr key={`${a.id}-${a.turmaId}`} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-500">{a.numeroChamada === null ? "—" : String(a.numeroChamada).padStart(2, "0")}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium text-slate-800">{a.nome}</td>
                  <td className="px-4 py-3 text-slate-600">{a.turmaNome}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-slate-500">{a.escolaNome}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-slate-500">{a.professorNome ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.sexo ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.etnia ? (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{a.etnia}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.bairro ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{a.dataNascimento ? formatDate(a.dataNascimento) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}