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
  FileUp,
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

type Step =
  | "escola"
  | "arquivo"
  | "padroes"
  | "validar"
  | "importando"
  | "resultado";

const STEPS: { id: Step; label: string }[] = [
  { id: "escola", label: "1. Escola" },
  { id: "arquivo", label: "2. Arquivo" },
  { id: "padroes", label: "3. Padrões" },
  { id: "validar", label: "4. Validar" },
  { id: "importando", label: "5. Importação" },
  { id: "resultado", label: "6. Resultado" },
];

/* Alias aceitos para auto-detecção (mesma lógica da lib). */
const ALIASES_CAMPO: Record<string, string[]> = {
  NOME: ["NOME", "NOME DO ALUNO", "ALUNO", "NOME DO ESTUDANTE", "ESTUDANTE"],
  TURMA: ["TURMA", "NOME DA TURMA", "TURMA (NOME)", "CLASSE", "SALA", "GRUPO"],
  ANO: ["ANO", "SERIE", "SÉRIE", "ANO/SERIE", "ANO/SÉRIE", "ANO E SERIE", "ANO E SÉRIE", "TURMA_ANO"],
TURNO: ["TURNO", "PERIODO", "PERÍODO", "PERIODO AULA", "HORARIO", "HORÁRIO"],
  PROFESSOR: ["PROFESSOR", "PROFESSOR (NOME)", "NOME DO PROFESSOR", "DOCENTE"],
  SEXO: ["SEXO", "GENERO", "GÊNERO", "SEXO/GÊNERO", "GÊNERO DO ALUNO"],
  ETNIA: ["ETNIA", "COR", "COR/RACA", "COR/RÇA", "RACA", "RAÇA", "COR OU RAÇA", "RACA/COR", "COR/RAÇA"],
  BAIRRO: ["BAIRRO", "BAIRRO DE RESIDENCIA", "BAIRRO DE RESIDÊNCIA", "BAIRRO DO ALUNO", "RESIDENCIA"],
};

function normCompare(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function detectarColunas(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const campo of Object.keys(ALIASES_CAMPO)) {
    const aliases = ALIASES_CAMPO[campo].map(normCompare);
    const hit = headers.find((h) => aliases.includes(normCompare(h))) ?? "";
    if (hit) map[campo] = hit;
  }
  return map;
}

/**
 * Fluxo de importação de alunos (escola → arquivo → colunas → padrões → validar → confirmar).
 */
export default function ImportUnificadoPanel() {
const [step, setStep] = useState<
    "escola" | "arquivo" | "padroes" | "validar" | "importando" | "resultado"
  >("escola");

// Escola
  const [escolasData, setEscolasData] = useState<
    {
      id: string;
      nome: string;
      turmas: { id: string; nome: string; alunos?: { id: string; nome: string; numeroChamada: number | null }[] }[];
    }[]
  >([]);
  const [escolaCodigo, setEscolaCodigo] = useState<number | null>(null);
  const [buscaEscola, setBuscaEscola] = useState("");

  // Arquivo
  const [file, setFile] = useState<FileState | null>(null);

  // Colunas mapeadas
  const [colunas, setColunas] = useState<Record<string, string>>({});

  // Importação
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AlunoReport | null>(null);
  const [error, setError] = useState("");
  const [semTurmas, setSemTurmas] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/escolas")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setEscolasData(data.escolas);
      })
      .catch(() => {});
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

  /* Quantidade de alunos já cadastrados na escola selecionada. */
  const totalAlunosEscola = useMemo(
    () => selectedEscola?.turmas?.reduce((acc, t) => acc + (t.alunos?.length ?? 0), 0) ?? 0,
    [selectedEscola]
  );

  /* Nomes já cadastrados na escola (para a pré-visualização Novos vs Já cadastrados). */
  const alunosExistentesEscola = useMemo(() => {
    const s = new Set<string>();
    selectedEscola?.turmas?.forEach((t) =>
      t.alunos?.forEach((a) => s.add(normCompare(a.nome)))
    );
    return s;
  }, [selectedEscola]);

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
      setColunas(detectarColunas(headers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      setFile(null);
    }
  }, []);

  /* ---------- Validar planilha (dry-run: valida sem gravar) ---------- */
  async function validar() {
    if (!file || !fixedEscola) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/alunos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId: selectedEscola?.id ?? "",
          colunas,
          rows: file.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao validar.");
        setStep("importando");
        return;
      }
      setReport(data.report);
      setStep("validar");
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStep("arquivo");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Importar (confirmação: grava no banco) ---------- */
  async function importar() {
    if (!file || !fixedEscola || !report) return;
    setBusy(true);
    setError("");
    setStep("importando");
    try {
      const res = await fetch("/api/alunos/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId: selectedEscola?.id ?? "",
          colunas,
          rows: file.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao importar.");
        setStep("validar");
        return;
      }
      setReport(data.report);
      setStep("resultado");
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStep("validar");
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
    setStep("escola");
  }

  function stepIndex(): number {
    const order: Step[] = ["escola", "arquivo", "padroes", "validar", "importando", "resultado"];
    return Math.max(0, order.indexOf(step));
  }

const importados = report?.escrita?.alunosCriados ?? 0;
  const comErros = report?.escrita?.ignorados ?? report?.erros ?? 0;
  const atualizados = report?.escrita?.alunosAtualizados ?? 0;

  const headers = file?.rows.length ? Object.keys(file.rows[0]) : [];

  /* Classificação da pré-visualização: novato (verde), já cadastrado (amarelo) ou erro (vermelho). */
  const situacaoItens = useMemo(() => {
    if (!report) return [];
    return report.itens.map((i) => ({
      ...i,
      situacao:
        i.status === "erro"
          ? "erro"
          : alunosExistentesEscola.has(normCompare(i.nome))
            ? "cadastrado"
            : "novo",
    }));
  }, [report, alunosExistentesEscola]);

  const novosCount = situacaoItens.filter((i) => i.situacao === "novo").length;
  const jaCadastradosCount = situacaoItens.filter((i) => i.situacao === "cadastrado").length;
  const errosCount = report?.erros ?? 0;

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

      {/* ============ PASSO 1: Selecionar escola ============ */}
      {step === "escola" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <School className="h-5 w-5 text-indigo-600" /> Selecionar escola
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Pesquise e selecione a unidade que enviou o arquivo. As turmas devem estar cadastradas.
          </p>

          <div className="relative mt-4 flex items-center gap-2">
            <Search className="absolute left-3.5 h-4 w-4 text-slate-400" />
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
                    onClick={() => setEscolaCodigo(ec.numero)}
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

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("escola")}
              disabled={!fixedEscola}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("arquivo")}
              disabled={!fixedEscola}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 2: Receber arquivo ============ */}
      {step === "arquivo" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> Receber arquivo
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Envie a planilha da escola com uma linha por aluno. Cabeçalho na primeira linha.
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
              {file
                ? `${file.rows.length} aluno(s) encontrados no arquivo`
                : ".xlsx · .xls · .csv — primeira linha = cabeçalho"}
            </p>
            <input
              id="arquivo-unificado"
              type="file"
              accept=".xlsx,.xls,.csv"
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
              onClick={() => setStep("escola")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("padroes")}
              disabled={!file}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 4: Configurar padrões ============ */}
      {step === "padroes" && file && fixedEscola && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-indigo-600" /> Configurar padrões
          </h2>
          <p className="mt-1 text-xs text-slate-400">Confira os padrões que serão aplicados à importação.</p>

          <dl className="mt-4 space-y-3">
<div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Escola</dt>
              <dd className="max-w-[70%] text-right">
                <span className="block text-sm font-bold text-slate-900">{fixedEscola.nome}</span>
                <span className="block text-xs text-slate-500">
                  Código {String(fixedEscola.numero).padStart(2, "0")} · {escolaTipo(fixedEscola.numero)}
                </span>
                <span className="mt-1 block text-xs font-semibold text-indigo-700">
                  {totalAlunosEscola} aluno(s) já cadastrado(s)
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
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Padrões</dt>
<dd className="max-w-[70%] text-right text-sm font-semibold text-slate-900">
                Ano/Série e Turno vêm da planilha · Professor, Gênero, Etnia e Bairro opcionais
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("padroes")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => void validar()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 5: Validar planilha (dry-run) ============ */}
      {step === "validar" && report && file && fixedEscola && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                <FileUp className="h-5 w-5 text-indigo-600" /> Validar planilha
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {fixedEscola.nome} · {file.name} · {file.rows.length} linha(s)
              </p>
            </div>
            {report.ok && report.erros === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Tudo certo, pode importar!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Corrija os erros antes de importar
              </span>
            )}
          </div>

