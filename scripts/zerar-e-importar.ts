import * as XLSX from "xlsx";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "planilha_unica_atualizada_com_escolas.xlsx";
const dry = args.includes("--dry");
const noReset = args.includes("--no-reset");
const skip = args.includes("--resume");
const chunkOpt = args.find((a) => a.startsWith("--chunk="));
const CHUNK = chunkOpt ? Number(chunkOpt.split("=")[1]) : 150;
const anoLetivo = 2026;

function norm(s: string): string {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marca (normalizada) de cada escola oficial, para casar com os nomes da planilha. */
const MARCA: Record<number, string> = {
  1: "ARCO IRIS",
  2: "BRUNO LEONARDO",
  3: "CRIANCA FELIZ",
  4: "DOM FRANCO",
  5: "LUIZ FELIPE",
  6: "MENINO JESUS",
  7: "NOSSO LAR",
  8: "GUILHERME FREITAS",
  9: "ORLANDO PEREIRA",
  10: "SAO CRISTOVAO",
  11: "VASCO PAPA",
  12: "JOSE DE ANCHIETA",
  13: "PAULO FREIRE",
  14: "MARIA HILDA PANAS",
  15: "EUCLIDES DA CUNHA",
  16: "VINICIUS DE MORAIS",
  17: "ALVARES DE AZEVEDO",
  18: "CORA CORALINA",
  19: "OSVALDO CRUZ",
};

function matchCode(escolaRaw: string): number | null {
  const n = norm(escolaRaw);
  if (!n) return null;
  const hits = new Map<number, number>();
  for (const [code, marca] of Object.entries(MARCA)) {
    const m = norm(marca);
    let score = 0;
    if (n.includes(m)) score += 100;
    else {
      for (const w of m.split(" ")) if (w.length >= 4 && n.includes(w)) score += 10;
    }
    if (score > 0) hits.set(Number(code), score);
  }
  const sorted = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    const exact = sorted.find(([, s]) => s === 100);
    return exact ? exact[0] : null;
  }
  return sorted[0][0];
}

async function lerPlanilha(): Promise<Record<string, string | number | null | undefined>[]> {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets["Importação"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Aba 'Importação' não encontrada na planilha.");
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = raw[0].map((h) => String(h || "").trim());
  const dataRows = raw.slice(1).filter((row) => row.some((c) => c !== "" && c !== null));
  return dataRows.map((row) => {
    const obj: Record<string, string | number | null | undefined> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
    });
    return obj;
  });
}

function resumo(report: { total: number; validas: number; avisos: number; erros: number; escrita?: unknown }) {
  const e = report.escrita ? JSON.stringify(report.escrita) : "sem escrita (dry-run)";
  return `total=${report.total} validas=${report.validas} avisos=${report.avisos} erros=${report.erros} | ${e}`;
}

