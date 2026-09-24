import { eq } from "drizzle-orm";
import { db } from "@/db";
import { escolas } from "@/db/schema";
import { normalizeHeader as normalizeHeaderAluno, commitAlunoImport, validateAlunoImport } from "@/lib/aluno-import";
import { commitImport, validateImport, type ImportLine, type ImportReport, type ReportStatus } from "@/lib/import";
import { ESCOLAS_MUNICIPAIS, escolaTipo } from "@/lib/municipal-schools";

const DEFAULT_ANO_LETIVO = 2026;
const CHUNK_ALUNOS = 150;
const MAX_TENTATIVAS = 5;

export type { ImportLine };

/* ============================================================
 * Marca (normalizada) de cada escola oficial para casar nomes da planilha
 * ============================================================ */

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

function normImport(s: string): string {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchEscolaCodigo(escolaRaw: string | number | null | undefined): number | null {
  const n = normImport(String(escolaRaw ?? ""));
  if (!n) return null;
  const hits = new Map<number, number>();
  for (const [code, marca] of Object.entries(MARCA)) {
    const m = normImport(marca);
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

/* ============================================================
 * Cabeçalhos flexíveis (mesma normalização das libs)
 * ============================================================ */

const ESCOLA_ALIASES = new Set(
  [
    "ESCOLA",
    "NOME DA ESCOLA",
    "NOME DA UNIDADE",
    "UNIDADE",
    "NOME DA ESCOLA (BAIRRO)",
    "UNIDADE ESCOLAR",
    "ESCOLA (NOME)",
  ].map((a) => normalizeHeaderAluno(a))
);

const TURMA_ALIASES = new Set(
  ["TURMA", "NOME DA TURMA", "CLASSE", "SALA", "TURMA (NOME)"].map((a) => normalizeHeaderAluno(a))
);

const ANO_ALIASES = new Set(
  ["ANO", "SERIE", "SÉRIE", "ANO/SÉRIE", "ANO/SERIE", "ANO E SÉRIE", "ANO E SERIE", "TURMA ANO", "TURMA_ANO"].map((a) =>
    normalizeHeaderAluno(a)
  )
);

const TURNO_ALIASES = new Set(
  ["TURNO", "PERIODO", "PERÍODO", "TURNO AULA", "PERIODO AULA", "HORARIO", "HORÁRIO"].map((a) => normalizeHeaderAluno(a))
);

const PROFESSOR_ALIASES = new Set(
  ["PROFESSOR", "NOME DO PROFESSOR", "DOCENTE", "PROFESSOR (NOME)"].map((a) => normalizeHeaderAluno(a))
);

function findHeader(headers: string[], aliases: Set<string>): string | null {
  return headers.find((h) => aliases.has(normalizeHeaderAluno(h))) ?? null;
}

const cell = (row: ImportLine, header: string | null): string => (header ? String(row[header] ?? "").trim() : "");

/* ============================================================
 * Identificação (escopo inicial; sem gravar nada)
 * ============================================================ */

export type EscolaIdentificada = {
  codigo: number;
  nome: string;
  tipo: string;
  linhas: number;
  turmas: number;
  turmasNomes: string[];
  existe: boolean;
};

export type IdentificacaoPlanilha = {
  ok: boolean;
  totalLinhas: number;
  escolas: EscolaIdentificada[];
  semEscola: { escola: string; linhas: number }[];
};

export async function identificarPlanilha(rows: ImportLine[]): Promise<IdentificacaoPlanilha> {
  const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  const hEscola = findHeader(headers, ESCOLA_ALIASES);
  const hTurma = findHeader(headers, TURMA_ALIASES);

  const porEscola = new Map<number, ImportLine[]>();
  const semEscola = new Map<string, number>();
  for (const r of rows) {
    const escola = cell(r, hEscola);
    const codigo = matchEscolaCodigo(escola);
    if (codigo === null) {
      const k = normImport(escola) || "(ESCOLA em branco)";
      semEscola.set(k, (semEscola.get(k) ?? 0) + 1);
      continue;
    }
    if (!porEscola.has(codigo)) porEscola.set(codigo, []);
    porEscola.get(codigo)!.push(r);
  }

  const dbEscolas = await db.select().from(escolas);
  const turmaKey = new Map<number, Set<string>>();
  const turmaNomes = new Map<number, string[]>();
  for (const [codigo, group] of porEscola) {
    const s = new Set<string>();
    const names: string[] = [];
    for (const r of group) {
      const t = cell(r, hTurma || "NOME DA TURMA");
      if (!t) continue;
      const n = normImport(t);
      if (!s.has(n)) {
        s.add(n);
        names.push(t);
      }
    }
    turmaKey.set(codigo, s);
    turmaNomes.set(codigo, names);
  }

  const escolasList = [...porEscola.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([codigo, group]) => {
      const oficial = ESCOLAS_MUNICIPAIS.find((e) => e.numero === codigo)!;
      const dbEscola = dbEscolas.find((e) => e.codigo === codigo) ?? null;
      return {
        codigo,
        nome: oficial.nome,
        tipo: escolaTipo(codigo),
        linhas: group.length,
        turmas: turmaKey.get(codigo)?.size ?? 0,
        turmasNomes: turmaNomes.get(codigo) ?? [],
        existe: dbEscola !== null,
      };
    });

  return {
    ok: true,
    totalLinhas: rows.length,
    escolas: escolasList,
    semEscola: [...semEscola.entries()].map(([escola, linhas]) => ({ escola, linhas })),
  };
}

/* ============================================================
 * Monta as linhas de turma (distintas) de uma escola
 * ============================================================ */

export function montarTurmas(alunoRows: ImportLine[], codigo: number, nomeOficial: string): ImportLine[] {
  const headers = alunoRows.length > 0 ? Object.keys(alunoRows[0] ?? {}) : [];
  const hTurma = findHeader(headers, TURMA_ALIASES) ?? "NOME DA TURMA";
  const hAno = findHeader(headers, ANO_ALIASES) ?? "ANO/SÉRIE";
  const hTurno = findHeader(headers, TURNO_ALIASES) ?? "TURNO";
  const hProfessor = findHeader(headers, PROFESSOR_ALIASES);

  const turmas = new Map<string, ImportLine>();
  for (const r of alunoRows) {
    const nomeTurma = cell(r, hTurma);
    if (!nomeTurma || turmas.has(nomeTurma)) continue;
    turmas.set(nomeTurma, {
      "CÓDIGO ESCOLA": codigo,
      ESCOLA: nomeOficial,
      "NOME DA TURMA": nomeTurma,
      "ANO/SÉRIE": cell(r, hAno),
      TURNO: cell(r, hTurno),
      PROFESSOR: hProfessor ? cell(r, hProfessor) : "",
    });
  }
  return [...turmas.values()];
}

/* ============================================================
 * Validação (dry-run) de uma escola (turmas + alunos)
 * ============================================================ */

export type ValidacaoEscola = {
  codigo: number;
  nome: string;
  tipo: string;
  existe: boolean;
  alunos: number;
  turmas: ImportReport;
  alunosReport?: {
    total: number;
    validas: number;
    avisos: number;
    erros: number;
    itens: {
      linha: number;
      status: "ok" | "aviso" | "erro";
      nome: string;
      cpf: string | null;
      turma: string;
      turno: string;
      motivos: string[];
    }[];
  };
};

export async function validarEscolaPlanilha(
  rows: ImportLine[],
  codigo: number,
  anoLetivo = DEFAULT_ANO_LETIVO
): Promise<ValidacaoEscola> {
  const oficial = ESCOLAS_MUNICIPAIS.find((e) => e.numero === codigo)!;
  const [dbEscola] = await db.select().from(escolas).where(eq(escolas.codigo, codigo)).limit(1);

  const turmaRows = montarTurmas(rows, codigo, oficial.nome);
  const turmas = await validateImport(turmaRows, anoLetivo, undefined, codigo);

  const base: ValidacaoEscola = {
    codigo,
    nome: oficial.nome,
    tipo: escolaTipo(codigo),
    existe: !!dbEscola,
    alunos: rows.length,
    turmas,
  };

  if (!dbEscola) return base;

  const alunosReport = await validateAlunoImport(rows, {
    escolaId: dbEscola.id,
    anoLetivo,
    permitirCriacaoTurmas: true,
  });

  return {
    ...base,
    alunosReport: {
      total: alunosReport.total,
      validas: alunosReport.validas,
      avisos: alunosReport.avisos,
      erros: alunosReport.erros,
      itens: alunosReport.itens.map((i) => ({
        linha: i.linha,
        status: i.status,
        nome: i.nome,
        cpf: i.cpf,
        turma: i.turma,
        turno: i.turno,
        motivos: i.motivos,
      })),
    },
  };
}

/* ============================================================
 * Commit de uma escola (turmas + alunos em chunks, com retry)
 * ============================================================ */

export type CommitEscolaResult = {
  codigo: number;
  nome: string;
  turmas: ImportReport;
  alunos: {
    total: number;
    validas: number;
    avisos: number;
    erros: number;
    escrita?: {
      alunosCriados: number;
      alunosAtualizados: number;
      matriculasCriadas: number;
      jaCadastrados: number;
      ignorados: number;
    };
    itens: {
      linha: number;
      status: ReportStatus;
      nome: string;
      cpf: string | null;
      turma: string;
      turno: string;
      motivos: string[];
    }[];
  };
};

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let tentativa = 0;
  for (;;) {
    tentativa += 1;
    try {
      return await fn();
    } catch (err) {
      if (tentativa >= MAX_TENTATIVAS) throw err;
      const wait = 3000 * tentativa;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export async function commitEscolaPlanilha(
  rows: ImportLine[],
  codigo: number,
  anoLetivo = DEFAULT_ANO_LETIVO
): Promise<CommitEscolaResult> {
  const oficial = ESCOLAS_MUNICIPAIS.find((e) => e.numero === codigo)!;

  let dbEscola = (
    await db.select().from(escolas).where(eq(escolas.codigo, codigo)).limit(1)
  )[0];

  const turmaRows = montarTurmas(rows, codigo, oficial.nome);
  const turmas = await withRetry(() => commitImport(turmaRows, anoLetivo, undefined, codigo));

  // A escola pode ter sido criada pelo commitImport (com o nome oficial).
  const [aposTurmas] = await db.select().from(escolas).where(eq(escolas.codigo, codigo)).limit(1);
  if (!dbEscola && aposTurmas) dbEscola = aposTurmas;

  const totalEscrita = {
    alunosCriados: 0,
    alunosAtualizados: 0,
    matriculasCriadas: 0,
    jaCadastrados: 0,
    ignorados: 0,
  };
  const itens: CommitEscolaResult["alunos"]["itens"] = [];

  if (dbEscola) {
    for (let i = 0; i < rows.length; i += CHUNK_ALUNOS) {
      const parte = rows.slice(i, i + CHUNK_ALUNOS);
      const rA = await withRetry(() =>
        commitAlunoImport(parte, { escolaId: dbEscola.id, anoLetivo, permitirCriacaoTurmas: true })
      );
      if (rA.escrita) {
        totalEscrita.alunosCriados += rA.escrita.alunosCriados;
        totalEscrita.alunosAtualizados += rA.escrita.alunosAtualizados;
        totalEscrita.matriculasCriadas += rA.escrita.matriculasCriadas;
        totalEscrita.jaCadastrados += rA.escrita.jaCadastrados;
        totalEscrita.ignorados += rA.escrita.ignorados;
      }
      itens.push(
        ...rA.itens.map((i) => ({ ...i })).filter((i) => i.status === "erro" || i.status === "aviso")
      );
    }
  }

  return {
    codigo,
    nome: oficial.nome,
    turmas,
    alunos: {
      total: rows.length,
      validas: rows.length - totalEscrita.ignorados,
      avisos: 0,
      erros: totalEscrita.ignorados,
      escrita: totalEscrita,
      itens,
    },
  };
}