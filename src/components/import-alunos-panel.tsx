"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Rocket,
  School,
  Search,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { ESCOLAS_MUNICIPAIS, escolaLabel, escolaTipo } from "@/lib/municipal-schools";
import { cn } from "@/lib/utils";

type TurmaOption = { id: string; nome: string; ano: string; turno: string };

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
  resumo: { turma: string; ano: string; turno: string; quantidade: number }[];
  escrita?: {
    alunosCriados: number;
    alunosAtualizados: number;
    matriculasCriadas: number;
    jaCadastrados: number;
    ignorados: number;
  };
};

type FileState = { name: string; rows: Record<string, string | number | null | undefined>[] };

export default function ImportarAlunosPanel() {
  const [step, setStep] = useState<"escola" | "turma" | "validacao" | "concluido">("escola");

  // Escola
  const [escolasData, setEscolasData] = useState<{ id: string; nome: string; turmas: TurmaOption[] }[]>([]);
  const [busca, setBusca] = useState("");
  const [escolaCodigo, setEscolaCodigo] = useState<number | null>(null);

  // Turma
  const [turmaId, setTurmaId] = useState<string>("");
  const [anoLetivo, setAnoLetivo] = useState<number>(2026);

  // Planilha
  const [file, setFile] = useState<FileState | null>(null);
  const [busy, setBusy] = useState<"validar" | "publicar" | null>(null);
  const [report, setReport] = useState<AlunoReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/escolas")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) {
          setEscolasData(
            data.escolas.map((e: { id: string; nome: string; turmas: TurmaOption[] }) => ({
              id: e.id,
              nome: e.nome,
              turmas: e.turmas,
            }))
          );
        }
      })
      .catch(() => {
        /* mantém sem escolas se falhar */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fixedEscola = ESCOLAS_MUNICIPAIS.find((ec) => ec.numero === escolaCodigo) ?? null;
  const selectedEscola = fixedEscola
    ? escolasData.find((e) => e.nome.toUpperCase() === fixedEscola.nome.toUpperCase()) ?? null
    : null;

  const turmasDisponiveis = selectedEscola?.turmas ?? [];

  const escolasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return ESCOLAS_MUNICIPAIS.filter((ec) => {
      const label = `${escolaLabel(ec)}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return !q || label.includes(q) || String(ec.numero).includes(q);
    });
  }, [busca]);

  /* ---------- Baixar modelo da escola ---------- */
  function baixarModelo() {
    if (!fixedEscola || !selectedEscola) return;
    const turmas = turmaId ? selectedEscola.turmas.filter((t) => t.id === turmaId) : selectedEscola.turmas;
    const headers = ["Nº", "NOME DO ALUNO", "CPF", "DATA DE NASCIMENTO", "TURMA", "TURNO"];
    const linhas: (string | number)[][] = [];
    linhas.push([`Importação de alunos — ${fixedEscola.nome} — ${anoLetivo}`, "", "", "", "", ""]);
    linhas.push(headers);
    for (const t of turmas) {
      for (let i = 0; i < 3; i++) {
        linhas.push(["", "", "", "", t.nome, t.turno]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    const slug = fixedEscola.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
    XLSX.writeFile(wb, `modelo-alunos-${slug}-${anoLetivo}.xlsx`);
  }

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

      // Detecta a linha do cabeçalho
      const KNOWN = ["Nº", "NOME DO ALUNO", "CPF", "DATA DE NASCIMENTO", "TURMA", "TURNO"];
      const norm = (s: string) =>
        s.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ºª]/g, "").replace(/\s+/g, " ");
      const headerIdx = raw.findIndex((row) => {
        const hits = row.filter((c) => typeof c === "string" && c.trim() && KNOWN.some((k) => norm(k) === norm(String(c)))).length;
        return hits >= 3;
      });
      if (headerIdx < 0) throw new Error("Não foi possível identificar as colunas. Verifique o modelo da escola.");

      const headers = raw[headerIdx].map((h) => String(h || "").trim());
      const dataRows = raw.slice(headerIdx + 1).filter((row) => row.some((c) => c !== "" && c !== null));

      const rows = dataRows.map((row: unknown[]) => {
        const obj: Record<string, string | number | null | undefined> = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? (row[i] as string | number | null) : "";
        });
        return obj;
      });
      if (rows.length === 0) throw new Error("Nenhuma linha de dados depois do cabeçalho.");
      setFile({ name: f.name, rows });
      setStep("validacao");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      setFile(null);
    }
  }, []);

  /* ---------- Validar ---------- */
  async function validar() {
    if (!file || !selectedEscola) return;
    setBusy("validar");
    setError("");
    try {
      const res = await fetch("/api/alunos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId: selectedEscola.id,
          turmaId: turmaId || undefined,
          anoLetivo,
          rows: file.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao validar.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  /* ---------- Confirmar (commit) ---------- */
  async function confirmar() {
    if (!file || !selectedEscola || !report) return;
    setBusy("publicar");
    setError("");
    try {
      const res = await fetch("/api/alunos/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId: selectedEscola.id,
          turmaId: turmaId || undefined,
          anoLetivo,
          rows: file.rows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao importar.");
        return;
      }
      setReport(data.report);
      setStep("concluido");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setReport(null);
    setError("");
    setBusy(null);
    setStep("escola");
  }

  function voltarEscola() {
    setEscolaCodigo(null);
    setTurmaId("");
    setFile(null);
    setReport(null);
    setError("");
    setStep("escola");
  }

  /* ================================================================ */
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setStep("escola")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700",
          step === "escola" && "pointer-events-none opacity-0"
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Alterar escola
      </button>

      {/* ============ PASSOS 1 e 2: seleção de escola + arquivo ============ */}
      {(step === "escola" || step === "turma") && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <School className="h-5 w-5 text-indigo-600" /> Selecionar escola
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Selecione a escola e envie a planilha do seu arquivo desta unidade.
            </p>

            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Digite o nome da escola..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {escolasFiltradas.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-400">Nenhuma escola encontrada.</p>
              ) : (
                escolasFiltradas.map((ec) => (
                  <button
                    key={ec.numero}
                    type="button"
                    onClick={() => {
                      setEscolaCodigo(ec.numero);
                      setTurmaId("");
                      setError("");
                      setStep("turma");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
                      escolaCodigo === ec.numero
                        ? "bg-indigo-50 font-semibold text-indigo-700"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>{escolaLabel(ec)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            {fixedEscola && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Escola selecionada</p>
                <p className="mt-1 flex items-start gap-2 font-bold text-slate-900">
                  <School className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                  {fixedEscola.nome}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Código: {String(fixedEscola.numero).padStart(2, "0")} · {escolaTipo(fixedEscola.numero)}
                </p>
                {!selectedEscola && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Esta escola ainda não tem turmas cadastradas. Procure a coordenação antes de importar.
                  </p>
                )}
              </div>
            )}

            {fixedEscola && selectedEscola && (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Turma</label>
                  <select
                    value={turmaId}
                    onChange={(e) => setTurmaId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Todas as turmas</option>
                    {turmasDisponiveis.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome} · {t.turno} · {t.ano}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-400">
                    {turmaId
                      ? "O modelo virá com esta turma preenchida."
                      : "O modelo virá com todas as turmas da escola; a planilha pode conter várias turmas."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Ano letivo</label>
                  <select
                    value={anoLetivo}
                    onChange={(e) => setAnoLetivo(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  >
                    {[2026, 2027, 2025].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={baixarModelo}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    <Download className="h-4 w-4" /> Baixar modelo ({anoLetivo})
                  </button>
                </div>

                <div
                  onClick={() => {
                    const input = document.getElementById("arquivo-alunos") as HTMLInputElement | null;
                    input?.click();
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void parseFile(f);
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40"
                >
                  <FileSpreadsheet className="h-10 w-10 text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-700">
                    {file ? file.name : "Arraste a planilha ou clique para enviar"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {file ? `${file.rows.length} aluno(s) no arquivo` : "Modelo: Nº · Nome do aluno · CPF · Data de nascimento · Turma · Turno"}
                  </p>
                  <input
                    id="arquivo-alunos"
                    type="file"
                    accept=".xlsx,.xls"
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
                    onClick={() => void validar()}
                    disabled={busy !== null}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {busy === "validar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {busy === "validar" ? "Validando..." : "Validar importação"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      {/* ============ PASSO 3: validação ============ */}
      {step === "validacao" && report && (
        <div className="space-y-6">
          <ValidationHeader
            escola={fixedEscola?.nome ?? ""}
            report={report}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard tone="bg-slate-100 text-slate-700" label="Total de linhas" value={String(report.total)} />
            <MetricCard tone="bg-emerald-100 text-emerald-700" label="Válidos" value={String(report.validas)} />
            <MetricCard tone="bg-amber-100 text-amber-700" label="Avisos" value={String(report.avisos)} />
            <MetricCard tone="bg-rose-100 text-rose-700" label="Com erro" value={String(report.erros)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={busy !== null || report.erros > 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              title={report.erros > 0 ? "Corrija os erros na planilha antes de importar." : "Confirmar importação"}
            >
              {busy === "publicar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {busy === "publicar" ? "Importando..." : "Confirmar importação"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Importar nova planilha
            </button>
            <Link
              href="/admin/professor/cadastro"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cadastrar manual
            </Link>
          </div>

          {/* Resumo por turma */}
          {report.resumo.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h3 className="text-sm font-bold text-slate-900">Turmas encontradas</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold">Turma</th>
                    <th className="px-4 py-2.5 font-semibold">Ano</th>
                    <th className="px-4 py-2.5 font-semibold">Turno</th>
                    <th className="px-4 py-2.5 font-semibold">Alunos</th>
                  </tr>
                </thead>
                <tbody>
                  {report.resumo.map((r) => (
                    <tr key={`${r.turma}-${r.ano}`} className="border-b border-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{r.turma}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.ano}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.turno}</td>
                      <td className="px-4 py-2.5 font-semibold text-indigo-700">{r.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Erros */}
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

      {/* ============ PASSO 4: concluído ============ */}
      {step === "concluido" && report && report.escrita && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-3 text-xl font-extrabold text-slate-900">Importação concluída</h2>
          <p className="mt-1 text-sm text-slate-600">
            <strong>{fixedEscola?.nome}</strong> · Ano letivo {anoLetivo}
          </p>

          <div className="mx-auto mt-6 grid max-w-xl gap-3 text-left sm:grid-cols-2">
            <ResultStat label="Alunos importados" value={report.escrita.alunosCriados} />
            <ResultStat label="Reutilizados em nova turma" value={report.escrita.alunosAtualizados} />
            <ResultStat label="Matrículas criadas" value={report.escrita.matriculasCriadas} />
            <ResultStat label="Já cadastrados nesta turma" value={report.escrita.jaCadastrados} />
            <ResultStat label="Linhas com erro (ignoradas)" value={report.escrita.ignorados} />
            <ResultStat label="Total de linhas" value={report.total} />
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link
              href="/admin/alunos"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              <Users className="h-4 w-4" /> Ver alunos
            </Link>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Importar nova planilha
            </button>
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

function ValidationHeader({ escola, report }: { escola: string; report: AlunoReport }) {
  const ok = !report.ok && report.erros > 0;
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        ok ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {ok ? <XCircle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {ok ? "Erros de importação" : "Validação concluída"}
      </h2>
      <p className="mt-1 text-sm text-slate-600">Escola: <strong>{escola}</strong></p>
      {ok && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700">
          Corrija os erros na planilha e envie novamente. Nenhum dado foi gravado.
        </p>
      )}
    </div>
  );
}

function MetricCard({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold", tone)}>
        {value}
      </span>
      <p className="text-xs font-medium text-slate-500">{label}</p>
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