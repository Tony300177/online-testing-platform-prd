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
import { ESCOLAS_MUNICIPAIS } from "@/lib/municipal-schools";
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
  CODIGO_ESCOLA: ["CODIGO ESCOLA", "CODIGO DA ESCOLA", "CODIGO", "Nº", "NUMERO", "NUM"],
  ESCOLA: ["ESCOLA", "NOME DA ESCOLA", "NOME DA UNIDADE", "UNIDADE", "NOME"],
  TURMA: ["TURMA", "NOME DA TURMA", "TURMA (NOME)", "CLASSE", "SALA"],
  ANO: ["ANO", "SERIE", "SÉRIE", "ANO/SERIE", "ANO E SERIE", "TURMA_ANO", "TURMA ANO"],
  TURNO: ["TURNO", "PERIODO", "PERÍODO", "PERIODO AULA", "HORARIO", "HORÁRIO"],
  PROFESSOR: ["PROFESSOR", "NOME DO PROFESSOR", "PROFESSOR (NOME)", "DOCENTE"],
};

export const CANONICAL_FIELDS = ["CODIGO_ESCOLA", "ESCOLA", "TURMA", "ANO", "TURNO", "PROFESSOR"] as const;
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

/* ============================================================
 * Ano/Série padronizado: Maternal I/II, Pré I/II, 1º–9º Ano
 * ============================================================ */

export const ANOS_SERIES = [
  "Maternal I",
  "Maternal II",
  "Pré I",
  "Pré II",
  "1º Ano",
  "2º Ano",
  "3º Ano",
  "4º Ano",
  "5º Ano",
  "6º Ano",
  "7º Ano",
  "8º Ano",
  "9º Ano",
] as const;

const ANO_ALIASES: Record<string, string> = {
  MATERNALI: "Maternal I",
  MATERNAL: "Maternal I",
  "MATERNAL I": "Maternal I",
  "MATERNAL 1": "Maternal I",
  "MATERNALII": "Maternal II",
  "MATERNAL 2": "Maternal II",
  "MATERNAL II": "Maternal II",
  "PREI": "Pré I",
  "PRE I": "Pré I",
  "PRE 1": "Pré I",
  "PREII": "Pré II",
  "PRE II": "Pré II",
  "PRE 2": "Pré II",
  "PRÉ I": "Pré I",
  "PRÉ II": "Pré II",
  "1º ANO": "1º Ano",
  "1": "1º Ano",
  "2º ANO": "2º Ano",
  "2": "2º Ano",
  "3º ANO": "3º Ano",
  "3": "3º Ano",
  "4º ANO": "4º Ano",
  "4": "4º Ano",
  "5º ANO": "5º Ano",
  "5": "5º Ano",
  "6º ANO": "6º Ano",
  "6": "6º Ano",
  "7º ANO": "7º Ano",
  "7": "7º Ano",
  "8º ANO": "8º Ano",
  "8": "8º Ano",
  "9º ANO": "9º Ano",
  "9": "9º Ano",
};

/** Normaliza uma string de ano/série para a forma canônica ("5ºA" → "5º Ano"). */
export function normalizeAnoSerie(value: string): string | null {
  if (!value) return null;
  const v = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "")
    .replace(/\s+/g, " ");
  if (!v) return null;
  // "5 A" / "1A" / "5 ANO" / "5o" / "5" → derive o ano
  const m = v.match(/^(\d{1,2})\s*[O]?\s*A?N?O?\s*$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 9) return `${n}º Ano`;
  }
  // "MATERNAL I", "MATERNALII", "MATERNAL 2" → Educação infantil
  const mi = v.match(/^MATERNAL\s*(I{1,2}|2)?$/);
  if (mi) return `Maternal ${mi[1] && (mi[1].length === 2 || mi[1] === "2") ? "II" : "I"}`;
  const pre = v.match(/^PRE\s*(I{1,2}|2)?$/);
  if (pre) return `Pré ${pre[1] && (pre[1].length === 2 || pre[1] === "2") ? "II" : "I"}`;
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
  turmasAtualizadas: number;
  ignoradas: number;
};

export type ImportReport = {
  ok: boolean;
  total: number;
  validas: number;
  avisos: number;
  erros: number;
  foraDaEscola?: number;
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

/** Encontra a unidade escolar oficial pelo código (01-19). */
function findOfficialSchool(codigo: number | null): { numero: number; nome: string } | null {
  if (codigo === null) return null;
  return ESCOLAS_MUNICIPAIS.find((e) => e.numero === codigo) ?? null;
}

/**
 * Filtra as linhas de uma planilha única da secretaria para a escola selecionada.
 * Linhas de outras escolas são simplesmente ignoradas (não viram erro). Quando nenhuma
 * escola é selecionada ("Todas as escolas"), nenhuma linha é removida.
 */
function filterRowsBySchool(
  rows: ImportLine[],
  escolaCodigo: number | null | undefined
): { rows: ImportLine[]; ignoradas: number } {
  if (escolaCodigo === null || escolaCodigo === undefined) return { rows, ignoradas: 0 };
  const oficial = findOfficialSchool(escolaCodigo);
  if (!oficial) return { rows, ignoradas: 0 };

  const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  const headerMap = mapHeaders(headers);
  const get = (field: ImportField, row: ImportLine): string => {
    const h = headerMap.get(field);
    return h ? cleanText(row[h]) : "";
  };

  let ignoradas = 0;
  const filtradas = rows.filter((row) => {
    const codigo = toInt(row[headerMap.get("CODIGO_ESCOLA") ?? ""]);
    const nome = get("ESCOLA", row).trim().toUpperCase();
    if (codigo !== null && codigo !== oficial.numero) {
      ignoradas += 1;
      return false;
    }
    if (codigo === null && nome) {
      const oficialPeloNome = ESCOLAS_MUNICIPAIS.find((e) => normalize(e.nome) === normalize(nome));
      if (oficialPeloNome && oficialPeloNome.numero !== oficial.numero) {
        ignoradas += 1;
        return false;
      }
    }
    return true;
  });
  return { rows: filtradas, ignoradas };
}

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

export function parseImportRows(
  rows: ImportLine[],
  anoLetivoDefault: number,
  escolaDefault?: string,
  escolaCodigoSelecionada?: number | null
): ParsedRow[] {
  const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];
  const headerMap = mapHeaders(headers);

  const get = (field: ImportField, row: ImportLine): string => {
    const h = headerMap.get(field);
    return h ? cleanText(row[h]) : "";
  };

  // Escola fixada no passo 1 do wizard (obrigatória): todo o lote é gravado nela.
  const escolaOficial =
    escolaCodigoSelecionada !== null && escolaCodigoSelecionada !== undefined
      ? findOfficialSchool(escolaCodigoSelecionada)
      : null;

  return rows.map((row, i) => {
    const linha = i + 2; // linha 1 é o cabeçalho
    const motivos: string[] = [];
    const avisos: string[] = [];

    const escolaCodigoPlanilha = toInt(row[headerMap.get("CODIGO_ESCOLA") ?? ""]);
    let escolaCodigo: number | null;
    let escola: string;

    if (escolaOficial) {
      // Wizard: escola já selecionada — força a escola alvo e valida código + nome da linha.
      escolaCodigo = escolaOficial.numero;
      escola = escolaOficial.nome;
      if (escolaCodigoPlanilha !== null && escolaCodigoPlanilha !== escolaOficial.numero) {
        motivos.push(
          `Linha é da escola ${String(escolaCodigoPlanilha).padStart(2, "0")}, mas a selecionada é ${String(escolaOficial.numero).padStart(2, "0")} (${escolaOficial.nome}). Selecione a escola correta ou envie a planilha desta unidade.`
        );
      }
      const nomePlanilhaEscola = get("ESCOLA", row).trim().toUpperCase();
      if (nomePlanilhaEscola) {
        const oficialPeloNome = ESCOLAS_MUNICIPAIS.find((e) => normalize(e.nome) === normalize(nomePlanilhaEscola));
        if (oficialPeloNome && oficialPeloNome.numero !== escolaOficial.numero) {
          motivos.push(
            `ESCOLA "${nomePlanilhaEscola}" pertence a outra unidade (${String(oficialPeloNome.numero).padStart(2, "0")}). Linha fora da escola selecionada (${escolaOficial.nome}).`
          );
        } else if (!oficialPeloNome && normalize(nomePlanilhaEscola) !== normalize(escolaOficial.nome)) {
          avisos.push(`Escola no arquivo difere da oficial: "${nomePlanilhaEscola}" → usada "${escolaOficial.nome}"`);
        }
      }
    } else {
      // Caminho legado: escola vem do CÓDIGO/ESCOLA da própria planilha.
      const oficial = findOfficialSchool(escolaCodigoPlanilha);
      escolaCodigo = oficial ? oficial.numero : escolaCodigoPlanilha;
      escola = oficial
        ? oficial.nome
        : get("ESCOLA", row).toUpperCase() || (escolaDefault ? escolaDefault.toUpperCase() : "");
      if (oficial) {
        const nomePlanilha = get("ESCOLA", row).trim().toUpperCase();
        if (nomePlanilha && normalize(nomePlanilha) !== normalize(oficial.nome)) {
          avisos.push(`Escola no arquivo difere da oficial: "${nomePlanilha}" → usada "${oficial.nome}"`);
        }
      } else if (escolaCodigoPlanilha !== null) {
        motivos.push(`CÓDIGO de escola ${escolaCodigoPlanilha} não consta nas 19 unidades municipais`);
      } else if (escola.length < 3) {
        motivos.push("NOME da escola ausente ou muito curto");
      }
    }

    const turmaRaw = get("TURMA", row).toUpperCase();
    const anoRaw = get("ANO", row);
    const turno = normalizeTurno(get("TURNO", row));
    const anoLetivo = anoLetivoDefault;
    const professorRaw = get("PROFESSOR", row);
    const professor = stripPrefix(professorRaw).toUpperCase();
    const professorCodigo = toInt(professorRaw.split(/\s*-\s*/)[0]);

    // Ano/série: usa a coluna ANO; se ausente, tira do nome da turma ("5ºA" → "5º Ano").
    const turmaMatch = turmaRaw.match(/^(\d+)\s*[ºo°]?\s*(.*)$/i);
    const ano = normalizeAnoSerie(anoRaw) ?? (turmaMatch ? normalizeAnoSerie(turmaMatch[1]) ?? `${turmaMatch[1]}º Ano` : null) ?? anoRaw;

    if (turmaRaw.length < 2) motivos.push("TURMA ausente ou muito curta");
    if (!ano || !ano.trim()) motivos.push("ANO ausente ou inválido");
    else if (!(ANOS_SERIES as readonly string[]).includes(ano)) motivos.push(`ANO "${ano}" não permitido`);
    if (!turno) motivos.push("TURNO ausente ou inválido");
    // PROFESSOR é opcional (pode vir vazio na planilha da secretaria).

    return {
      linha,
      escola,
      escolaCodigo,
      turma: turmaRaw,
      ano: ano || anoRaw,
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
export async function validateImport(
  rows: ImportLine[],
  anoLetivoDefault = DEFAULT_ANO_LETIVO,
  escolaDefault?: string,
  escolaCodigoSelecionada?: number | null
): Promise<ImportReport> {
  const { rows: rowsFiltradas, ignoradas } = filterRowsBySchool(rows, escolaCodigoSelecionada);
  const items = parseImportRows(rowsFiltradas, anoLetivoDefault, escolaDefault, escolaCodigoSelecionada);
  const snap = await loadSnapshot(anoLetivoDefault);

  const itens: ReportItem[] = [];
  const seenTurma = new Set<string>();
  const professorCodeByName = new Map<string, number>();

  for (const item of items) {
    const motivos = [...item.motivos];
    const avisos = [...item.avisos];

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

  return buildReport(itens, items, anoLetivoDefault, undefined, ignoradas);
}

/** Valida e grava de forma idempotente. */
export async function commitImport(
  rows: ImportLine[],
  anoLetivoDefault = DEFAULT_ANO_LETIVO,
  escolaDefault?: string,
  escolaCodigoSelecionada?: number | null
): Promise<ImportReport> {
  const { rows: rowsFiltradas, ignoradas } = filterRowsBySchool(rows, escolaCodigoSelecionada);
  const items = parseImportRows(rowsFiltradas, anoLetivoDefault, escolaDefault, escolaCodigoSelecionada);
  const snap = await loadSnapshot(anoLetivoDefault);

  const itens: ReportItem[] = [];
  const escrita: Escrita = {
    escolasCriadas: 0,
    professoresCriados: 0,
    turmasCriadas: 0,
    turmasAtualizadas: 0,
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
        motivos: [...item.motivos, ...item.avisos],
      };

      if (item.motivos.length > 0) {
        itens.push({ ...base, status: "erro", motivos: [...item.motivos] });
        continue;
      }

      // ---- Escola (prefere o código oficial 01-19) ----
      let escola = [...escolaById.values()].find(
        (e) =>
          (item.escolaCodigo !== null && e.codigo === item.escolaCodigo) ||
          normalize(e.nome) === normalize(item.escola)
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

      // ---- Professor (opcional) ----
      let professor: Professor | null = null;
      if (item.professor) {
        professor =
          [...professorById.values()].find(
            (p) => (item.professorCodigo !== null && p.codigo === item.professorCodigo) || normalize(p.nome) === normalize(item.professor)
          ) ?? null;
        if (!professor) {
          const [ins] = await tx
            .insert(professores)
            .values({ nome: item.professor, codigo: item.professorCodigo ?? undefined })
            .returning();
          professor = ins;
          professorById.set(ins.id, ins);
          escrita.professoresCriados += 1;
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
            ano: item.ano,
            turno: item.turno!,
            professor: professor?.nome ?? null,
            professorCodigo: professor?.codigo ?? undefined,
            professorId: professor?.id ?? undefined,
            anoLetivo: item.anoLetivo,
          })
          .returning();
        turma = ins;
        turmaById.set(ins.id, ins);
        escrita.turmasCriadas += 1;
        itens.push({ ...base, status: "ok" });
      } else {
        // Importação inteligente: detecta o que mudou para marcar como atualiizada/nova campo.
        const patch: Partial<typeof turmas.$inferInsert> = {};
        if (item.turno && turma.turno !== item.turno) patch.turno = item.turno;
        if (turma.ano !== item.ano) patch.ano = item.ano;
        if (professor && turma.professorId !== professor.id) {
          patch.professorId = professor.id;
          patch.professor = professor.nome;
          patch.professorCodigo = professor.codigo ?? undefined;
        }
        if (Object.keys(patch).length > 0) {
          await tx.update(turmas).set(patch).where(eq(turmas.id, turma.id));
          turma = { ...turma, ...patch };
          turmaById.set(turma.id, turma);
          escrita.turmasAtualizadas += 1;
          itens.push({ ...base, status: "aviso", motivos: ["Turma já cadastrada — dados atualizados"] });
        } else {
          escrita.ignoradas += 1;
          itens.push({ ...base, status: "aviso", motivos: ["Turma já cadastrada — mantida como está"] });
        }
      }
    }
  });

  return buildReport(itens, items, anoLetivoDefault, escrita, ignoradas);
}

function buildReport(
  itens: ReportItem[],
  items: ParsedRow[],
  anoLetivo: number,
  escrita?: Escrita,
  foraDaEscola = 0
): ImportReport {
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
    total: items.length + foraDaEscola,
    validas,
    avisos,
    erros,
    foraDaEscola: foraDaEscola > 0 ? foraDaEscola : undefined,
    itens,
    resumo: Array.from(resumo.values()),
    ...(escrita ? { escrita } : {}),
  };
}