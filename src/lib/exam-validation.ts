import { and, eq } from "drizzle-orm";
import type { Prova } from "@/db/schema";
import { db } from "@/db";
import { turmas } from "@/db/schema";

export type AlternativaInput = { letra: string; texto: string; correta: boolean };

export type QuestaoInput = {
  pergunta: string;
  tipo: "multiple" | "essay";
  valor: number;
  alternativas: AlternativaInput[];
};

export type ProvaInput = {
  titulo: string;
  disciplina: string;
  turma: string;
  escolaId: string | null;
  instrucoes: string;
  dataInicio: Date | null;
  dataFim: Date | null;
  tempoMinutos: number | null;
  questoes: QuestaoInput[];
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNumber(v: unknown, fallback = 1): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Normaliza e valida o payload de criação/edição de prova. */
export function parseProvaPayload(body: unknown): { ok: true; value: ProvaInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const titulo = asString(b.titulo);
  if (titulo.length < 3) errors.push("Informe um título para a prova.");

  const disciplina = asString(b.disciplina);
  const turma = asString(b.turma);
  const instrucoes = asString(b.instrucoes);

  const escolaId =
    typeof b.escolaId === "string" && b.escolaId.trim().length > 0 ? b.escolaId.trim() : null;

  const toDate = (v: unknown): Date | null => {
    const s = asString(v);
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dataInicio = toDate(b.dataInicio);
  const dataFim = toDate(b.dataFim);

  const tempoMinutos =
    typeof b.tempoMinutos === "number" && Number.isFinite(b.tempoMinutos) && b.tempoMinutos > 0
      ? Math.min(Math.floor(b.tempoMinutos), 999)
      : null;

  const rawQuestoes = Array.isArray(b.questoes) ? b.questoes : [];
  const parsedQuestoes: QuestaoInput[] = [];

  if (rawQuestoes.length === 0) {
    errors.push("Adicione pelo menos uma questão.");
  } else {
    rawQuestoes.forEach((q, i) => {
      const item = (q ?? {}) as Record<string, unknown>;
      const pergunta = asString(item.pergunta);
      if (!pergunta) {
        errors.push(`A questão ${i + 1} está sem enunciado.`);
        return;
      }
      const tipo = asString(item.tipo) === "essay" ? "essay" : "multiple";
      const valor = asNumber(item.valor, 1);

      if (tipo === "essay") {
        parsedQuestoes.push({ pergunta, tipo, valor, alternativas: [] });
        return;
      }

      const rawAlts = Array.isArray(item.alternativas) ? item.alternativas : [];
      const alternativas: AlternativaInput[] = [];
      for (let ai = 0; ai < rawAlts.length; ai++) {
        const alt = (rawAlts[ai] ?? {}) as Record<string, unknown>;
        const texto = asString(alt.texto);
        if (!texto) continue;
        alternativas.push({
          letra: asString(alt.letra) || String.fromCharCode(65 + ai),
          texto,
          correta: alt.correta === true,
        });
      }

      if (alternativas.length < 2) {
        errors.push(`A questão ${i + 1} precisa de pelo menos 2 alternativas preenchidas.`);
        return;
      }
      if (alternativas.filter((a) => a.correta).length !== 1) {
        errors.push(`Marque a alternativa correta da questão ${i + 1}.`);
        return;
      }
      parsedQuestoes.push({ pergunta, tipo, valor, alternativas });
    });
  }

  if (parsedQuestoes.length === 0 && errors.length === 0) {
    errors.push("Adicione pelo menos uma questão válida.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { titulo, disciplina, turma, escolaId, instrucoes, dataInicio, dataFim, tempoMinutos, questoes: parsedQuestoes },
  };
}

/** Validação rápida de status/publicação. */
export function validateDeadlineForPublish(dataFim: Date | null): string | null {
  if (dataFim && dataFim.getTime() < Date.now()) {
    return "A data final precisa estar no futuro para publicar a prova.";
  }
  return null;
}

export function isDraft(prova: Pick<Prova, "status">): boolean {
  return prova.status === "draft";
}

/** Resolve a turma (UUID) a partir da escola e do nome da turma informados. */
export async function resolveTurmaId(escolaId: string | null, turma: string): Promise<string | null> {
  if (!escolaId || !turma) return null;
  const [row] = await db
    .select({ id: turmas.id })
    .from(turmas)
    .where(and(eq(turmas.escolaId, escolaId), eq(turmas.nome, turma)))
    .limit(1);
  return row?.id ?? null;
}

/** Tamanho máximo do PDF da prova (limite de corpo do Vercel é 4.5MB). */
export const MAX_PDF_BYTES = 4_000_000;

export type ProvaPdfInput = { name: string; data: string; size: number };

export type ProvaRequestParsed = {
  value: ProvaInput;
  publish: boolean;
  pdf: ProvaPdfInput | null;
  removePdf: boolean;
};

/**
 * Lê e valida o corpo da requisição de criação/edição de prova.
 * Aceita tanto JSON (compatibilidade) quanto multipart/form-data (upload de PDF).
 */
export async function parseProvaRequest(
  req: Request
): Promise<{ ok: true; parsed: ProvaRequestParsed } | { ok: false; status: number; error: string }> {
  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let body: Record<string, unknown>;
  let publish = false;
  let removePdf = false;
  let pdfFile: File | null = null;

  if (isMultipart) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return { ok: false, status: 400, error: "Não foi possível ler o envio da prova." };
    let questoes: unknown = [];
    const rawQuestoes = fd.get("questoes");
    if (rawQuestoes) {
      try {
        questoes = JSON.parse(String(rawQuestoes));
      } catch {
        return { ok: false, status: 400, error: "Dados das questões inválidos." };
      }
    }
    body = {
      titulo: fd.get("titulo"),
      disciplina: fd.get("disciplina"),
      turma: fd.get("turma"),
      escolaId: fd.get("escolaId"),
      instrucoes: fd.get("instrucoes"),
      dataInicio: fd.get("dataInicio"),
      dataFim: fd.get("dataFim"),
      tempoMinutos: fd.get("tempoMinutos") ? Number(fd.get("tempoMinutos")) : null,
      questoes,
    };
    publish = fd.get("publish") === "1" || fd.get("publish") === "true";
    removePdf = fd.get("removePdf") === "1" || fd.get("removePdf") === "true";
    const file = fd.get("pdf");
    if (file && typeof file === "object" && "arrayBuffer" in file) pdfFile = file as File;
  } else {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    publish = body.publish === true || body.status === "active";
    removePdf = body.removePdf === true;
  }

  const parsed = parseProvaPayload(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.errors.join(" ") };
  const { value } = parsed;

  let pdf: ProvaPdfInput | null = null;
  if (pdfFile) {
    if (pdfFile.size === 0) return { ok: false, status: 400, error: "O arquivo PDF está vazio." };
    if (!pdfFile.name.toLowerCase().endsWith(".pdf")) {
      return { ok: false, status: 400, error: "Envie um arquivo no formato PDF." };
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
      return { ok: false, status: 400, error: "O arquivo PDF deve ter no máximo 4 MB." };
    }
    const buf = Buffer.from(await pdfFile.arrayBuffer());
    if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return { ok: false, status: 400, error: "O arquivo enviado não é um PDF válido." };
    }
    pdf = { name: pdfFile.name, data: buf.toString("base64"), size: buf.length };
  }

  return { ok: true, parsed: { value, publish, pdf, removePdf } };
}