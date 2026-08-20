import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alunos,
  escolas,
  matriculas,
  professores,
  turmas,
  type Aluno,
  type Escola,
  type Matricula,
  type Professor,
  type Turma,
} from "@/db/schema";
import { STUDENT_DEFAULT_PASSWORD } from "@/lib/auth";
import { normalize } from "@/lib/utils";

const DEFAULT_ANO_LETIVO = 2026;

/* ============================================================
 * Constantes e normalizadores
 * ============================================================ */

export const ETNIAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena"] as const;
export type Etnia = (typeof ETNIAS)[number];

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

const SEXO_MASCULINO = new Set(["m", "masc", "masc.", "masculino", "homem", "h", "1"]);
const SEXO_FEMININO = new Set(["f", "fem", "fem.", "feminino", "mulher", "2"]);

/** Cabeçalhos aceitos por campo (comparação normalizada: sem acento, sem º/ª, maiúsculas). */
const HEADER_ALIASES: Record<string, string[]> = {
  ESCOLA: ["ESCOLA", "NOME DA ESCOLA"],
  ESCOLA_CODIGO: ["ESCOLA_CODIGO", "CODIGO DA ESCOLA", "CODIGO ESCOLA"],
  TURMA: ["TURMA", "NOME DA TURMA", "TURMA (NOME)"],
  TURMA_ANO: ["TURMA_ANO", "ANO", "SERIE", "SERIE TURMA", "ANO/SERIE", "ANO E SERIE", "TURMA ANO"],
  TURNO: ["TURNO", "PERIODO", "PERIODO AULA"],
  ANO_LETIVO: ["ANO_LETIVO", "ANO LETIVO", "ANO LETIVO (MATRICULA)"],
  PROFESSOR: ["PROFESSOR", "NOME DO PROFESSOR", "PROFESSOR (NOME)"],
  PROFESSOR_CODIGO: ["PROFESSOR_CODIGO", "CODIGO DO PROFESSOR", "CODIGO PROFESSOR", "FUNCIONAL"],
  ALUNO: ["ALUNO", "ALUNOS", "NOME DO ALUNO", "ALUNO (NOME)", "NOME ALUNO"],
  NUMERO_CHAMADA: ["NUMERO_CHAMADA", "N CHAMADA", "N CHAMADA", "CHAMADA", "NUMERO DE CHAMADA", "N DA CHAMADA", "NO CHAMADA"],
  MATRICULA: ["MATRICULA", "N MATRICULA", "NUMERO DE MATRICULA", "N DA MATRICULA"],
  SEXO: ["SEXO", "GENERO", "GÊNERO", "SEXO/GENERO"],
  COR_RACA: ["COR_RACA", "COR/RACA", "COR", "RACA", "COR RACA", "COR OU RACA", "ETNIA", "COR RAÇA"],
  BAIRRO: ["BAIRRO", "BAIRRO DE RESIDENCIA", "BAIRRO DE RESIDÊNCIA", "RESIDENCIA", "RESIDÊNCIA"],
  DATA_NASCIMENTO: ["DATA_NASCIMENTO", "DATA DE NASCIMENTO", "NASCIMENTO", "DATA NASCIMENTO", "DATA DE NASC."],
};

export const CANONICAL_FIELDS = [
  "ESCOLA",
  "ESCOLA_CODIGO",
  "TURMA",
  "TURMA_ANO",
  "TURNO",
  "ANO_LETIVO",
  "PROFESSOR",
  "PROFESSOR_CODIGO",
  "ALUNO",
  "NUMERO_CHAMADA",
  "MATRICULA",
  "SEXO",
  "COR_RACA",
  "BAIRRO",
  "DATA_NASCIMENTO",
] as const;
export type ImportField = (typeof CANONICAL_FIELDS)[number];

/** Normaliza um cabeçalho para comparação (ex.: "Nº CHAMADA" -> "N CHAMADA"). */
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

function normalizeTurno(value: string): string | null {
  const v = normalize(value);
  if (!v) return null;
  // suporta "1 - MATUTINO" → "Matutino"
  const stripped = normalize(stripPrefix(value, " - "));
  return TURNO_SINONIMOS[stripped] ?? TURNO_SINONIMOS[v] ?? null;
}

function normalizeSexo(value: string): "Masculino" | "Feminino" | null {
  const v = normalize(value);
  if (!v) return null;
  if (SEXO_MASCULINO.has(v)) return "Masculino";
  if (SEXO_FEMININO.has(v)) return "Feminino";
  return null;
}