(async () => {
  const { db } = await import("@/db");
  const { escolas } = await import("@/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { commitImport, validateImport } = await import("@/lib/import");
  const { commitAlunoImport, validateAlunoImport } = await import("@/lib/aluno-import");
  const { ESCOLAS_MUNICIPAIS, escolaTipo } = await import("@/lib/municipal-schools");
  const { Client } = await import("pg");
  const bcrypt = (await import("bcryptjs")).default;

  const rows = await lerPlanilha();
  console.log(`Linhas lidas: ${rows.length}`);

  const porEscola = new Map<number, Record<string, string | number | null | undefined>[]>();
  const naoAchou = new Map<string, number>();

  for (const r of rows) {
    const escola = String(r["ESCOLA"] ?? "");
    const codigo = matchCode(escola);
    if (codigo === null) {
      const k = norm(escola);
      naoAchou.set(k, (naoAchou.get(k) ?? 0) + 1);
      continue;
    }
    if (!porEscola.has(codigo)) porEscola.set(codigo, []);
    porEscola.get(codigo)!.push(r);
  }

  console.log("Escolas reconhecidas:", porEscola.size);
  for (const [code] of [...porEscola.entries()].sort((a, b) => a[0] - b[0])) {
    const oficial = ESCOLAS_MUNICIPAIS.find((e) => e.numero === code)!;
    console.log(`  ${String(code).padStart(2, "0")} · ${oficial.nome} → ${porEscola.get(code)!.length} alunos`);
  }
  if (naoAchou.size) {
    console.log("Linhas sem escola reconhecida:");
    for (const [k, n] of naoAchou) console.log(`  "${k}" x${n}`);
  }

  if (!dry && !noReset) {
    console.log("\n--- RESET DO BANCO ---");
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query("BEGIN");
    await c.query(`
      TRUNCATE TABLE
        alternativas, alunos, aplicacao_escolas, aplicacao_turmas, aplicacoes,
        desempenho_thresholds, escolas, matriculas, professores, provas,
        questoes, respostas_alunos, resultados, turmas, users
      RESTART IDENTITY CASCADE
    `);
    const hash = bcrypt.hashSync("123", 10);
    await c.query(
      `INSERT INTO users (name, email, password_hash, role, school, created_at)
       VALUES ('admin@', 'admin@', $1, 'admin', 'Secretaria de Educação', now())`,
      [hash]
    );
    for (const e of ESCOLAS_MUNICIPAIS) {
      await c.query(
        `INSERT INTO escolas (nome, codigo, tipo, ativo, created_at) VALUES ($1, $2, $3, true, now())`,
        [e.nome, e.numero, escolaTipo(e.numero)]
      );
    }
    await c.query("COMMIT");
    await c.end();
    console.log("Banco zerado (users=admin@, escolas=19).");
  }

  const skip = args.includes("--resume");

  async function importarEscolaLocal(
    codigo: number,
    escolaDb: { id: string; nome: string },
    oficial: { numero: number; nome: string },
    turmaRows: Record<string, string | number | null | undefined>[],
    alunoRows: Record<string, string | number | null | undefined>[],
    dry: boolean
  ) {
    console.log(`\n========== ESCOLA ${String(codigo).padStart(2, "0")} · ${oficial.nome} ==========`);
    console.log(`Alunos: ${alunoRows.length} | turmas distintas: ${turmaRows.length}`);

    console.log("--- 1/2 TURMAS ---");
    const rT = dry
      ? await validateImport(turmaRows, anoLetivo, undefined, codigo)
      : await commitImport(turmaRows, anoLetivo, undefined, codigo);
    console.log(resumo(rT));
    for (const it of rT.itens.filter((i) => i.status === "erro").slice(0, 20)) {
      console.log(`  linha ${it.linha}: ${it.motivos.join("; ")}`);
    }
    if (rT.erros > 0 && !dry) throw new Error(`Erros de TURMA na escola ${codigo} — abortando.`);

    console.log(`--- 2/2 ALUNOS (${escolaDb.nome}) ---`);
    // Chunks para não estourar o statement_timeout (2min) do Supabase em escolas grandes.
    const totalEscrita = { alunosCriados: 0, alunosAtualizados: 0, matriculasCriadas: 0, jaCadastrados: 0, ignorados: 0 };
    for (let i = 0; i < alunoRows.length; i += CHUNK) {
      const parte = alunoRows.slice(i, i + CHUNK);
      const rA = dry
        ? await validateAlunoImport(parte, { escolaId: escolaDb.id, anoLetivo })
        : await commitAlunoImport(parte, { escolaId: escolaDb.id, anoLetivo });
      if (rA.escrita) {
        totalEscrita.alunosCriados += rA.escrita.alunosCriados;
        totalEscrita.alunosAtualizados += rA.escrita.alunosAtualizados;
        totalEscrita.matriculasCriadas += rA.escrita.matriculasCriadas;
        totalEscrita.jaCadastrados += rA.escrita.jaCadastrados;
        totalEscrita.ignorados += rA.escrita.ignorados;
      }
      const errosBloco = rA.itens.filter((it) => it.status === "erro");
      console.log(`  chunk ${i / CHUNK + 1}/${Math.ceil(alunoRows.length / CHUNK)}: total=${rA.total} validas=${rA.validas} avisos=${rA.avisos} erros=${errosBloco.length}`);
      for (const it of errosBloco.slice(0, 10)) {
        console.log(`    linha ${it.linha} | ${it.nome} | ${it.turma}: ${it.motivos.join("; ")}`);
      }
      if (errosBloco.length > 0 && !dry) throw new Error(`Erros de ALUNO na escola ${codigo} (chunk ${i / CHUNK + 1}) — abortando.`);
    }
    const totalLinhas = alunoRows.length;
    const sintetizado = {
      total: totalLinhas,
      validas: totalLinhas - totalEscrita.ignorados,
      avisos: 0,
      erros: 0,
      escrita: dry ? undefined : totalEscrita,
    };
    console.log(resumo(sintetizado));
  }

  for (const [codigo] of [...porEscola.entries()].sort((a, b) => a[0] - b[0])) {
    const [escolaDb] = await db.select().from(escolas).where(eq(escolas.codigo, codigo)).limit(1);
    if (!escolaDb) throw new Error(`Escola ${codigo} não existe no banco.`);

    if (skip) {
      const res = await db.execute(
        sql`SELECT count(*)::int n FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE t.escola_id = ${escolaDb.id}`
      );
      const n = Number(res.rows[0]?.n ?? 0);
      if (n > 0) {
        console.log(`Escola ${String(codigo).padStart(2, "0")} já importada — pulando.`);
        continue;
      }
    }
    const oficial = ESCOLAS_MUNICIPAIS.find((e) => e.numero === codigo)!;
    const alunoRows = porEscola.get(codigo)!;

    // Turmas distintas (nome + ano + turno da primeira linha de cada turma)
    const turmas = new Map<string, Record<string, string | number | null | undefined>>();
    for (const r of alunoRows) {
      const nomeTurma = String(r["NOME DA TURMA"] ?? "").trim();
      if (!nomeTurma || turmas.has(nomeTurma)) continue;
      turmas.set(nomeTurma, {
        "CÓDIGO ESCOLA": codigo,
        ESCOLA: oficial.nome,
        "NOME DA TURMA": nomeTurma,
        "ANO/SÉRIE": String(r["ANO/SÉRIE"] ?? ""),
        TURNO: String(r["TURNO"] ?? ""),
        PROFESSOR: String(r["PROFESSOR"] ?? ""),
      });
    }
    const turmaRows = [...turmas.values()];

    let tentativa = 0;
    for (;;) {
      tentativa += 1;
      try {
        await importarEscolaLocal(codigo, escolaDb, oficial, turmaRows, alunoRows, dry);
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ⛔ tentativa ${tentativa} falhou: ${msg.slice(0, 300)}`);
        if (dry || tentativa >= 5) throw err;
        const wait = 4000 * tentativa;
        console.log(`  ↻ aguardando ${wait / 1000}s antes de repetir...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  if (!dry) {
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const t = await c.query(`SELECT
      (SELECT count(*) FROM escolas) escolas,
      (SELECT count(*) FROM turmas) turmas,
      (SELECT count(*) FROM alunos) alunos,
      (SELECT count(*) FROM matriculas) matriculas,
      (SELECT count(*) FROM users) users`);
    console.log("\nFINAIS:", JSON.stringify(t.rows[0]));
    await c.end();
  }
  console.log(dry ? "\n(dry-run: nada foi gravado)" : "\n(banco zerado + importação concluída)");
})().catch((e) => {
  console.error("\n[ERRO]", e?.message || e);
  process.exit(1);
});