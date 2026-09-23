"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Info,
  Loader2,
  Rocket,
  School,
  Upload,
  XCircle,
  Users,
} from "lucide-react";
import { ESCOLAS_MUNICIPAIS, escolaLabel, escolaTipo } from "@/lib/municipal-schools";
import { cn } from "@/lib/utils";

// Cabeçalhos típicos da planilha de ALUNOS — usados para sugerir a guia correta.
const ALUNO_SMELL_HEADERS = new Set(
  [
    "NOME DO ALUNO", "ALUNO", "NOME COMPLETO",
    "INEP", "INEP DO ALUNO", "CPF", "CPF DO ALUNO",
    "MATRICULA", "Nº MATRICULA", "Nº CHAMADA", "NUMERO CHAMADA",
    "DATA DE NASCIMENTO", "NASCIMENTO",
  ].map((h) => h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ºª]/g, "").replace(/\s+/g, " "))
);

function smellHeader(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .replace(/\s+/g, " ");
}

// Conjunto de cabeçalhos conhecidos para auto-detecção (normalizados: uppercase, sem acento, sem ºª)
const KNOWN_HEADER_SET = new Set([
  "CODIGO ESCOLA", "CODIGO DA ESCOLA", "CODIGO", "N", "NUMERO", "NUM",
  "ESCOLA", "NOME DA ESCOLA", "NOME DA UNIDADE", "UNIDADE", "NOME",
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
  foraDaEscola?: number;
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

type FileState = { name: string; size: number; rows: Record<string, string | number | null | undefined>[] };

type Step = "arquivo" | "validacao" | "concluido";

const TEMPLATE_HEADERS = [
  "NOME",
  "NOME DA TURMA",
  "ANO/SÉRIE",
  "TURNO",
  "PROFESSOR",
];

const TEMPLATE_EXAMPLE = [
  "CENTRO DE EDUCAÇÃO MUNICIPAL VASCO PAPA",
  "5º A",
  "5º Ano",
  "Matutino",
  "JANETE FRANCISCA DA SILVA",
];

const ANOS_SERIES_TEMPLATE = [
  "Berçário I",
  "Berçário II",
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

export default function ImportPanel({ onIrAlunos }: { onIrAlunos?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("arquivo");
  const [pareceAlunos, setPareceAlunos] = useState(false);

  // Filtro opcional: "Todas as escolas" (padrão) ou uma unidade específica
  const [escolaCodigo, setEscolaCodigo] = useState<number | null>(null);
  const selectedEscola = ESCOLAS_MUNICIPAIS.find((ec) => ec.numero === escolaCodigo) ?? null;

  // Arquivo (planilha da escola)
  const [file, setFile] = useState<FileState | null>(null);

  // Validação / conclusão
  const [busy, setBusy] = useState<"validar" | "publicar" | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");

  const parseFile = useCallback(async (f: File) => {
    setError("");
    setReport(null);
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

      // Usa a primeira linha como cabeçalho se nenhum padrão conhecido for detectado
      const headerRow = headerIdx >= 0 ? raw[headerIdx] : raw[0];
      const headers = headerRow.map((h: unknown) => String(h || "").trim());
      const dataRows = raw.slice(headerIdx >= 0 ? headerIdx + 1 : 1).filter((row: unknown[]) => row.some((c: unknown) => c !== "" && c !== null));

      const rows: Record<string, string | number | null | undefined>[] = dataRows.map((row: unknown[]) => {
        const obj: Record<string, string | number | null | undefined> = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
        });
        return obj;
      });

      if (rows.length === 0) throw new Error("Nenhuma linha de dados encontrada após o cabeçalho.");
      setFile({ name: f.name, size: f.size, rows });
      setPareceAlunos(headers.some((h: string) => ALUNO_SMELL_HEADERS.has(smellHeader(h))));
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
        body: JSON.stringify({ rows: file.rows, escolaCodigo: escolaCodigo ?? undefined, anoLetivo: 2026 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao validar.");
        return;
      }
      setReport(data.report);
      setStep("validacao");
      window.scrollTo({ top: 0 });
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
        body: JSON.stringify({ rows: file.rows, escolaCodigo: escolaCodigo ?? undefined, anoLetivo: 2026 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao publicar.");
        return;
      }
      setReport(data.report);
      setStep("concluido");
      window.scrollTo({ top: 0 });
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  function resetAll() {
    setStep("arquivo");
    setEscolaCodigo(null);
    setFile(null);
    setReport(null);
    setError("");
    setBusy(null);
    setPareceAlunos(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function backToFile() {
    setReport(null);
    setError("");
    setStep("arquivo");
    setPareceAlunos(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  /* ================================================================ */
  return (
    <div className="space-y-6">
      {/* Indicador de etapas */}
      <StepIndicator step={step} />

      {/* ============ PASSO 1: ARQUIVO (planilha única da secretaria) ============ */}
      {step === "arquivo" && (
        <div>
          {pareceAlunos && (
            <div className="mb-6 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-amber-800">
                Este arquivo parece ser a planilha de <strong>ALUNOS</strong> (colunas de aluno). As turmas precisam estar
                cadastradas primeiro — importe-o na guia <strong>Alunos</strong>.
              </p>
              {onIrAlunos && (
                <button
                  type="button"
                  onClick={onIrAlunos}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  <Users className="h-3.5 w-3.5" /> Ir para a guia Alunos
                </button>
              )}
            </div>
          )}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Planilha da escola</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Apenas a planilha da escola</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Envie a planilha da escola com as turmas, professores e alunos.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <label htmlFor="filtro-escola" className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Filter className="h-4 w-4 text-indigo-500" /> Escola (filtro opcional)
              </label>
              <select
                id="filtro-escola"
                value={escolaCodigo ?? ""}
                onChange={(e) => {
                  const num = e.target.value === "" ? null : Number(e.target.value);
                  setEscolaCodigo(num);
                  setError("");
                }}
                className="mt-1 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Todas as escolas</option>
                {ESCOLAS_MUNICIPAIS.map((ec) => (
                  <option key={ec.numero} value={ec.numero}>
                    {escolaLabel(ec)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-400">
                {escolaCodigo === null
                  ? "Sem filtro: toda a planilha é importada e as linhas são gravadas na escola informada em cada linha."
                  : `Filtro ativo: ${selectedEscola?.nome}. Apenas os registros desta escola serão importados; linhas de outras unidades são ignoradas.`}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Info className="h-3.5 w-3.5 text-indigo-500" /> Modelo de planilha
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Colunas: NOME, NOME DA TURMA, ANO/SÉRIE, TURNO e PROFESSOR opcional (uma linha por turma).
              </p>
              <button
                type="button"
                onClick={() => downloadExcel(TEMPLATE_HEADERS, TEMPLATE_EXAMPLE)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Download className="h-3.5 w-3.5" /> Baixar modelo
              </button>
            </div>
          </div>

          <div className="space-y-4">
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
                {file ? file.name : "Selecione a planilha da escola"}
              </p>
              <p className="text-xs text-slate-400">Arraste ou clique · .xlsx e .xls · máximo 5.000 linhas</p>
              {file && (
                <p className="text-xs text-slate-500">
                  {file.rows.length} linha(s) de dados · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void parseFile(f);
                }}
              />
            </div>

            {file && (
              <button
                type="button"
                onClick={() => void runValidation()}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy === "validar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {busy === "validar" ? "Validando..." : "Validar planilha"}
                {busy !== "validar" && <ArrowRight className="h-4 w-4" />}
              </button>
            )}
          </div>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      {/* ============ PASSO 2: VALIDAÇÃO ============ */}
      {step === "validacao" && report && (
        <div className="space-y-6">
          <ValidationHeader
            escola={selectedEscola ? selectedEscola.nome : "Todas as escolas"}
            report={report}
            anoLetivo={2026}
          />

          {/* Métricas */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard tone="bg-slate-100 text-slate-700" label="Total de linhas" value={String(report.total)} icon={<FileSpreadsheet className="h-4 w-4" />} />
            <MetricCard tone="bg-emerald-100 text-emerald-700" label="Válidas" value={String(report.validas)} icon={<CheckCircle2 className="h-4 w-4" />} />
            <MetricCard tone="bg-amber-100 text-amber-700" label="Avisos" value={String(report.avisos)} icon={<AlertTriangle className="h-4 w-4" />} />
            <MetricCard tone="bg-rose-100 text-rose-700" label="Erros" value={String(report.erros)} icon={<XCircle className="h-4 w-4" />} />
          </div>

          {!report.ok && report.erros > 0 && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Corrija os erros na planilha e valide novamente. Nenhum dado foi gravado.
            </p>
          )}

          {typeof report.foraDaEscola === "number" && report.foraDaEscola > 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <Filter className="mr-1 inline h-4 w-4" />
              {report.foraDaEscola} linha(s) de outras escolas foram ignoradas pelo filtro selecionado e não serão gravadas.
            </p>
          )}

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy !== null || report.erros > 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              title={report.erros > 0 ? "Corrija os erros na planilha antes de confirmar." : "Confirmar importação no Supabase"}
            >
              {busy === "publicar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {busy === "publicar" ? "Importando..." : "Confirmar importação"}
            </button>
            <button
              type="button"
              onClick={backToFile}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> {report.erros > 0 ? "Corrigir planilha" : "Voltar"}
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(buildErrorCsv(report), `validacao-${new Date().toISOString().slice(0, 10)}.csv`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Baixar CSV de validação
            </button>
          </div>

          {/* Pré-visualização: resumo por turma */}
          {report.resumo.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="text-sm font-bold text-slate-900">Pré-visualização · Resumo por turma</h3>
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
                  {report.resumo.map((r, idx) => (
                    <tr key={`${r.escola}-${r.turma}-${idx}`} className="border-b border-slate-50">
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

          {/* Erros linha a linha */}
          {report.itens.some((i) => i.status === "erro") && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-rose-700">
                  <XCircle className="h-4 w-4" /> Erros ({report.erros}) — corrigir
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

      {/* ============ PASSO 3: CADASTROS SALVOS ============ */}
      {step === "concluido" && report && report.escrita && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-3 text-xl font-extrabold text-slate-900">Cadastros salvos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Importação confirmada no Supabase · <strong>{selectedEscola ? selectedEscola.nome : "Todas as escolas"}</strong> · Ano letivo 2026
          </p>

          <div className="mx-auto mt-6 grid max-w-xl gap-3 text-left sm:grid-cols-2">
            <ResultStat label="Escolas criadas" value={report.escrita.escolasCriadas} />
            <ResultStat label="Professores criados" value={report.escrita.professoresCriados} />
            <ResultStat label="Novas turmas" value={report.escrita.turmasCriadas} />
            <ResultStat label="Turmas atualizadas" value={report.escrita.turmasAtualizadas} />
            <ResultStat label="Já existentes (mantidas)" value={report.escrita.ignoradas} />
            <ResultStat label="Total de linhas" value={report.total} />
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Importar nova planilha
            </button>
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <School className="h-4 w-4" /> Ver cadastros
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Voltar ao painel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "arquivo", label: "Arquivo" },
    { key: "validacao", label: "Validação" },
    { key: "concluido", label: "Concluído" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                done && "bg-emerald-500 text-white",
                active && "bg-indigo-600 text-white",
                !done && !active && "bg-slate-200 text-slate-500"
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
            </span>
            <span
              className={cn(
                "text-xs font-semibold",
                active ? "text-indigo-700" : done ? "text-emerald-600" : "text-slate-400"
              )}
            >
              {s.label}
            </span>
            {idx < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}

function ValidationHeader({ escola, report, anoLetivo }: { escola: string; report: ImportReport; anoLetivo: number }) {
  const hasErrors = report.erros > 0;
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        hasErrors ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {hasErrors ? <XCircle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {hasErrors ? "Com erros — corrigir" : "Sem erros — pré-visualização"}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Escola: <strong>{escola}</strong> · Ano letivo: <strong>{anoLetivo}</strong>
        {escola === "Todas as escolas" && (
          <span className="text-slate-400"> — cada linha usa a escola de sua coluna NOME</span>
        )}
      </p>
      {hasErrors ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700">
          Corrija os erros na planilha e valide novamente. Nenhum dado foi gravado.
        </p>
      ) : (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700">
          Revise a pré-visualização e clique em &quot;Confirmar importação&quot; para gravar no Supabase.
        </p>
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

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3">
      <p className="text-lg font-extrabold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}