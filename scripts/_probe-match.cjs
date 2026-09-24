const XLSX = require("xlsx");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

function norm(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

(async () => {
  // Turmas do arquivo
  const wb = XLSX.readFile("planilha_unica_atualizada.xlsx");
  const s = wb.Sheets["Importação"];
  const raw = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
  const rows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null));
  const fileTurmas = [...new Set(rows.map((r) => String(Object.values(r)[1]).trim()))].sort();
  console.log("Turmas no arquivo:", fileTurmas.length);

  // Turmas do banco, por escola
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const db = await c.query(`
    SELECT e.codigo, e.nome AS escola, t.nome AS turma, t.ano, t.turno
    FROM turmas t JOIN escolas e ON e.id = t.escola_id
    WHERE t.ano_letivo = 2026
  `);

  // Mapa nome-normalizado -> escola(s)
  const matchT = new Map();
  for (const row of db.rows) {
    const k = norm(row.turma);
    if (!matchT.has(k)) matchT.set(k, []);
    matchT.get(k).push(`${String(row.codigo).padStart(2, "0")} ${row.escola.split(" ").slice(0, 4).join(" ")}`);
  }

  const unMatched = [];
  const matchedCodes = {};
  const multi = [];
  for (const t of fileTurmas) {
    const k = norm(t);
    const hits = matchT.get(k) ?? [];
    if (hits.length === 0) {
      unMatched.push(t);
    } else if (hits.length > 1) {
      multi.push([t, hits]);
    } else {
      const code = hits[0].slice(0, 2);
      matchedCodes[code] = (matchedCodes[code] || 0) + 1;
    }
  }
  console.log("\nTurmas do arquivo SEM match no banco:", unMatched.length);
  for (const t of unMatched) console.log("   SEM MATCH:", t);
  console.log("\nTurmas com match em VÁRIAS escolas:", multi.length);
  for (const [t, hits] of multi) console.log("   MULTI:", t, "->", hits);
  console.log("\nDistribuição turmas por escola (match único):");
  for (const [code, n] of Object.entries(matchedCodes).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   ${code}: ${n} turmas`);
  }
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});