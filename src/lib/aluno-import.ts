import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alunos,
  matriculas,
  turmas,
  type Aluno,
  type Matricula,
  type Turma,
} from "@/db/schema";
import { STUDENT_DEFAULT_PASSWORD } from "@/lib/auth";
import { normalize } from "@/lib/utils";

const DEFAULT_ANO_LETIVO = 2026;

/* ============================================================
 * Cabeçalhos aceitos por campo (comparação normalizada)
 * ============================================================ */

const HEADER_ALIASES: Record<string, string[]> = {
  NUMERO_CHAMADA: ["Nº", "N", "NUMERO", "NUMERO CHAMADA", "Nº CHAMADA", "CHAMADA"],
  NOME: ["NOME", "NOME DO ALUNO", "ALUNO", "NOME COMPLETO"],
  INEP: ["INEP DO ALUNO", "INEP", "CODIGO INEP", "CODIGO DO ALUNO INEP", "INEP ESTUDANTE"],
  MATRICULA: ["MATRICULA", "MATRÍCULA", "Nº MATRICULA", "Nº MATRÍCULA", "NUMERO MATRICULA", "NUMERO DA MATRICULA"],
  CPF: ["CPF", "CPF DO ALUNO"],
  DATA_NASCIMENTO: ["DATA DE NASCIMENTO", "DATA NASCIMENTO", "NASCIMENTO", "DT NASCIMENTO", "DATA"],
  SEXO: ["SEXO", "GENERO", "GÊNERO", "SEXO/GÊNERO", "SEXO E GÊNERO", "GÊNERO DO ALUNO"],
  ETNIA: ["ETNIA", "COR", "RACA", "RAÇA", "COR RACA", "COR/RAÇA", "COR/RACA", "RACA/COR", "RAÇA/COR", "COR OU RAÇA", "COR ETNIA", "COR/ETNIA"],
  BAIRRO: ["BAIRRO", "BAIRRO DE RESIDENCIA", "BAIRRO DE RESIDÊNCIA", "BAIRRO DO ALUNO", "RESIDENCIA", "RESIDÊNCIA", "BAIRRO DO ESTUDANTE"],
  TURMA: ["TURMA", "NOME DA TURMA", "CLASSE", "SALA"],
  TURNO: ["TURNO", "PERIODO", "PERÍODO", "TURNO AULA"],
  ANO: ["ANO", "SERIE", "SÉRIE", "ANO/SÉRIE", "ANO E SÉRIE", "TURMA_ANO", "ANO SERIE", "SERIE ANO"],
  PROFESSOR: ["PROFESSOR", "NOME DO PROFESSOR", "DOCENTE"],
};

export const ALUNO_FIELDS = ["NUMERO_CHAMADA", "NOME", "INEP", "MATRICULA", "CPF", "DATA_NASCIMENTO", "SEXO", "ETNIA", "BAIRRO", "TURMA", "TURNO", "ANO", "PROFESSOR"] as const;
export type AlunoImportField = (typeof ALUNO_FIELDS)[number];

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .replace(/\s+/g, " ");
}

function mapHeaders(headers: string[]): Map<AlunoImportField, string> {
  const map = new Map<AlunoImportField, string>();
  const aliasIndex = new Map<string, AlunoImportField>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) aliasIndex.set(normalizeHeader(a), field as AlunoImportField);
  }
  for (const h of headers) {
    const field = aliasIndex.get(normalizeHeader(h));
    if (field && !map.has(field)) map.set(field, h);
  }
  return map;
}

const KNOWN_HEADERS = new Set(
  Object.values(HEADER_ALIASES)
    .flat()
    .map((a) => normalizeHeader(a))
);

/** Deteta a linha de cabeçalho em planilhas com linhas de título. */
export function detectAlunoHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = rows[i];
    if (!cells || cells.length === 0) continue;
    const hits = cells.filter(
      (c) => typeof c === "string" && c.trim() !== "" && KNOWN_HEADERS.has(normalizeHeader(String(c)))
    ).length;
    if (hits >= 3) return i;
  }
  return 0;
}

/* ============================================================
 * Helpers de normalização
 * ============================================================ */

export function cleanCPF(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\D/g, "");
}

export function isCPFValid(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    return rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function cleanDates(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    // Número serial do Excel (data a partir de 01/01/1900)
    const d = new Date(Math.round((value - 25569) * 86400000));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [_, dd, mm, yyyy] = dmy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [_, yyyy, mm, dd] = iso;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function cleanText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Normaliza gênero/sexo para "Masculino" | "Feminino" (aceita M/F e variações). */
export function normalizeGenero(value: string): string | null {
  const v = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (v === "M" || v === "MASC" || v === "MASCULINO" || v === "MASCULIN") return "Masculino";
  if (v === "F" || v === "FEM" || v === "FEMININO") return "Feminino";
  return null;
}

/** Normaliza cor/raça para a classificação IBGE (Branca, Preta, Parda, Amarela, Indígena). */
export function normalizeEtnia(value: string): string | null {
  const v = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  const ETNIAS_IBGE: [string[], string][] = [
    [["BRANCA", "BRANCO"], "Branca"],
    [["PRETA", "PRETO", "NEGRA", "NEGRO"], "Preta"],
    [["PARDA", "PARDO"], "Parda"],
    [["AMARELA", "AMARELO"], "Amarela"],
    [["INDIGENA", "INDIGENO", "INDIGENA/BRASILEIRA"], "Indígena"],
  ];
  for (const [aliases, label] of ETNIAS_IBGE) {
    if (aliases.includes(v)) return label;
  }
  return null;
}

/** Converte "yyyy-mm-dd" (ou Date) para Date usado nos inserts do drizzle. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/* ============================================================
 * Tipos
 * ============================================================ */

export type ImportAlunoLine = Record<string, string | number | null | undefined>;

export type ParsedAlunoRow = {
  linha: number;
  nome: string;
  cpf: string | null;
  inep: string | null;
  matricula: string | null;
  dataNascimento: string | null;
  numeroChamada: number | null;
  sexo: string | null;
  etnia: string | null;
  bairro: string | null;
  turma: string;
  turno: string | null;
  ano: string | null;
  professor: string | null;
  anoLetivo: number;
  motivos: string[];
  avisos: string[];
};

export type AlunoReportItem = {
  linha: number;
  status: "ok" | "aviso" | "erro";
  nome: string;
  cpf: string | null;
  turma: string;
  turno: string;
  motivos: string[];
};

export type AlunoResumoTurma = {
  turma: string;
  ano: string;
  turno: string;
  quantidade: number;
};

export type AlunoEscrita = {
  alunosCriados: number;
  alunosAtualizados: number;
  matriculasCriadas: number;
  jaCadastrados: number;
  ignorados: number;
};

export type AlunoImportReport = {
  ok: boolean;
  total: number;
  validas: number;
  avisos: number;
  erros: number;
  itens: AlunoReportItem[];
  resumo: AlunoResumoTurma[];
  escrita?: AlunoEscrita;
};

export type AlunoImportOptions = {
  escolaId: string;
  turmaId?: string;
  anoLetivo?: number;
  /** Mapa nome-do-campo → cabeçalho real na planilha (ex.: NOME, TURMA, ANO, TURNO, PROFESSOR). */
  colunas?: Record<string, string>;
};

/* ============================================================
 * Parse
 * ============================================================ */

export function parseAlunoRows(rows: ImportAlunoLine[], options: AlunoImportOptions): ParsedAlunoRow[] {
  const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  const headerMap = mapHeaders(headers);
  const get = (field: AlunoImportField, row: ImportAlunoLine): string => {
    const h = headerMap.get(field);
    return h ? cleanText(row[h]) : "";
  };

  const anoLetivo = options.anoLetivo ?? DEFAULT_ANO_LETIVO;

  return rows.map((row, i) => {
    const linha = i + 2;
    const motivos: string[] = [];
    const avisos: string[] = [];

    const nome = get("NOME", row).toUpperCase();
    const cpfRaw = cleanCPF(row[headerMap.get("CPF") ?? ""]);
    const inep = cleanText(row[headerMap.get("INEP") ?? ""]) || null;
    const matricula = cleanText(row[headerMap.get("MATRICULA") ?? ""]) || null;
    const dataNascimento = cleanDates(row[headerMap.get("DATA_NASCIMENTO") ?? ""]);
    const numeroChamadaRaw = get("MATRICULA", row) || get("NUMERO_CHAMADA", row);
    const turma = get("TURMA", row).toUpperCase();
    const turnoRaw = get("TURNO", row);
    const ano = get("ANO", row).toUpperCase() || null;
    const professor = get("PROFESSOR", row).toUpperCase() || null;

    const sexoRaw = get("SEXO", row);
    const sexo = sexoRaw ? normalizeGenero(sexoRaw) : null;
    if (sexoRaw && !sexo) avisos.push(`SEXO "${sexoRaw}" não reconhecido — use Masculino ou Feminino`);

    const etniaRaw = get("ETNIA", row);
    const etnia = etniaRaw ? normalizeEtnia(etniaRaw) : null;
    if (etniaRaw && !etnia) avisos.push(`ETNIA/COR "${etniaRaw}" não reconhecida — use Branca, Preta, Parda, Amarela ou Indígena`);

    const bairro = cleanText(get("BAIRRO", row)) || null;

    const numeroChamada =
      numeroChamadaRaw === "" || !/^\d+$/.test(numeroChamadaRaw)
        ? null
        : Number(numeroChamadaRaw);

    if (nome.length < 3) motivos.push("NOME do aluno ausente ou muito curto");
    if (cpfRaw && cpfRaw.length !== 11) motivos.push(`CPF "${cpfRaw}" incompleto (esperado 11 dígitos)`);
    else if (cpfRaw && cpfRaw.length === 11 && !isCPFValid(cpfRaw)) motivos.push(`CPF "${cpfRaw}" inválido`);
    if (dataNascimento === null && cleanText(row[headerMap.get("DATA_NASCIMENTO") ?? ""]).trim() !== "") {
      motivos.push("DATA DE NASCIMENTO inválida");
    }

    if (!turma && !options.turmaId) motivos.push("TURMA ausente");

    return {
      linha,
      nome,
      cpf: cpfRaw || null,
      inep,
      matricula,
      dataNascimento,
      numeroChamada,
      sexo,
      etnia,
      bairro,
      turma,
      turno: turnoRaw ? turnoRaw.toUpperCase() : null,
      ano,
      professor,
      anoLetivo,
      motivos,
      avisos,
    };
  });
}

/* ============================================================
 * Snapshot do banco (turmas da escola + alunos + matrículas)
 * ============================================================ */

type AlunoSnapshot = {
  turmas: Turma[];
  alunos: Aluno[];
  matriculas: Matricula[];
};

async function loadAlunoSnapshot(escolaId: string, anoLetivo: number): Promise<AlunoSnapshot> {
  const turmasRows = await db.select().from(turmas).where(and(eq(turmas.escolaId, escolaId), eq(turmas.anoLetivo, anoLetivo)));
  const turmaIds = turmasRows.map((t) => t.id);
  const [alunosRows, matriculasRows] = await Promise.all([
    db.select().from(alunos),
    turmaIds.length > 0
      ? db.select().from(matriculas).where(eq(matriculas.anoLetivo, anoLetivo))
      : Promise.resolve([] as Matricula[]),
  ]);
  const filteredMatriculas = turmaIds.length > 0 ? matriculasRows.filter((m) => turmaIds.includes(m.turmaId)) : [];
  return { turmas: turmasRows, alunos: alunosRows, matriculas: filteredMatriculas };
}

function findTurmaNoEscola(turmasRows: Turma[], nome: string, ano?: string, turno?: string): Turma | null {
  if (!nome) return null;
  // Compara por chave alfanumérica: "PRE I - B" == "PRÉ I B" == "pre i-b"
  const byName = turmasRows.filter((t) => normKey(t.nome) === normKey(nome));
  if (byName.length === 0) return null;
  if (byName.length === 1) return byName[0];
  const preferida = byName.find(
    (t) => (!ano || normKey(t.ano) === normKey(ano)) && (!turno || normKey(t.turno) === normKey(turno))
  );
  return preferida ?? byName[0];
}

/** Chave normalizada para comparação de ano/série, turno e nomes (sem acentos/não-alfanuméricos). */
function normKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Remove prefixo numérico estilo "168 - JANETE" antes de comparar/guardar professores. */
function nomeProfessor(value: string): string {
  const idx = value.indexOf(" - ");
  if (idx !== -1 && value.substring(idx + 3).trim().length >= 2) return value.substring(idx + 3).trim();
  return value;
}

/** Compara Turma/Ano-Série/Turno/Professor da planilha contra a turma cadastrada (gera avisos). */
function pushConferenciaTurma(avisos: string[], turmaRow: Turma, item: ParsedAlunoRow) {
  if (item.ano && normKey(item.ano) !== normKey(turmaRow.ano || "")) {
    avisos.push(`Ano/série na planilha ("${item.ano}") difere do cadastrado ("${turmaRow.ano}")`);
  }
  if (item.turno && normKey(item.turno) !== normKey(turmaRow.turno || "")) {
    avisos.push(`Turno na planilha ("${item.turno}") difere do cadastrado ("${turmaRow.turno}")`);
  }
  if (item.professor && turmaRow.professor) {
    if (normKey(nomeProfessor(item.professor)) !== normKey(nomeProfessor(turmaRow.professor))) {
      avisos.push(`Professor na planilha ("${item.professor}") difere do cadastrado ("${turmaRow.professor}")`);
    }
  }
}

function findAlunoPorCPF(alunosRows: Aluno[], cpf: string): Aluno | null {
  if (!cpf) return null;
  return alunosRows.find((a) => a.cpf === cpf) ?? null;
}

function findAlunoPorNome(alunosRows: Aluno[], nome: string): Aluno | null {
  return alunosRows.find((a) => normalize(a.nome) === normalize(nome)) ?? null;
}

/* ============================================================
 * Validação
 * ============================================================ */

export async function validateAlunoImport(rows: ImportAlunoLine[], options: AlunoImportOptions): Promise<AlunoImportReport> {
  const items = parseAlunoRows(rows, options);
  const snap = await loadAlunoSnapshot(options.escolaId, options.anoLetivo ?? DEFAULT_ANO_LETIVO);

  const itens: AlunoReportItem[] = [];
  const resumoMap = new Map<string, AlunoResumoTurma>();

  for (const item of items) {
    const motivos = [...item.motivos];
    const avisos: string[] = item.avisos ? [...item.avisos] : [];

    // Bloqueio de escola incorreta: turma precisa existir na escola selecionada.
    let turmaRow: Turma | null = null;
    if (!options.turmaId) {
      turmaRow = findTurmaNoEscola(snap.turmas, item.turma, item.ano ?? undefined, item.turno ?? undefined);
      if (!turmaRow && motivos.length === 0) {
        motivos.push(`Turma "${item.turma}" não cadastrada nesta escola — importe antes a planilha de turmas`);
      }
    } else {
      turmaRow = snap.turmas.find((t) => t.id === options.turmaId) ?? null;
      if (turmaRow && item.turma && normalize(turmaRow.nome) !== normalize(item.turma)) {
        avisos.push(`Turma no arquivo ("${item.turma}") difere da turma selecionada ("${turmaRow.nome}") — usada a selecionada`);
      }
    }
    if (turmaRow && motivos.length === 0) pushConferenciaTurma(avisos, turmaRow, item);

    const status: AlunoReportItem["status"] = motivos.length > 0 ? "erro" : avisos.length > 0 ? "aviso" : "ok";
    itens.push({
      linha: item.linha,
      status,
      nome: item.nome,
      cpf: item.cpf,
      turma: options.turmaId && turmaRow ? turmaRow.nome : item.turma,
      turno: item.turno ?? "",
      motivos: motivos.length > 0 ? motivos : avisos.length > 0 ? avisos : [],
    });

    if (status === "erro") continue;

    if (turmaRow) {
      const key = `${turmaRow.nome}|${turmaRow.ano}|${turmaRow.turno}`;
      const prev = resumoMap.get(key) ?? { turma: turmaRow.nome, ano: turmaRow.ano, turno: turmaRow.turno, quantidade: 0 };
      prev.quantidade += 1;
      resumoMap.set(key, prev);
    }
  }

  return buildAlunoReport(itens, items, resumoMap);
}

/* ============================================================
 * Commit
 * ============================================================ */

export async function commitAlunoImport(rows: ImportAlunoLine[], options: AlunoImportOptions): Promise<AlunoImportReport> {
  const items = parseAlunoRows(rows, options);
  const anoLetivo = options.anoLetivo ?? DEFAULT_ANO_LETIVO;
  const snap = await loadAlunoSnapshot(options.escolaId, anoLetivo);

  const escrita: AlunoEscrita = {
    alunosCriados: 0,
    alunosAtualizados: 0,
    matriculasCriadas: 0,
    jaCadastrados: 0,
    ignorados: 0,
  };

  const resumoMap = new Map<string, AlunoResumoTurma>();

  // Senha padrão é a mesma para todos: calcula o hash uma única vez.
  const senhaHash = bcrypt.hashSync(STUDENT_DEFAULT_PASSWORD, 10);

  // Linhas ignoradas no commit (erros de parse ou turma fora da escola).
  let continuaIgnorados = 0;

  const escritasComplementos = new Map<number, string[]>();

  await db.transaction(async (tx) => {
    for (const item of items) {
      const motivos = [...item.motivos];
      const avisos: string[] = item.avisos ? [...item.avisos] : [];

      // ---- Turma (bloqueio de escola incorreta) ----
      let turmaRow: Turma | null = null;
      if (options.turmaId) {
        turmaRow = snap.turmas.find((t) => t.id === options.turmaId) ?? null;
        if (turmaRow && item.turma && normalize(turmaRow.nome) !== normalize(item.turma)) {
          avisos.push(`Turma no arquivo ("${item.turma}") difere da turma selecionada ("${turmaRow.nome}") — usada a selecionada`);
        }
      } else {
        turmaRow = findTurmaNoEscola(snap.turmas, item.turma, item.ano ?? undefined, item.turno ?? undefined);
        if (!turmaRow && motivos.length === 0) {
          motivos.push(`Turma "${item.turma}" não cadastrada nesta escola — importe antes a planilha de turmas`);
        }
      }
      if (turmaRow && motivos.length === 0) pushConferenciaTurma(avisos, turmaRow, item);
      escritasComplementos.set(item.linha, avisos);

      // Linha com erro: registra e não grava.
      if (motivos.length > 0) {
        continuaIgnorados++;
        continue;
      }

      // ---- Aluno (dedupe por CPF, fallback nome) ----
      let aluno = item.cpf ? findAlunoPorCPF(snap.alunos, item.cpf) : null;
      if (!aluno) aluno = findAlunoPorNome(snap.alunos, item.nome);

      let alunoId: string;

      if (aluno) {
        const patch: Partial<typeof alunos.$inferInsert> = {};
        if (item.cpf && aluno.cpf !== item.cpf) patch.cpf = item.cpf;
        if (item.inep && aluno.matricula !== item.inep) patch.matricula = item.inep;
        const dataNova = toDate(item.dataNascimento);
        const dataAtual = aluno.dataNascimento instanceof Date ? aluno.dataNascimento : toDate(String(aluno.dataNascimento ?? ""));
        if (dataNova && (!dataAtual || dataAtual.getTime() !== dataNova.getTime())) {
          patch.dataNascimento = dataNova;
        }
        if (item.sexo && aluno.sexo !== item.sexo) patch.sexo = item.sexo;
        if (item.etnia && aluno.etnia !== item.etnia) patch.etnia = item.etnia;
        if (item.bairro && aluno.bairro !== item.bairro) patch.bairro = item.bairro;
        if (item.numeroChamada !== null && aluno.numeroChamada === null) patch.numeroChamada = item.numeroChamada;
        if (!aluno.senhaHash) patch.senhaHash = senhaHash;
        if (Object.keys(patch).length > 0) {
          await tx.update(alunos).set(patch).where(eq(alunos.id, aluno.id));
          aluno = { ...aluno, ...patch };
        }
        alunoId = aluno.id;
      } else {
        const [novo] = await tx
          .insert(alunos)
          .values({
            nome: item.nome,
            cpf: item.cpf ?? undefined,
            matricula: item.inep ?? undefined,
            dataNascimento: toDate(item.dataNascimento) ?? undefined,
            numeroChamada: item.numeroChamada ?? undefined,
            sexo: item.sexo ?? undefined,
            etnia: item.etnia ?? undefined,
            bairro: item.bairro ?? undefined,
            senhaHash,
          })
          .returning();
        snap.alunos.push(novo);
        escrita.alunosCriados += 1;
        alunoId = novo.id;
      }

      // ---- Matrícula (idempotente: aluno + turma + ano letivo) ----
      const matriculaExistente = snap.matriculas.find(
        (m) => m.alunoId === alunoId && m.turmaId === turmaRow!.id && m.anoLetivo === anoLetivo
      );
      if (matriculaExistente) {
        escrita.jaCadastrados += 1;
      } else {
        await tx.insert(matriculas).values({
          alunoId,
          turmaId: turmaRow!.id,
          anoLetivo,
          status: "ativo",
        });
        snap.matriculas.push({
          id: "tmp",
          alunoId,
          turmaId: turmaRow!.id,
          anoLetivo,
          status: "ativo",
          createdAt: new Date(),
        });
        escrita.matriculasCriadas += 1;
        if (aluno) escrita.alunosAtualizados += 1;
      }

      const key = `${turmaRow!.nome}|${turmaRow!.ano}|${turmaRow!.turno}`;
      const prev = resumoMap.get(key) ?? { turma: turmaRow!.nome, ano: turmaRow!.ano, turno: turmaRow!.turno, quantidade: 0 };
      prev.quantidade += 1;
      resumoMap.set(key, prev);
    }
  });

  // Reporte pós-commit
  escrita.ignorados = continuaIgnorados;
  const itens: AlunoReportItem[] = items.map((item) => {
    const err = item.motivos.length > 0;
    const avisos = escritasComplementos.get(item.linha) ?? [];
    return {
      linha: item.linha,
      status: err ? "erro" : avisos.length > 0 ? "aviso" : "ok",
      nome: item.nome,
      cpf: item.cpf,
      turma: item.turma,
      turno: item.turno ?? "",
      motivos: err ? item.motivos : avisos,
    };
  });

  return buildAlunoReport(itens, items, resumoMap, escrita);
}

function buildAlunoReport(
  itens: AlunoReportItem[],
  items: ParsedAlunoRow[],
  resumo: Map<string, AlunoResumoTurma>,
  escrita?: AlunoEscrita
): AlunoImportReport {
  const validas = itens.filter((i) => i.status === "ok").length;
  const avisos = itens.filter((i) => i.status === "aviso").length;
  const erros = itens.filter((i) => i.status === "erro").length;

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