<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{report.total}</p>
              <p className="text-xs font-semibold text-slate-500">linhas processadas</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-emerald-700">{novosCount}</p>
              <p className="text-xs font-semibold text-emerald-700">🟢 novos alunos</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-amber-600">{jaCadastradosCount}</p>
              <p className="text-xs font-semibold text-amber-600">🟡 já cadastrados</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-rose-600">{errosCount}</p>
              <p className="text-xs font-semibold text-rose-600">🔴 dados com erro</p>
            </div>
          </div>

          {report.itens.length > 0 && (
            <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Linha</th>
                    <th className="px-3 py-2 font-semibold">Aluno</th>
                    <th className="px-3 py-2 font-semibold">Turma</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {situacaoItens.map((i) => (
                    <tr key={i.linha}>
                      <td className="px-3 py-2 align-top text-xs font-mono text-slate-400">{i.linha}</td>
                      <td className="px-3 py-2 align-top font-semibold text-slate-900">{i.nome}</td>
                      <td className="px-3 py-2 align-top text-xs text-slate-500">
                        {i.turma} {i.turno ? `· ${i.turno}` : ""}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {i.situacao === "erro" && (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                            <XCircle className="h-3.5 w-3.5" /> Dados com erro
                          </span>
                        )}
                        {i.situacao === "cadastrado" && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Já cadastrado
                          </span>
                        )}
                        {i.situacao === "novo" && (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Novo aluno
                          </span>
                        )}
                        {i.motivos.length > 0 && (
                          <span className="mt-1 block font-normal text-slate-400">
                            {i.motivos.join(" · ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("arquivo")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <AlertTriangle className="h-4 w-4" /> Corrigir planilha
            </button>
            <button
              type="button"
              disabled={!report.ok || report.erros > 0}
              onClick={() => void importar()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirmar importação <ArrowRight className="h-4 w-4" />{" "}
              {!report.ok || report.erros > 0 ? "— corriga os erros" : ""}
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 6: Importação (grava no banco) ============ */}
      {step === "importando" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-600" />
          <h2 className="mt-3 text-lg font-extrabold text-slate-900">Importando dados...</h2>
          <p className="mt-1 text-sm text-slate-500">
            {fixedEscola?.nome} · {file?.name}
          </p>
          <p className="mt-4 text-xs text-slate-400">Validando turmas, ano/série e duplicidades...</p>
        </div>
      )}

      {/* ============ PASSO 6: Resultado ============ */}
      {step === "resultado" && report && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-3 text-xl font-extrabold text-slate-900">Resultado da importação</h2>
            <p className="mt-1 text-xs text-slate-400">
              {fixedEscola?.nome} · {file?.name}
            </p>

<div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-2xl font-extrabold text-slate-900">{report.total}</p>
                <p className="text-xs font-semibold text-slate-500">total processado</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-emerald-700">{importados}</p>
                <p className="text-xs font-semibold text-emerald-700">importados</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-amber-600">{atualizados}</p>
                <p className="text-xs font-semibold text-amber-600">atualizados</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-rose-600">{comErros}</p>
                <p className="text-xs font-semibold text-rose-600">erros</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Link
                href="/admin/alunos"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Users className="h-4 w-4" /> Ver alunos
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
