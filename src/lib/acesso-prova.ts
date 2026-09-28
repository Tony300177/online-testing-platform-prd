import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { aplicacaoEscolas, aplicacaoTurmas, aplicacoes, provas, turmas } from "@/db/schema";
import { isExamClosed, notYetOpen } from "@/lib/utils";

/**
 * Escopo de acesso de um código de prova/aplicação.
 *
 * O código é a credencial que o aluno recebe do professor: enquanto vale e a
 * janela está aberta, ele autoriza ver **apenas** as turmas que ele próprio
 * cobre — as réplicas da aplicação, ou a turma única da prova avulsa. Sem ele,
 * nenhuma lista de alunos é aberta.
 */
export type EscopoCodigo =
  | {
      ok: true;
      /** Aplicação de origem do código; null quando é uma prova avulsa. */
      aplicacaoId: number | null;
      /** Turmas liberadas. Vazio = prova avulsa sem turma: não abre lista de alunos. */
      turmaIds: string[];
      escolaIds: string[];
    }
  | { ok: false; motivo: "invalido" | "indisponivel" };

type Janela = { status: string; dataInicio: Date | null; dataFim: Date | null };

function disponivel(j: Janela): boolean {
  return j.status !== "draft" && !isExamClosed(j) && !notYetOpen(j);
}

/** Escolas donas das turmas dadas, sem repetir. */
async function escolasDasTurmas(turmaIds: string[]): Promise<string[]> {
  if (turmaIds.length === 0) return [];
  const rows = await db
    .select({ escolaId: turmas.escolaId })
    .from(turmas)
    .where(inArray(turmas.id, turmaIds));
  const out: string[] = [];
  for (const r of rows) {
    if (r.escolaId && !out.includes(r.escolaId)) out.push(r.escolaId);
  }
  return out;
}

export async function resolverEscopoCodigo(codigo: string): Promise<EscopoCodigo> {
  const code = codigo.trim().toUpperCase();
  if (!code) return { ok: false, motivo: "invalido" };

  const [prova] = await db
    .select({
      id: provas.id,
      status: provas.status,
      dataInicio: provas.dataInicio,
      dataFim: provas.dataFim,
      turmaId: provas.turmaId,
      escolaId: provas.escolaId,
    })
    .from(provas)
    .where(eq(provas.codigo, code))
    .limit(1);

  // Prova avulsa: não tem réplicas, mas pertence a UMA turma (provas.turma_id).
  // Esse é o escopo: abre a lista só daquela turma, nunca a da rede. Sem turma
  // não existe escopo possível, e aí a lista de alunos fica fechada.
  if (prova) {
    if (!disponivel(prova)) return { ok: false, motivo: "indisponivel" };
    if (!prova.turmaId) return { ok: true, aplicacaoId: null, turmaIds: [], escolaIds: [] };
    const escolaIds = prova.escolaId ? [prova.escolaId] : await escolasDasTurmas([prova.turmaId]);
    return { ok: true, aplicacaoId: null, turmaIds: [prova.turmaId], escolaIds };
  }

  const [aplicacao] = await db
    .select({ id: aplicacoes.id, status: aplicacoes.status, dataInicio: aplicacoes.dataInicio, dataFim: aplicacoes.dataFim })
    .from(aplicacoes)
    .where(eq(aplicacoes.codigo, code))
    .limit(1);

  if (!aplicacao) return { ok: false, motivo: "invalido" };
  if (!disponivel(aplicacao)) return { ok: false, motivo: "indisponivel" };

  const turmaIds = (
    await db
      .select({ turmaId: aplicacaoTurmas.turmaId })
      .from(aplicacaoTurmas)
      .where(eq(aplicacaoTurmas.aplicacaoId, aplicacao.id))
  ).map((t) => t.turmaId);

  const escolaIds = (
    await db
      .select({ escolaId: aplicacaoEscolas.escolaId })
      .from(aplicacaoEscolas)
      .where(eq(aplicacaoEscolas.aplicacaoId, aplicacao.id))
  ).map((e) => e.escolaId);

  if (escolaIds.length === 0 && turmaIds.length > 0) {
    for (const escolaId of await escolasDasTurmas(turmaIds)) {
      if (!escolaIds.includes(escolaId)) escolaIds.push(escolaId);
    }
  }

  return { ok: true, aplicacaoId: aplicacao.id, turmaIds, escolaIds };
}