function normalizeEtnia(value: string): Etnia | null {
  const v = normalize(value);
  if (!v) return null;
  const found = ETNIAS.find((e) => normalize(e) === v);
  if (found) return found;
  // "NÃO DECLARADA" → armazena como string (estatísticas mostram como grupo próprio)
  if (v.includes("nao declarada") || v.includes("não declarada")) return "Não Declarada" as Etnia;
  return null;
}

/** Converte data Excel serial number (ex.: 41803) para Date. */
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDataNascimento(value: string | number): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Excel serial number (ex.: 41803)
  if (typeof value === "number" || (typeof value === "string" && /^\d{4,5}$/.test(value.trim()))) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 30000 && n < 60000) return excelSerialToDate(n);
  }
  const v = String(value).trim();
  if (!v) return null;
  // DD/MM/AAAA
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
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
  aluno: string;
  professor: string;
  motivos: string[];
};

export type ResumoItem = {
  escola: string;
  turma: string;
  professor: string;
  alunos: number;
};

export type Escrita = {
  escolasCriadas: number;
  professoresCriados: number;
  alunosCriados: number;
  turmasCriadas: number;
  matriculasCriadas: number;
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
  turmaAno: string;
  turno: string | null;
  anoLetivo: number;
  professor: string;
  professorCodigo: number | null;
  aluno: string;
  numeroChamada: number | null;
  matricula: string | null;
  sexo: "Masculino" | "Feminino" | null;
  etnia: Etnia | null;
  bairro: string | null;
  dataNascimento: Date | null;
  motivos: string[];
  avisos: string[];
};

type DbSnapshot = {
  escolas: Escola[];
  professores: Professor[];
  turmas: Turma[];
  alunos: Aluno[];
  matriculas: Matricula[];
};

async function loadSnapshot(anoLetivo: number): Promise<DbSnapshot> {
  const [escolasRows, professoresRows, turmasRows, alunosRows, matriculasRows] = await Promise.all([
    db.select().from(escolas),
    db.select().from(professores),
    db.select().from(turmas),
    db.select().from(alunos),
    db.select().from(matriculas).where(eq(matriculas.anoLetivo, anoLetivo)),
  ]);
  return {
    escolas: escolasRows,
    professores: professoresRows,
    turmas: turmasRows,
    alunos: alunosRows,
    matriculas: matriculasRows,
  };
}

/* ============================================================
 * Parse + validação de uma planilha
 * ============================================================ */

export function parseImportRows(rows: ImportLine[], anoLetivoDefault: number): ParsedRow[] {
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

    const escola = get("ESCOLA", row).toUpperCase();
    const escolaCodigo = toInt(row[headerMap.get("ESCOLA_CODIGO") ?? ""]);
    const turmaRaw = get("TURMA", row).toUpperCase();
    const turmaAnoRaw = get("TURMA_ANO", row);
    const turno = normalizeTurno(get("TURNO", row));
    const anoLetivoRaw = toInt(row[headerMap.get("ANO_LETIVO") ?? ""]) ?? anoLetivoDefault;
    const professorRaw = get("PROFESSOR", row);
    const professor = stripPrefix(professorRaw).toUpperCase();
    const professorCodigo = toInt(row[headerMap.get("PROFESSOR_CODIGO") ?? ""]) ?? toInt(professorRaw.split(/\s*-\s*/)[0]);
    const aluno = get("ALUNO", row).toUpperCase();
    const numeroChamada = toInt(row[headerMap.get("NUMERO_CHAMADA") ?? ""]);
    const matricula = get("MATRICULA", row) || null;
    const sexo = normalizeSexo(get("SEXO", row));
    const etnia = normalizeEtnia(get("COR_RACA", row));
    const bairro = get("BAIRRO", row) || null;
    const dataNascimento = parseDataNascimento(get("DATA_NASCIMENTO", row));

    // Turma: "5ºA" → turmaAno="5", turma="5ºA"
    const turmaMatch = turmaRaw.match(/^(\d+)\s*[ºo°]?\s*(.*)$/i);
    const turmaAno = turmaAnoRaw || (turmaMatch ? turmaMatch[1] + "º Ano" : turmaAnoRaw);
    const turma = turmaMatch && !turmaRaw.includes("/") ? turmaRaw : turmaRaw;

    if (escola.length < 3) motivos.push("ESCOLA ausente ou muito curta");
    if (turma.length < 2) motivos.push("TURMA ausente ou muito curta");
    if (!turmaAno.trim()) motivos.push("TURMA_ANO ausente");
    if (!turno) motivos.push("TURNO ausente ou inválido");
    if (professor.length < 2) motivos.push("PROFESSOR ausente ou muito curto");
    if (aluno.length < 3) motivos.push("ALUNO ausente ou muito curto");
    if (!Number.isFinite(anoLetivoRaw) || anoLetivoRaw <= 0) motivos.push("ANO_LETIVO inválido");

    const sexoRaw = get("SEXO", row);
    if (sexoRaw && !sexo) motivos.push(`SEXO inválido ("${sexoRaw}")`);
    const etniaRaw = get("COR_RACA", row);
    if (etniaRaw && !etnia) motivos.push(`COR_RACA/ETNIA inválida ("${etniaRaw}")`);
    const dataRaw = get("DATA_NASCIMENTO", row);
    if (dataRaw && !dataNascimento) motivos.push(`DATA_NASCIMENTO inválida ("${dataRaw}")`);

    return {
      linha,
      escola,
      escolaCodigo,
      turma,
      turmaAno,
      turno,
      anoLetivo: anoLetivoRaw,
      professor,
      professorCodigo,
      aluno,
      numeroChamada,
      matricula,
      sexo,
      etnia,
      bairro,
      dataNascimento,
      motivos,
      avisos,
    };
  });
}

