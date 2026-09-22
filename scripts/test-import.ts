import { normalizeAnoSerie, parseImportRows, validateImport } from "../src/lib/import";

async function main() {
  const tests: [string, string | null][] = [
    ["5ºA", "5º Ano"],
    ["5º Ano", "5º Ano"],
    ["5o ano", "5º Ano"],
    ["5", "5º Ano"],
    ["1º", "1º Ano"],
    ["Pré I", "Pré I"],
    ["PRE II", "Pré II"],
    ["PREII", "Pré II"],
    ["Maternal I", "Maternal I"],
    ["maternal", "Maternal I"],
    ["MATERNAL 2", "Maternal II"],
    ["9º Ano", "9º Ano"],
    ["10", null],
    ["Ensino Médio", null],
  ];

  let fail = 0;
  for (const [input, expected] of tests) {
    const got = normalizeAnoSerie(input);
    const ok = got === expected;
    if (!ok) fail++;
    console.log(`${ok ? "OK " : "FAIL"} normalizeAnoSerie(${JSON.stringify(input)}) = ${JSON.stringify(got)} (esperado ${JSON.stringify(expected)})`);
  }

  // Parse de uma planilha de exemplo (formato novo)
  const rows = [
    { "CÓDIGO ESCOLA": 11, "ESCOLA": "CEM VASCO PAPA", "NOME DA TURMA": "6º A", "ANO/SÉRIE": "6º Ano", "TURNO": "Matutino", "PROFESSOR": "JANETE FRANCISCA DA SILVA" },
    { "CÓDIGO ESCOLA": 1, "ESCOLA": "CEI ARCO IRIS", "NOME DA TURMA": "Pré I A", "ANO/SÉRIE": "Pré I", "TURNO": "Vespertino", "PROFESSOR": 168 },
    { "CÓDIGO ESCOLA": 99, "ESCOLA": "INVALIDA", "NOME DA TURMA": "X A", "ANO/SÉRIE": "Ensino Médio", "TURNO": "Manhã", "PROFESSOR": "" },
    { "CÓDIGO ESCOLA": 11, "ESCOLA": "CEM VASCO PAPA", "NOME DA TURMA": "5º A", "ANO/SÉRIE": "5º Ano", "TURNO": "Matutino", "PROFESSOR": "JANETE FRANCISCA DA SILVA" },
  ];

  const parsed = parseImportRows(rows as any, 2026);
  for (const p of parsed) {
    console.log(`linha ${p.linha}: escola=${p.escola} codigo=${p.escolaCodigo} turma=${p.turma} ano=${p.ano} turno=${p.turno} prof=${p.professor} motivos=${JSON.stringify(p.motivos)} avisos=${JSON.stringify(p.avisos)}`);
  }

  const report = await validateImport(rows as any, 2026);
  console.log("validate: total", report.total, "validas", report.validas, "avisos", report.avisos, "erros", report.erros);
  for (const i of report.itens) {
    console.log(`  [${i.linha}] ${i.status}: escola=${i.escola} turma=${i.turma} motivos=${JSON.stringify(i.motivos)}`);
  }

  process.exit(fail > 0 ? 1 : 0);
}

main();