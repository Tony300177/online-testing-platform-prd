/**
 * Diagnostica e corrige o deslocamento de fuso gravado em provas/aplicacoes
 * antes de o fuso da plataforma ser fixado em America/Cuiaba.
 *
 * ## Por que NAO existe um "UPDATE DE -4 HORAS" global
 *
 * O bug era `new Date("2026-03-10T14:30")` (hora de parede, sem offset) sendo
 * interpretado no fuso do processo. O que foi gravado depende de quem gravou:
 *
 *   - provas, via criar-avaliacao-wizard / exam-form: string crua entregue ao
 *     servidor (UTC em producao), logo 14:30 ficou 14:30Z. Correcao: -4h.
 *   - aplicacoes, via os dois wizards: `.toISOString()` gerado no navegador,
 *     logo 14:30 no fuso do admin virou o UTC equivalente. Correcao: -4h mais
 *     o fuso do navegador de quem agiu.
 *   - respostas.respondida_em / criado_em: `now()` no servidor. JA ESTAVAM
 *     CORRETAS. Nao tocar.
 *
 * Por isso este script NUNCA atualiza em massa. Ele mostra o antes/depois de
 * cada linha e so grava os ids confirmados via --ids.
 *
 * ## Uso
 *
 *   node scripts/corrigir-fuso-provas.cjs                      # diagnostico
 *   node scripts/corrigir-fuso-provas.cjs --tabela=provas
 *   node scripts/corrigir-fuso-provas.cjs --aplicar --ids=12,34,55
 *   node scripts/corrigir-fuso-provas.cjs --aplicar --ids=12 --horas=1
 *   node scripts/corrigir-fuso-provas.cjs --restaurar
 *
 * Passos: (1) cria fuso_backup_<tabela>; (2) imprime o relatorio por linha;
 * (3) com --aplicar, transacao ajustando so os ids listados.
 */
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const APP_TZ = "America/Cuiaba";

/**
 * Deslocamento do bug em producao: o servidor rodava em UTC e o alvo e
 * UTC-4, entao um valor crudo esta 4h adiantado. Usado so no relatorio; a
 * correcao real vem de --horas.
 */
const HORAS_PADRAO = 4;

const TABELAS = {
  provas: { tabela: "provas", rotulo: "provas (banco de provas)" },
  aplicacoes: { tabela: "aplicacoes", rotulo: "aplicacoes (replicas por turma)" },
};

function arg(nome, padrao) {
  const hit = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return hit ? hit.slice(nome.length + 3) : padrao;
}
const flag = (nome) => process.argv.includes(`--${nome}`);

const IDS = arg("ids", "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const HORAS = Number(arg("horas", String(HORAS_PADRAO)));
const ALVO = arg("tabela", "");

const C = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
};

/** Desloca o instante de HORAS para tras e devolve "YYYY-MM-DD HH:MM". */
function desloca(valor, horas) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + horas * 3600000).toISOString().slice(0, 16).replace("T", " ");
}

const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);

function titulo(t) {
  console.log(`\n${C.bold}${C.cyan}${"=".repeat(78)}${C.reset}`);
  console.log(`${C.bold}${t}${C.reset}`);
  console.log(`${C.cyan}${"=".repeat(78)}${C.reset}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL ausente. Configure o .env.local.");
    process.exit(1);
  }

  if (ALVO && !TABELAS[ALVO]) {
    console.error(`--tabela invalida. Use: ${Object.keys(TABELAS).join(", ")}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl, options: `-c timezone=${APP_TZ}` });
  await client.connect();

  try {
    const { rows: tz } = await client.query("SHOW TimeZone");
    console.log(`${C.dim}Sessao Postgres: ${tz[0].TimeZone} | alvo da plataforma: ${APP_TZ}${C.reset}`);

    if (flag("restaurar")) {
      await restaurar(client);
      return;
    }

    const selecionadas = ALVO ? { [ALVO]: TABELAS[ALVO] } : TABELAS;
    for (const cfg of Object.values(selecionadas)) {
      await criarBackup(client, cfg);
      await relatorio(client, cfg);
    }

    if (!flag("aplicar")) {
      titulo("MODO DIAGNOSTICO - nada foi gravado");
      console.log("Copie os ids do relatorio e rode:");
      console.log("  node scripts/corrigir-fuso-provas.cjs --aplicar --ids=1,2,3");
      return;
    }

    if (IDS.length === 0) {
      titulo("BLOQUEADO: --aplicar exige --ids");
      console.log(
        "Nao ha atualizacao em massa por seguranca: cada tabela foi gravada por um\n" +
          "caminho diferente e o deslocamento correto varia por linha."
      );
      return;
    }

    if (!Number.isFinite(HORAS) || HORAS === 0) {
      console.error("--horas invalido.");
      process.exit(1);
    }

    await aplicar(client, selecionadas, IDS, HORAS);
  } finally {
    await client.end();
  }
}

async function criarBackup(client, { tabela, rotulo }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fuso_backup_${tabela} AS
    SELECT id, data_inicio, data_fim FROM ${tabela}
  `);
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM fuso_backup_${tabela})::int AS linhas`
  );
  console.log(
    `\n${C.dim}Backup fuso_backup_${tabela}: ${rows[0].linhas} linha(s) preservadas | ${rotulo}${C.reset}`
  );
}

