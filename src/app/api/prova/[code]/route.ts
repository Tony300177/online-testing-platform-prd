import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  alunos,
  alternativas,
  aplicacaoEscolas,
  aplicacaoTurmas,
  aplicacoes,
  escolas,
  matriculas,
  provas,
  questoes,
  resultados,
  turmas,
} from "@/db/schema";
import { getSessionAluno } from "@/lib/auth";
import { isExamClosed, notYetOpen } from "@/lib/utils";

const ANO_LETIVO = 2026;

type Ctx = { params: Promise<{ code: string }> };

async function fetchEscolasDaAplicacao(aplicacaoId: number) {
  const appEscolas = await db
    .select({ escolaId: aplicacaoEscolas.escolaId })
    .from(aplicacaoEscolas)
    .where(eq(aplicacaoEscolas.aplicacaoId, aplicacaoId));

  const appTurmas = await db
    .select({ turmaId: aplicacaoTurmas.turmaId })
    .from(aplicacaoTurmas)
    .where(eq(aplicacaoTurmas.aplicacaoId, aplicacaoId));

  const escolaIds = appEscolas.map((e) => e.escolaId);
  const turmaIds = appTurmas.map((t) => t.turmaId);
  if (turmaIds.length === 0) return [];

  const turmasRows = await db.select().from(turmas).where(inArray(turmas.id, turmaIds));
  const escolasRows = escolaIds.length ? await db.select().from(escolas).where(inArray(escolas.id, escolaIds)) : [];

  const matRows = await db
    .select({
      alunoId: matriculas.alunoId,
      turmaId: matriculas.turmaId,
      nome: alunos.nome,
      numeroChamada: alunos.numeroChamada,
    })
    .from(matriculas)
    .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
    .where(and(eq(matriculas.anoLetivo, ANO_LETIVO), eq(matriculas.status, "ativo"), inArray(matriculas.turmaId, turmaIds)))
    .orderBy(asc(alunos.numeroChamada));

  const byTurma = new Map<string, { id: string; nome: string; numeroChamada: number | null }[]>();
  for (const m of matRows) {
    const list = byTurma.get(m.turmaId) ?? [];
    list.push({ id: m.alunoId, nome: m.nome, numeroChamada: m.numeroChamada });
    byTurma.set(m.turmaId, list);
  }

  return escolasRows.map((e) => ({
    id: e.id,
    nome: e.nome,
    turmas: turmasRows
      .filter((t) => t.escolaId === e.id)
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        ano: t.ano,
        turno: t.turno,
        professor: t.professor,
        alunos: byTurma.get(t.id) ?? [],
      })),
  }));
}

/**
 * Endpoint público usado pela tela do aluno.
 * Resolve tanto o código de uma prova publicada quanto o código de uma aplicação
 * (quando o código pertence a uma aplicação, retorna as escolas/turmas participantes
 * para a identificação e, após a identificação, as questões da réplica da turma).
 */
