const XLSX = require("xlsx");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

function norm(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
}

(async () => {
  const wb = XLSX.readFile("planilha_unica_atualizada.xlsx");
  const s = wb.Sheets["Importação"];
  const raw = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
  const rows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null));

  // Divide em blocos por mudança de turma
  const blocos = [];
  let prev = "";
  for (const r of rows) {
    const t = String(Object.values(r)[1]).trim();
    if (t !== prev) {
      blocos.push({ turmas: new Set(), itens: [] });
      prev = t;
    }
    const b = blocos[blocos.length - 1];
    b.turmas.add(norm(t));
    b.itens.push(r);
  }
  console.log("Blocos no arquivo:", blocos.length);

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const db = await c.query(`
    SELECT e.codigo, e.nome AS escola, t.nome AS turma
    FROM turmas t JOIN escolas e ON e.id = t.escola_id WHERE t.ano_letivo = 2026
  `);
  // Escolas do banco com conjunto de turmas
  const byEscola = new Map();
  for (const row of db.rows) {
    if (!byEscola.has(row.codigo)) byEscola.set(row.codigo, new Set());
    byEscola.get(row.codigo).add(norm(row.turma));
  }

  // Para cada bloco, procurar escola cujo conjunto de turmas seja SUPERSET (contenha o bloco)
  const matches = [];
  const unmatched = [];
  for (const b of blocos) {
    const cand = [];
    for (const [codigo, setT] of byEscola) {
      let all = true;
      for (const t of b.turmas) if (!setT.has(t)) { all = false; break; }
      if (all) cand.push(codigo);
    }
    if (cand.length === 1) matches.push([b, cand[0]]);
    else if (cand.length === 0) unmatched.push(b);
  }
  console.log("Blocos com 1 escola candidata:", matches.length);
  console.log("Blocos sem escola candidata:", unmatched.length);

  const dist = {};
  for (const [, codigo] of matches) dist[codigo] = (dist[codigo] || 0) + 1;
  console.log("Distribuição de blocos por escola:", JSON.stringify(dist));

  for (const b of unmatched) {
    console.log("SEM MATCH:", [...b.turmas].map(norm).join(", "), "| alunos:", b.itens.length);
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });