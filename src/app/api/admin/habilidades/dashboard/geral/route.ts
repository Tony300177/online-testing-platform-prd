import { NextResponse } from "next/server";
import { db } from "@/db";
import { respostasAlunos, questoes, provas, turmas, escolas, alunos, desempenhoThresholds } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

function classificarDesempenho(pct: number, thresholds: { verdeMin: number; amareloMin: number; laranjaMin: number }) {
  if (pct >= thresholds.verdeMin) return "verde";
  if (pct >= thresholds.amareloMin) return "amarelo";
  if (pct >= thresholds.laranjaMin) return "laranja";
  return "vermelho";
}

function getCorClassificacao(classif: string) {
  switch (classif) {
    case "verde": return { bg: "bg-emerald-100", text: "text-emerald-800", label: "Satisfatório", icon: "🟢" };
    case "amarelo": return { bg: "bg-amber-100", text: "text-amber-800", label: "Em desenvolvimento", icon: "🟡" };
    case "laranja": return { bg: "bg-orange-100", text: "text-orange-800", label: "Necessita acompanhamento", icon: "🟠" };
    default: return { bg: "bg-rose-100", text: "text-rose-800", label: "Necessita intervenção pedagógica", icon: "🔴" };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const escolaId = searchParams.get("escolaId");
    const provaId = searchParams.get("provaId");

    // Buscar thresholds da escola (ou padrão)
    const [thresholdRow] = await db
      .select()
      .from(desempenhoThresholds)
      .where(escolaId ? eq(desempenhoThresholds.escolaId, escolaId) : sql`escola_id IS NULL`)
      .limit(1);
    
    const thresholds = thresholdRow ?? { verdeMin: 80, amareloMin: 60, laranjaMin: 40 };

    const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
    if (provaId) conditions.push(eq(respostasAlunos.provaId, Number(provaId)));
    if (escolaId) conditions.push(eq(respostasAlunos.escolaNome, (await db.select({ nome: escolas.nome }).from(escolas).where(eq(escolas.id, escolaId)).limit(1))[0]?.nome ?? ""));

    // Query agregada por escola
    const { rows } = await db.execute(sql`
      SELECT
        ra.escola_nome AS "escolaNome",
        q.disciplina,
        unnest(q.habilidade) AS habilidade,
        ra.correta
      FROM respostas_alunos ra
      INNER JOIN questoes q ON q.id = ra.questao_id
      INNER JOIN provas p ON p.id = ra.prova_id
      WHERE ${sql.join(conditions, sql` AND `)}
    `);

    // Agregar por escola -> disciplina -> habilidade
    type Count = { total: number; acertos: number };
    const map: Record<string, Record<string, Record<string, Count>>> = {};

    for (const r of rows as any[]) {
      const escola = r.escolaNome ?? "—";
      const disc = r.disciplina ?? "—";
      const hab = r.habilidade;
      if (!map[escola]) map[escola] = {};
      if (!map[escola][disc]) map[escola][disc] = {};
      if (!map[escola][disc][hab]) map[escola][disc][hab] = { total: 0, acertos: 0 };
      map[escola][disc][hab].total++;
      if (r.correta) map[escola][disc][hab].acertos++;
    }

    // Construir resposta estruturada
    const escolasData = Object.entries(map).map(([escolaNome, disciplinas]) => {
      const discData = Object.entries(disciplinas).map(([disciplina, habs]) => {
        const habData = Object.entries(habs).map(([habilidade, c]) => {
          const pct = c.total > 0 ? Math.round((c.acertos / c.total) * 100) : 0;
          const classif = classificarDesempenho(pct, thresholds);
          const cor = getCorClassificacao(classif);
          return {
            habilidade,
            total: c.total,
            acertos: c.acertos,
            percentual: pct,
            classificacao: classif,
            ...cor,
          };
        }).sort((a, b) => a.percentual - b.percentual); // piores primeiro

        // Média da disciplina
        const totalGeral = habData.reduce((s, h) => s + h.total, 0);
        const acertosGeral = habData.reduce((s, h) => s + h.acertos, 0);
        const mediaDisc = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
        const classifDisc = classificarDesempenho(mediaDisc, thresholds);
        const corDisc = getCorClassificacao(classifDisc);

        return {
          disciplina,
          media: mediaDisc,
          classificacao: classifDisc,
          ...corDisc,
          habilidades: habData,
        };
      });

      // Média geral da escola
      const allHabs = discData.flatMap(d => d.habilidades);
      const totalGeral = allHabs.reduce((s, h) => s + h.total, 0);
      const acertosGeral = allHabs.reduce((s, h) => s + h.acertos, 0);
      const mediaGeral = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
      const classifGeral = classificarDesempenho(mediaGeral, thresholds);
      const corGeral = getCorClassificacao(classifGeral);

      // Top 5 habilidades com maior dificuldade
      const topDificuldade = [...allHabs]
        .sort((a, b) => a.percentual - b.percentual)
        .slice(0, 5)
        .map(h => ({ habilidade: h.habilidade, percentual: h.percentual, disciplina: discData.find(d => d.habilidades.some(h2 => h2.habilidade === h.habilidade))?.disciplina }));

      return {
        escolaNome,
        mediaGeral,
        classificacaoGeral: classifGeral,
        ...corGeral,
        disciplinas: discData,
        topDificuldade,
      };
    });

    return NextResponse.json({ ok: true, data: escolasData, thresholds });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}