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
    const alunoId = searchParams.get("alunoId");
    const alunoNome = searchParams.get("alunoNome");
    const turmaId = searchParams.get("turmaId");
    const provaId = searchParams.get("provaId");

    if (!alunoId && !alunoNome) return NextResponse.json({ ok: false, error: "alunoId ou alunoNome é obrigatório" }, { status: 400 });

    const [thresholdRow] = await db
      .select()
      .from(desempenhoThresholds)
      .where(escolaId ? eq(desempenhoThresholds.escolaId, escolaId) : sql`escola_id IS NULL`)
      .limit(1);
    const thresholds = thresholdRow ?? { verdeMin: 80, amareloMin: 60, laranjaMin: 40 };

    const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
    if (alunoId) conditions.push(eq(respostasAlunos.alunoId, alunoId));
    if (alunoNome) conditions.push(eq(respostasAlunos.alunoNome, alunoNome));
    if (turmaId) conditions.push(eq(respostasAlunos.turmaId, turmaId));
    if (provaId) conditions.push(eq(respostasAlunos.provaId, Number(provaId)));

    const { rows } = await db.execute(sql`
      SELECT
        ra.aluno_nome AS "alunoNome",
        ra.aluno_turma AS "alunoTurma",
        ra.aluno_id AS "alunoId",
        ra.escola_nome AS "escolaNome",
        ra.prova_id AS "provaId",
        p.titulo AS "provaTitulo",
        p.disciplina AS "provaDisciplina",
        q.disciplina,
        unnest(q.habilidade) AS habilidade,
        ra.correta,
        ra.respondida_em AS "respondidaEm"
      FROM respostas_alunos ra
      INNER JOIN questoes q ON q.id = ra.questao_id
      INNER JOIN provas p ON p.id = ra.prova_id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY ra.respondida_em DESC
    `);

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, data: { aluno: null, historico: [], thresholds } });
    }

    const first = rows[0] as any;
    const alunoInfo = {
      alunoNome: first.alunoNome,
      alunoTurma: first.alunoTurma,
      alunoId: first.alunoId,
      escolaNome: first.escolaNome,
    };

    // Agregar por prova -> disciplina -> habilidade
    type Count = { total: number; acertos: number };
    const provasMap: Record<string, { provaTitulo: string; provaDisciplina: string; disciplinas: Record<string, Record<string, Count>> }> = {};

    for (const r of rows as any[]) {
      const provaKey = `${r.provaId}|${r.provaTitulo}`;
      if (!provasMap[provaKey]) provasMap[provaKey] = { provaTitulo: r.provaTitulo, provaDisciplina: r.provaDisciplina, disciplinas: {} };
      const disc = r.disciplina ?? "—";
      const hab = r.habilidade;
      if (!provasMap[provaKey].disciplinas[disc]) provasMap[provaKey].disciplinas[disc] = {};
      if (!provasMap[provaKey].disciplinas[disc][hab]) provasMap[provaKey].disciplinas[disc][hab] = { total: 0, acertos: 0 };
      provasMap[provaKey].disciplinas[disc][hab].total++;
      if (r.correta) provasMap[provaKey].disciplinas[disc][hab].acertos++;
    }

    // Histórico por prova
    const historico = Object.entries(provasMap).map(([key, data]) => {
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

      const allHabs = disciplinas.flatMap(d => d.habilidades);
      const totalGeral = allHabs.reduce((s, h) => s + h.total, 0);
      const acertosGeral = allHabs.reduce((s, h) => s + h.acertos, 0);
      const mediaGeral = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
      const classifGeral = classificarDesempenho(mediaGeral, thresholds);
      const corGeral = getCorClassificacao(classifGeral);

      return {
        provaId: key.split("|")[0],
        provaTitulo: data.provaTitulo,
        provaDisciplina: data.provaDisciplina,
        mediaGeral,
        classificacaoGeral: classifGeral,
        ...corGeral,
        disciplinas,
      };
    });

    // Agregado geral (todas as provas)
    const allHabs = historico.flatMap(p => p.disciplinas.flatMap(d => d.habilidades));
    const habAgg: Record<string, { total: number; acertos: number; disciplina: string }> = {};
    for (const h of historico) {
      for (const d of h.disciplinas) {
        for (const hab of d.habilidades) {
          if (!habAgg[hab.habilidade]) habAgg[hab.habilidade] = { total: 0, acertos: 0, disciplina: d.disciplina };
          habAgg[hab.habilidade].total += hab.total;
          habAgg[hab.habilidade].acertos += hab.acertos;
        }
      }
    }

    const habilidadesDesenvolvidas = Object.entries(habAgg)
      .filter(([, c]) => {
        const pct = c.total > 0 ? Math.round((c.acertos / c.total) * 100) : 0;
        return pct >= thresholds.verdeMin;
      })
      .map(([habilidade, c]) => ({
        habilidade,
        disciplina: c.disciplina,
        percentual: Math.round((c.acertos / c.total) * 100),
        total: c.total,
        acertos: c.acertos,
      }))
      .sort((a, b) => b.percentual - a.percentual);

    const habilidadesComDificuldade = Object.entries(habAgg)
      .filter(([, c]) => {
        const pct = c.total > 0 ? Math.round((c.acertos / c.total) * 100) : 0;
        return pct < thresholds.amareloMin;
      })
      .map(([habilidade, c]) => ({
        habilidade,
        disciplina: c.disciplina,
        percentual: Math.round((c.acertos / c.total) * 100),
        total: c.total,
        acertos: c.acertos,
      }))
      .sort((a, b) => a.percentual - b.percentual);

    const totalGeral = allHabs.reduce((s, h) => s + h.total, 0);
    const acertosGeral = allHabs.reduce((s, h) => s + h.acertos, 0);
    const mediaGeral = totalGeral > 0 ? Math.round((acertosGeral / totalGeral) * 100) : 0;
    const classifGeral = classificarDesempenho(mediaGeral, thresholds);
    const corGeral = getCorClassificacao(classifGeral);

    return NextResponse.json({
      ok: true,
      data: {
        aluno: { ...alunoInfo, mediaGeral, classificacaoGeral: classifGeral, ...corGeral },
        historico,
        habilidadesDesenvolvidas,
        habilidadesComDificuldade,
        thresholds,
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}