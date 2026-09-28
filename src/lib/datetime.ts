/**
 * Fonte unica de verdade de fuso horario e calendario da plataforma.
 *
 * Toda data/hora entra e sai daqui. Nenhum outro arquivo deve chamar
 * `new Date(string)` sobre valor vindo de `<input type="datetime-local">`,
 * nem usar `getHours()`/`getMonth()` para montar valor de calendario.
 *
 * Regra: `APP_TZ` e constante de proposito. Uma variavel de ambiente
 * pareceria mais flexivel, mas `process.env` nao existe no bundle do
 * cliente Next.js — a constante garante que servidor e cliente interpretam
 * a mesma hora de parede.
 *
 * O banco armazena tudo em `timestamptz` (instante absoluto, UTC). A
 * conversao para "14:30" acontece so na borda: entrada do formulario e
 * saida de exibicao.
 */

/** Fuso de exibicao e de interpretacao de hora de parede. */
export const APP_TZ = "America/Cuiaba";

const PARTS_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(): Intl.DateTimeFormat {
  let f = PARTS_CACHE.get("probe");
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PARTS_CACHE.set("probe", f);
  }
  return f;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Le os componentes de uma data ja deslocada para APP_TZ. */
function wallClockInAppTz(d: Date): WallClock {
  const out: Partial<WallClock> = {};
  for (const p of partsFormatter().formatToParts(d)) {
    if (p.type === "year") out.year = Number(p.value);
    else if (p.type === "month") out.month = Number(p.value);
    else if (p.type === "day") out.day = Number(p.value);
    else if (p.type === "hour") out.hour = Number(p.value);
    else if (p.type === "minute") out.minute = Number(p.value);
    else if (p.type === "second") out.second = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    // Alguns runtimes de ICU devolvem "24" para meia-noite mesmo com h23.
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Deslocamento em ms que APP_TZ aplica a um instante, sinal incluido. */
function appTzOffsetMs(instant: Date): number {
  const w = wallClockInAppTz(instant);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Arredonda para o segundo: formatToParts nao tem milissegundo.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Converte hora de parede de APP_TZ no instante UTC correspondente.
 *
 * Duas passadas: a primeira estimativa pode cair do lado errado de uma
 * transicao de horario de summer; a segunda corrige. America/Cuiaba nao usa
 * horario de summer desde 2019, mas a logica nao deve depender disso.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = appTzOffsetMs(new Date(guess));
  const corrected = guess - firstOffset;
  const secondOffset = appTzOffsetMs(new Date(corrected));
  return new Date(guess - secondOffset);
}

/** `YYYY-MM-DD` a partir de componentes de calendario. */
export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** `YYYY-MM-DDTHH:mm`, formato aceito por `<input type="datetime-local">`. */
export function toLocalInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const w = wallClockInAppTz(d);
  return `${ymd(w.year, w.month, w.day)}T${pad2(w.hour)}:${pad2(w.minute)}`;
}

/** `YYYY-MM-DD` do calendario de APP_TZ. */
export function toLocalDateValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const w = wallClockInAppTz(d);
  return ymd(w.year, w.month, w.day);
}

/** Data civil de APP_TZ (meia-noite local) a partir de componentes. */
export function ymdToDate(year: number, month: number, day: number): Date {
  return zonedTimeToUtc(year, month, day, 0, 0, 0);
}

/** "`YYYY-MM-DD` a partir de `dd/mm/aaaa` ou de serial do Excel." */
export function parseLocalDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Serial do Excel, epoca 1899-12-30 (UTC).
    const d = new Date(Math.round((value - 25569) * 86400000));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return ymd(Number(yyyy), Number(mm), Number(dd));
  }

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return ymd(Number(yyyy), Number(mm), Number(dd));
  }

  return null;
}

const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const NAIVE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Ponto unico de entrada de data/hora vinda de formulario.
 *
 * - `2026-03-10T14:30` (naixo, vem de `datetime-local`): lido como hora de
 *   parede de APP_TZ, convertido para o instante UTC correto.
 * - `2026-03-10T17:30:00.000Z` ou `...-04:00`: respeitado o offset declarado.
 * - `2026-03-10`: meia-noite em APP_TZ.
 *
 * `new Date()` sozinho NAO serve aqui: para o primeiro caso ele usa o fuso
 * do processo, que difere entre desenvolvimento e producao.
 */
export function parseLocalInput(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;

  const s = value.trim();
  if (!s) return null;

  if (!HAS_OFFSET.test(s)) {
    const naive = NAIVE_DATETIME.exec(s);
    if (naive) {
      return zonedTimeToUtc(
        Number(naive[1]),
        Number(naive[2]),
        Number(naive[3]),
        Number(naive[4]),
        Number(naive[5]),
      naive[6] ? Number(naive[6]) : 0
      );
    }
    const bareDate = NAIVE_DATE.exec(s);
    if (bareDate) {
      return ymdToDate(Number(bareDate[1]), Number(bareDate[2]), Number(bareDate[3]));
    }
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Intervalo semiaberto [start, endExclusive) do dia `YYYY-MM-DD` em APP_TZ. */
export function dayBoundsUtc(day: string): { start: Date; endExclusive: Date } | null {
  const m = NAIVE_DATE.exec(day.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return { start: ymdToDate(y, mo, d), endExclusive: ymdToDate(y, mo, d + 1) };
}

/** "Hoje" no calendario de APP_TZ, como `YYYY-MM-DD`. */
export function todayInAppTz(now: Date = new Date()): string {
  return toLocalDateValue(now);
}

/** Ano corrente no calendario de APP_TZ. */
export function currentYearInAppTz(now: Date = new Date()): number {
  return wallClockInAppTz(now).year;
}

const DISPLAY_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DISPLAY_DATETIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TZ,
  hourCycle: "h23",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `dd/mm/aaaa` no calendario de APP_TZ. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string") {
    const bare = NAIVE_DATE.exec(value.trim());
    if (bare) return `${bare[3]}/${bare[2]}/${bare[1]}`;
  }
  const d = toDate(value);
  if (!d) return "—";
  return DISPLAY_DATE.format(d);
}

/** `dd/mm/aaaa HH:mm` no calendario de APP_TZ. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = toDate(value);
  if (!d) return "—";
  return DISPLAY_DATETIME.format(d).replace(",", "");
}
