import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  escolas,
  professores,
  turmas,
  type Escola,
  type Professor,
  type Turma,
} from "@/db/schema";
import { normalize } from "@/lib/utils";

const DEFAULT_ANO_LETIVO = 2026;

/* ============================================================
 * Constantes e normalizadores
 * ============================================================ */

export type Turno = "Matutino" | "Vespertino" | "Noturno" | "Integral";

export const TURNOS = ["Matutino", "Vespertino", "Noturno", "Integral"] as const;

const TURNO_SINONIMOS: Record<string, string> = {
  mat: "Matutino",
  matutino: "Matutino",
  manha: "Matutino",
  manhã: "Matutino",
  vespertino: "Vespertino",
  vesp: "Vespertino",
  tarde: "Vespertino",
  noturno: "Noturno",
  noite: "Noturno",
  integral: "Integral",
};

/** Cabeçalhos aceitos por campo (comparação normalizada: sem acento, sem º/ª, maiúsculas). */
const HEADER_ALIASES: Record<string, string[]> = {
  ESCOLA: ["ESCOLA", "NOME DA ESCOLA", "NOME DA UNIDADE", "UNIDADE"],
  TURMA: ["TURMA", "NOME DA TURMA", "TURMA (NOME)", "CLASSE", "SALA"],
  ANO: ["ANO", "SERIE", "SÉRIE", "ANO/SERIE", "ANO E SERIE", "TURMA_ANO", "TURMA ANO"],
  TURNO: ["TURNO", "PERIODO", "PERÍODO", "PERIODO AULA", "HORARIO", "HORÁRIO"],
  PROFESSOR: ["PROFESSOR", "NOME DO PROFESSOR", "PROFESSOR (NOME)", "DOCENTE"],
};

export const CANONICAL_FIELDS = ["ESCOLA", "TURMA", "ANO", "TURNO", "PROFESSOR"] as const;
export type ImportField = (typeof CANONICAL_FIELDS)[number];

/** Normaliza um cabeçalho para comparação (ex.: "Nº" -> "N"). */
export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .replace(/\s+/g, " ");
}

/** Mapeia os cabeçalhos da planilha para os campos canônicos. */
export function mapHeaders(headers: string[]): Map<ImportField, string> {
  const map = new Map<ImportField, string>();
  const aliasIndex = new Map<string, ImportField>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) aliasIndex.set(normalizeHeader(a), field as ImportField);
  }
  for (const h of headers) {
    const field = aliasIndex.get(normalizeHeader(h));
    if (field && !map.has(field)) map.set(field, h);
  }
  return map;
}

/* ============================================================
 * Auto-detecção de linha de cabeçalho (planilhas com título)
 * ============================================================ */

const KNOWN_HEADERS = new Set(
  Object.values(HEADER_ALIASES)
    .flat()
    .map((a) => normalizeHeader(a))
);

/** Deteta a linha de cabeçalho em planilhas que têm linhas de título antes do header real. */
export function detectHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i];
    if (!cells || cells.length === 0) continue;
    const hits = cells.filter(
      (c) => typeof c === "string" && c.trim() !== "" && KNOWN_HEADERS.has(normalizeHeader(String(c)))
    ).length;
    if (hits >= 3) return i;
  }
  return 0;
}

/** Extrai o nome limpo do professor no formato "168 - NOME" (remove prefixo numérico). */
export function stripPrefix(value: string, separator = " - "): string {
  const idx = value.indexOf(separator);
  if (idx === -1) return value;
  const after = value.substring(idx + separator.length).trim();
  return after.length >= 2 ? after : value;
}

function normalizeTurno(value: string): Turno | null {
  const v = normalize(value);
  if (!v) return null;
  // suporta "1 - MATUTINO" → "Matutino"
  const stripped = normalize(stripPrefix(value, " - "));
  return (TURNO_SINONIMOS[stripped] ?? TURNO_SINONIMOS[v] ?? null) as Turno | null;
}

function toInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function cleanText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/* ============================================================
 * Tipos de saída
 * ============================================================ */

export type ImportLine = Record<string, string | number | null | undefined>;

export type ReportStatus = "ok" | "aviso" | "erro";

export type ReportItem = {
  linha: number;
  status: ReportStatus;
  escola: string;
  turma: string;
  ano: string;
  turno: string;
  professor: string;
  motivos: string[];
};

export type ResumoItem = {
  escola: string;
  turma: string;
  ano: string;
  turno: string;
  professor: string;
};

export type Escrita = {
  escolasCriadas: number;
  professoresCriados: number;
  turmasCriadas: number;
  ignoradas: number;
};

export type ImportReport = {
  ok: boolean;
  total: number;
  validas: number;
  avisos: number;
  erros: number;
  itens: ReportItem[];
  resumo: ResumoItem[];
  escrita?: Escrita;
};

type ParsedRow = {
  linha: number;
  escola: string;
  escolaCodigo: number | null;
  turma: string;
  ano: string;
  turno: string | null;
  anoLetivo: number;
  professor: string;
  professorCodigo: number | null;
  motivos: string[];
  avisos: string[];
};

type DbSnapshot = {
  escolas: Escola[];
  professores: Professor[];
  turmas: Turma[];
};

async function loadSnapshot(anoLetivo: number): Promise<DbSnapshot> {
  const [escolasRows, professoresRows, turmasRows] = await Promise.all([
    db.select().from(escolas),
    db.select().from(professores),
    db.select().from(turmas).where(eq(turmas.anoLetivo, anoLetivo)),
  ]);
  return {
    escolas: escolasRows,
    professores: professoresRows,
    turmas: turmasRows,
  };
}

/* ============================================================
 * Parse + validação de uma planilha
 * ============================================================ */

export function parseImportRows(rows: ImportLine[], anoLetivoDefault: number, escolaDefault?: string): ParsedRow[] {
  const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  const headerMap = mapHeaders(headers);

  const get = (field: ImportField, row: ImportLine): string => {
    const h = headerMap.get(field);
    return h ? cleanText(row[h]) : "";
  };

  return rows.map((row, i) => {
    const linha = i + 2; // linha 1 é o cabeçalho
    const motivos: string[] = [];
    const avisos: string[] = [];

    const escola = get("ESCOLA", row).toUpperCase() || (escolaDefault ? escolaDefault.toUpperCase() : "");
    const escolaCodigo = toInt(row[headerMap.get("ESCOLA") ?? ""]);
    const turmaRaw = get("TURMA", row).toUpperCase();
    const anoRaw = get("ANO", row);
    const turno = normalizeTurno(get("TURNO", row));
    const anoLetivo = anoLetivoDefault;
    const professorRaw = get("PROFESSOR", row);
    const professor = stripPrefix(professorRaw).toUpperCase();
    const professorCodigo = toInt(professorRaw.split(/\s*-\s*/)[0]);

    // Turma/ano: "5ºA" → ano="5º Ano", turma="5ºA"; senão usa a coluna ANO.
    const turmaMatch = turmaRaw.match(/^(\d+)\s*[ºo°]?\s*(.*)$/i);
    const ano = anoRaw || (turmaMatch ? turmaMatch[1] + "º Ano" : anoRaw);

    if (escola.length < 3) motivos.push("ESCOLA ausente ou muito curta");
    if (turmaRaw.length < 2) motivos.push("TURMA ausente ou muito curta");
    if (!ano.trim()) motivos.push("ANO ausente");
    if (!turno) motivos.push("TURNO ausente ou inválido");
    if (professor.length < 2) motivos.push("PROFESSOR ausente ou muito curto");

    return {
      linha,
      escola,
      escolaCodigo,
      turma: turmaRaw,
      ano,
      turno,
      anoLetivo,
      professor,
      professorCodigo,
      motivos,
      avisos,
    };
  });
}

/** Valida contra o estado atual do banco e monta o relatório (sem gravar). */
export async function validateImport(rows: ImportLine[], anoLetivoDefault = DEFAULT_ANO_LETIVO, escolaDefault?: string): Promise<ImportReport> {
  const items = parseImportRows(rows, anoLetivoDefault, escolaDefault);
  const snap = await loadSnapshot(anoLetivoDefault);

  const itens: ReportItem[] = [];
  const seenTurma = new Set<string>();
  const professorCodeByName = new Map<string, number>();

  for (const item of items) {
    const motivos = [...item.motivos];
    const avisos: string[] = [];

    const base: ReportItem = {
      linha: item.linha,
      status: "ok",
      escola: item.escola,
      turma: item.turma,
      ano: item.ano,
      turno: item.turno ?? "",
      professor: item.professor,
      motivos,
    };

    if (motivos.length > 0) {
      itens.push({ ...base, status: "erro" });
      continue;
    }

    // Professor: nome com códigos divergentes -> aviso
    if (item.professorCodigo !== null) {
      const prev = professorCodeByName.get(item.professor);
      if (prev !== undefined && prev !== item.professorCodigo) {
        avisos.push(`Professor "${item.professor}" aparece com códigos ${prev} e ${item.professorCodigo}`);
      } else {
        professorCodeByName.set(item.professor, item.professorCodigo);
      }
    }

    // Turma: duplicidade no próprio arquivo
    const key = `${item.escola}|${item.turma}|${item.anoLetivo}`;
    if (seenTurma.has(key)) {
      avisos.push("Linha duplicada no arquivo (mesma escola + turma) — será mantida");
    } else {
      seenTurma.add(key);
    }

    // Turma já existente no banco
    const existingEscola = snap.escolas.find((e) => normalize(e.nome) === normalize(item.escola));
    if (existingEscola) {
      const turmaExiste = snap.turmas.some(
        (t) =>
          t.escolaId === existingEscola.id &&
          normalize(t.nome) === normalize(item.turma) &&
          t.anoLetivo === item.anoLetivo
      );
      if (turmaExiste) {
        avisos.push("Turma já cadastrada nesta escola — será mantida/atualizada");
      }
    }

    const status: ReportStatus = avisos.length > 0 ? "aviso" : "ok";
    itens.push({ ...base, status, motivos: [...motivos, ...avisos] });
  }

  return buildReport(itens, items, anoLetivoDefault);
}

