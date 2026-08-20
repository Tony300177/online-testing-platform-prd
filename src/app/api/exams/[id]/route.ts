import { and, asc, count, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alternativas, provas, questoes, resultados } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { parseProvaPayload, parseProvaRequest, resolveTurmaId, validateDeadlineForPublish } from "@/lib/exam-validation";
import { generateSlug } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwnedProva(id: number) {
  const [prova] = await db.select().from(provas).where(eq(provas.id, id)).limit(1);
  return prova;
}

function canAccess(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, prova: { professorId: number | null }) {
  return user.role === "admin" || user.id === prova.professorId;
}

/** Detalhes da prova + questões + alternativas (professor dono ou admin). */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const prova = await loadOwnedProva(id);
  if (!prova) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccess(user, prova)) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const qs = await db
    .select()
    .from(questoes)
    .where(eq(questoes.provaId, id))
    .orderBy(asc(questoes.ordem));

  const qIds = qs.map((q) => q.id);
  const allAlts =
    qIds.length > 0
      ? await db
          .select()
          .from(alternativas)
          .where(inArray(alternativas.questaoId, qIds))
      : [];

  const altByQuestao = new Map<number, (typeof allAlts)[number][]>();
  for (const a of allAlts) {
    if (!altByQuestao.has(a.questaoId)) altByQuestao.set(a.questaoId, []);
    altByQuestao.get(a.questaoId)!.push(a);
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(resultados)
    .where(eq(resultados.provaId, id));

  return NextResponse.json({
    ok: true,
    prova: {
      id: prova.id,
      titulo: prova.titulo,
      disciplina: prova.disciplina,
      turma: prova.turma,
      escolaId: prova.escolaId,
      instrucoes: prova.instrucoes,
      professorId: prova.professorId,
      status: prova.status,
      dataInicio: prova.dataInicio ? prova.dataInicio.toISOString() : null,
      dataFim: prova.dataFim ? prova.dataFim.toISOString() : null,
      tempoMinutos: prova.tempoMinutos,
      codigo: prova.codigo,
      arquivoNome: prova.arquivoNome,
      arquivoTamanho: prova.arquivoTamanho,
      createdAt: prova.createdAt.toISOString(),
      submissionCount: Number(total),
    },
    questions: qs.map((q) => ({
      id: q.id,
      numero: q.numero,
      pergunta: q.pergunta,
      tipo: q.tipo,
      valor: Number(q.valor),
      ordem: q.ordem,
      alternativas: (altByQuestao.get(q.id) ?? []).map((a) => ({
        id: a.id,
        letra: a.letra,
        texto: a.texto,
        correta: a.correta,
      })),
    })),
  });
}

