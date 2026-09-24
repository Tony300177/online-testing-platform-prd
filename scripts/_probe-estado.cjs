const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const total = await c.query(`
    SELECT (SELECT count(*) FROM escolas) AS escolas,
           (SELECT count(*) FROM professores) AS professores,
           (SELECT count(*) FROM turmas) AS turmas,
           (SELECT count(*) FROM alunos) AS alunos,
           (SELECT count(*) FROM matriculas) AS matriculas
  `);
  console.log("TOTAIS:", JSON.stringify(total.rows[0]));

  const r = await c.query(`
    SELECT e.codigo, e.nome,
           count(t.id) AS turmas,
           count(DISTINCT m.aluno_id) AS alunos
    FROM escolas e
    LEFT JOIN turmas t ON t.escola_id = e.id
    LEFT JOIN matriculas m ON m.turma_id = t.id
    GROUP BY e.codigo, e.nome
    ORDER BY e.codigo
  `);
  console.log("POR ESCOLA:");
  for (const x of r.rows) {
    console.log(`  ${String(x.codigo).padStart(2, "0")} | ${x.nome} | turmas=${x.turmas} | alunos=${x.alunos}`);
  }

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});