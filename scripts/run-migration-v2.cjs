const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "migracao-importacao-v2.sql"), "utf8");
  const statements = [];
  let buf = "";
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue;
    buf += line + "\n";
    if (trimmed.endsWith(";")) {
      statements.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) statements.push(buf);
  console.log(`Total statements: ${statements.length}`);
  for (let i = 0; i < statements.length; i++) {
    try {
      await client.query(statements[i]);
      console.log(`OK [${i + 1}] ${statements[i].slice(0, 60).replace(/\n/g, " ")}`);
    } catch (e) {
      console.log(`FALHOU [${i + 1}]: ${e.message.split("\n")[0]}`);
      console.log(statements[i].slice(0, 200));
      break;
    }
  }
  const idx = await client.query(`select indexname, indexdef from pg_indexes where tablename='escolas'`);
  console.log("indexes escolas:", JSON.stringify(idx.rows));
  await client.end();
})().catch((e) => { console.error("ERRO GERAL:", e.message); process.exit(1); });