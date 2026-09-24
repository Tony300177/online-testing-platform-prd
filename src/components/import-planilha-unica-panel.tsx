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
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  Layers,
  Loader2,
  RefreshCcw,
  School,
  Search,
  Sparkles,
  Table2,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { buildCsv } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Row = Record<string, string | number | null | undefined>;

type FileState = { name: string; rows: Row[]; sheets: string[] };

/* ============ Tipos dos endpoints ============ */

type EscolaIdentificada = {
  codigo: number;
  nome: string;
  tipo: string;
  linhas: number;
  turmas: number;
  turmasNomes: string[];
  existe: boolean;
};

type Identificacao = {
  ok: boolean;
  totalLinhas: number;
  escolas: EscolaIdentificada[];
  semEscola: { escola: string; linhas: number }[];
};

type ItemAluno = {
  linha: number;
  status: "ok" | "aviso" | "erro";
  nome: string;
  cpf: string | null;
  turma: string;
  turno: string;
  motivos: string[];
};

type RelatorioTurmas = {
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
  escrita?: { escolasCriadas: number; professoresCriados: number; turmasCriadas: number; turmasAtualizadas: number; ignoradas: number };
};

type ValidacaoEscola = {
  codigo: number;
  nome: string;
  tipo: string;
  existe: boolean;
  alunos: number;
  turmas: RelatorioTurmas | null;
  alunosReport?: {
    total: number;
    validas: number;
    avisos: number;
    erros: number;
    itens: ItemAluno[];
  };
};

type CommitEscola = {
  codigo: number;
  nome: string;
  turmas: RelatorioTurmas;
  alunos: {
    total: number;
    validas: number;
    avisos: number;
    erros: number;
    escrita?: { alunosCriados: number; alunosAtualizados: number; matriculasCriadas: number; jaCadastrados: number; ignorados: number };
    itens: ItemAluno[];
  };
};

type Situacao = "novo" | "existente" | "atualizar" | "erro";

/* ============ Passos do fluxo (11) ============ */

type Step =
  | "fonte"
  | "arquivo"
  | "escolas"
  | "turmas"
  | "validar"
  | "duplicados"
  | "preview"
  | "confirmar"
  | "gravando"
  | "resultado"
  | "relatorio";

const STEPS: { id: Step; label: string }[] = [
  { id: "fonte", label: "1. Fonte" },
  { id: "arquivo", label: "2. Arquivo" },
  { id: "escolas", label: "3. Escolas" },
  { id: "turmas", label: "4. Turmas" },
  { id: "validar", label: "5. Validar" },
  { id: "duplicados", label: "6. Duplicados" },
  { id: "preview", label: "7. Pré-visualização" },
  { id: "confirmar", label: "8. Confirmar" },
  { id: "gravando", label: "9. Gravar" },
  { id: "resultado", label: "10. Resultado" },
  { id: "relatorio", label: "11. Relatório" },
];

const ORDER: Step[] = STEPS.map((s) => s.id);

/* ============ Identificação de escola no cliente (mesma marca da lib) ============ */

const MARCA: Record<number, string> = {
  1: "ARCO IRIS",
  2: "BRUNO LEONARDO",
  3: "CRIANCA FELIZ",
  4: "DOM FRANCO",
  5: "LUIZ FELIPE",
  6: "MENINO JESUS",
  7: "NOSSO LAR",
  8: "GUILHERME FREITAS",
  9: "ORLANDO PEREIRA",
  10: "SAO CRISTOVAO",
  11: "VASCO PAPA",
  12: "JOSE DE ANCHIETA",
  13: "PAULO FREIRE",
  14: "MARIA HILDA PANAS",
  15: "EUCLIDES DA CUNHA",
  16: "VINICIUS DE MORAIS",
  17: "ALVARES DE AZEVEDO",
  18: "CORA CORALINA",
  19: "OSVALDO CRUZ",
};

