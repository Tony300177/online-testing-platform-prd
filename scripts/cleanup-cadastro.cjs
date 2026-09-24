const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`delete from turmas where nome = 'TESTE CADASTRO MANUAL' returning id, nome`);
  console.log("deletadas:", JSON.stringify(r.rows));
  const chk = await c.query(`select count(*) as t from turmas where ano_letivo = 2026`);
  console.log("turmas 2026:", chk.rows[0].t);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });