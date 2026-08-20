import { NextResponse } from "next/server";
import { db } from "@/db";
import { alternativas, provas, questoes } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { parseProvaRequest, resolveTurmaId, validateDeadlineForPublish } from "@/lib/exam-validation";
import { generateSlug } from "@/lib/utils";

/** Cria uma nova prova (rascunho ou publicada). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const result = await parseProvaRequest(req);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { value, publish, pdf } = result.parsed;

  if (publish) {
    const deadlineError = validateDeadlineForPublish(value.dataFim);
    if (deadlineError) return NextResponse.json({ error: deadlineError }, { status: 400 });
  }

  const provaId = await db.transaction(async (tx) => {
    const turmaId = await resolveTurmaId(value.escolaId, value.turma);
    const codigo = publish ? generateSlug() : null;
    const [prova] = await tx
      .insert(provas)
      .values({
        titulo: value.titulo,
        disciplina: value.disciplina,
        turma: value.turma,
        turmaId,
        escolaId: value.escolaId,
        instrucoes: value.instrucoes,
        dataInicio: value.dataInicio,
        dataFim: value.dataFim,
        tempoMinutos: value.tempoMinutos,
        professorId: user.id,
        status: publish ? "active" : "draft",
        codigo,
        arquivoNome: pdf?.name ?? null,
        arquivoBase64: pdf?.data ?? null,
        arquivoTamanho: pdf?.size ?? null,
      })
      .returning({ id: provas.id });

    const questoesId: number[] = [];
    for (let i = 0; i < value.questoes.length; i++) {
      const q = value.questoes[i];
      const [questao] = await tx
        .insert(questoes)
        .values({
          provaId: prova.id,
          numero: i + 1,
          pergunta: q.pergunta,
          tipo: q.tipo,
          valor: String(q.valor),
          ordem: i,
        })
        .returning({ id: questoes.id });
      questoesId.push(questao.id);

      if (q.alternativas.length > 0) {
        await tx.insert(alternativas).values(
          q.alternativas.map((a) => ({
            questaoId: questao.id,
            letra: a.letra,
            texto: a.texto,
            correta: a.correta,
          }))
        );
      }
    }
    return prova.id;
  });

  return NextResponse.json({ ok: true, id: provaId });
}