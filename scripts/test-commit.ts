import { commitImport } from "../src/lib/import";

async function main() {
  const rows = [
    { "CÓDIGO ESCOLA": 11, "ESCOLA": "CEM VASCO PAPA", "NOME DA TURMA": "6º A", "ANO/SÉRIE": "6º Ano", "TURNO": "Matutino", "PROFESSOR": "TESTE IMPORT V2 - UNICO" },
    { "CÓDIGO ESCOLA": 1, "ESCOLA": "CEI ARCO IRIS", "NOME DA TURMA": "Pré I A", "ANO/SÉRIE": "Pré I", "TURNO": "Vespertino", "PROFESSOR": "TESTE IMPORT V2 - UNICO" },
    { "CÓDIGO ESCOLA": 11, "ESCOLA": "CEM VASCO PAPA", "NOME DA TURMA": "6º A", "ANO/SÉRIE": "6º Ano", "TURNO": "Matutino", "PROFESSOR": "TESTE IMPORT V2 - UNICO" },
  ];

  console.log("=== 1ª execução ===");
  const r1 = await commitImport(rows as any, 2026);
  console.log("total", r1.total, "validas", r1.validas, "avisos", r1.avisos, "erros", r1.erros, "escrita", JSON.stringify(r1.escrita));

  console.log("=== 2ª execução (mesmo arquivo) ===");
  const r2 = await commitImport(rows as any, 2026);
  console.log("total", r2.total, "validas", r2.validas, "avisos", r2.avisos, "erros", r2.erros, "escrita", JSON.stringify(r2.escrita));

  console.log("=== 3ª execução com mudança (turno Noturno) ===");
  const r3 = await commitImport([{ ...rows[0], "TURNO": "Noturno" }] as any, 2026);
  console.log("total", r3.total, "validas", r3.validas, "avisos", r3.avisos, "erros", r3.erros, "escrita", JSON.stringify(r3.escrita));
}

main();