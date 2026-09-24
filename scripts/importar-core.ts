import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { escolas } from "@/db/schema";
import { commitImport, validateImport, type ImportLine } from "@/lib/import";
import { commitAlunoImport, validateAlunoImport } from "@/lib/aluno-import";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry");
const escolaArg = args.find((a) => a.startsWith("--escola="));
const anoArg = args.find((a) => a.startsWith("--ano="));
const escolaCodigo = escolaArg ? Number(escolaArg.split("=")[1]) : 11;
const anoLetivo = anoArg ? Number(anoArg.split("=")[1]) : 2026;

/** Marca (normalizada) da ESCOLA na planilha "Todos os Registros" por código oficial. */
const PLANILHA_MARCA: Record<number, string> = {
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

function norm(s: string): string {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveAno(turma: string): string | null {
  const t = turma.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/AEE|ATENDIMENTO EDUCACIONAL|ED\.?\s*ESPECIAL/.test(t)) return "AEE";
  if (t.includes("BER")) return /BER[ÇC]ARIO\s*(II|2)/.test(t) ? "Berçário II" : "Berçário I";
  if (t.includes("MATERNAL")) return /MATERNAL\s*(II|2)/.test(t) ? "Maternal II" : "Maternal I";
  if (t.includes("PRE")) return /PRE\s*(II|2)/.test(t) ? "Pré II" : "Pré I";
  const m = t.match(/^(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return `${n}º Ano`;
  }
  return turma.trim();
}

function deriveTurno(turma: string): string {
  const t = turma.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/INTEGRAL/.test(t)) return "Integral";
  if (/VESPERT|TARDE|VESP\.?$/.test(t)) return "Vespertino";
  if (/MATUT|MANHA|MAT\.?$/.test(t)) return "Matutino";
  if (/NOITE|NOTURNO|NOT\.?$/.test(t)) return "Noturno";
  return "Matutino";
}

function readRows(filePath: string, codigo: number, escolaNome: string): { turmas: ImportLine[]; alunos: ImportLine[] } {
  const marca = PLANILHA_MARCA[codigo];
  if (!marca) throw new Error(`Código de escola ${codigo} sem marca na planilha (use 1..19).`);

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets["Todos os Registros"];
  if (!sheet) throw new Error("Aba 'Todos os Registros' não encontrada.");
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = raw[0].map((h) => String(h || "").trim());
  const dataRows = raw.slice(1).filter((row) => row.some((c) => c !== "" && c !== null));

  const alunos = dataRows
    .map((row) => {
      const obj: Record<string, string | number | null | undefined> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
      });
      return obj;
    })
    .filter((r) => norm(String(r["ESCOLA"] ?? "")).includes(marca));

  const distinct = new Map<string, ImportLine>();
  for (const r of alunos) {
    const turma = String(r["NOME DA TURMA"] ?? "").trim();
    if (!turma) continue;
    const ano = deriveAno(turma);
    if (!ano) throw new Error(`Não consegui derivar ANO da turma "${turma}"`);
    distinct.set(turma, {
      "CÓDIGO ESCOLA": codigo,
      ESCOLA: escolaNome,
      "NOME DA TURMA": turma,
      "ANO/SÉRIE": ano,
      TURNO: deriveTurno(turma),
      PROFESSOR: "",
    });
  }
  return { turmas: Array.from(distinct.values()), alunos };
}

function resumo(report: { total: number; validas: number; avisos: number; erros: number; escrita?: unknown }) {
  const e = report.escrita ? JSON.stringify(report.escrita) : "sem escrita (dry-run)";
  return `total=${report.total} validas=${report.validas} avisos=${report.avisos} erros=${report.erros} | ${e}`;
}

export async function importarEscola(file: string, codigo: number, anoLetivo: number, dry: boolean) {
  const [escolaExiste] = await db.select().from(escolas).where(eq(escolas.codigo, codigo)).limit(1);
  if (!escolaExiste) throw new Error(`Escola código ${codigo} não existe no banco.`);

  const { turmas, alunos } = readRows(file, codigo, escolaExiste.nome);
  console.log(`\n========== ESCOLA ${String(codigo).padStart(2, "0")} · ${escolaExiste.nome} ==========`);
  console.log(`Alunos: ${alunos.length} | turmas distintas: ${turmas.length}`);
  for (const t of turmas) console.log(`  ${t["NOME DA TURMA"]} → ${t["ANO/SÉRIE"]} / ${t["TURNO"]}`);

  console.log(`--- 1/2 TURMAS (escola ${codigo}) ---`);
  const rTurmas = dry
    ? await validateImport(turmas, anoLetivo, undefined, codigo)
    : await commitImport(turmas, anoLetivo, undefined, codigo);
  console.log(resumo(rTurmas));
  for (const it of rTurmas.itens.filter((i) => i.status === "erro").slice(0, 5)) {
    console.log(`  linha ${it.linha}: ${it.motivos.join("; ")}`);
  }

  console.log(`--- 2/2 ALUNOS (escola ${escolaExiste.nome}) ---`);
  const rAlunos = dry
    ? await validateAlunoImport(alunos, { escolaId: escolaExiste.id, anoLetivo })
    : await commitAlunoImport(alunos, { escolaId: escolaExiste.id, anoLetivo });
  console.log(resumo(rAlunos));
  for (const it of rAlunos.itens.filter((i) => i.status === "erro").slice(0, 5)) {
    console.log(`  linha ${it.linha}: ${it.motivos.join("; ")}`);
  }
}

export async function main() {
  if (!file) {
    console.log("Uso: importar.ts <planilha> [--dry] [--escola=1..19] [--ano=2026]");
    process.exit(1);
  }
  await importarEscola(file, escolaCodigo, anoLetivo, dry);
  console.log(dry ? "\n(dry-run: nada foi gravado)" : "\n(comit realizado)");
}
