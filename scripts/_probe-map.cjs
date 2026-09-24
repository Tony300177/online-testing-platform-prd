const XLSX = require("xlsx");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const OFFICIAL = {
  "ARCO IRIS": 1,
  "BRUNO LEONARDO": 2,
  "CRIANCA FELIZ": 3,
  "DOM FRANCO": 4,
  "LUIZ FELIPE": 5,
  "MENINO JESUS": 6,
  "NOSSO LAR": 7,
  "GUILHERME FREITAS": 8,
  "ORLANDO PEREIRA": 9,
  "SAO CRISTOVAO": 10,
  "VASCO PAPA": 11,
  "ANCHIETA": 12,
  "PAULO FREIRE": 13,
  "MARIA HILDA": 14,
  "EUCLIDES": 15,
  "VINICIUS": 16,
  "ALVARES": 17,
  "CORA CORALINA": 18,
  "OSVALDO CRUZ": 19,
};

function norm(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
}

function matchCode(escola) {
  const n = norm(escola);
  for (const [key, code] of Object.entries(OFFICIAL)) {
    if (n.includes(norm(key))) return code;
  }
  return null;
}

(async () => {
  const wb = XLSX.readFile("planilha_unica_atualizada_com_escolas.xlsx");
  const s = wb.Sheets["Importação"];
  const raw = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
  const rows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null));

  const byEscola = new Map();
  for (const r of rows) {
    const v = Object.values(r);
    const escola = String(v[0]).trim().toUpperCase();
    if (!byEscola.has(escola)) byEscola.set(escola, { turmas: new Set(), alunos: 0 });
    byEscola.get(escola).turmas.add(String(v[2]).trim());
    byEscola.get(escola).alunos++;
  }

  console.log("=== MAPEAMENTO ESCOLA NA PLANILHA -> CÓDIGO OFICIAL ===");
  for (const [escola, e] of byEscola) {
    const code = matchCode(escola);
    console.log(`${String(code ?? "??").padStart(2, "0")} | ${escola} | turmas=${e.turmas.size} | alunos=${e.alunos} ${code ? "" : "  <<<< SEM MATCH"}`);
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log("\n=== ESTADO ATUAL DO BANCO ===");
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name
  `);
  for (const t of tables.rows) {
    const cnt = await c.query(`SELECT count(*) AS n FROM "${t.table_name}"`);
    console.log(`  ${t.table_name}: ${cnt.rows[0].n}`);
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });