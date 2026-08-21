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
    const turmaId = searchParams.get("turmaId");
    const provaId = searchParams.get("provaId");

    if (!turmaId) {
      const escolasList = await db.select({ id: escolas.id, nome: escolas.nome }).from(escolas).orderBy(escolas.nome);
      const turmasConditions = escolaId ? [eq(turmas.escolaId, escolaId)] : [];
      const turmasList = await db
        .select({ id: turmas.id, nome: turmas.nome, escolaId: turmas.escolaId })
        .from(turmas)
        .where(turmasConditions.length ? turmasConditions[0] : sql`1=1`)
        .orderBy(turmas.nome);
      return NextResponse.json({ ok: true, data: { escolas: escolasList, turmas: turmasList } });
    }

    const [thresholdRow] = await db
      .select()
      .from(desempenhoThresholds)
      .where(escolaId ? eq(desempenhoThresholds.escolaId, escolaId) : sql`escola_id IS NULL`)
      .limit(1);
    const thresholds = thresholdRow ?? { verdeMin: 80, amareloMin: 60, laranjaMin: 40 };

    const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`, eq(respostasAlunos.turmaId, turmaId)];
    if (provaId) conditions.push(eq(respostasAlunos.provaId, Number(provaId)));

    const { rows } = await db.execute(sql`
      SELECT
        ra.aluno_nome AS "alunoNome",
        ra.aluno_turma AS "alunoTurma",
        ra.aluno_id AS "alunoId",
        q.disciplina,
        unnest(q.habilidade) AS habilidade,
        ra.correta
      FROM respostas_alunos ra
      INNER JOIN questoes q ON q.id = ra.questao_id
      INNER JOIN provas p ON p.id = ra.prova_id
      WHERE ${sql.join(conditions, sql` AND `)}
    `);

    // Agregar por aluno -> disciplina -> habilidade
    type Count = { total: number; acertos: number };
    const map: Record<string, { alunoNome: string; alunoTurma: string; disciplinas: Record<string, Record<string, Count>> }> = {};

    for (const r of rows as any[]) {
      const key = `${r.alunoId}|${r.alunoNome}`;
      if (!map[key]) map[key] = { alunoNome: r.alunoNome, alunoTurma: r.alunoTurma, disciplinas: {} };
      const disc = r.disciplina ?? "—";
      const hab = r.habilidade;
      if (!map[key].disciplinas[disc]) map[key].disciplinas[disc] = {};
      if (!map[key].disciplinas[disc][hab]) map[key].disciplinas[disc][hab] = { total: 0, acertos: 0 };
      map[key].disciplinas[disc][hab].total++;
      if (r.correta) map[key].disciplinas[disc][hab].acertos++;
    }

    // Estruturar dados por aluno
    const alunosData = Object.entries(map).map(([key, data]) => {
      const disciplinas = Object.entries(data.disciplinas).map(([disciplina, habs]) => {
        const habData = Object.entries(habs).map(([habilidade, c]) => {
          const pct = c.total > 0 ? Math.round((c.acertos / c.total) * 100) : 0;
          const classif = classificarDesempenho(pct, thresholds);
          const cor = getCorClassificacao(classif);
          return { habilidade, total: c.total, acertos: c.acertos, percentual: pct, classificacao: classif, ...cor };
        }).sort((a, b) => a.percentual - b.percentual);

        const totalGeral = habData.reduce((s, h) => s + h.total, 0);
        const acertosGeral = habData.reduce((s, h) => s + h.acertos, 0);
        const mediaDisc = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
        const classifDisc = classificarDesempenho(mediaDisc, thresholds);
        const corDisc = getCorClassificacao(classifDisc);

        return { disciplina, media: mediaDisc, classificacao: classifDisc, ...corDisc, habilidades: habData };
      });

      // Média geral do aluno
      const allHabs = disciplinas.flatMap(d => d.habilidades);
      const totalGeral = allHabs.reduce((s, h) => s + h.total, 0);
      const acertosGeral = allHabs.reduce((s, h) => s + h.acertos, 0);
      const mediaGeral = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
      const classifGeral = classificarDesempenho(mediaGeral, thresholds);
      const corGeral = getCorClassificacao(classifGeral);

      return {
        alunoNome: data.alunoNome,
        alunoTurma: data.alunoTurma,
        alunoId: key.split("|")[0],
        mediaGeral,
        classificacaoGeral: classifGeral,
        ...corGeral,
        disciplinas,
      };
    }).sort((a, b) => a.mediaGeral - b.mediaGeral); // piores primeiro

    // Ranking da turma
    const ranking = alunosData.map((a, i) => ({
      posicao: i + 1,
      ...a,
    }));

    // Média da turma
    const mediaTurma = alunosData.length > 0
      ? Math.round(alunosData.reduce((s, a) => s + a.mediaGeral, 0) / alunosData.length)
      : 0;
    const classifTurma = classificarDesempenho(mediaTurma, thresholds);
    const corTurma = getCorClassificacao(classifTurma);

    // Habilidades mais difíceis da turma
    const allHabs = alunosData.flatMap(a => a.disciplinas.flatMap(d => d.habilidades));
    const habAgg: Record<string, { total: number; acertos: number; disciplina: string }> = {};
    for (const ad of alunosData) {
      for (const d of ad.disciplinas) {
        for (const h of d.habilidades) {
          if (!habAgg[h.habilidade]) habAgg[h.habilidade] = { total: 0, acertos: 0, disciplina: d.disciplina };
          habAgg[h.habilidade].total += h.total;
          habAgg[h.habilidade].acertos += h.acertos;
        }
      }
    }
    const topDificuldade = Object.entries(habAgg)
      .map(([habilidade, c]) => ({
        habilidade,
        disciplina: c.disciplina,
        percentual: c.total > 0 ? Math.round((c.acertos / c.total) * 100) : 0,
      }))
      .sort((a, b) => a.percentual - b.percentual)
      .slice(0, 10);

    return NextResponse.json({ 
      ok: true, 
      data: {
        turma: { media: mediaTurma, classificacao: classifTurma, ...corTurma },
        ranking,
        topDificuldade,
        alunos: alunosData,
        thresholds,
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}