function normCompare(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchEscolaCodigo(escolaRaw: string | number | null | undefined): number | null {
  const n = normCompare(String(escolaRaw ?? ""));
  if (!n) return null;
  const hits = new Map<number, number>();
  for (const [code, marca] of Object.entries(MARCA)) {
    const m = normCompare(marca);
    let score = 0;
    if (n.includes(m)) score += 100;
    else for (const w of m.split(" ")) if (w.length >= 4 && n.includes(w)) score += 10;
    if (score > 0) hits.set(Number(code), score);
  }
  const sorted = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    const exact = sorted.find(([, s]) => s === 100);
    return exact ? exact[0] : null;
  }
  return sorted[0][0];
}

const ESCOLA_ALIASES = [
  "ESCOLA",
  "NOME DA ESCOLA",
  "NOME DA UNIDADE",
  "UNIDADE",
  "NOME DA ESCOLA (BAIRRO)",
  "UNIDADE ESCOLAR",
];

const TURMA_ALIASES = ["TURMA", "NOME DA TURMA", "CLASSE", "SALA"];

function normHeader(value: string): string {
  return normCompare(value).replace("º", "°").replace("ª", "º");
}

function findHeader(headers: string[], aliases: string[]): string {
  return headers.find((h) => aliases.map(normHeader).includes(normHeader(h))) ?? "";
}

function cell(row: Row, header: string): string {
  return header ? String(row[header] ?? "").trim() : "";
}

function agruparLinhasPorEscola(rows: Row[], hEscola: string): Map<number, { rows: Row[]; nome: string }> {
  const grupos = new Map<number, { rows: Row[]; nome: string }>();
  for (const r of rows) {
    const raw = cell(r, hEscola);
    const codigo = matchEscolaCodigo(raw);
    if (codigo === null) continue;
    const g = grupos.get(codigo) ?? { rows: [] as Row[], nome: raw };
    g.rows.push(r);
    if (!g.nome) g.nome = raw;
    grupos.set(codigo, g);
  }
  return grupos;
}

