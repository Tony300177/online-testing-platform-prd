const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const TABELAS = [
  "respostas_alunos",
  "resultados",
  "alternativas",
  "questoes",
  "provas",
  "aplicacao_escolas",
  "aplicacao_turmas",
  "aplicacoes",
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN");
    const antes = {};
    for (const t of TABELAS) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
      antes[t] = rows[0].n;
    }
    for (const t of TABELAS) {
      await c.query(`TRUNCATE TABLE ${t} CONTINUE IDENTITY CASCADE`);
    }
    await c.query("COMMIT");
    console.log("Zerados (contagem antes -> depois):");
    for (const t of TABELAS) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(`  ${t.padEnd(20)} ${antes[t]} -> ${rows[0].n}`);
    }
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("FALHA:", e.message);
    process.exitCode = 1;
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });