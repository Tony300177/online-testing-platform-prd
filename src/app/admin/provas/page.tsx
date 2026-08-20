import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { ArrowRight, ClipboardList } from "lucide-react";
import { StatusBadge } from "@/app/professor/page";
import { db } from "@/db";
import { provas, questoes, resultados, users } from "@/db/schema";
import { formatDateTime, isExamClosed } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminProvasPage() {
  const rows = await db
    .select({
      id: provas.id,
      titulo: provas.titulo,
      disciplina: provas.disciplina,
      turma: provas.turma,
      status: provas.status,
      dataFim: provas.dataFim,
      codigo: provas.codigo,
      createdAt: provas.createdAt,
      teacherName: users.name,
    })
    .from(provas)
    .leftJoin(users, eq(users.id, provas.professorId ?? 0))
    .orderBy(desc(provas.createdAt));

  const qCounts = await db
    .select({ provaId: questoes.provaId, total: count() })
    .from(questoes)
    .groupBy(questoes.provaId);
  const sCounts = await db
    .select({ provaId: resultados.provaId, total: count() })
    .from(resultados)
    .groupBy(resultados.provaId);

  const qMap = new Map(qCounts.map((c) => [c.provaId, Number(c.total)]));
  const sMap = new Map(sCounts.map((c) => [c.provaId, Number(c.total)]));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Todas as provas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visão geral de todas as avaliações criadas pelos professores.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Prova</th>
              <th className="px-4 py-3 font-semibold">Professor</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Questões</th>
              <th className="px-4 py-3 font-semibold">Respostas</th>
              <th className="px-4 py-3 font-semibold">Prazo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma prova cadastrada na plataforma.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const closed = isExamClosed(r);
                const status = r.status === "draft" ? "draft" : closed ? "finished" : "active";
                return (
                  <tr key={r.id} className="border-b border-slate-50 transition hover:bg-indigo-50/30">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate font-semibold text-slate-800">{r.titulo}</p>
                      {r.turma && <p className="truncate text-xs text-slate-400">Turma: {r.turma}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.teacherName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{qMap.get(r.id) ?? 0}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/respostas?prova=${r.id}`}
                        className="font-bold text-indigo-700 hover:underline"
                      >
                        {sMap.get(r.id) ?? 0}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.dataFim ? formatDateTime(r.dataFim) : "Sem prazo"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/professor/exames/${r.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        Ver detalhes <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="mt-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Quando os professores criarem provas, elas aparecerão aqui.
          </p>
        </div>
      )}
    </div>
  );
}