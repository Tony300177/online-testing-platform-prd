import Link from "next/link";
import { count, isNotNull } from "drizzle-orm";
import { CalendarClock, Plus, Link2 } from "lucide-react";
import EncerrarAplicacaoButton from "@/components/admin/encerrar-aplicacao-button";
import { db } from "@/db";
import { aplicacaoEscolas, aplicacaoTurmas, aplicacoes, provas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAplicacoesPage() {
  await requireUser(["admin"]);

  const apps = await db.select().from(aplicacoes).orderBy(aplicacoes.createdAt);

  const turmaCounts = await db
    .select({ aplicacaoId: aplicacaoTurmas.aplicacaoId, total: count() })
    .from(aplicacaoTurmas)
    .groupBy(aplicacaoTurmas.aplicacaoId);

  const escolaCounts = await db
    .select({ aplicacaoId: aplicacaoEscolas.aplicacaoId, total: count() })
    .from(aplicacaoEscolas)
    .groupBy(aplicacaoEscolas.aplicacaoId);

  const replicaCounts = await db
    .select({ aplicacaoId: provas.aplicacaoId, total: count() })
    .from(provas)
    .where(isNotNull(provas.aplicacaoId))
    .groupBy(provas.aplicacaoId);

  const turmaMap = new Map(turmaCounts.map((c) => [c.aplicacaoId, Number(c.total)]));
  const escolaMap = new Map(escolaCounts.map((c) => [c.aplicacaoId, Number(c.total)]));
  const replicaMap = new Map(replicaCounts.map((c) => [c.aplicacaoId, Number(c.total)]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Aplicações</h1>
          <p className="mt-1 text-sm text-slate-500">
            Agendamentos de provas do banco de provas para múltiplas escolas e turmas.
          </p>
        </div>
        <Link
          href="/admin/aplicacoes/nova"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Nova aplicação
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Aplicação</th>
              <th className="px-4 py-3 font-semibold">Escolas</th>
              <th className="px-4 py-3 font-semibold">Turmas</th>
              <th className="px-4 py-3 font-semibold">Provas</th>
              <th className="px-4 py-3 font-semibold">Período</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma aplicação criada ainda.
                </td>
              </tr>
            ) : (
              apps.map((a) => {
                const finished = a.status === "finished";
                return (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="max-w-[240px] px-4 py-3">
                      <p className="truncate font-semibold text-slate-800">{a.titulo}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <Link2 className="h-3 w-3" /> Código: {a.codigo}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{escolaMap.get(a.id) ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{turmaMap.get(a.id) ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{replicaMap.get(a.id) ?? 0}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {a.dataFim
                        ? `${formatDateTime(a.dataInicio)} → ${formatDateTime(a.dataFim)}`
                        : a.dataInicio
                          ? formatDateTime(a.dataInicio)
                          : "Sem período"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          finished
                            ? "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500"
                            : "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                        }
                      >
                        {finished ? "Encerrada" : "Ativa"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!finished && <EncerrarAplicacaoButton id={a.id} />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {apps.length === 0 && (
        <div className="mt-10 text-center">
          <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Crie uma aplicação para aplicar uma prova em várias turmas ao mesmo tempo.
          </p>
        </div>
      )}
    </div>
  );
}