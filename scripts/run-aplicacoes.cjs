const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "migracao-aplicacoes.sql"), "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const st of statements) {
    try {
      const r = await c.query(st);
      if (r.rows && r.rows.length) console.log(JSON.stringify(r.rows));
      console.log("OK:", st.slice(0, 60).replace(/\s+/g, " "));
    } catch (e) {
      console.error("FALHA:", e.message);
      console.error("  SQL:", st.slice(0, 120));
      process.exitCode = 1;
    }
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });