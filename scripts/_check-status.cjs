const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const t = await c.query(`SELECT
    (SELECT count(*) FROM escolas) escolas,
    (SELECT count(*) FROM turmas) turmas,
    (SELECT count(*) FROM alunos) alunos,
    (SELECT count(*) FROM matriculas) matriculas,
    (SELECT count(*) FROM users) users`);
  console.log("TOTAIS:", JSON.stringify(t.rows[0]));
  const e = await c.query(`
    SELECT es.codigo,
      count(DISTINCT t.id) as turmas,
      count(DISTINCT m.aluno_id) FILTER (WHERE m.status='ativo') as alunos
    FROM escolas es
    LEFT JOIN turmas t ON t.escola_id = es.id
    LEFT JOIN matriculas m ON m.turma_id = t.id
    GROUP BY es.codigo
    ORDER BY es.codigo`);
  for (const r of e.rows) console.log(`${String(r.codigo).padStart(2,"0")} turmas=${r.turmas} alunos=${r.alunos}`);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });