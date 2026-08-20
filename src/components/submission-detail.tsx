import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleAlert, FileText, GraduationCap } from "lucide-react";
import { db } from "@/db";
import { alternativas, provas, questoes, respostasAlunos, resultados } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { renderPrompt } from "@/lib/markdown";
import { cn, formatDateTime, formatScore } from "@/lib/utils";

/** Visualização detalhada da prova respondida por um aluno (professor dono ou admin). */
export default async function SubmissionDetail({
  submissionId,
  backHref,
}: {
  submissionId: number;
  backHref: string;
}) {
  const user = await requireUser(["admin", "teacher"]);

  const [resultado] = await db.select().from(resultados).where(eq(resultados.id, submissionId)).limit(1);
  if (!resultado) notFound();

  const [prova] = await db.select().from(provas).where(eq(provas.id, resultado.provaId)).limit(1);
  if (!prova) notFound();
  if (user.role !== "admin" && user.id !== prova.professorId) notFound();

  const qs = await db
    .select()
    .from(questoes)
    .where(eq(questoes.provaId, prova.id))
    .orderBy(asc(questoes.ordem));

  const qIds = qs.map((q) => q.id);
  const allAlts =
    qIds.length > 0
      ? await db.select().from(alternativas).where(inArray(alternativas.questaoId, qIds))
      : [];
  const altByQuestao = new Map<number, (typeof allAlts)[number][]>();
  for (const a of allAlts) {
    if (!altByQuestao.has(a.questaoId)) altByQuestao.set(a.questaoId, []);
    altByQuestao.get(a.questaoId)!.push(a);
  }

  const respostas = await db
    .select()
    .from(respostasAlunos)
    .where(eq(respostasAlunos.resultadoId, resultado.id));
  const answerMap = new Map(respostas.map((a) => [a.questaoId, a]));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Cabeçalho do aluno */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
              {resultado.alunoNome.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{resultado.alunoNome}</h1>
              <p className="text-sm text-slate-500">
                {resultado.alunoTurma} · {resultado.escolaNome}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-indigo-700">{formatScore(Number(resultado.nota))}</p>
            <p className="text-xs text-slate-400">
              {resultado.acertos + resultado.erros > 0
                ? `${resultado.acertos}/${resultado.acertos + resultado.erros} acertos objetivos`
                : "Sem questões objetivas"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
            Prova: {prova.titulo}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            Enviada em {formatDateTime(resultado.criadoEm)}
          </span>
        </div>
      </div>

      {/* Questões */}
      <div className="mt-6 space-y-4">
        {qs.map((q) => {
          const answer = answerMap.get(q.id);
          const alts = altByQuestao.get(q.id) ?? [];
          const isCorrect = answer?.correta === true;
          const isWrong = answer?.correta === false;
          return (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                  {q.numero}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-relaxed text-slate-900">{renderPrompt(q.pergunta)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {q.tipo === "multiple" ? "Múltipla escolha" : "Dissertativa"}
                    </span>
                    {q.tipo === "multiple" && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                          isCorrect
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        )}
                      >
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Acertou
                          </>
                        ) : (
                          <>
                            <CircleAlert className="h-3.5 w-3.5" /> Errou
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {q.tipo === "multiple" ? (
                <div className="mt-4 space-y-2">
                  {alts.map((a) => {
                    const chosen = answer?.alternativaId === a.id;
                    const isAnswer = a.correta;
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm",
                          isAnswer
                            ? "border-emerald-300 bg-emerald-50"
                            : chosen
                              ? "border-rose-300 bg-rose-50"
                              : "border-slate-100 bg-white"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            isAnswer
                              ? "bg-emerald-600 text-white"
                              : chosen
                                ? "bg-rose-500 text-white"
                                : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {a.letra}
                        </span>
                        <span className="flex-1 text-slate-800">{a.texto}</span>
                        {isAnswer && (
                          <span className="text-[11px] font-bold uppercase text-emerald-600">
                            Correta
                          </span>
                        )}
                        {chosen && (
                          <span
                            className={cn(
                              "text-[11px] font-bold uppercase",
                              isAnswer ? "text-emerald-600" : "text-rose-600"
                            )}
                          >
                            Resposta do aluno
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {answer?.alternativaId === null && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                      Questão deixada em branco pelo aluno.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">Resposta do aluno</p>
                  {answer?.textoResposta ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
                      {answer.textoResposta}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                      Questão deixada em branco pelo aluno.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Correção manual do professor — não incluída na nota automática.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}