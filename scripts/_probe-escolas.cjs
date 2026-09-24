const XLSX = require("xlsx");

const wb = XLSX.readFile("planilha_unica_atualizada_com_escolas.xlsx");
const s = wb.Sheets["Importação"];
const raw = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
const rows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null));

const byEscola = new Map();
for (const r of rows) {
  const v = Object.values(r);
  const escola = String(v[0]).trim().toUpperCase();
  const turma = String(v[2]).trim();
  if (!byEscola.has(escola)) byEscola.set(escola, { turmas: new Set(), alunos: 0 });
  const e = byEscola.get(escola);
  e.turmas.add(turma);
  e.alunos++;
}
let soma = 0;
for (const [escola, e] of byEscola) {
  soma += e.alunos;
  console.log(`${escola} | turmas=${e.turmas.size} | alunos=${e.alunos}`);
}
console.log("TOTAL ESCOLAS:", byEscola.size, "| TOTAL ALUNOS:", soma, "| LINHAS:", rows.length);