/** Valida contra o estado atual do banco e monta o relatório (sem gravar). */
export async function validateImport(rows: ImportLine[], anoLetivoDefault = DEFAULT_ANO_LETIVO): Promise<ImportReport> {
  const items = parseImportRows(rows, anoLetivoDefault);
  const snap = await loadSnapshot(anoLetivoDefault);

  const itens: ReportItem[] = [];
  const seenAlunoTurma = new Set<string>();
  const professorCodeByName = new Map<string, number>();

  for (const item of items) {
    const status: ReportStatus = item.motivos.length > 0 ? "erro" : "ok";
    const motivos = [...item.motivos];

    if (item.anoLetivo !== anoLetivoDefault && item.motivos.length === 0) {
      // permite apenas o ano letivo configurado
      motivos.push(`ANO_LETIVO ${item.anoLetivo} fora do ano letivo atual (${anoLetivoDefault})`);
    }

    const base: ReportItem = {
      linha: item.linha,
      status: "ok",
      escola: item.escola,
      turma: item.turma,
      aluno: item.aluno,
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
        item.avisos.push(`Professor "${item.professor}" aparece com códigos ${prev} e ${item.professorCodigo}`);
      } else {
        professorCodeByName.set(item.professor, item.professorCodigo);
      }
    }

    // Aluno + turma: duplicidade no próprio arquivo
    const key = `${item.aluno}|${item.turma}|${item.anoLetivo}`;
    if (seenAlunoTurma.has(key)) {
      item.avisos.push("Linha duplicada no arquivo (mesmo aluno + turma) — será ignorada");
    } else {
      seenAlunoTurma.add(key);
    }

    // Aluno já matriculado na turma no banco
    const existingAluno = snap.alunos.find((a) => normalize(a.nome) === normalize(item.aluno));
    if (existingAluno) {
      const jaMatriculado = snap.matriculas.some(
        (m) =>
          m.alunoId === existingAluno.id &&
          snap.turmas.some((t) => t.id === m.turmaId && normalize(t.nome) === normalize(item.turma) && t.anoLetivo === item.anoLetivo)
      );
      if (jaMatriculado) {
        item.avisos.push("Aluno já matriculado nesta turma — matrícula mantida");
      }
    }

    const finalStatus: ReportStatus = item.avisos.length > 0 ? "aviso" : "ok";
    itens.push({ ...base, status: finalStatus, motivos: [...motivos, ...item.avisos] });
  }

  return buildReport(itens, items, anoLetivoDefault);
}

