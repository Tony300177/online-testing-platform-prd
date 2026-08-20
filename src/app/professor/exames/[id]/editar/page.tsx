import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ExamForm, { type ProvaDraft, type QuestaoDraft } from "@/components/exam-form";
import { db } from "@/db";
import { alternativas, provas, questoes } from "@/db/schema";
import { requireUser } from "@/lib/auth";

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditExamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["admin", "teacher"]);
  const id = Number((await params).id);

  const [prova] = await db.select().from(provas).where(eq(provas.id, id)).limit(1);
  if (!prova) notFound();
  if (user.role !== "admin" && user.id !== prova.professorId) notFound();

  const qs = await db.select().from(questoes).where(eq(questoes.provaId, id)).orderBy(asc(questoes.ordem));
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

  const initial: ProvaDraft = {
    titulo: prova.titulo,
    disciplina: prova.disciplina,
    escolaId: prova.escolaId ?? "",
    turma: prova.turma,
    instrucoes: prova.instrucoes,
    dataInicio: toLocalInput(prova.dataInicio),
    dataFim: toLocalInput(prova.dataFim),
    tempoMinutos: prova.tempoMinutos,
    pdfName: prova.arquivoNome,
    questoes: qs.map(
      (q): QuestaoDraft => ({
        key: `q-${q.id}`,
        pergunta: q.pergunta,
        tipo: q.tipo === "essay" ? "essay" : "multiple",
        valor: Number(q.valor) || 1,
        alternativas:
          q.tipo === "essay"
            ? []
            : (altByQuestao.get(q.id) ?? []).map((a) => ({
                key: `a-${a.id}`,
                texto: a.texto,
                correta: a.correta,
              })),
      })
    ),
  };

  if (prova.status !== "draft") {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-10">
          <h1 className="text-xl font-bold text-amber-900">Prova não editável</h1>
          <p className="mt-2 text-sm text-amber-800">
            Esta prova já foi publicada e recebeu respostas. Para preservar a integridade dos
            resultados, apenas rascunhos podem ser editados. Você pode encerrá-la e criar uma nova
            versão.
          </p>
          <Link
            href={`/professor/exames/${prova.id}`}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para a prova
          </Link>
        </div>
      </div>
    );
  }

  return <ExamForm examId={prova.id} initial={initial} />;
}