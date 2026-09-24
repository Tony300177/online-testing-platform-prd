const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select id, nome, codigo, tipo, ativo from escolas where codigo in (11, 1, 2) order by codigo`);
  console.log("escolas alvo:", JSON.stringify(r.rows));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });