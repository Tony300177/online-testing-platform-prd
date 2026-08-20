import Link from "next/link";
import { count, desc, eq, inArray } from "drizzle-orm";
import { CalendarDays, FilePlus2, FolderOpen, Megaphone, Users } from "lucide-react";
import ExamActions from "@/components/exam-actions";
import { db } from "@/db";
import { provas, resultados, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime, isExamClosed } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProfessorDashboard() {
  const user = await requireUser(["admin", "teacher"]);

  const rows = await db
    .select({
      id: provas.id,
      titulo: provas.titulo,
      disciplina: provas.disciplina,
      turma: provas.turma,
      professorId: provas.professorId,
      teacherName: users.name,
      status: provas.status,
      dataFim: provas.dataFim,
      dataInicio: provas.dataInicio,
      codigo: provas.codigo,
      createdAt: provas.createdAt,
    })
    .from(provas)
    .leftJoin(users, eq(users.id, provas.professorId))
    .where(user.role === "admin" ? undefined : eq(provas.professorId, user.id))
    .orderBy(desc(provas.createdAt));

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ provaId: resultados.provaId, total: count() })
        .from(resultados)
        .where(inArray(resultados.provaId, ids))
        .groupBy(resultados.provaId)
    : [];
  const countMap = new Map(counts.map((c) => [c.provaId, Number(c.total)]));

  const active = rows.filter((r) => r.status === "active" && !isExamClosed(r));
  const drafts = rows.filter((r) => r.status === "draft");
  const finished = rows.filter((r) => r.status !== "draft" && isExamClosed(r));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Minhas provas</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.role === "admin" ? "Todas as provas da plataforma." : "Crie, publique e acompanhe suas avaliações."}
          </p>
        </div>
        <Link
          href="/professor/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <FilePlus2 className="h-4 w-4" /> Nova prova
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatusCard icon={<Megaphone className="h-5 w-5" />} tone="emerald" label="Ativas" value={active.length} />
        <StatusCard icon={<FolderOpen className="h-5 w-5" />} tone="slate" label="Rascunhos" value={drafts.length} />
        <StatusCard icon={<CalendarDays className="h-5 w-5" />} tone="amber" label="Finalizadas" value={finished.length} />
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          {[
            { title: "Provas ativas", list: active, hint: "Disponíveis para os alunos responderem agora." },
            { title: "Rascunhos", list: drafts, hint: "Provas em preparação — publique quando estiverem prontas." },
            { title: "Finalizadas", list: finished, hint: "Prazo encerrado ou encerradas manualmente." },
          ].map((group) =>
            group.list.length === 0 ? null : (
              <section key={group.title}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {group.title} <span className="font-normal normal-case text-slate-400">· {group.hint}</span>
                </h2>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {group.list.map((prova) => {
                    const submissionsCount = countMap.get(prova.id) ?? 0;
                    const closed = isExamClosed(prova);
                    return (
                      <div
                        key={prova.id}
                        className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <StatusBadge
                              status={prova.status === "draft" ? "draft" : closed ? "finished" : "active"}
                            />
                            <Link
                              href={`/professor/exames/${prova.id}`}
                              className="mt-2 block truncate text-base font-bold text-slate-900 hover:text-indigo-600"
                            >
                              {prova.titulo}
                            </Link>
                            {prova.disciplina && (
                              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{prova.disciplina}</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {submissionsCount} {submissionsCount === 1 ? "resposta" : "respostas"}
                          </span>
                          {prova.turma && <span className="max-w-[220px] truncate">Turma: {prova.turma}</span>}
                          {prova.dataFim && <span>Prazo: {formatDateTime(prova.dataFim)}</span>}
                          {user.role === "admin" && prova.teacherName && <span>Prof.: {prova.teacherName}</span>}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                          <ExamActions
                            examId={prova.id}
                            status={prova.status === "draft" ? "draft" : closed ? "finished" : "active"}
                            editHref={`/professor/exames/${prova.id}/editar`}
                          />
                          <Link
                            href={`/professor/exames/${prova.id}`}
                            className="text-sm font-semibold text-indigo-600 hover:underline"
                          >
                            Ver detalhes →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "emerald" | "slate" | "amber";
  label: string;
  value: number;
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-700",
  } as const;
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <div>
        <p className="text-2xl font-extrabold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: "draft" | "active" | "finished" }) {
  const map = {
    draft: { label: "Rascunho", cls: "bg-slate-100 text-slate-600" },
    active: { label: "Ativa", cls: "bg-emerald-100 text-emerald-700" },
    finished: { label: "Finalizada", cls: "bg-amber-100 text-amber-700" },
  } as const;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${map[status].cls}`}>
      {map[status].label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
      <FilePlus2 className="mx-auto h-10 w-10 text-slate-300" />
      <h3 className="mt-4 text-lg font-bold text-slate-900">Nenhuma prova criada ainda</h3>
      <p className="mt-1 text-sm text-slate-500">
        Comece criando sua primeira avaliação — leva menos de cinco minutos.
      </p>
      <Link
        href="/professor/nova"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        <FilePlus2 className="h-4 w-4" /> Criar minha primeira prova
      </Link>
    </div>
  );
}