const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const e = await c.query(`select codigo, nome, tipo, ativo from escolas order by codigo`);
  console.log("escolas:", JSON.stringify(e.rows));
  const t = await c.query(`select t.nome, t.ano, t.turno, t.ativo, e.codigo as escola_codigo from turmas t left join escolas e on e.id=t.escola_id order by e.codigo, t.nome`);
  console.log("turmas:", JSON.stringify(t.rows));
  const p = await c.query(`select codigo, nome, ativo from professores order by codigo`);
  console.log("professores:", JSON.stringify(p.rows));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });