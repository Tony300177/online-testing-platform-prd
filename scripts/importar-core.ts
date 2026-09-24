import path from "node:path";
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

function norm(s: string): string {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveAno(turma: string): string | null {
  const t = turma.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("BER")) return /BER[ÇC]ARIO\s*(II|2)/.test(t) ? "Berçário II" : "Berçário I";
  if (t.includes("MATERNAL")) return /MATERNAL\s*(II|2)/.test(t) ? "Maternal II" : "Maternal I";
  if (t.includes("PRE")) return /PRE\s*(II|2)/.test(t) ? "Pré II" : "Pré I";
  const m = t.match(/^(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return `${n}º Ano`;
  }
  return null;
}

function deriveTurno(turma: string): string {
  const t = turma.toUpperCase().trim();
  if (/INTEGRAL/.test(t)) return "Integral";
  if (/(VESP\.?)$/.test(t)) return "Vespertino";
  if (/(MAT\.?)$/.test(t)) return "Matutino";
  return "Matutino";
}

function readRows(filePath: string): { turmas: ImportLine[]; alunos: ImportLine[] } {
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
    .filter((r) => norm(String(r["ESCOLA"] ?? "")).includes("VASCO PAPA"));

  const distinct = new Map<string, ImportLine>();
  for (const r of alunos) {
    const turma = String(r["NOME DA TURMA"] ?? "").trim();
    if (!turma) continue;
    const ano = deriveAno(turma);
    if (!ano) throw new Error(`Não consegui derivar ANO da turma "${turma}"`);
    distinct.set(turma, {
      "CÓDIGO ESCOLA": escolaCodigo,
      ESCOLA: "CENTRO DE EDUCAÇÃO MUNICIPAL VASCO PAPA",
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

export async function main() {
  if (!file) {
    console.log("Uso: importar.ts <planilha> [--dry] [--escola=11] [--ano=2026]");
    process.exit(1);
  }
  const { turmas, alunos } = readRows(file);
  console.log(`Arquivo: ${path.basename(file)} | alunos Vasco Papa: ${alunos.length} | turmas distintas: ${turmas.length}`);
  for (const t of turmas) console.log(`  ${t["NOME DA TURMA"]} → ${t["ANO/SÉRIE"]} / ${t["TURNO"]}`);

  const [escolaExiste] = await db.select().from(escolas).where(eq(escolas.codigo, escolaCodigo)).limit(1);
  if (!escolaExiste) throw new Error(`Escola código ${escolaCodigo} não existe no banco.`);

  console.log(`\n--- 1/2 TURMAS (escola ${escolaCodigo} · ${escolaExiste.nome}) ---`);
  const rTurmas = dry
    ? await validateImport(turmas, anoLetivo, undefined, escolaCodigo)
    : await commitImport(turmas, anoLetivo, undefined, escolaCodigo);
  console.log(resumo(rTurmas));
  for (const it of rTurmas.itens.filter((i) => i.status === "erro").slice(0, 10)) {
    console.log(`  linha ${it.linha}: ${it.motivos.join("; ")}`);
  }

  console.log(`\n--- 2/2 ALUNOS (escola ${escolaExiste.nome}) ---`);
  const rAlunos = dry
    ? await validateAlunoImport(alunos, { escolaId: escolaExiste.id, anoLetivo })
    : await commitAlunoImport(alunos, { escolaId: escolaExiste.id, anoLetivo });
  console.log(resumo(rAlunos));
  for (const it of rAlunos.itens.filter((i) => i.status === "erro").slice(0, 10)) {
    console.log(`  linha ${it.linha}: ${it.motivos.join("; ")}`);
  }

  console.log(dry ? "\n(dry-run: nada foi gravado)" : "\n(comit realizado)");
}