/** Valida e grava de forma idempotente. */
export async function commitImport(rows: ImportLine[], anoLetivoDefault = DEFAULT_ANO_LETIVO, escolaDefault?: string): Promise<ImportReport> {
  const items = parseImportRows(rows, anoLetivoDefault, escolaDefault);
  const snap = await loadSnapshot(anoLetivoDefault);

  const itens: ReportItem[] = [];
  const escrita: Escrita = {
    escolasCriadas: 0,
    professoresCriados: 0,
    turmasCriadas: 0,
    ignoradas: 0,
  };

  // Estado em memória (atualizado conforme gravamos, para deduplicar dentro do lote)
  const escolaById = new Map(snap.escolas.map((e) => [e.id, e]));
  const professorById = new Map(snap.professores.map((p) => [p.id, p]));
  const turmaById = new Map(snap.turmas.map((t) => [t.id, t]));

  await db.transaction(async (tx) => {
    for (const item of items) {
      const base: ReportItem = {
        linha: item.linha,
        status: "ok",
        escola: item.escola,
        turma: item.turma,
        ano: item.ano,
        turno: item.turno ?? "",
        professor: item.professor,
        motivos: [...item.motivos],
      };

      if (item.motivos.length > 0) {
        itens.push({ ...base, status: "erro" });
        continue;
      }

      // ---- Escola ----
      let escola = [...escolaById.values()].find(
        (e) => (item.escolaCodigo !== null && e.codigo === item.escolaCodigo) || normalize(e.nome) === normalize(item.escola)
      );
      if (!escola) {
        const [ins] = await tx
          .insert(escolas)
          .values({ nome: item.escola, codigo: item.escolaCodigo ?? undefined })
          .returning();
        escola = ins;
        escolaById.set(ins.id, ins);
        escrita.escolasCriadas += 1;
      }

      // ---- Professor ----
      let professor = [...professorById.values()].find(
        (p) => (item.professorCodigo !== null && p.codigo === item.professorCodigo) || normalize(p.nome) === normalize(item.professor)
      );
      if (!professor) {
        const [ins] = await tx
          .insert(professores)
          .values({ nome: item.professor, codigo: item.professorCodigo ?? undefined })
          .returning();
        professor = ins;
        professorById.set(ins.id, ins);
        escrita.professoresCriados += 1;
      }

      // ---- Turma (chave natural: escola + nome + ano letivo) ----
      let turma = [...turmaById.values()].find(
        (t) => t.escolaId === escola.id && normalize(t.nome) === normalize(item.turma) && t.anoLetivo === item.anoLetivo
      );
      if (!turma) {
        const [ins] = await tx
          .insert(turmas)
          .values({
            escolaId: escola.id,
            nome: item.turma,
            ano: item.ano,
            turno: item.turno!,
            professor: professor.nome,
            professorCodigo: professor.codigo ?? undefined,
            professorId: professor.id,
            anoLetivo: item.anoLetivo,
          })
          .returning();
        turma = ins;
        turmaById.set(ins.id, ins);
        escrita.turmasCriadas += 1;
        itens.push({ ...base, status: "ok" });
      } else {
        // Mantém existente, atualizando dados que mudaram
        const patch: Partial<typeof turmas.$inferInsert> = {};
        if (item.turno && turma.turno !== item.turno) patch.turno = item.turno;
        if (turma.ano !== item.ano) patch.ano = item.ano;
        if (!turma.professorId) {
          patch.professorId = professor.id;
          patch.professor = professor.nome;
          patch.professorCodigo = professor.codigo ?? undefined;
        }
        if (Object.keys(patch).length > 0) {
          await tx.update(turmas).set(patch).where(eq(turmas.id, turma.id));
          turma = { ...turma, ...patch };
          turmaById.set(turma.id, turma);
        }
        escrita.ignoradas += 1;
        itens.push({ ...base, status: "aviso", motivos: ["Turma já cadastrada — mantida/atualizada"] });
      }
    }
  });

  return buildReport(itens, items, anoLetivoDefault, escrita);
}

function buildReport(itens: ReportItem[], items: ParsedRow[], anoLetivo: number, escrita?: Escrita): ImportReport {
  const validas = itens.filter((i) => i.status === "ok").length;
  const avisos = itens.filter((i) => i.status === "aviso").length;
  const erros = itens.filter((i) => i.status === "erro").length;

  const resumo = new Map<string, ResumoItem>();
  for (const i of itens.filter((x) => x.status !== "erro")) {
    const key = `${i.escola}|${i.turma}`;
    resumo.set(key, { escola: i.escola, turma: i.turma, ano: i.ano, turno: i.turno, professor: i.professor });
  }

  return {
    ok: erros === 0,
    total: items.length,
    validas,
    avisos,
    erros,
    itens,
    resumo: Array.from(resumo.values()),
    ...(escrita ? { escrita } : {}),
  };
}