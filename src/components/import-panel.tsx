"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Rocket,
  Upload,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Conjunto de cabeçalhos conhecidos para auto-detecção (normalizados: uppercase, sem acento, sem ºª)
const KNOWN_HEADER_SET = new Set([
  "CODIGO ESCOLA", "CODIGO DA ESCOLA", "CODIGO", "N", "NUMERO", "NUM",
  "ESCOLA", "NOME DA ESCOLA", "NOME DA UNIDADE", "UNIDADE",
  "TURMA", "NOME DA TURMA", "CLASSE", "SALA",
  "ANO", "SERIE", "ANO/SERIE", "ANO E SERIE", "TURMA ANO",
  "TURNO", "PERIODO", "PERIODO AULA", "HORARIO",
  "PROFESSOR", "NOME DO PROFESSOR", "DOCENTE",
]);

type ImportReport = {
  ok: boolean;
  total: number;
  validas: number;
  avisos: number;
  erros: number;
  itens: {
    linha: number;
    status: "ok" | "aviso" | "erro";
    escola: string;
    turma: string;
    ano: string;
    turno: string;
    professor: string;
    motivos: string[];
  }[];
  resumo: { escola: string; turma: string; ano: string; turno: string; professor: string }[];
  escrita?: {
    escolasCriadas: number;
    professoresCriados: number;
    turmasCriadas: number;
    turmasAtualizadas: number;
    ignoradas: number;
  };
};

type FileState = { name: string; size: number; rows: Record<string, string | number | null | undefined>[]; escola: string };

const TEMPLATE_HEADERS = [
  "CÓDIGO ESCOLA",
  "ESCOLA",
  "NOME DA TURMA",
  "ANO/SÉRIE",
  "TURNO",
  "PROFESSOR",
];

const TEMPLATE_EXAMPLE = [
  "11",
  "CEM VASCO PAPA",
  "5º A",
  "5º Ano",
  "Matutino",
  "JANETE FRANCISCA DA SILVA",
];

const ANOS_SERIES_TEMPLATE = [
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
];

const TURNOS_TEMPLATE = ["Matutino", "Vespertino", "Noturno", "Integral"];

function downloadExcel(headers: string[], example: string[]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([Object.fromEntries(headers.map((h, i) => [h, example[i]]))]);
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  const wsAux = XLSX.utils.aoa_to_sheet([["Anos/Séries aceitos", ""], ...ANOS_SERIES_TEMPLATE.map((a) => [a])]);
  XLSX.utils.book_append_sheet(wb, wsAux, "Anos e Séries");
  const wsTurnos = XLSX.utils.aoa_to_sheet([["Turnos aceitos", ""], ...TURNOS_TEMPLATE.map((t) => [t])]);
  XLSX.utils.book_append_sheet(wb, wsTurnos, "Turnos");
  XLSX.writeFile(wb, "modelo-importacao-turmas.xlsx");
}