async function relatorio(client, { tabela, rotulo }) {
  titulo(`RELATORIO: ${rotulo}`);

  const { rows: horas } = await client.query(`
    SELECT extract(hour FROM data_inicio AT TIME ZONE 'UTC')::int AS h, count(*)::int AS n
      FROM ${tabela}
     WHERE data_inicio IS NOT NULL
     GROUP BY 1 ORDER BY 1
  `);
  if (horas.length) {
    console.log(`${C.bold}Hora gravada (UTC) por linha:${C.reset}`);
    for (const r of horas) {
      const marca = r.h < 5 || r.h > 22 ? ` ${C.yellow}<-- fora do horario escolar${C.reset}` : "";
      console.log(`  ${String(r.h).padStart(2, "0")}h  ${C.cyan}${r.n}${C.reset} linha(s)${marca}`);
    }
  }

  const { rows } = await client.query(
    `SELECT id, titulo, data_inicio, data_fim
       FROM ${tabela}
      WHERE data_inicio IS NOT NULL OR data_fim IS NOT NULL
      ORDER BY id`
  );

  if (rows.length === 0) {
    console.log("\nSem janelas de data gravadas.");
    return;
  }

  console.log(
    `\n${C.bold}${pad("id", 5)}${pad("titulo", 30)}${pad("inicio grav.", 17)}` +
      `${C.green}${pad(`inicio -${HORAS_PADRAO}h`, 17)}${C.reset}${pad("fim grav.", 17)}` +
      `${C.green}fim -${HORAS_PADRAO}h${C.reset}`
  );
  for (const r of rows) {
    console.log(
      `${pad(r.id, 5)}${pad(r.titulo, 30)}` +
        `${pad(desloca(r.data_inicio, 0), 17)}` +
        `${C.green}${pad(desloca(r.data_inicio, -HORAS_PADRAO), 17)}${C.reset}` +
        `${pad(desloca(r.data_fim, 0), 17)}` +
        `${C.green}${desloca(r.data_fim, -HORAS_PADRAO)}${C.reset}`
    );
  }
  console.log(
    `\n${C.dim}Colunas "grav." mostram o valor atual; as verdes mostram o mesmo instante\n` +
      `reduzido em ${HORAS_PADRAO}h. Confirme contra a agenda real antes de gravar.${C.reset}`
  );
}

async function aplicar(client, selecionadas, ids, horas) {
  const deltaMin = -Math.abs(horas) * 60;
  for (const { tabela, rotulo } of Object.values(selecionadas)) {
    titulo(`APLICANDO em ${rotulo} - ids ${ids.join(", ")} - delta ${deltaMin} min`);

    const { rows: antes } = await client.query(
      `SELECT id, titulo, data_inicio, data_fim FROM ${tabela} WHERE id = ANY($1::int[])`,
      [ids]
    );
    if (antes.length === 0) {
      console.log(`${C.yellow}Nenhum id encontrado em ${tabela}. Pulando.${C.reset}`);
      continue;
    }
    for (const r of antes) {
      console.log(
        `  id ${pad(r.id, 5)} ${pad((r.titulo ?? "").slice(0, 28), 30)}` +
          `${pad(desloca(r.data_inicio, 0), 17)}-> ` +
          `${C.green}${desloca(r.data_inicio, -Math.abs(horas))}${C.reset}`
      );
    }

    await client.query("BEGIN");
    try {
      const { rowCount } = await client.query(
        `UPDATE ${tabela}
            SET data_inicio = data_inicio + make_interval(mins => $2),
                data_fim    = CASE WHEN data_fim IS NULL THEN NULL
                                   ELSE data_fim + make_interval(mins => $2) END
          WHERE id = ANY($1::int[])`,
        [ids, deltaMin]
      );
      await client.query("COMMIT");
      console.log(`\n${C.green}${rowCount} linha(s) atualizada(s) em ${tabela}.${C.reset}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`\n${C.red}Falhou; transacao desfeita: ${err.message}${C.reset}`);
      process.exit(1);
    }
  }

  titulo("CONCLUIDO");
  console.log("Desfazer com: node scripts/corrigir-fuso-provas.cjs --restaurar");
}

async function restaurar(client) {
  titulo("RESTAURANDO DO BACKUP");
  for (const { tabela, rotulo } of Object.values(TABELAS)) {
    const existe = await client.query(`SELECT to_regclass('fuso_backup_${tabela}') IS NOT NULL AS ok`);
    if (!existe.rows[0].ok) {
      console.log(`${C.dim}fuso_backup_${tabela} nao existe. Pulando.${C.reset}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      const { rowCount } = await client.query(
        `UPDATE ${tabela} t
            SET data_inicio = b.data_inicio,
                data_fim    = b.data_fim
           FROM fuso_backup_${tabela} b
          WHERE t.id = b.id
            AND (t.data_inicio IS DISTINCT FROM b.data_inicio
              OR t.data_fim    IS DISTINCT FROM b.data_fim)`
      );
      await client.query("COMMIT");
      console.log(`${C.green}${rowCount} linha(s) restaurada(s) em ${rotulo}.${C.reset}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`${C.red}Falhou em ${tabela}: ${err.message}${C.reset}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`${C.red}${err.message}${C.reset}`);
  process.exit(1);
});
