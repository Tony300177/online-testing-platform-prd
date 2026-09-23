"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  School,
  Search,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { ESCOLAS_MUNICIPAIS, escolaLabel, escolaTipo } from "@/lib/municipal-schools";
import { cn } from "@/lib/utils";

type FileState = { name: string; rows: Record<string, string | number | null | undefined>[] };

type AlunoReport = {
  ok: boolean;
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
  escrita?: {
    alunosCriados: number;
    alunosAtualizados: number;
    matriculasCriadas: number;
    jaCadastrados: number;
    ignorados: number;
  };
};

type Step = "arquivo" | "escola" | "confirmar" | "importando" | "resultado";

const STEPS: { id: Step; label: string }[] = [
  { id: "arquivo", label: "Receber arquivo" },
  { id: "escola", label: "Selecionar escola" },
  { id: "confirmar", label: "Confirmar importação" },
  { id: "resultado", label: "Resultado" },
];

function normCompare(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export default function ImportUnificadoPanel() {
  const [step, setStep] = useState<Step>("arquivo");

  // Arquivo
  const [file, setFile] = useState<FileState | null>(null);

  // Escola
  const [escolasData, setEscolasData] = useState<{ id: string; nome: string; turmas: { id: string; nome: string }[] }[]>([]);
  const [escolaCodigo, setEscolaCodigo] = useState<number | null>(null);
  const [buscaEscola, setBuscaEscola] = useState("");

  // Importação
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AlunoReport | null>(null);
  const [error, setError] = useState("");
  const [verErros, setVerErros] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/escolas")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setEscolasData(data.escolas);
      })
      .catch(() => {
        /* mantém sem escolas se falhar */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fixedEscola = ESCOLAS_MUNICIPAIS.find((ec) => ec.numero === escolaCodigo) ?? null;
  const selectedEscola = useMemo(() => {
    if (!fixedEscola) return null;
    return (
      escolasData.find((e) => normCompare(e.nome) === normCompare(fixedEscola.nome)) ?? null
    );
  }, [fixedEscola, escolasData]);

  const semTurmas = !selectedEscola || selectedEscola.turmas.length === 0;

  /* ---------- Filtro de escolas por busca ---------- */
  const escolasFiltradas = useMemo(() => {
    const q = normCompare(buscaEscola);
    if (!q) return ESCOLAS_MUNICIPAIS;
    return ESCOLAS_MUNICIPAIS.filter((ec) => {
      const label = normCompare(`${ec.numero} ${ec.nome}`);
      return label.includes(q);
    });
  }, [buscaEscola]);

  /* ---------- Parse do arquivo ---------- */
  const parseFile = useCallback(async (f: File) => {
    setError("");
    setReport(null);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Planilha vazia ou sem abas.");

      const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (raw.length < 2) throw new Error("Nenhuma linha de dados encontrada.");

      // Cabeçalho: sempre a primeira linha da planilha
      const headers = raw[0].map((h) => String(h || "").trim());
      const dataRows = raw.slice(1).filter((row) => row.some((c) => c !== "" && c !== null));

      const rows = dataRows.map((row: unknown[]) => {
        const obj: Record<string, string | number | null | undefined> = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
        });
        return obj;
      });
      if (rows.length === 0) throw new Error("Nenhuma linha de dados depois do cabeçalho.");
      setFile({ name: f.name, rows });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      setFile(null);
    }
  }, []);

  /* ---------- Importar (valida + grava em uma passada) ---------- */
  async function importar() {
    if (!file || !selectedEscola) return;
    setBusy(true);
    setError("");
    setStep("importando");
    try {
      const res = await fetch("/api/alunos/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId: selectedEscola.id,
          rows: file.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao importar.");
        setStep("confirmar");
        return;
      }
      setReport(data.report);
      setStep("resultado");
      setVerErros(false);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStep("confirmar");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setEscolaCodigo(null);
    setBuscaEscola("");
    setReport(null);
    setError("");
    setBusy(false);
    setVerErros(false);
    setStep("arquivo");
  }

  function stepIndex(): number {
    const order: Step[] = ["arquivo", "escola", "confirmar", "importando", "resultado"];
    return Math.max(0, order.indexOf(step));
  }

  const importados = report?.escrita?.matriculasCriadas ?? 0;
  const comErros = report?.escrita?.ignorados ?? report?.erros ?? 0;
  const duplicados = report?.escrita?.jaCadastrados ?? 0;

  /* ================================================================ */
  return (
    <div className="space-y-6">
      {/* Indicador de passos */}
      <ol className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold">
        {STEPS.map((s, i) => {
          const done = i < stepIndex();
          const active = i === stepIndex();
          return (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5",
                  active && "bg-indigo-600 text-white",
                  done && "bg-emerald-100 text-emerald-700",
                  !active && !done && "bg-slate-100 text-slate-500"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-slate-300">›</span>}
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      {/* ============ PASSO 1: Receber arquivo ============ */}
      {step === "arquivo" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> Receber arquivo da escola
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Envie o relatório em Excel (XLSX) enviado pela escola, com uma linha por aluno. Cabeçalho na primeira linha:
            Nome do aluno, Turma, Ano/Série, Turno e Professor (opcional).
          </p>

          <div
            onClick={() => {
              const input = document.getElementById("arquivo-unificado") as HTMLInputElement | null;
              input?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void parseFile(f);
            }}
            className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40"
          >
            <FileSpreadsheet className="h-12 w-12 text-indigo-500" />
            <p className="text-sm font-semibold text-slate-700">
              {file ? file.name : "Arraste a planilha ou clique para enviar"}
            </p>
            <p className="text-xs text-slate-400">
              {file ? `${file.rows.length} aluno(s) encontrados no arquivo` : ".xlsx · primeira linha = cabeçalho"}
            </p>
            <input
              id="arquivo-unificado"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parseFile(f);
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setStep("escola")}
              disabled={!file}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 2: Selecionar escola ============ */}
      {step === "escola" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <School className="h-5 w-5 text-indigo-600" /> Selecionar escola
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Pesquise e selecione a unidade que enviou o arquivo. As turmas e professores já precisam estar cadastrados.
          </p>

          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={buscaEscola}
              onChange={(e) => setBuscaEscola(e.target.value)}
              placeholder="Pesquisar por código ou nome da escola..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <ul className="mt-4 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {escolasFiltradas.map((ec) => {
              const selected = ec.numero === escolaCodigo;
              return (
                <li key={ec.numero}>
                  <button
                    type="button"
                    onClick={() => {
                      setEscolaCodigo(ec.numero);
                      setError("");
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                      selected ? "bg-indigo-50" : "hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{ec.nome}</span>
                      <span className="block text-xs text-slate-400">
                        Código: {String(ec.numero).padStart(2, "0")} · {escolaTipo(ec.numero)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {escolasFiltradas.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">Nenhuma escola encontrada.</li>
            )}
          </ul>

          {fixedEscola && semTurmas && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Esta escola ainda não tem turmas cadastradas no sistema. Importe as turmas primeiro (guia Turmas) — os alunos
              só são validados contra turmas existentes.
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("arquivo")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("confirmar")}
              disabled={!fixedEscola}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 3: Confirmar importação ============ */}
      {step === "confirmar" && fixedEscola && file && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Confirmar importação
          </h2>
          <p className="mt-1 text-xs text-slate-400">Confira os dados abaixo antes de importar.</p>

          <dl className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Escola</dt>
              <dd className="max-w-[70%] text-right">
                <span className="block text-sm font-bold text-slate-900">{fixedEscola.nome}</span>
                <span className="block text-xs text-slate-500">
                  Código {String(fixedEscola.numero).padStart(2, "0")} · {escolaTipo(fixedEscola.numero)}
                </span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Arquivo</dt>
              <dd className="max-w-[70%] text-right text-sm font-semibold text-slate-900">{file.name}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alunos encontrados</dt>
              <dd className="text-lg font-extrabold text-indigo-700">{file.rows.length}</dd>
            </div>
          </dl>

          {semTurmas && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Sem turmas cadastradas para esta escola: a importação fica toda com erro até você importar as turmas na guia
              Turmas.
            </p>
          )}

          <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setStep("escola")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void importar()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 4: Importação + validação ============ */}
      {step === "importando" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            <h2 className="text-lg font-extrabold text-slate-900">Importando dados...</h2>
            <p className="text-sm text-slate-500">
              {fixedEscola?.nome} · {file?.name}
            </p>

            <ul className="mx-auto mt-2 w-full max-w-sm space-y-1.5 text-left text-sm">
              <li className="flex items-center gap-2 text-slate-700">
                <Check className="h-4 w-4 text-emerald-600" /> Nome do aluno
              </li>
              <li className="flex items-center gap-2 text-slate-700">
                <Check className="h-4 w-4 text-emerald-600" /> Turma existente na escola
              </li>
              <li className="flex items-center gap-2 text-slate-700">
                <Check className="h-4 w-4 text-emerald-600" /> Ano/Série
              </li>
              <li className="flex items-center gap-2 text-slate-700">
                <Check className="h-4 w-4 text-emerald-600" /> Turno
              </li>
              <li className="flex items-center gap-2 text-slate-400">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px]">
                  ○
                </span>
                Professor (opcional)
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> Verificando duplicidades...
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ============ PASSO 5: Resultado ============ */}
      {step === "resultado" && report && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-3 text-xl font-extrabold text-slate-900">Resultado da importação</h2>
            <p className="mt-1 text-sm text-slate-500">
              {fixedEscola?.nome} · {file?.name}
            </p>

            <div className="mx-auto mt-6 grid max-w-lg grid-cols-1 gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-emerald-700">{importados}</p>
                <p className="text-xs font-semibold text-emerald-700">alunos importados</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="flex items-center gap-1 text-2xl font-extrabold text-amber-600">{comErros}</p>
                <p className="text-xs font-semibold text-amber-600">alunos com erros</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-amber-600">{duplicados}</p>
                <p className="text-xs font-semibold text-amber-600">registros duplicados</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setVerErros((v) => !v)}
                disabled={comErros === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" /> {verErros ? "Ocultar erros" : "Ver erros"}
              </button>
              <Link
                href="/admin/alunos"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Users className="h-4 w-4" /> Ver alunos
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Concluir
              </button>
            </div>
          </div>

          {/* Erros detalhados */}
          {verErros && report.itens.some((i) => i.status === "erro") && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-rose-700">
                  <XCircle className="h-4 w-4" /> Erros ({comErros})
                </h3>
                <p className="text-xs text-slate-400">Linhas ignoradas — corrija e reenvie o arquivo.</p>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Linha</th>
                    <th className="px-4 py-2.5 font-semibold">Aluno</th>
                    <th className="px-4 py-2.5 font-semibold">CPF</th>
                    <th className="px-4 py-2.5 font-semibold">Turma</th>
                    <th className="px-4 py-2.5 font-semibold">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.itens
                    .filter((i) => i.status === "erro")
                    .map((i) => (
                      <tr key={`e${i.linha}`} className="border-b border-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{i.linha}</td>
                        <td className="px-4 py-2.5 text-slate-800">{i.nome}</td>
                        <td className="px-4 py-2.5 text-slate-500">{i.cpf ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{i.turma}</td>
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
        </div>
      )}
    </div>
  );
}