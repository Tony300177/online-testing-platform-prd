/**
 * Aplica as migrations de sql/ em ordem alfabetica, uma transacao por arquivo,
 * e registra o que ja foi aplicado na tabela schema_migrations.
 *
 *   node scripts/aplicar-migrations.cjs            # so lista o que falta
 *   node scripts/aplicar-migrations.cjs --aplicar   # aplica as pendentes
 *   node scripts/aplicar-migrations.cjs --marcar migracao-x.sql   # registra sem executar
 *
 * Cada arquivo e enviado como um unico comando (multi-statement), o que preserva
 * blocos DO $$ e funcoes. Nao divide por ";" como os scripts antigos: isso quebra
 * blocos com ponto e virgula dentro do corpo.
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: ".env.local" });

/**
 * Ordem de aplicacao. O alfabeto nao serve: estrutura-provas referencia
 * turmas/escolas (criadas por banco-escolar) e aluno-login depende de alunos.
 * Qualquer arquivo fora desta lista entra no fim, em ordem alfabetica, com aviso.
 *
 * Observacao: "users" NAO e criada aqui (vem do Supabase/Auth).
 */
const ORDEM = [
  "banco-escolar-ceem-vasco-papa.sql", // base: escolas, turmas, alunos, matriculas
  "estrutura-provas.sql", // base: provas, questoes, alternativas, respostas
  "migracao-perfil-demografico.sql", // cria professores (depende de alunos)
  "aluno-login.sql", // altera alunos (depende de banco-escolar)
  "migracao-importacao-v2.sql", // altera escolas/professores/turmas
  "migracao-importar-alunos-cpf.sql", // altera alunos
  "migracao-aplicacoes.sql", // cria aplicacoes (depende de provas)
  "migracao-habilidades.sql", // cria habilidades e altera questoes
  // corretiva: canonicaliza códigos BNCC duplicados (depende de habilidades)
  "migracao-corrigir-codigos-habilidade-duplicados.sql",
];

const SQL_DIR = path.join(__dirname, "..", "sql");
const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const marcarIdx = args.indexOf("--marcar");
// aceita varios arquivos: --marcar a.sql b.sql
const marcar = marcarIdx >= 0 ? args.slice(marcarIdx + 1).filter((a) => !a.startsWith("--")) : [];

const checksum = (conteudo) => crypto.createHash("sha256").update(conteudo).digest("hex").slice(0, 16);

const conhecidos = ORDEM.filter((f) => fs.existsSync(path.join(SQL_DIR, f)));
const extras = fs
  .readdirSync(SQL_DIR)
  .filter((f) => f.endsWith(".sql") && !ORDEM.includes(f))
  .sort();
const arquivos = [...conhecidos, ...extras];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nao definida (esperado em .env.local).");
    process.exit(1);
  }

  // Sem opcao ssl: segue o mesmo padrao de src/db/index.ts e respeita o
  // sslmode da propria URL (Supabase exige, Postgres local nao suporta).
  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows: aplicadas } = await client.query("SELECT nome, checksum FROM schema_migrations");
  const registro = new Map(aplicadas.map((r) => [r.nome, r.checksum]));

  console.log(`\nMigrations em ${path.relative(process.cwd(), SQL_DIR)}: ${arquivos.length}`);
  console.log(`Ja aplicadas: ${registro.size}\n`);
  if (extras.length) console.log(`Fora da ordem conhecida (aplicadas por ultimo): ${extras.join(", ")}\n`);

  let pendentes = 0;

  for (const nome of arquivos) {
    const conteudo = fs.readFileSync(path.join(SQL_DIR, nome), "utf8");
    const soma = checksum(conteudo);

    if (registro.has(nome)) {
      const div = registro.get(nome) === soma ? "" : "  [ATENCAO: arquivo mudou depois de aplicado]";
      console.log(`  ok        ${nome}${div}`);
      continue;
    }

    pendentes++;
    console.log(`  PENDENTE  ${nome}`);

    if (marcar.length) {
      if (!marcar.includes(nome)) continue;
      await client.query("INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2) ON CONFLICT (nome) DO NOTHING", [nome, soma]);
      console.log(`            -> registrada sem executar`);
      continue;
    }

    if (!aplicar) continue;

    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '120s'");
      await client.query(conteudo);
      await client.query("INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)", [nome, soma]);
      await client.query("COMMIT");
      console.log(`            -> aplicada`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`            -> FALHOU: ${e.message.split("\n")[0]}`);
      console.error("            nada foi gravado (rollback). Corrija e rode de novo.");
      break;
    }
  }

  console.log(
    pendentes === 0
      ? "\nNada pendente.\n"
      : `\n${pendentes} pendente(s).${
          marcar.length ? " Rode --marcar com o nome do arquivo para registrar." : aplicar ? "" : " Use --aplicar para executar."
        }\n`
  );

  await client.end();
})().catch((e) => {
  console.error("ERRO GERAL:", e.message);
  process.exit(1);
});
