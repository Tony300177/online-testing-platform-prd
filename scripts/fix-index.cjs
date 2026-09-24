const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("DROP INDEX IF EXISTS escolas_codigo_uniq");
  await c.query("CREATE UNIQUE INDEX escolas_codigo_uniq ON escolas (codigo)");
  console.log("indice recriado");
  const r = await c.query(`select i.indexname, i.indexdef from pg_indexes i where tablename='escolas'`);
  console.log(JSON.stringify(r.rows));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });