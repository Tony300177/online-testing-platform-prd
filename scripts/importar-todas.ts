import dotenv from "dotenv";

dotenv.config({ path: "C:/Users/DELL/Desktop/PROJETOS IDE/Projeto Provas NAF/online-testing-platform-prd/.env.local" });

/**
 * Importa (ou valida em dry-run) todas as escolas com dados na planilha.
 * Uso: tsx scripts/importar-todas.ts <planilha> [--dry] [--ano=2026]
 */
(async () => {
  const { importarEscola } = await import("./importar-core");

  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dry = args.includes("--dry");
  const anoArg = args.find((a) => a.startsWith("--ano="));
  const anoLetivo = anoArg ? Number(anoArg.split("=")[1]) : 2026;

  if (!file) {
    console.error("Uso: importar-todas.ts <planilha> [--dry] [--ano=2026]");
    process.exit(1);
  }

  // Vasco Papa (11) já foi importada; CORA CORALINA (18) não tem dados na planilha.
  const codigos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19];

  for (const codigo of codigos) {
    try {
      await importarEscola(file, codigo, anoLetivo, dry);
    } catch (e) {
      console.error(`\n[ERRO] escola ${codigo}:`, e);
    }
  }

  console.log(dry ? "\n(dry-run: nada foi gravado)" : "\n(comit de todas as escolas realizado)");
})();