/** Edita (rascunho), publica, encerra ou exclui uma prova. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const prova = await loadOwnedProva(id);
  if (!prova) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccess(user, prova)) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  // Edição de conteúdo com upload de PDF (multipart) — apenas em rascunho
  if (isMultipart) {
    if (prova.status !== "draft") {
      return NextResponse.json(
        { error: "Provas publicadas não podem ser editadas. Crie uma nova prova ou encerre esta." },
        { status: 400 }
      );
    }

    const result = await parseProvaRequest(req);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { value, publish, pdf, removePdf } = result.parsed;

    if (publish) {
      const deadlineError = validateDeadlineForPublish(value.dataFim);
      if (deadlineError) return NextResponse.json({ error: deadlineError }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      const turmaId = await resolveTurmaId(value.escolaId, value.turma);
      const pdfFields: Record<string, unknown> = {};
      if (pdf) {
        pdfFields.arquivoNome = pdf.name;
        pdfFields.arquivoBase64 = pdf.data;
        pdfFields.arquivoTamanho = pdf.size;
      } else if (removePdf) {
        pdfFields.arquivoNome = null;
        pdfFields.arquivoBase64 = null;
        pdfFields.arquivoTamanho = null;
      }

      await tx
        .update(provas)
        .set({
          titulo: value.titulo,
          disciplina: value.disciplina,
          turma: value.turma,
          turmaId,
          escolaId: value.escolaId,
          instrucoes: value.instrucoes,
          dataInicio: value.dataInicio,
          dataFim: value.dataFim,
          tempoMinutos: value.tempoMinutos,
          ...pdfFields,
          ...(publish && prova.status === "draft"
            ? { status: "active", codigo: prova.codigo ?? generateSlug() }
            : {}),
        })
        .where(eq(provas.id, id));

      await tx.delete(questoes).where(eq(questoes.provaId, id));
      for (let i = 0; i < value.questoes.length; i++) {
        const q = value.questoes[i];
        const [questao] = await tx
          .insert(questoes)
          .values({
            provaId: id,
            numero: i + 1,
            pergunta: q.pergunta,
            tipo: q.tipo,
            valor: String(q.valor),
            ordem: i,
          })
          .returning({ id: questoes.id });
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
    });

    return NextResponse.json({ ok: true });
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const targetStatus = typeof body.status === "string" ? body.status : null;

  // Transições de status permitidas
  if (targetStatus && targetStatus !== prova.status) {
    if (targetStatus === "active" && prova.status === "draft") {
      const deadlineError = validateDeadlineForPublish(prova.dataFim);
      if (deadlineError) return NextResponse.json({ error: deadlineError }, { status: 400 });
      const [{ total }] = await db
        .select({ total: count() })
        .from(questoes)
        .where(eq(questoes.provaId, id));
      if (Number(total ?? 0) === 0) {
        return NextResponse.json({ error: "Adicione pelo menos uma questão antes de publicar." }, { status: 400 });
      }
      await db
        .update(provas)
        .set({
          status: "active",
          codigo: prova.codigo ?? generateSlug(),
          dataFim: body.dataFim ? new Date(body.dataFim) : prova.dataFim,
        })
        .where(eq(provas.id, id));
    } else if (targetStatus === "finished" && prova.status === "active") {
      await db.update(provas).set({ status: "finished" }).where(eq(provas.id, id));
    } else if (targetStatus === "draft" && prova.status === "finished") {
      // Reabre como rascunho (mantém o link)
      await db.update(provas).set({ status: "draft" }).where(eq(provas.id, id));
    } else {
      return NextResponse.json({ error: "Transição de status inválida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // Edição de conteúdo: apenas em rascunho
  if (prova.status !== "draft") {
    return NextResponse.json(
      { error: "Provas publicadas não podem ser editadas. Crie uma nova prova ou encerre esta." },
      { status: 400 }
    );
  }

  const parsed = parseProvaPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors.join(" ") }, { status: 400 });
  }
  const { value } = parsed;

  const pdfFields: Record<string, unknown> = {};
  if (body.removePdf === true) {
    pdfFields.arquivoNome = null;
    pdfFields.arquivoBase64 = null;
    pdfFields.arquivoTamanho = null;
  }

  await db.transaction(async (tx) => {
    const turmaId = await resolveTurmaId(value.escolaId, value.turma);
    await tx
      .update(provas)
      .set({
        titulo: value.titulo,
        disciplina: value.disciplina,
        turma: value.turma,
        turmaId,
        escolaId: value.escolaId,
        instrucoes: value.instrucoes,
        dataInicio: value.dataInicio,
        dataFim: value.dataFim,
        tempoMinutos: value.tempoMinutos,
        ...pdfFields,
      })
      .where(eq(provas.id, id));

    await tx.delete(questoes).where(eq(questoes.provaId, id));
    for (let i = 0; i < value.questoes.length; i++) {
      const q = value.questoes[i];
      const [questao] = await tx
        .insert(questoes)
        .values({
          provaId: id,
          numero: i + 1,
          pergunta: q.pergunta,
          tipo: q.tipo,
          valor: String(q.valor),
          ordem: i,
        })
        .returning({ id: questoes.id });
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
  });

  return NextResponse.json({ ok: true });
}

/** Exclui a prova (com questões, alternativas, respostas e resultados). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const prova = await loadOwnedProva(id);
  if (!prova) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccess(user, prova)) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const [{ total }] = await db
    .select({ total: count() })
    .from(resultados)
    .where(eq(resultados.provaId, id));

  if (Number(total) > 0 && prova.status === "active") {
    return NextResponse.json(
      { error: "Não é possível excluir uma prova publicada que já possui respostas. Encerre a prova." },
      { status: 400 }
    );
  }

  await db.delete(provas).where(eq(provas.id, id));
  return NextResponse.json({ ok: true });
}