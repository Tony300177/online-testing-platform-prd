import { randomBytes } from "node:crypto";
import type { Prova } from "@/db/schema";

/** Combina classes CSS condicionalmente. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFormatter.format(d);
}

/** Formata nota no padrão brasileiro (8,5). */
export function formatScore(score: number | string | null | undefined): string {
  if (score === null || score === undefined || score === "") return "—";
  const n = typeof score === "string" ? Number(score) : score;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/** Gera um código de acesso curto e amigável (ex.: "K7M2QX9P"). */
const SLUG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateSlug(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

/** Normaliza texto para comparações (duplicidade de envio). */
export function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Prova considerada encerrada quando o prazo final expirou ou foi finalizada manualmente. */
export function isExamClosed(exam: Pick<Prova, "status" | "dataFim">): boolean {
  if (exam.status === "finished") return true;
  if (exam.dataFim && new Date(exam.dataFim).getTime() < Date.now()) return true;
  return false;
}

/** Prova ainda não liberada quando a data de início está no futuro. */
export function notYetOpen(exam: Pick<Prova, "dataInicio">): boolean {
  if (!exam.dataInicio) return false;
  return new Date(exam.dataInicio).getTime() > Date.now();
}

/** Monta o conteúdo de um arquivo CSV com BOM UTF-8 (abre direto no Excel). */
export function buildCsv(rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = rows.map((r) => r.map(escape).join(";")).join("\r\n");
  return `\uFEFF${body}`;
}

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