export async function GET(req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const url = new URL(req.url);
  const turmaIdQuery = url.searchParams.get("turmaId");

  const [prova] = await db.select().from(provas).where(eq(provas.codigo, code)).limit(1);

  // Código de aplicação (réplicas por turma não têm código próprio)
  let aplicacao: { id: number; titulo: string; provaOrigemId: number | null; dataInicio: Date | null; dataFim: Date | null; status: string } | undefined;
  if (!prova) {
    [aplicacao] = await db
      .select({
        id: aplicacoes.id,
        titulo: aplicacoes.titulo,
        provaOrigemId: aplicacoes.provaOrigemId,
        dataInicio: aplicacoes.dataInicio,
        dataFim: aplicacoes.dataFim,
        status: aplicacoes.status,
      })
      .from(aplicacoes)
      .where(eq(aplicacoes.codigo, code))
      .limit(1);
    if (!aplicacao || aplicacao.status === "draft") {
      return NextResponse.json({ ok: false, error: "Prova não encontrada. Verifique o código." }, { status: 404 });
    }
  }

  const session = await getSessionAluno();
  const aluno = session
    ? { id: session.aluno.id, nome: session.aluno.nome, turmaId: session.turmaId, turma: session.turmaNome, escola: session.escolaNome }
    : null;

  // ----- Fluxo de aplicação -----
  if (aplicacao) {
    const [origem] = aplicacao.provaOrigemId
      ? await db.select().from(provas).where(eq(provas.id, aplicacao.provaOrigemId)).limit(1)
      : [];
    const baseExam = {
      id: origem?.id ?? 0,
      titulo: aplicacao.titulo,
      disciplina: origem?.disciplina ?? "",
      turma: "",
      instrucoes: origem?.instrucoes ?? "",
      dataInicio: aplicacao.dataInicio ? aplicacao.dataInicio.toISOString() : null,
      dataFim: aplicacao.dataFim ? aplicacao.dataFim.toISOString() : null,
      tempoMinutos: origem?.tempoMinutos ?? null,
      arquivoNome: origem?.arquivoNome ?? null,
    };
    const closed = isExamClosed({ status: aplicacao.status, dataFim: aplicacao.dataFim });
    const notOpen = notYetOpen({ dataInicio: aplicacao.dataInicio });

    // Réplica da turma do aluno logado (ou informado via query após a identificação)
    const identificarTurmaId = aluno?.turmaId ?? turmaIdQuery ?? undefined;
    if (aluno || turmaIdQuery) {
      if (!identificarTurmaId) {
        return NextResponse.json(
          { ok: false, error: "Não foi possível identificar sua turma. Tente novamente." },
          { status: 400 }
        );
      }
      const [replica] = await db
        .select()
        .from(provas)
        .where(and(eq(provas.aplicacaoId, aplicacao.id), eq(provas.turmaId, identificarTurmaId)))
        .limit(1);
      if (!replica || replica.status === "draft") {
        return NextResponse.json(
          { ok: false, error: "Sua turma não está participando desta aplicação." },
          { status: 403 }
        );
      }
      const alunoIdParaResultado = aluno?.id ?? url.searchParams.get("alunoId") ?? null;
      const [resultado] = alunoIdParaResultado
        ? await db
            .select()
            .from(resultados)
            .where(and(eq(resultados.provaId, replica.id), eq(resultados.alunoId, alunoIdParaResultado)))
            .limit(1)
        : [];
      if (resultado) {
        return NextResponse.json({
          ok: true,
          aplicacao: true,
          closed: isExamClosed(replica),
          notOpen: notYetOpen(replica),
          alreadySubmitted: true,
          aluno,
          exam: baseExam,
          result: {
            acertos: Number(resultado.acertos),
            erros: Number(resultado.erros),
            nota: Number(resultado.nota),
            percentual: Number(resultado.percentual),
          },
        });
      }
      const qs = await db.select().from(questoes).where(eq(questoes.provaId, replica.id)).orderBy(asc(questoes.ordem));
      const qIds = qs.map((q) => q.id);
      const allAlts =
        qIds.length > 0
          ? await db
              .select({ id: alternativas.id, questaoId: alternativas.questaoId, letra: alternativas.letra, texto: alternativas.texto })
              .from(alternativas)
              .where(inArray(alternativas.questaoId, qIds))
          : [];
      const altByQuestao = new Map<number, (typeof allAlts)[number][]>();
      for (const a of allAlts) {
        if (!altByQuestao.has(a.questaoId)) altByQuestao.set(a.questaoId, []);
        altByQuestao.get(a.questaoId)!.push(a);
      }
      return NextResponse.json({
        ok: true,
        aplicacao: true,
        closed: isExamClosed(replica),
        notOpen,
        aluno,
        exam: baseExam,
        questions: qs.map((q) => ({
          id: q.id,
          numero: q.numero,
          pergunta: q.pergunta,
          tipo: q.tipo,
          valor: Number(q.valor),
          ordem: q.ordem,
          alternativas: (altByQuestao.get(q.id) ?? []).map((a) => ({ id: a.id, letra: a.letra, texto: a.texto })),
        })),
      });
    }

    // Aluno ainda não identificado: retorna as escolas/turmas participantes da aplicação
    const escolas = await fetchEscolasDaAplicacao(aplicacao.id);
    return NextResponse.json({
      ok: true,
      aplicacao: true,
      closed,
      notOpen,
      aluno: null,
      exam: baseExam,
      escolas,
    });
  }

  // ----- Fluxo de prova única -----
  if (!prova || prova.status === "draft") {
    return NextResponse.json({ ok: false, error: "Prova não encontrada. Verifique o código." }, { status: 404 });
  }

  const closed = isExamClosed(prova);
  const notOpen = notYetOpen(prova);
  const baseExam = {
    id: prova.id,
    titulo: prova.titulo,
    disciplina: prova.disciplina,
    turma: prova.turma,
    instrucoes: prova.instrucoes,
    dataInicio: prova.dataInicio ? prova.dataInicio.toISOString() : null,
    dataFim: prova.dataFim ? prova.dataFim.toISOString() : null,
    tempoMinutos: prova.tempoMinutos,
    arquivoNome: prova.arquivoNome,
  };

  // Aluno logado que já enviou: devolve o resultado em vez das questões.
  if (aluno) {
    const [resultado] = await db
      .select()
      .from(resultados)
      .where(and(eq(resultados.provaId, prova.id), eq(resultados.alunoId, aluno.id)))
      .limit(1);
    if (resultado) {
      return NextResponse.json({
        ok: true,
        closed,
        notOpen,
        alreadySubmitted: true,
        aluno,
        exam: baseExam,
        result: {
          acertos: Number(resultado.acertos),
          erros: Number(resultado.erros),
          nota: Number(resultado.nota),
          percentual: Number(resultado.percentual),
        },
      });
    }
  }

  if (closed) {
    return NextResponse.json(
      {
        ok: true,
        closed: true,
        notOpen: false,
        aluno,
        exam: baseExam,
      },
      { status: 200 }
    );
  }

  const qs = await db
    .select()
    .from(questoes)
    .where(eq(questoes.provaId, prova.id))
    .orderBy(asc(questoes.ordem));

  const qIds = qs.map((q) => q.id);
  const allAlts =
    qIds.length > 0
      ? await db
          .select({ id: alternativas.id, questaoId: alternativas.questaoId, letra: alternativas.letra, texto: alternativas.texto })
          .from(alternativas)
          .where(inArray(alternativas.questaoId, qIds))
      : [];
  const altByQuestao = new Map<number, (typeof allAlts)[number][]>();
  for (const a of allAlts) {
    if (!altByQuestao.has(a.questaoId)) altByQuestao.set(a.questaoId, []);
    altByQuestao.get(a.questaoId)!.push(a);
  }

  return NextResponse.json({
    ok: true,
    closed: false,
    notOpen,
    aluno,
    exam: baseExam,
    questions: qs.map((q) => ({
      id: q.id,
      numero: q.numero,
      pergunta: q.pergunta,
      tipo: q.tipo,
      valor: Number(q.valor),
      ordem: q.ordem,
      alternativas: (altByQuestao.get(q.id) ?? []).map((a) => ({ id: a.id, letra: a.letra, texto: a.texto })),
    })),
  });
}