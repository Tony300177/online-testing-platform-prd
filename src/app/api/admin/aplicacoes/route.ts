import { NextResponse } from "next/server";
import { count, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { aplicacaoEscolas, aplicacaoTurmas, aplicacoes, provas, turmas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { duplicateProvaForTurmas } from "@/lib/aplicacoes";
import { generateSlug } from "@/lib/utils";

/** Cria uma aplicação (agendamento de uma prova do banco para várias escolas/turmas). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  let body: { provaOrigemId?: number; titulo?: string; dataInicio?: string; dataFim?: string; turmaIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const provaOrigemId = body.provaOrigemId;
  const turmaIds = Array.isArray(body.turmaIds) ? body.turmaIds.filter(Boolean) : [];
  if (!provaOrigemId) return NextResponse.json({ error: "Selecione a prova do banco de provas." }, { status: 400 });
  if (turmaIds.length === 0) return NextResponse.json({ error: "Selecione ao menos uma turma." }, { status: 400 });

  const dataInicio = body.dataInicio ? new Date(body.dataInicio) : null;
  const dataFim = body.dataFim ? new Date(body.dataFim) : null;
  if (dataInicio && Number.isNaN(dataInicio.getTime())) return NextResponse.json({ error: "Data de início inválida." }, { status: 400 });
  if (dataFim && Number.isNaN(dataFim.getTime())) return NextResponse.json({ error: "Data de término inválida." }, { status: 400 });

  const aplicacaoId = await db.transaction(async (tx) => {
    const [origem] = await tx.select().from(provas).where(eq(provas.id, provaOrigemId));
    if (!origem) throw new Error("Prova do banco de provas não encontrada.");

    const turmasSelecionadas = await tx.select().from(turmas).where(inArray(turmas.id, turmaIds));
    if (turmasSelecionadas.length === 0) throw new Error("Nenhuma turma selecionada foi encontrada.");
    const escolaIds = [...new Set(turmasSelecionadas.map((t) => t.escolaId).filter(Boolean))] as string[];

    const [aplicacao] = await tx
      .insert(aplicacoes)
      .values({
        codigo: generateSlug(),
        titulo: body.titulo?.trim() || origem.titulo,
        provaOrigemId: origem.id,
        dataInicio,
        dataFim,
        status: "active",
        criadoPor: user.id,
      })
      .returning({ id: aplicacoes.id });

    if (escolaIds.length) {
      await tx.insert(aplicacaoEscolas).values(escolaIds.map((escolaId) => ({ aplicacaoId: aplicacao.id, escolaId })));
    }
    await tx.insert(aplicacaoTurmas).values(
      turmasSelecionadas.map((t) => ({ aplicacaoId: aplicacao.id, turmaId: t.id }))
    );

    await duplicateProvaForTurmas(
      tx,
      origem.id,
      aplicacao.id,
      turmasSelecionadas.map((t) => ({ turmaId: t.id, escolaId: t.escolaId, nome: t.nome }))
    );

    return aplicacao.id;
  });

  return NextResponse.json({ ok: true, id: aplicacaoId });
}

/** Lista aplicações (com contagem de escolas, turmas e provas duplicadas). */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const apps = await db.select().from(aplicacoes).orderBy(aplicacoes.createdAt);

  const turmaCounts = await db
    .select({ aplicacaoId: aplicacaoTurmas.aplicacaoId, valor: count() })
    .from(aplicacaoTurmas)
    .groupBy(aplicacaoTurmas.aplicacaoId);

  const escolaCounts = await db
    .select({ aplicacaoId: aplicacaoEscolas.aplicacaoId, valor: count() })
    .from(aplicacaoEscolas)
    .groupBy(aplicacaoEscolas.aplicacaoId);

  const replicaCounts = await db
    .select({ aplicacaoId: provas.aplicacaoId, valor: count() })
    .from(provas)
    .where(isNotNull(provas.aplicacaoId))
    .groupBy(provas.aplicacaoId);

  const countMap = (rows: { aplicacaoId: number | null; valor: number }[]) =>
    new Map(rows.map((r) => [r.aplicacaoId, Number(r.valor)]));

  const turmaMap = countMap(turmaCounts);
  const escolaMap = countMap(escolaCounts);
  const replicaMap = countMap(replicaCounts);

  const list = await Promise.all(
    apps.map(async (a) => {
      const origem = a.provaOrigemId ? await db.select({ id: provas.id, titulo: provas.titulo, disciplina: provas.disciplina }).from(provas).where(eq(provas.id, a.provaOrigemId)) : [];
      return {
        id: a.id,
        codigo: a.codigo,
        titulo: a.titulo,
        status: a.status,
        dataInicio: a.dataInicio,
        dataFim: a.dataFim,
        criadoEm: a.createdAt,
        provaOrigem: origem[0]?.titulo ?? "Prova removida",
        disciplina: origem[0]?.disciplina ?? "",
        totalEscolas: escolaMap.get(a.id) ?? 0,
        totalTurmas: turmaMap.get(a.id) ?? 0,
        totalReplicas: replicaMap.get(a.id) ?? 0,
      };
    })
  );

  return NextResponse.json({ ok: true, aplicacoes: list });
}