const XLSX = require("xlsx");

const wb = XLSX.readFile("planilha_unica_atualizada_com_escolas.xlsx");
const s = wb.Sheets["Importação"];
const raw = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
const rows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null));

const anos = new Map();
const pares = new Map();
const turnos = new Set();
const racas = new Map();
for (const r of rows) {
  const v = Object.values(r);
  const ano = String(v[3]).trim();
  const turma = String(v[2]).trim();
  const turno = String(v[8]).trim();
  const raca = String(v[6]).trim();
  anos.set(ano, (anos.get(ano) || 0) + 1);
  pares.set(`${turma}##${ano}`, true);
  turnos.add(turno);
  racas.set(raca, (racas.get(raca) || 0) + 1);
}
console.log("ANO/SÉRIE distintos (com total de linhas):");
for (const [a, n] of anos) console.log(`  ${JSON.stringify(a)}: ${n}`);
console.log("\nTURNOS:", [...turnos]);
console.log("\nRAÇAS:", [...racas.entries()]);
console.log("\nPares único turma->ano:", pares.size);