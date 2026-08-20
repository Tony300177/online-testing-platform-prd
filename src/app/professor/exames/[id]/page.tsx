import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  FileDown,
  FileText,
  Layers,
  Target,
  Users,
} from "lucide-react";
import ExamActions from "@/components/exam-actions";
import ShareCard from "@/components/share-card";
import { StatusBadge } from "@/app/professor/page";
import { db } from "@/db";
import { alunos, provas, questoes, resultados, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hardestQuestions } from "@/lib/exports";
import { formatDateTime, formatScore, isExamClosed } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "teacher"]);
  const id = Number((await params).id);

  const [prova] = await db.select().from(provas).where(eq(provas.id, id)).limit(1);
  if (!prova) notFound();
  if (user.role !== "admin" && user.id !== prova.professorId) notFound();

  const [teacher] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, prova.professorId ?? 0))
    .limit(1);
  const qs = await db.select().from(questoes).where(eq(questoes.provaId, id)).orderBy(asc(questoes.ordem));
  const res = await db
    .select({
      id: resultados.id,
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
    .leftJoin(alunos, eq(resultados.alunoId, alunos.id))
    .where(eq(resultados.provaId, id))
    .orderBy(asc(resultados.criadoEm));

  const closed = isExamClosed(prova);
  const effectiveStatus = prova.status === "draft" ? "draft" : closed ? "finished" : "active";
  const withScore = res.filter((s) => s.nota !== null);
  const avgScore = withScore.length
    ? withScore.reduce((acc, s) => acc + Number(s.nota), 0) / withScore.length
    : null;
  const totalMc = res.reduce((acc, s) => acc + s.acertos + s.erros, 0);
  const totalCorrect = res.reduce((acc, s) => acc + s.acertos, 0);
  const best = withScore.length ? Math.max(...withScore.map((s) => Number(s.nota))) : null;
  const hardest = await hardestQuestions(id);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/professor"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para minhas provas
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{prova.titulo}</h1>
            <StatusBadge status={effectiveStatus} />
          </div>
          {prova.disciplina && <p className="mt-1.5 text-sm text-slate-600">{prova.disciplina}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              Prazo: {prova.dataFim ? formatDateTime(prova.dataFim) : "sem prazo definido"}
            </span>
            {prova.turma && (
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-4 w-4 text-slate-400" />
                Turma: {prova.turma}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-slate-400" />
              {qs.length} {qs.length === 1 ? "questão" : "questões"}
            </span>
            {user.role === "admin" && teacher && <span>Prof.: {teacher.name}</span>}
          </div>
        </div>
        <ExamActions examId={prova.id} status={effectiveStatus} editHref={`/professor/exames/${prova.id}/editar`} />
      </div>

      {prova.codigo && effectiveStatus !== "draft" ? (
        <div className="mt-6">
          <ShareCard slug={prova.codigo} examTitle={prova.titulo} />
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Publique a prova para gerar o <strong>link único</strong> e o <strong>QR Code</strong> de
          acesso dos alunos.
        </div>
      )}

      {/* Estatísticas */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={<Users className="h-5 w-5" />} label="Respostas enviadas" value={String(res.length)} />
        <Metric
          icon={<Award className="h-5 w-5" />}
          label="Nota média"
          value={avgScore === null ? "—" : formatScore(avgScore)}
        />
        <Metric
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Taxa de acertos"
          value={totalMc > 0 ? `${Math.round((totalCorrect / totalMc) * 100)}%` : "—"}
        />
        <Metric icon={<Award className="h-5 w-5" />} label="Melhor nota" value={best === null ? "—" : formatScore(best)} />
      </div>

      {/* Resultados por aluno */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Resultados por aluno</h2>
          <div className="flex gap-2">
            <a
              href={`/api/exports/csv?examId=${prova.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <FileDown className="h-3.5 w-3.5" /> Exportar Excel (CSV)
            </a>
            <a
              href={`/api/exports/pdf?examId=${prova.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <FileText className="h-3.5 w-3.5" /> Exportar PDF
            </a>
          </div>
        </div>

        {res.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            Nenhuma resposta enviada até o momento. Compartilhe o link com os alunos!
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Nº</th>
                  <th className="px-4 py-3 font-semibold">Aluno</th>
                  <th className="px-4 py-3 font-semibold">Turma</th>
                  <th className="px-4 py-3 font-semibold">Escola</th>
                  <th className="px-4 py-3 font-semibold">Nota</th>
                  <th className="px-4 py-3 font-semibold">Acertos</th>
                  <th className="px-4 py-3 font-semibold">Enviada em</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {res.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 transition hover:bg-indigo-50/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {s.numeroChamada === null ? "—" : String(s.numeroChamada).padStart(3, "0")}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.alunoNome}</td>
                    <td className="px-4 py-3 text-slate-600">{s.alunoTurma}</td>
                    <td className="px-4 py-3 text-slate-600">{s.escolaNome}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-indigo-700">{formatScore(Number(s.nota))}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.acertos + s.erros > 0 ? `${s.acertos}/${s.acertos + s.erros}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(s.criadoEm)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/professor/exames/${prova.id}/respostas/${s.id}`}
                        className="text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        Ver prova →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Questões mais erradas */}
      {hardest.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">Questões com maior índice de erro</h2>
          <div className="mt-3 space-y-3">
            {hardest.map((h, i) => (
              <div key={h.questionId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
                    {i + 1}. {h.prompt}
                  </p>
                  <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                    {h.rate}% de erro
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-rose-500"
                    style={{ width: `${Math.max(h.rate, 4)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {h.errors} de {h.total} alunos erraram esta questão.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-extrabold text-slate-900">{value}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}