function buildErrorCsv(report: ImportReport): string {
  const lines: string[][] = [
    ["Linha", "Escola", "Turma", "Ano", "Turno", "Professor", "Status", "Motivo"],
    ...report.itens
      .filter((i) => i.status === "erro")
      .map((i) => [String(i.linha), i.escola, i.turma, i.ano, i.turno, i.professor, "Erro", i.motivos.join("; ")]),
    ...report.itens
      .filter((i) => i.status === "aviso")
      .map((i) => [String(i.linha), i.escola, i.turma, i.ano, i.turno, i.professor, "Aviso", i.motivos.join("; ")]),
  ];
  const escape = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = lines.map((r) => r.map(escape).join(";")).join("\r\n");
  return `\uFEFF${body}`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<FileState | null>(null);
  const [anoLetivo, setAnoLetivo] = useState<number>(2026);
  const [busy, setBusy] = useState<"validar" | "publicar" | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");

  const parseFile = useCallback(async (f: File) => {
    setError("");
    setReport(null);
    setPublished(false);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Planilha vazia ou sem abas.");

      // Lê todas as linhas como arrays para detectar onde está o cabeçalho
      const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (raw.length < 2) throw new Error("Nenhuma linha de dados encontrada.");

      // Detecta a linha do cabeçalho (pula linhas de título)
      const headerIdx = raw.findIndex((row) => {
        const recognized = row.filter((c: unknown) => {
          if (typeof c !== "string" || !c.trim()) return false;
          const norm = c.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ºª]/g, "").replace(/\s+/g, " ").trim();
          return norm.length >= 2 && KNOWN_HEADER_SET.has(norm);
        }).length;
        return recognized >= 3;
      });

      if (headerIdx < 0) throw new Error("Não foi possível identificar as colunas na planilha. Verifique se os cabeçalhos estão na segunda linha.");

      // Reconstrói a partir da linha de cabeçalho
      const headers = raw[headerIdx].map((h: unknown) => String(h || "").trim());
      const dataRows = raw.slice(headerIdx + 1).filter((row: unknown[]) => row.some((c: unknown) => c !== "" && c !== null));

      // Extrai nome da escola das linhas de título (antes do cabeçalho)
      let escolaDetectada = "";
      for (let r = 0; r < headerIdx; r++) {
        const cells = raw[r];
        if (!cells) continue;
        for (const c of cells) {
          if (typeof c === "string" && c.trim().length >= 3 && !/^\d+$/.test(c.trim())) {
            escolaDetectada = c.trim().toUpperCase();
            break;
          }
        }
        if (escolaDetectada) break;
      }

      const rows: Record<string, string | number | null | undefined>[] = dataRows.map((row: unknown[]) => {
        const obj: Record<string, string | number | null | undefined> = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
        });
        return obj;
      });

      if (rows.length === 0) throw new Error("Nenhuma linha de dados encontrada após o cabeçalho.");
      setFile({ name: f.name, size: f.size, rows, escola: escolaDetectada });
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  }, []);

  async function runValidation() {
    if (!file) return;
    setBusy("validar");
    setError("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: file.rows, escola: file.escola, anoLetivo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao validar.");
        return;
      }
      setReport(data.report);
      setPublished(false);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!file || !report) return;
    setBusy("publicar");
    setError("");
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: file.rows, escola: file.escola, anoLetivo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao publicar.");
        return;
      }
      setReport(data.report);
      setPublished(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Modelo */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <Info className="h-4 w-4" /> Modelo de planilha
          </h2>
          <p className="mt-0.5 text-xs text-indigo-700">
            Colunas: CÓDIGO ESCOLA, ESCOLA, NOME DA TURMA, ANO/SÉRIE, TURNO e PROFESSOR (uma linha por turma).
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadExcel(TEMPLATE_HEADERS, TEMPLATE_EXAMPLE)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          <Download className="h-3.5 w-3.5" /> Baixar modelo Excel
        </button>
      </div>

      {/* Ano letivo */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <label htmlFor="ano-letivo" className="text-sm font-semibold text-slate-700">
          Ano letivo
        </label>
        <select
          id="ano-letivo"
          value={anoLetivo}
          onChange={(e) => setAnoLetivo(Number(e.target.value))}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          {[2026, 2027, 2025].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">As turmas serão vinculadas ao ano letivo selecionado.</p>
      </div>

      {/* Upload */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void parseFile(f);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40"
      >
        <FileSpreadsheet className="h-10 w-10 text-indigo-500" />
        <p className="text-sm font-semibold text-slate-700">
          {file ? file.name : "Arraste a planilha do Vasco Papa ou clique para selecionar"}
        </p>
        <p className="text-xs text-slate-400">Aceita .xlsx e .xls · máximo 5.000 linhas</p>
        {file && (
          <p className="text-xs text-slate-500">
            {file.rows.length} linha(s) de dados · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void parseFile(f);
          }}
        />
      </div>

      {file && !report && (
        <button
          type="button"
          onClick={() => void runValidation()}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy === "validar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy === "validar" ? "Validando..." : "Validar planilha"}
        </button>
      )}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      {/* Relatório */}
      {report && (
        <div className="space-y-6">
          {/* Métricas */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard tone="bg-slate-100 text-slate-700" label="Total de linhas" value={String(report.total)} icon={<FileSpreadsheet className="h-4 w-4" />} />
            <MetricCard tone="bg-emerald-100 text-emerald-700" label="Válidas" value={String(report.validas)} icon={<CheckCircle2 className="h-4 w-4" />} />
            <MetricCard tone="bg-amber-100 text-amber-700" label="Avisos" value={String(report.avisos)} icon={<AlertTriangle className="h-4 w-4" />} />
            <MetricCard tone="bg-rose-100 text-rose-700" label="Erros" value={String(report.erros)} icon={<XCircle className="h-4 w-4" />} />
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-2">
            {!published ? (
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy !== null || report.erros > 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                title={report.erros > 0 ? "Corrija os erros na planilha antes de publicar." : "Publicar no Supabase"}
              >
                {busy === "publicar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {busy === "publicar" ? "Publicando..." : "Publicar no Supabase"}
              </button>
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Dados publicados com sucesso.
              </p>
            )}
            <button
              type="button"
              onClick={() => downloadCsv(buildErrorCsv(report), `validacao-${new Date().toISOString().slice(0, 10)}.csv`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Baixar CSV de validação
            </button>
            <button
              type="button"
              onClick={() => {
                setReport(null);
                setFile(null);
                setPublished(false);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Limpar
            </button>
          </div>

          {/* Resumo por turma */}
          {report.resumo.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="text-sm font-bold text-slate-900">Resumo por turma</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Escola</th>
                    <th className="px-4 py-2.5 font-semibold">Turma</th>
                    <th className="px-4 py-2.5 font-semibold">Ano</th>
                    <th className="px-4 py-2.5 font-semibold">Turno</th>
                    <th className="px-4 py-2.5 font-semibold">Professor</th>
                  </tr>
                </thead>
                <tbody>
                  {report.resumo.map((r) => (
                    <tr key={`${r.escola}-${r.turma}`} className="border-b border-slate-50">
                      <td className="px-4 py-2.5 text-slate-700">{r.escola}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{r.turma}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.ano}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.turno}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r.professor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Escrita */}
          {published && report.escrita && (
            <div className="grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <WriteStat label="Escolas criadas" value={report.escrita.escolasCriadas} accent="text-emerald-700" />
              <WriteStat label="Professores criados" value={report.escrita.professoresCriados} accent="text-emerald-700" />
              <WriteStat label="Novas turmas" value={report.escrita.turmasCriadas} accent="text-blue-700" />
              <WriteStat label="Turmas atualizadas" value={report.escrita.turmasAtualizadas} accent="text-indigo-700" />
              <WriteStat label="Turmas já existentes (mantidas)" value={report.escrita.ignoradas} accent="text-slate-600" />
            </div>
          )}

          {/* Erros linha a linha */}
          {report.itens.some((i) => i.status === "erro") && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-rose-700">
                  <XCircle className="h-4 w-4" /> Erros ({report.erros})
                </h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Linha</th>
                    <th className="px-4 py-2.5 font-semibold">Escola</th>
                    <th className="px-4 py-2.5 font-semibold">Turma</th>
                    <th className="px-4 py-2.5 font-semibold">Ano</th>
                    <th className="px-4 py-2.5 font-semibold">Turno</th>
                    <th className="px-4 py-2.5 font-semibold">Professor</th>
                    <th className="px-4 py-2.5 font-semibold">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.itens
                    .filter((i) => i.status === "erro")
                    .map((i) => (
                      <tr key={`e${i.linha}`} className="border-b border-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{i.linha}</td>
                        <td className="px-4 py-2.5 text-slate-700">{i.escola}</td>
                        <td className="px-4 py-2.5 text-slate-700">{i.turma}</td>
                        <td className="px-4 py-2.5 text-slate-500">{i.ano}</td>
                        <td className="px-4 py-2.5 text-slate-500">{i.turno}</td>
                        <td className="px-4 py-2.5 text-slate-700">{i.professor}</td>
                        <td className="px-4 py-2.5">
                          {i.motivos.map((m, idx) => (
                            <p key={idx} className="text-rose-600">
                              {m}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Avisos linha a linha */}
          {report.itens.some((i) => i.status === "aviso") && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-amber-700">
                  <AlertTriangle className="h-4 w-4" /> Avisos ({report.avisos})
                </h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Linha</th>
                    <th className="px-4 py-2.5 font-semibold">Escola</th>
                    <th className="px-4 py-2.5 font-semibold">Turma</th>
                    <th className="px-4 py-2.5 font-semibold">Ano</th>
                    <th className="px-4 py-2.5 font-semibold">Turno</th>
                    <th className="px-4 py-2.5 font-semibold">Professor</th>
                    <th className="px-4 py-2.5 font-semibold">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {report.itens
                    .filter((i) => i.status === "aviso")
                    .map((i) => (
                      <tr key={`a${i.linha}`} className="border-b border-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{i.linha}</td>
                        <td className="px-4 py-2.5 text-slate-700">{i.escola}</td>
                        <td className="px-4 py-2.5 text-slate-700">{i.turma}</td>
                        <td className="px-4 py-2.5 text-slate-500">{i.ano}</td>
                        <td className="px-4 py-2.5 text-slate-500">{i.turno}</td>
                        <td className="px-4 py-2.5 text-slate-700">{i.professor}</td>
                        <td className="px-4 py-2.5">
                          {i.motivos.map((m, idx) => (
                            <p key={idx} className="text-amber-700">
                              {m}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
      <div>
        <p className="text-2xl font-extrabold text-slate-900">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function WriteStat({ label, value, accent = "text-emerald-700" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3">
      <p className={cn("text-lg font-extrabold", accent)}>{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}