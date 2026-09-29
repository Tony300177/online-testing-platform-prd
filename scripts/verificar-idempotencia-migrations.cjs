const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const SQL_DIR = path.join(__dirname, "..", "sql");
const ORDEM = JSON.parse(fs.readFileSync(path.join(SQL_DIR, "ordem.json"), "utf8")).ordem.map((m) => m.arquivo);

async function fingerprint(c) {
  const { rows } = await c.query(`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, column_name
  `);
  const { rows: idx } = await c.query(`
    select tablename, indexname, indexdef from pg_indexes
    where schemaname = 'public' order by tablename, indexname
  `);
  const { rows: cons } = await c.query(`
    select conrelid::regclass::text as tbl, conname, contype
    from pg_constraint
    where connamespace = 'public'::regnamespace
    order by conname
  `);
  return JSON.stringify({ cols: rows, idx, cons }, null, 1);
}

(async () => {
  const url = process.env.DATABASE_URL;
  const c = new Client({ connectionString: url });
  await c.connect();

  const antes = await fingerprint(c);
  console.log(`schema inicial: ${antes.length} bytes de fingerprint`);

  const linhas = ORDEM.length;
  console.log(`reaplicando ${linhas} arquivos, fora do schema_migrations...`);
  for (const nome of ORDEM) {
    const sql = fs.readFileSync(path.join(SQL_DIR, nome), "utf8");
    try {
      await c.query(sql);
      console.log(`  ok    ${nome}`);
    } catch (e) {
      console.log(`  FALHA ${nome}: ${e.message.split("\n")[0]}`);
      process.exitCode = 1;
      break;
    }
  }

  const depois = await fingerprint(c);
  if (antes === depois) {
    console.log("\nIDEMPOTENTE: schema identico apos reaplicar tudo.");
  } else {
    console.log("\nDIVERGENCIA: o schema mudou na segunda passagem.");
    const a = antes.split("\n");
    const d = depois.split("\n");
    const dif = [];
    for (let i = 0; i < Math.max(a.length, d.length); i++) if (a[i] !== d[i]) dif.push(`  ${a[i]}\n  ${d[i]}`);
    console.log(dif.slice(0, 30).join("\n"));
    process.exitCode = 1;
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
