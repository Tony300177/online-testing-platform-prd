import { NextResponse } from "next/server";
import { db } from "@/db";
import { respostasAlunos, questoes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const provaId = searchParams.get("provaId");
    const formato = searchParams.get("formato");

    const conditions = [sql`q.habilidade IS NOT NULL AND cardinality(q.habilidade) > 0`];
    if (provaId) conditions.push(eq(respostasAlunos.provaId, Number(provaId)));

    const { rows } = await db.execute(sql`
      SELECT
        ra.aluno_nome AS "alunoNome",
        ra.aluno_turma AS "alunoTurma",
        ra.escola_nome AS "escolaNome",
        ra.correta,
        q.disciplina,
        unnest(q.habilidade) AS habilidade
      FROM respostas_alunos ra
      INNER JOIN questoes q ON q.id = ra.questao_id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY ra.aluno_turma, ra.aluno_nome, q.disciplina
    `);

    // Agrupar por aluno -> habilidade
    type HCount = { total: number; acertos: number };
    const map: Record<string, { alunoNome: string; alunoTurma: string; escolaNome: string; habilidades: Record<string, HCount> }> = {};

    for (const r of rows as any[]) {
      const key = `${r.alunoNome}|${r.alunoTurma}`;
      if (!map[key]) map[key] = { alunoNome: r.alunoNome, alunoTurma: r.alunoTurma, escolaNome: r.escolaNome, habilidades: {} };
      const h = r.habilidade as string;
      if (!map[key].habilidades[h]) map[key].habilidades[h] = { total: 0, acertos: 0 };
      map[key].habilidades[h].total++;
      if (r.correta) map[key].habilidades[h].acertos++;
    }

    const data = Object.values(map);

    if (formato === "csv") {
      const allHabs = [...new Set((rows as any[]).map((r) => r.habilidade as string))].sort();
      const header = ["Turma", "Aluno", ...allHabs.map((h) => `${h} (acertos/total)`)];
      const csvRows = data.map((a) => [
        a.alunoTurma,
        a.alunoNome,
        ...allHabs.map((h) => {
          const info = a.habilidades[h];
          return info ? `${info.acertos}/${info.total}` : "—";
        }),
      ]);
      const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=habilidades.csv" },
      });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
