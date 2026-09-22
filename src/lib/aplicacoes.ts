import { eq, inArray, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { NodePgTransaction } from "drizzle-orm/node-postgres/session";
import * as schema from "@/db/schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/**
 * Duplica uma prova (questões + alternativas + arquivo) para cada turma,
 * criando uma linha em `provas` por turma vinculada à aplicação.
 * Retorna os IDs das réplicas criadas.
 */
export async function duplicateProvaForTurmas(
  tx: Tx,
  origemId: number,
  aplicacaoId: number,
  turmas: { turmaId: string; escolaId: string; nome: string }[]
): Promise<number[]> {
  const [origem] = await tx
    .select()
    .from(schema.provas)
    .where(eq(schema.provas.id, origemId));

  if (!origem) throw new Error("Prova de origem não encontrada.");

  const origensQuestoes = await tx
    .select()
    .from(schema.questoes)
    .where(eq(schema.questoes.provaId, origemId))
    .orderBy(schema.questoes.ordem, schema.questoes.numero);

  const origensAlternativas = origensQuestoes.length
    ? await tx
        .select()
        .from(schema.alternativas)
        .where(
          inArray(
            schema.alternativas.questaoId,
            origensQuestoes.map((q) => q.id)
          )
        )
    : [];

  const replicas: number[] = [];

  for (const turma of turmas) {
    const [replica] = await tx
      .insert(schema.provas)
      .values({
        titulo: origem.titulo,
        disciplina: origem.disciplina,
        turma: turma.nome,
        turmaId: turma.turmaId,
        escolaId: turma.escolaId,
        arquivoNome: origem.arquivoNome,
        arquivoBase64: origem.arquivoBase64,
        arquivoTamanho: origem.arquivoTamanho,
        arquivoUrl: origem.arquivoUrl,
        instrucoes: origem.instrucoes,
        dataInicio: origem.dataInicio,
        dataFim: origem.dataFim,
        tempoMinutos: origem.tempoMinutos,
        status: "active",
        codigo: null,
        professorId: origem.professorId,
        aplicacaoId,
      })
      .returning({ id: schema.provas.id });

    replicas.push(replica.id);

    for (const q of origensQuestoes) {
      const [novaQuestao] = await tx
        .insert(schema.questoes)
        .values({
          provaId: replica.id,
          numero: q.numero,
          pergunta: q.pergunta,
          tipo: q.tipo,
          valor: q.valor,
          habilidade: q.habilidade,
          ordem: q.ordem,
        })
        .returning({ id: schema.questoes.id });

      const alts = origensAlternativas.filter((a) => a.questaoId === q.id);
      if (alts.length) {
        await tx.insert(schema.alternativas).values(
          alts.map((a) => ({
            questaoId: novaQuestao.id,
            letra: a.letra,
            texto: a.texto,
            correta: a.correta,
          }))
        );
      }
    }
  }

  return replicas;
}