export default function ImportPlanilhaUnicaPanel() {
  const [step, setStep] = useState<Step>("fonte");

  const [file, setFile] = useState<FileState | null>(null);
  const [identificacao, setIdentificacao] = useState<Identificacao | null>(null);
  const [validacoes, setValidacoes] = useState<Record<number, ValidacaoEscola>>({});
  const [commits, setCommits] = useState<Record<number, CommitEscola>>({});

  const [id, setId] = useState<{ atual: number; total: number; nome: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [baixouErros, setBaixouErros] = useState(false);

  // Alunos já cadastrados por escola (para classificar novatos/existentes).
  const [escolasData, setEscolasData] = useState<
    { id: string; nome: string; turmas: { id: string; nome: string; alunos?: { id: string; nome: string }[] }[] }[]
  >([]);

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

  /* Alunos existentes por código de escola: nome normalizado → conjunto de turmas. */
  const indexAlunosExistentes = useMemo(() => {
    const idx = new Map<number, Map<string, Set<string>>>();
    for (const escola of escolasData) {
      let codigo: number | null = null;
      for (const [c] of Object.entries(MARCA)) {
        if (normCompare(escola.nome).includes(normCompare(MARCA[Number(c)]))) {
          codigo = Number(c);
          break;
        }
      }
      if (codigo === null) continue;
      const porNome = new Map<string, Set<string>>();
      for (const t of escola.turmas) {
        const tNorm = normCompare(t.nome);
        for (const a of t.alunos ?? []) {
          const n = normCompare(a.nome);
          if (!porNome.has(n)) porNome.set(n, new Set());
          porNome.get(n)!.add(tNorm);
        }
      }
      idx.set(codigo, porNome);
    }
    return idx;
  }, [escolasData]);

  const classificar = useCallback(
    (escolaCodigo: number, item: ItemAluno): Situacao => {
      if (item.status === "erro" || item.motivos.length > 0) return "erro";
      const porNome = indexAlunosExistentes.get(escolaCodigo);
      if (!porNome) return "novo";
      const turmasMatch = porNome.get(normCompare(item.nome));
      if (!turmasMatch || turmasMatch.size === 0) return "novo";
      if (turmasMatch.has(normCompare(item.turma))) return "existente";
      return "atualizar";
    },
    [indexAlunosExistentes]
  );

  /* ---------- Parse do arquivo ---------- */
  const parseFile = useCallback(async (f: File) => {
    setError("");
    setIdentificacao(null);
    setValidacoes({});
    setCommits({});
    setBaixouErros(false);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Planilha vazia ou sem abas.");

      const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (raw.length < 2) throw new Error("Nenhuma linha de dados encontrada.");

      const headers = raw[0].map((h) => String(h || "").trim());
      const dataRows = raw.slice(1).filter((row) => row.some((c) => c !== "" && c !== null));

      const rows = dataRows.map((row: unknown[]) => {
        const obj: Row = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
        });
        return obj;
      });
      if (rows.length === 0) throw new Error("Nenhuma linha de dados depois do cabeçalho.");
      setFile({ name: f.name, rows, sheets: wb.SheetNames });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      setFile(null);
    }
  }, []);

  /* ---------- Passo 3: identificar escolas ---------- */
  async function identificar() {
    if (!file) return;
    setBusy(true);
    setError("");
    setCommits({});
    try {
      const res = await fetch("/api/import/planilha/identificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: file.rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao identificar.");
      setIdentificacao(data.data);
      setStep("escolas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Passo 5: validar todas as escolas (dry-run) ---------- */
  async function validarTodas() {
    if (!file || !identificacao) return;
    setBusy(true);
    setError("");
    setValidacoes({});
    const acumulado: Record<number, ValidacaoEscola> = {};
    setStep("validar");
    const escolas = identificacao.escolas;
    for (let i = 0; i < escolas.length; i++) {
      const ec = escolas[i];
      setId({ atual: i + 1, total: escolas.length, nome: ec.nome });
      const hEscola = findHeader(file.rows.length ? Object.keys(file.rows[0]) : [], ESCOLA_ALIASES) || "ESCOLA";
      const grupos = agruparLinhasPorEscola(file.rows, hEscola);
      const grupo = grupos.get(ec.codigo);
      if (!grupo) continue;
      try {
        const res = await fetch("/api/import/planilha/validar-escola", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: grupo.rows, escolaCodigo: ec.codigo }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Falha ao validar ${ec.nome}.`);
        acumulado[ec.codigo] = data.data;
        setValidacoes({ ...acumulado });
      } catch (e) {
        setError(e instanceof Error ? e.message : `Erro ao validar ${ec.nome}.`);
        break;
      }
    }
    setId(null);
    setBusy(false);
    if (Object.keys(acumulado).length > 0) setStep("duplicados");
  }

  /* ---------- Passo 9: gravar por escola (sequencial) ---------- */
  async function gravarTodas() {
    if (!file || !identificacao) return;
    setBusy(true);
    setError("");
    setCommits({});
    setStep("gravando");
    const acumulado: Record<number, CommitEscola> = {};
    const escolas = identificacao.escolas;
    const hEscola = findHeader(file.rows.length ? Object.keys(file.rows[0]) : [], ESCOLA_ALIASES) || "ESCOLA";
    const grupos = agruparLinhasPorEscola(file.rows, hEscola);
    for (let i = 0; i < escolas.length; i++) {
      const ec = escolas[i];
      setId({ atual: i + 1, total: escolas.length, nome: ec.nome });
      const grupo = grupos.get(ec.codigo);
      if (!grupo) continue;
      try {
        const res = await fetch("/api/import/planilha/commit-escola", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: grupo.rows, escolaCodigo: ec.codigo }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Falha ao gravar ${ec.nome}.`);
        acumulado[ec.codigo] = data.data;
        setCommits({ ...acumulado });
      } catch (e) {
        setError(e instanceof Error ? e.message : `Erro ao gravar ${ec.nome}.`);
        break;
      }
    }
    setId(null);
    setBusy(false);
    if (Object.keys(acumulado).length > 0) setStep("resultado");
  }

  function reset() {
    setFile(null);
    setIdentificacao(null);
    setValidacoes({});
    setCommits({});
    setError("");
    setBusy(false);
    setId(null);
    setBaixouErros(false);
    setStep("fonte");
  }

  function baixarRelatorio() {
    if (!commits) return;
    const linhas: (string | number)[][] = [
      ["Escola", "Linhas", "Turmas criadas", "Turmas atualizadas", "Alunos criados", "Alunos atualizados", "Já cadastrados", "Ignorados/erros", "Matrículas"],
    ];
    Object.values(commits).forEach((c) => {
      const e = c.alunos.escrita;
      linhas.push([
        c.nome,
        c.alunos.total,
        c.turmas.escrita?.turmasCriadas ?? 0,
        c.turmas.escrita?.turmasAtualizadas ?? 0,
        e?.alunosCriados ?? 0,
        e?.alunosAtualizados ?? 0,
        e?.jaCadastrados ?? 0,
        e?.ignorados ?? 0,
        e?.matriculasCriadas ?? 0,
      ]);
    });
    const csv = buildCsv(linhas);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-importacao.csv";
    a.click();
    URL.revokeObjectURL(url);
    setBaixouErros(true);
  }

  const stepIndex = useMemo(() => Math.max(0, ORDER.indexOf(step)), [step]);

  const itensClassificados = useMemo(() => {
    const itens: { escolaCodigo: number; escola: string; situacao: Situacao; item: ItemAluno }[] = [];
    for (const [codigo, v] of Object.entries(validacoes)) {
      const vs = v as ValidacaoEscola;
      for (const i of vs.alunosReport?.itens ?? []) {
        itens.push({ escolaCodigo: vs.codigo, escola: vs.nome, situacao: classificar(vs.codigo, i), item: i });
      }
    }
    itens.sort((a, b) => a.escolaCodigo - b.escolaCodigo || a.item.linha - b.item.linha);
    return itens;
  }, [validacoes, classificar]);

  const contagemPorSituacao = useMemo(() => {
    const c = { novo: 0, existente: 0, atualizar: 0, erro: 0 };
    itensClassificados.forEach((i) => {
      c[i.situacao] += 1;
    });
    return c;
  }, [itensClassificados]);

  const totaisTurmas = useMemo(() => {
    let criadas = 0;
    let atualizadas = 0;
    for (const c of Object.values(commits)) {
      criadas += c.turmas.escrita?.turmasCriadas ?? 0;
      atualizadas += c.turmas.escrita?.turmasAtualizadas ?? 0;
    }
    return { criadas, atualizadas };
  }, [commits]);

  const totaisAlunos = useMemo(() => {
    const t = { criados: 0, atualizados: 0, jaCadastrados: 0, ignorados: 0, matriculas: 0 };
    for (const c of Object.values(commits)) {
      const e = c.alunos.escrita;
      t.criados += e?.alunosCriados ?? 0;
      t.atualizados += e?.alunosAtualizados ?? 0;
      t.jaCadastrados += e?.jaCadastrados ?? 0;
      t.ignorados += e?.ignorados ?? 0;
      t.matriculas += e?.matriculasCriadas ?? 0;
    }
    return t;
  }, [commits]);

  const errosLista = useMemo(() => {
    const erros: { escola: string; linha: number; mensagem: string }[] = [];
    for (const c of Object.values(commits)) {
      for (const i of c.alunos.itens ?? []) {
        if (i.motivos.length > 0) erros.push({ escola: c.nome, linha: i.linha, mensagem: i.motivos.join(" · ") });
      }
    }
    erros.sort((a, b) => a.escola.localeCompare(b.escola) || a.linha - b.linha);
    return erros;
  }, [commits]);

  const headers = file?.rows.length ? Object.keys(file.rows[0]) : [];

  return (
    <div className="space-y-6">
      {/* Indicador de passos */}
      <ol className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold">
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
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

      {/* ============ PASSO 1: Fonte ============ */}
      {step === "fonte" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Sparkles className="h-5 w-5 text-indigo-600" /> Selecionar fonte
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Importação completa a partir de uma única planilha com todas as escolas, turmas e alunos de uma vez.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Fonte</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Planilha única (todas as escolas)</p>
              <p className="text-xs text-slate-500">.xlsx · .xls · .csv — cabeçalho na primeira linha</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">O que será feito</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Escolas → Turmas → Alunos</p>
              <p className="text-xs text-slate-500">Escola e turmas são identificadas e criadas automaticamente</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Situação</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Verificação completa</p>
              <p className="text-xs text-slate-500">Novos vs já cadastrados, erros e relatório final</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("arquivo")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Iniciar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 2: Arquivo ============ */}
      {step === "arquivo" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> Leitura do arquivo
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Envie a planilha com todas as escolas. Uma linha por aluno; primeira linha = cabeçalho.
          </p>

          <div
            onClick={() => {
              const input = document.getElementById("arquivo-unica") as HTMLInputElement | null;
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
              {file ? `${file.rows.length} aluno(s) no arquivo` : ".xlsx · .xls · .csv — todas as escolas em um arquivo"}
            </p>
            <input
              id="arquivo-unica"
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
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-indigo-700">{file.sheets.length}</p>
                <p className="text-xs font-semibold text-slate-500">aba(s) no arquivo</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-indigo-700">
                  {new Set(
                    file.rows
                      .map((r) => {
                        const h = findHeader(headers, ESCOLA_ALIASES) || "ESCOLA";
                        return cell(r, h);
                      })
                      .map((e) => matchEscolaCodigo(e))
                      .filter((c): c is number => c !== null)
                  ).size}
                </p>
                <p className="text-xs font-semibold text-slate-500">escolas identificadas</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-indigo-700">{file.rows.length}</p>
                <p className="text-xs font-semibold text-slate-500">alunos (linhas)</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-indigo-700">{headers.length}</p>
                <p className="text-xs font-semibold text-slate-500">campos detectados</p>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("fonte")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => void identificar()}
              disabled={!file || busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Identificar escolas <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 3: Escolas ============ */}
      {step === "escolas" && identificacao && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <School className="h-5 w-5 text-indigo-600" /> Identificar escolas
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Comparação com o banco: as escolas <strong>no banco serão utilizadas</strong>; as novas serão criadas na
            importação.
          </p>

          <div className="mt-4 space-y-2">
            {identificacao.escolas.map((ec) => (
              <div
                key={ec.codigo}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3",
                  ec.existe ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700">
                  {String(ec.codigo).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{ec.nome}</span>
                  <span className="block text-xs text-slate-500">
                    {ec.tipo} · {ec.linhas} linha(s) · {ec.turmas} turma(s)
                  </span>
                </span>
                {ec.existe ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Usar existente
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                    <Database className="h-3.5 w-3.5" /> Será criada
                  </span>
                )}
              </div>
            ))}

            {identificacao.semEscola.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-rose-700">
                  <XCircle className="h-4 w-4" /> Linhas sem escola identificada ({identificacao.semEscola.length})
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-rose-600">
                  {identificacao.semEscola.map((s, i) => (
                    <li key={i}>
                      &ldquo;{s.escola}&rdquo; — {s.linhas} linha(s)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("arquivo")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("turmas")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Ver turmas <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 4: Turmas ============ */}
      {step === "turmas" && identificacao && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Layers className="h-5 w-5 text-indigo-600" /> Identificar turmas
          </h2>
          <p className="mt-1 text-xs text-slate-400">Turmas distintas encontradas na planilha por escola.</p>

          <div className="mt-4 space-y-3">
            {identificacao.escolas.map((ec) => (
              <details key={ec.codigo} className="rounded-xl border border-slate-200 bg-slate-50 open:pb-3">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-xs font-bold text-indigo-700">
                    {String(ec.codigo).padStart(2, "0")}
                  </span>
                  {ec.nome}
                  <span className="ml-auto rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                    {ec.turmas} turma(s)
                  </span>
                </summary>
                <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                  {ec.turmasNomes.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      <Users className="h-3 w-3 text-indigo-500" /> {t}
                    </span>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("escolas")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => void validarTodas()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Validar alunos <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 5: Validar ============ */}
      {step === "validar" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <h2 className="text-lg font-extrabold text-slate-900">Validando alunos...</h2>
          </div>
          {id && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">{id.nome}</span>
                <span className="text-slate-400 tabular-nums">
                  {id.atual} de {id.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${(id.atual / id.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">Conferindo turmas, ano/série e duplicidades por escola...</p>
        </div>
      )}

      {/* ============ PASSO 6: Duplicados ============ */}
      {step === "duplicados" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Table2 className="h-5 w-5 text-indigo-600" /> Alunos duplicados e situação
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Classificação dos alunos da planilha em relação ao cadastro atual.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-emerald-700">🟢 {contagemPorSituacao.novo}</p>
              <p className="text-xs font-semibold text-emerald-700">novos alunos</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-amber-600">🟡 {contagemPorSituacao.existente}</p>
              <p className="text-xs font-semibold text-amber-600">já cadastrados</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-sky-700">🔵 {contagemPorSituacao.atualizar}</p>
              <p className="text-xs font-semibold text-sky-700">atualizar cadastro</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-rose-600">🔴 {contagemPorSituacao.erro}</p>
              <p className="text-xs font-semibold text-rose-600">dados com erro</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {Object.values(validacoes)
              .sort((a, b) => a.codigo - b.codigo)
              .map((v) => {
                const erros = v.alunosReport?.itens?.filter((i) => i.status === "erro").length ?? 0;
                return (
                  <div key={v.codigo} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                    <span className="text-sm font-bold text-slate-900">
                      {String(v.codigo).padStart(2, "0")} · {v.nome}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-slate-500">
                      {v.alunos} aluno(s) · {v.turmas?.total ?? 0} turma(s)
                      {erros > 0 && <span className="ml-2 text-rose-600">{erros} erro(s)</span>}
                    </span>
                  </div>
                );
              })}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("turmas")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("preview")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Pré-visualizar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 7: Pré-visualização ============ */}
      {step === "preview" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <FileUp className="h-5 w-5 text-indigo-600" /> Pré-visualização
          </h2>
          <p className="mt-1 text-xs text-slate-400">Linhas da planilha com a situação de cada aluno.</p>

          <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Escola</th>
                  <th className="px-3 py-2 font-semibold">Linha</th>
                  <th className="px-3 py-2 font-semibold">Aluno</th>
                  <th className="px-3 py-2 font-semibold">Turma</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itensClassificados.map((i) => (
                  <tr key={`${i.escolaCodigo}-${i.item.linha}`}>
                    <td className="px-3 py-2 align-top text-xs font-semibold text-slate-500">{i.escola}</td>
                    <td className="px-3 py-2 align-top font-mono text-xs text-slate-400">{i.item.linha}</td>
                    <td className="px-3 py-2 align-top font-semibold text-slate-900">{i.item.nome}</td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">
                      {i.item.turma} {i.item.turno ? `· ${i.item.turno}` : ""}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {i.situacao === "erro" && (
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                          <XCircle className="h-3.5 w-3.5" /> Dados com erro
                        </span>
                      )}
                      {i.situacao === "existente" && (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> Já cadastrado
                        </span>
                      )}
                      {i.situacao === "atualizar" && (
                        <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                          <RefreshCcw className="h-3.5 w-3.5" /> Atualizar cadastro
                        </span>
                      )}
                      {i.situacao === "novo" && (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                          <UserPlus className="h-3.5 w-3.5" /> Novo aluno
                        </span>
                      )}
                      {i.item.motivos.length > 0 && (
                        <span className="mt-1 block font-normal text-slate-400">{i.item.motivos.join(" · ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("duplicados")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep("confirmar")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Confirmar importação <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 8: Confirmar ============ */}
      {step === "confirmar" && identificacao && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-indigo-600" /> Confirmar importação
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Revise o resumo antes de gravar. As linhas com erro serão ignoradas; o restante será gravado no banco.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{identificacao.escolas.length}</p>
              <p className="text-xs font-semibold text-slate-500">escolas</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">
                {identificacao.escolas.reduce((acc, e) => acc + e.turmas, 0)}
              </p>
              <p className="text-xs font-semibold text-slate-500">turmas</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{identificacao.totalLinhas}</p>
              <p className="text-xs font-semibold text-slate-500">alunos na planilha</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-rose-600">{contagemPorSituacao.erro}</p>
              <p className="text-xs font-semibold text-rose-600">linhas com erro (serão ignoradas)</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("preview")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => void gravarTodas()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Sim, gravar no banco <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 9: Gravar ============ */}
      {step === "gravando" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <h2 className="text-lg font-extrabold text-slate-900">Gravando no Supabase...</h2>
          </div>
          {id && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">{id.nome}</span>
                <span className="text-slate-400 tabular-nums">
                  {id.atual} de {id.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${(id.atual / id.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {Object.values(commits).map((c) => (
              <div key={c.codigo} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-slate-900">{c.nome}</span>
                <span className="ml-auto text-xs text-slate-500">
                  {c.alunos.escrita?.alunosCriados ?? 0} novo(s) · {c.alunos.escrita?.jaCadastrados ?? 0} já cadastrado(s)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ PASSO 10: Resultado ============ */}
      {step === "resultado" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-3 text-center text-xl font-extrabold text-slate-900">Resultado da importação</h2>

          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{Object.keys(commits).length}</p>
              <p className="text-xs font-semibold text-slate-500">escolas gravadas</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{totaisTurmas.criadas}</p>
              <p className="text-xs font-semibold text-slate-500">turmas criadas</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{totaisTurmas.atualizadas}</p>
              <p className="text-xs font-semibold text-slate-500">turmas atualizadas</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-2xl font-extrabold text-slate-900">{totaisAlunos.matriculas}</p>
              <p className="text-xs font-semibold text-slate-500">matrículas</p>
            </div>
          </div>

          <div className="mx-auto mt-3 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-emerald-700">{totaisAlunos.criados}</p>
              <p className="text-xs font-semibold text-emerald-700">🟢 alunos criados</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-sky-700">{totaisAlunos.atualizados}</p>
              <p className="text-xs font-semibold text-sky-700">🔵 cadastros atualizados</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-amber-600">{totaisAlunos.jaCadastrados}</p>
              <p className="text-xs font-semibold text-amber-600">🟡 já cadastrados</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-2xl font-extrabold text-rose-600">{totaisAlunos.ignorados}</p>
              <p className="text-xs font-semibold text-rose-600">🔴 ignorados/erros</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setStep("relatorio")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Ver relatório final
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* ============ PASSO 11: Relatório final ============ */}
      {step === "relatorio" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> Relatório final
            </h2>
            <p className="mt-1 text-xs text-slate-400">Resumo por escola dos dados gravados e erros encontrados.</p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Escola</th>
                    <th className="px-3 py-2 font-semibold">Turmas criadas</th>
                    <th className="px-3 py-2 font-semibold">Turmas atualizadas</th>
                    <th className="px-3 py-2 font-semibold">Alunos criados</th>
                    <th className="px-3 py-2 font-semibold">Atualizados</th>
                    <th className="px-3 py-2 font-semibold">Já cadastrados</th>
                    <th className="px-3 py-2 font-semibold">Ignorados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.values(commits)
                    .sort((a, b) => a.codigo - b.codigo)
                    .map((c) => (
                      <tr key={c.codigo}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{c.nome}</td>
                        <td className="px-3 py-2 tabular-nums">{c.turmas.escrita?.turmasCriadas ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums">{c.turmas.escrita?.turmasAtualizadas ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums text-emerald-700">{c.alunos.escrita?.alunosCriados ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums text-sky-700">{c.alunos.escrita?.alunosAtualizados ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums text-amber-600">{c.alunos.escrita?.jaCadastrados ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums text-rose-600">{c.alunos.escrita?.ignorados ?? 0}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {errosLista.length > 0 && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-sm font-bold text-rose-700">🔴 Linhas ignoradas ({errosLista.length})</p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-rose-600">
                  {errosLista.map((e, i) => (
                    <li key={i}>
                      <strong>{e.escola}</strong> · linha {e.linha}: {e.mensagem}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={baixarRelatorio}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50",
                  baixouErros && "border-emerald-300 bg-emerald-50 text-emerald-700"
                )}
              >
                <Download className="h-4 w-4" /> {baixouErros ? "Relatório baixado" : "Baixar relatório (CSV)"}
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                <RefreshCcw className="h-4 w-4" /> Nova importação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}