/** Valida e grava de forma idempotente. */
export async function commitImport(rows: ImportLine[], anoLetivoDefault = DEFAULT_ANO_LETIVO): Promise<ImportReport> {
  const items = parseImportRows(rows, anoLetivoDefault);
  const snap = await loadSnapshot(anoLetivoDefault);

  const itens: ReportItem[] = [];
  const escrita: Escrita = {
    escolasCriadas: 0,
    professoresCriados: 0,
    alunosCriados: 0,
    turmasCriadas: 0,
    matriculasCriadas: 0,
    ignoradas: 0,
  };

  // Estado em memória (atualizado conforme gravamos, para deduplicar dentro do lote)
  const escolaById = new Map(snap.escolas.map((e) => [e.id, e]));
  const professorById = new Map(snap.professores.map((p) => [p.id, p]));
  const turmaById = new Map(snap.turmas.map((t) => [t.id, t]));
  const alunoById = new Map(snap.alunos.map((a) => [a.id, a]));

  await db.transaction(async (tx) => {
    for (const item of items) {
      const motivos = [...item.motivos];
      if (item.anoLetivo !== anoLetivoDefault && item.motivos.length === 0) {
        motivos.push(`ANO_LETIVO ${item.anoLetivo} fora do ano letivo atual (${anoLetivoDefault})`);
      }

      const base: ReportItem = {
        linha: item.linha,
        status: "ok",
        escola: item.escola,
        turma: item.turma,
        aluno: item.aluno,
        professor: item.professor,
        motivos,
      };

      if (motivos.length > 0) {
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

      // ---- Aluno (dedupe por nome normalizado) ----
      let aluno = [...alunoById.values()].find((a) => normalize(a.nome) === normalize(item.aluno));
      if (!aluno) {
        const [ins] = await tx
          .insert(alunos)
          .values({
            nome: item.aluno,
            matricula: item.matricula ?? undefined,
            numeroChamada: item.numeroChamada ?? undefined,
            sexo: item.sexo ?? undefined,
            etnia: item.etnia ?? undefined,
            bairro: item.bairro ?? undefined,
            dataNascimento: item.dataNascimento ?? undefined,
            senhaHash: bcrypt.hashSync(STUDENT_DEFAULT_PASSWORD, 10),
          })
          .returning();
        aluno = ins;
        alunoById.set(ins.id, ins);
        escrita.alunosCriados += 1;
      } else {
        // Atualiza campos demográficos se vierem preenchidos (nunca sobrescreve senha)
        const patch: Partial<typeof alunos.$inferInsert> = {};
        if (item.sexo) patch.sexo = item.sexo;
        if (item.etnia) patch.etnia = item.etnia;
        if (item.bairro) patch.bairro = item.bairro;
        if (item.dataNascimento) patch.dataNascimento = item.dataNascimento;
        if (!aluno.matricula && item.matricula) patch.matricula = item.matricula;
        if (!aluno.numeroChamada && item.numeroChamada) patch.numeroChamada = item.numeroChamada;
        if (Object.keys(patch).length > 0) {
          await tx.update(alunos).set(patch).where(eq(alunos.id, aluno.id));
          aluno = { ...aluno, ...patch };
          alunoById.set(aluno.id, aluno);
        }
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
            ano: item.turmaAno,
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
      } else {
        const patch: Partial<typeof turmas.$inferInsert> = {};
        if (item.turno && turma.turno !== item.turno) patch.turno = item.turno;
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
      }

      // ---- Matrícula ----
      const jaMatriculado = snap.matriculas.some((m) => m.alunoId === aluno.id && m.turmaId === turma.id);
      if (jaMatriculado) {
        itens.push({ ...base, status: "aviso", motivos: ["Aluno já matriculado nesta turma — matrícula mantida"] });
        escrita.ignoradas += 1;
        continue;
      }
      const inserida = await tx
        .insert(matriculas)
        .values({ alunoId: aluno.id, turmaId: turma.id, anoLetivo: item.anoLetivo, status: "ativo" })
        .onConflictDoNothing()
        .returning();
      if (inserida.length > 0) {
        escrita.matriculasCriadas += 1;
        snap.matriculas.push(inserida[0]);
      }
      itens.push({ ...base, status: "ok" });
    }
  });

  return buildReport(itens, items, anoLetivoDefault, escrita);
}

function buildReport(itens: ReportItem[], items: ParsedRow[], anoLetivo: number, escrita?: Escrita): ImportReport {
  const validas = itens.filter((i) => i.status === "ok").length;
  const avisos = itens.filter((i) => i.status === "aviso").length;
  const erros = itens.filter((i) => i.status === "erro").length;

  const resumo = new Map<string, ResumoItem>();
  const alunosPorTurma = new Map<string, Set<string>>();
  for (const i of itens.filter((x) => x.status !== "erro")) {
    const key = `${i.escola}|${i.turma}`;
    const set = alunosPorTurma.get(key) ?? new Set<string>();
    set.add(i.aluno);
    alunosPorTurma.set(key, set);
    resumo.set(key, { escola: i.escola, turma: i.turma, professor: i.professor, alunos: set.size });
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