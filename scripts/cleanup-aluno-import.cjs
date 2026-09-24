require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL || process.env.DB_URL });
  await c.connect();

  const sel = await c.query(`
    SELECT a.id, a.nome, t.nome AS turma
    FROM alunos a
    LEFT JOIN matriculas m ON m.aluno_id = a.id
    LEFT JOIN turmas t ON t.id = m.turma_id
    WHERE a.nome ILIKE 'ALUNO TESTE IMPORT%' OR a.nome ILIKE 'HTTP ALUNO%' OR a.cpf IN ('30048225630','81837395128','83611748420','14998496050','44855191043')
  `);
  console.log("Encontrados:", JSON.stringify(sel.rows, null, 1));

  const ids = sel.rows.map((r) => r.id);
  if (ids.length === 0) {
    console.log("Nada para limpar.");
  } else {
    await c.query("DELETE FROM matriculas WHERE aluno_id = ANY($1)", [ids]);
    await c.query("DELETE FROM alunos WHERE id = ANY($1)", [ids]);
    console.log(`Deletados ${ids.length} alunos e suas matrículas.`);

    const delTurma = await c.query("DELETE FROM turmas WHERE nome = 'TESTE-IMPORT-5A' RETURNING id");
    console.log("Turma teste deletada:", delTurma.rows.length > 0 ? delTurma.rows[0].id : "já não existia");
  }

  const chk = await c.query("SELECT nome, cpf FROM alunos WHERE cpf IS NOT NULL");
  console.log("Alunos restantes com cpf:", chk.rows.length === 0 ? "nenhum" : JSON.stringify(chk.rows));

  if (process.argv.includes("--check-escola")) {
    const r = await c.query(
      "SELECT e.codigo, e.nome, t.nome, t.ano, t.ano_letivo FROM turmas t JOIN escolas e ON e.id=t.escola_id WHERE e.codigo=12 ORDER BY t.nome"
    );
    console.log("Turmas escola 12:", JSON.stringify(r.rows, null, 1));
    const t = await c.query(
      "SELECT e.codigo, t.nome, t.ano, t.ano_letivo FROM turmas t JOIN escolas e ON e.id=t.escola_id ORDER BY e.codigo, t.nome"
    );
    console.log("TODAS as turmas:", JSON.stringify(t.rows, null, 1));
    const a = await c.query("SELECT nome, cpf FROM alunos ORDER BY nome LIMIT 10");
    console.log("Alunos (10):", JSON.stringify(a.rows, null, 1));
  }

  await c.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});