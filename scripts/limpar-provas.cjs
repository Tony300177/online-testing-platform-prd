/**
 * Limpa APENAS os dados de aplicação: provas, questões, alternativas,
 * respostas de alunos, resultados e as vinculações de uma prova com
 * escolas/turmas.
 *
 * Este script é a alternativa segura ao `--reset` de zerar-e-importar.ts.
 * Aquele trunca 15 tabelas e apaga a rede municipal inteira (escolas, turmas,
 * alunos, matrículas, professores e usuários) junto com as provas. Aqui só
 * sai o conteúdo de prova, e a rede sobrevive intacta.
 *
 *   node scripts/limpar-provas.cjs                      # só mostra o plano
 *   node scripts/limpar-provas.cjs --executar           # exige localhost
 *   node scripts/limpar-provas.cjs --executar --allow-host=<host>
 *
 * O guard é o mesmo de zerar-e-importar.ts: host não-local exige
 * --allow-host explícito, para que ninguém apague produção por descuido.
 */
const path = require("node:path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/** Tabelas apagadas, na ordem inversa das dependências. */
const APAGAR = [
  "respostas_alunos",
  "resultados",
  "alternativas",
  "questoes",
  "aplicacao_escolas",
  "aplicacao_turmas",
  "provas",
  "aplicacoes",
];

/**
 * Tabelas que NÃO podem mudar. O script confere a contagem antes e depois e
 * aborta a transação se qualquer uma tiver mudado: é a rede de custódia do
 * presente script.
 *
 * habilidades fica aqui de propósito. É o catálogo BNCC reutilizável por
 * qualquer prova, não é conteúdo de uma prova, e apagá-lo exigiria reimportar
 * o catálogo inteiro.
 */
const PRESERVAR = [
  "escolas",
  "turmas",
  "alunos",
  "matriculas",
  "professores",
  "users",
  "habilidades",
  "desempenho_thresholds",
];

const args = process.argv.slice(2);
const executar = args.includes("--executar");
const allowHost = args.find((a) => a.startsWith("--allow-host="))?.split("=")[1] ?? "";

function podeExecutar() {
  if (!executar) return false;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[ERRO] DATABASE_URL ausente. Nada foi apagado.");
    process.exit(1);
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("[ERRO] DATABASE_URL inválida. Nada foi apagado.");
    process.exit(1);
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local && host !== allowHost) {
    console.error(
      `[ERRO] Recusando apagar em "${host}".\n` +
        `       Use --allow-host=${host} para confirmar explicitamente.`
    );
    process.exit(1);
  }
  console.log(`\nAlvo: ${host}`);
  return true;
}

async function contar(c, tabelas) {
  // O alias é obrigatório: sem ele o Postgres nomeia as colunas count, count1,
  // count2... e a leitura por posição não bate.
  const partes = tabelas
    .map((t, i) => `(SELECT count(*)::int FROM ${t}) AS t${i}`)
    .join(", ");
  const { rows } = await c.query(`SELECT ${partes}`);
  const out = {};
  tabelas.forEach((t, i) => { out[t] = rows[0][`t${i}`]; });
  return out;
}

(async () => {
  const vaiApagar = podeExecutar();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const antesProvas = await contar(c, APAGAR);
  const antesRede = await contar(c, PRESERVAR);

  console.log("\n=== SERÁ APAGADO (dados de prova) ===");
  let total = 0;
  for (const t of APAGAR) {
    total += antesProvas[t];
    console.log(`  ${t.padEnd(20)} ${String(antesProvas[t]).padStart(6)}`);
  }
  console.log(`  ${"TOTAL".padEnd(20)} ${String(total).padStart(6)}`);

  console.log("\n=== SERÁ PRESERVADO (rede + cadastro) ===");
  for (const t of PRESERVAR) {
    console.log(`  ${t.padEnd(20)} ${String(antesRede[t]).padStart(6)}`);
  }

  if (!vaiApagar) {
    console.log("\n(nada foi apagado — modo de consulta. Use --executar para aplicar.)");
    await c.end();
    return;
  }

  await c.query("BEGIN");
  try {
    // aplicacoes e provas se referenciam mutuamente (prova criada a partir de
    // outra). Quebramos o ciclo zerando as duas pontas antes de apagar qualquer
    // uma, senão a FK impede. Ambas são nullable.
    await c.query("UPDATE provas SET aplicacao_id = NULL WHERE aplicacao_id IS NOT NULL");
    await c.query("UPDATE aplicacoes SET prova_origem_id = NULL WHERE prova_origem_id IS NOT NULL");

    for (const t of APAGAR) {
      const r = await c.query(`DELETE FROM ${t}`);
      if (r.rowCount) console.log(`  apagado ${t}: ${r.rowCount}`);
    }

    // Trava de segurança: se a rede mudou, não faz commit.
    const depoisRede = await contar(c, PRESERVAR);
    const divergencias = PRESERVAR.filter((t) => depoisRede[t] !== antesRede[t]);
    if (divergencias.length) {
      throw new Error(
        `rede alterada indevidamente em: ${divergencias.join(", ")} — rollback`
      );
    }
    await c.query("COMMIT");
    console.log("\nLimpeza concluída. Rede municipal intacta.");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`\n[ERRO] ${e.message}. Nada foi apagado.`);
    await c.end();
    process.exit(1);
  }

  const depoisProvas = await contar(c, APAGAR);
  const restantes = APAGAR.reduce((s, t) => s + depoisProvas[t], 0);
  console.log(`Registros de prova restantes: ${restantes}`);
  await c.end();
})().catch((e) => {
  console.error("\n[ERRO]", e?.message || e);
  process.exit(1);
});
