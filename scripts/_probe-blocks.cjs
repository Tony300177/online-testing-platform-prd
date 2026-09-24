const XLSX = require("xlsx");

const wb = XLSX.readFile("planilha_unica_atualizada.xlsx");
const s = wb.Sheets["Importação"];
const raw = XLSX.utils.sheet_to_json(s, { header: 1, defval: "" });
const rows = raw.slice(1).filter((r) => r.some((c) => c !== "" && c !== null));

// Sequência de turmas e endereços para detectar blocos por escola
let prevTurma = "";
let bloco = 0;
const blocos = [];
for (let i = 0; i < rows.length; i++) {
  const v = Object.values(rows[i]);
  const turma = String(v[1]);
  const end = String(v[6]);
  if (turma !== prevTurma) {
    bloco++;
    blocos.push({ ordem: i + 1, turma, end, n: 0 });
    prevTurma = turma;
  }
  blocos[blocos.length - 1].n++;
}
console.log("Blocos (transições de turma):", blocos.length);
console.log("Sequência de turmas na ordem do arquivo:");
console.log(blocos.map((b) => `${b.turma} [${b.n}]`).join(' | '));
console.log("\nEndereços (bairros) distintos em sequência (amostra):");
const endSeq = rows.map((r) => String(Object.values(r)[6])).filter((e, i, a) => e !== (a[i - 1] ?? ""));
console.log([...new Set(endSeq)].slice(0, 40).join(' | '));