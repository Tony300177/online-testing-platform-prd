import Link from "next/link";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Inbox,
  Lock,
  PlayCircle,
  Timer,
} from "lucide-react";
import Logo from "@/components/logo";
import { db } from "@/db";
import { provas, resultados } from "@/db/schema";
import { requireAluno } from "@/lib/auth";
import { isExamClosed, notYetOpen } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import PainelLogout from "@/components/student/painel-logout";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function turmaInProva(turma: string, nomeTurma: string): boolean {
  return turma
    .split(",")
    .map((t) => t.trim())
    .some((t) => t.toLowerCase() === nomeTurma.toLowerCase());
}

export default async function PainelPage() {
  const session = await requireAluno();

  const list = await db
    .select()
    .from(provas)
    .where(
      and(
        inArray(provas.status, ["active", "finished"]),
        or(eq(provas.escolaId, session.escolaId), eq(provas.turmaId, session.turmaId))
      )
    )
    .orderBy(desc(provas.createdAt));

  const minhas = list.filter(
    (p) => p.turmaId === session.turmaId || turmaInProva(p.turma, session.turmaNome)
  );

  const ids = minhas.map((p) => p.id);
  const res = ids.length
    ? await db
        .select()
        .from(resultados)
        .where(and(inArray(resultados.provaId, ids), eq(resultados.alunoId, session.aluno.id)))
    : [];
  const byProva = new Map<number, (typeof res)[number]>();
  for (const r of res) byProva.set(r.provaId, r);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Logo className="h-14 w-auto" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Minhas provas</h1>
              <p className="text-xs text-slate-500">
                {session.aluno.nome} · {session.turmaNome} · {session.escolaNome}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/aluno/codigo"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
            >
              <ClipboardList className="h-4 w-4" /> Tenho um código
            </Link>
            <PainelLogout />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {minhas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <Inbox className="mx-auto h-12 w-12 text-slate-300" />
            <h2 className="mt-4 text-lg font-bold text-slate-900">Nenhuma prova disponível</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Ainda não há provas publicadas para a sua turma. Fale com o seu professor ou use o
              código da prova se ele tiver enviado por outro canal.
            </p>
            <Link
              href="/aluno/codigo"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              <ClipboardList className="h-4 w-4" /> Inserir código da prova
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {minhas.map((p) => {
              const resultado = byProva.get(p.id);
              const closed = isExamClosed(p);
              const notOpen = notYetOpen(p);
              const available = p.status === "active" && !closed && !notOpen;
              return (
                <div key={p.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900">{p.titulo}</h2>
                      {p.disciplina && <p className="text-sm text-slate-500">{p.disciplina}</p>}
                    </div>
                    {resultado ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Respondida
                      </span>
                    ) : closed ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        <Lock className="h-3.5 w-3.5" /> Encerrada
                      </span>
                    ) : notOpen ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        <Clock className="h-3.5 w-3.5" /> Agendada
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                        <PlayCircle className="h-3.5 w-3.5" /> Disponível
                      </span>
                    )}
                  </div>

                  {p.instrucoes && <p className="mt-2 text-xs text-slate-500">{p.instrucoes}</p>}
                  {p.arquivoNome && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <FileText className="h-3.5 w-3.5" /> {p.arquivoNome}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    {p.dataFim && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" /> Prazo: {formatDateTime(p.dataFim)}
                      </span>
                    )}
                    {p.dataInicio && (
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-3.5 w-3.5" /> Início: {formatDateTime(p.dataInicio)}
                      </span>
                    )}
                  </div>

                  {resultado && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
                      <p className="text-xl font-extrabold text-emerald-700">
                        {Number(resultado.nota).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de 10
                      </p>
                      <p className="text-xs font-medium text-emerald-700/80">
                        {resultado.acertos} acertos · {resultado.erros} erros ·{" "}
                        {Number(resultado.percentual).toLocaleString("pt-BR")}%
                      </p>
                    </div>
                  )}

                  <div className="mt-auto pt-4">
                    {resultado ? (
                      <Link
                        href={`/prova/${p.codigo}`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                      >
                        Ver resultado
                      </Link>
                    ) : available ? (
                      <Link
                        href={`/prova/${p.codigo}`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                      >
                        <PlayCircle className="h-4 w-4" /> Iniciar prova
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className={cn(
                          "flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
                        )}
                      >
                        {notOpen ? "Aguardando início" : "Prova encerrada"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}