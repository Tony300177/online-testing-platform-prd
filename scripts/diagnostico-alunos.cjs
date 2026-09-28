/**
 * Diagnóstico de por que os alunos de uma escola não aparecem na identificação.
 *
 * Somente leitura: abre conexão, imprime contagens e fecha. Nada é escrito.
 *
 *   node scripts/diagnostico-alunos.cjs
 *   node scripts/diagnostico-alunos.cjs VASCO
 *   node scripts/diagnostico-alunos.cjs VASCO CODIGODAPROVA
 */
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const ANO_LETIVO = 2026;
const filtro = process.argv[2] ? String(process.argv[2]).trim() : "";
const codigo = process.argv[3] ? String(process.argv[3]).trim().toUpperCase() : "";

function titulo(t) {
  console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente em .env.local — nada a diagnosticar.");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  titulo("1. Escola procurada");
  const filtroEscola = `%${filtro}%`;
  const escolas = await c.query(
    `select id, codigo, nome, tipo, ativo from escolas
      where $1 = '%%' or nome ilike $1 or codigo::text = $2
      order by codigo`,
    [filtro ? filtroEscola : "%", filtro]
  );
  if (escolas.rows.length === 0) {
    console.log("Nenhuma escola encontrada para o filtro. Lista completa abaixo.");
  }
  for (const e of escolas.rows) {
    console.log(`  #${e.codigo} ${e.nome} | tipo=${e.tipo} ativo=${e.ativo} id=${e.id}`);
  }
  if (escolas.rows.length === 0) {
    const todas = await c.query(`select codigo, nome, ativo from escolas order by codigo`);
    for (const e of todas.rows) console.log(`  #${e.codigo} ${e.nome} ativo=${e.ativo}`);
    await c.end();
    return;
  }

  titulo(`2. Turmas e matrículas ativas em ${ANO_LETIVO}`);
  for (const e of escolas.rows) {
    const t = await c.query(
      `select t.id, t.nome, t.ano, t.turno, t.ano_letivo, t.ativo,
              (select count(*) from matriculas m
                where m.turma_id = t.id and m.ano_letivo = $2 and m.status = 'ativo') as ativos,
              (select count(*) from matriculas m where m.turma_id = t.id) as todas_matriculas
         from turmas t where t.escola_id = $1 order by t.nome`,
      [e.id, ANO_LETIVO]
    );
    console.log(`\n  Escola #${e.codigo} — ${t.rows.length} turma(s):`);
    if (t.rows.length === 0) console.log("    (nenhuma turma cadastrada)");
    for (const r of t.rows) {
      const marca = r.ativos === 0 ? "   <<< SEM ALUNOS ATIVOS NESTE ANO" : "";
      console.log(
        `    ${r.nome} | ano=${r.ano} turno=${r.turno} anoLetivo=${r.ano_letivo} ativo=${r.ativo}` +
          ` | matrículas ativas=${r.ativos} (total=${r.todas_matriculas})${marca}`
      );
    }
  }

  if (codigo) {
    titulo(`3. Escopo do código ${codigo}`);
    const prova = await c.query(
      `select id, titulo, status, data_inicio, data_fim, turma_id, escola_id, aplicacao_id
         from provas where upper(codigo) = $1`,
      [codigo]
    );
    const aplicacao = await c.query(
      `select id, titulo, status, data_inicio, data_fim from aplicacoes where upper(codigo) = $1`,
      [codigo]
    );

    if (prova.rows.length > 0) {
      const p = prova.rows[0];
      const agora = Date.now();
      const fechada =
        p.status === "finished" || (p.data_fim && new Date(p.data_fim).getTime() < agora);
      const futuro = p.data_inicio && new Date(p.data_inicio).getTime() > agora;
      console.log(`  PROVA AVULSA: ${p.titulo}`);
      console.log(`    status=${p.status} dataInicio=${p.data_inicio} dataFim=${p.data_fim}`);
      console.log(`    turma_id=${p.turma_id} escola_id=${p.escola_id}`);
      console.log(`    encerrada=${fechada} (bloqueia a lista) | aindaNaoLiberou=${futuro} (bloqueia a lista)`);
      if (!p.turma_id) {
        console.log("    <<< SEM turma_id: a lista de alunos fica bloqueada por falta de escopo.");
      } else {
        const t = await c.query(
          `select t.nome, e.codigo as escola_codigo, e.nome as escola_nome
             from turmas t join escolas e on e.id = t.escola_id where t.id = $1`,
          [p.turma_id]
        );
        if (t.rows.length === 0) console.log("    <<< turma_id não existe mais na tabela turmas");
        else
          console.log(
            `    turma da prova: ${t.rows[0].nome} (escola #${t.rows[0].escola_codigo} ${t.rows[0].escola_nome})` +
              (escolas.rows.some((e) => e.id === t.rows[0].escola_id)
                ? "  == escola procurada"
                : "  <<< NAO e a escola procurada")
          );
      }
    }

    if (aplicacao.rows.length > 0) {
      const a = aplicacao.rows[0];
      const agora = Date.now();
      const fechada = a.status === "finished" || (a.data_fim && new Date(a.data_fim).getTime() < agora);
      const futuro = a.data_inicio && new Date(a.data_inicio).getTime() > agora;
      console.log(`\n  APLICACAO: ${a.titulo}`);
      console.log(`    status=${a.status} dataInicio=${a.data_inicio} dataFim=${a.data_fim}`);
      console.log(`    encerrada=${fechada} | aindaNaoLiberou=${futuro}`);
      const turmas = await c.query(
        `select t.id, t.nome, e.codigo as escola_codigo, e.nome as escola_nome,
                (select count(*) from matriculas m
                  where m.turma_id = t.id and m.ano_letivo = $2 and m.status = 'ativo') as ativos
           from aplicacao_turmas at
           join turmas t on t.id = at.turma_id
           left join escolas e on e.id = t.escola_id
          where at.aplicacao_id = $1 order by e.codigo, t.nome`,
        [a.id, ANO_LETIVO]
      );
      console.log(`    turmas na aplicação: ${turmas.rows.length}`);
      for (const t of turmas.rows) {
        const alvo = escolas.rows.some((e) => e.id === undefined) ? false : t.escola_nome && filtro && t.escola_nome.toUpperCase().includes(filtro.toUpperCase());
        console.log(
          `      ${t.escola_codigo ?? "?"} ${t.escola_nome ?? "(sem escola)"} · ${t.nome} | ativos=${t.ativos}` +
            (alvo ? "   <<< escola procurada" : "")
        );
      }
      if (turmas.rows.length === 0) console.log("    <<< aplicacao_turmas vazia: nenhuma turma liberada.");
    }

    if (prova.rows.length === 0 && aplicacao.rows.length === 0) {
      console.log("  Nenhuma prova nem aplicação com esse código.");
    }
  }

  titulo("4. Resumo por escola (alunos com matrícula ativa em " + ANO_LETIVO + ")");
  const resumo = await c.query(
    `select e.codigo, e.nome,
            count(distinct t.id) as turmas,
            count(distinct m.aluno_id) filter (where m.status = 'ativo' and m.ano_letivo = $1) as alunos_ativos
       from escolas e
       left join turmas t on t.escola_id = e.id
       left join matriculas m on m.turma_id = t.id
      group by e.codigo, e.nome order by e.codigo`,
    [ANO_LETIVO]
  );
  for (const r of resumo.rows) {
    console.log(`  #${String(r.codigo).padStart(2, "0")} ${r.nome} | turmas=${r.turmas} | alunosAtivos=${r.alunos_ativos}`);
  }

  await c.end();
})().catch((e) => {
  console.error("[ERRO]", e.message);
  process.exit(1);
});
