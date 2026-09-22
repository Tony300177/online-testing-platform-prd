"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  School,
  UserRound,
  Users,
} from "lucide-react";
import { ESCOLAS_MUNICIPAIS, escolaLabel } from "@/lib/municipal-schools";
import { cn } from "@/lib/utils";

type SchoolAluno = { id: string; nome: string; numeroChamada: number | null };
type SchoolTurma = { id: string; nome: string; ano: string; turno: string; professor: string | null; alunos: SchoolAluno[] };
type SchoolOption = { id: string; nome: string; turmas: SchoolTurma[] };

type Step = "escola" | "turma" | "aluno" | "senha";

const PROGRESS: { key: Step; label: string; icon: typeof School }[] = [
  { key: "escola", label: "Escola", icon: School },
  { key: "turma", label: "Turma", icon: Users },
  { key: "aluno", label: "Aluno", icon: UserRound },
  { key: "senha", label: "Senha", icon: KeyRound },
];

/** Login do aluno em passos: escola → turma → aluno → senha (padrão 123456). */
export default function StudentLoginForm() {
  const router = useRouter();
  const [schoolData, setSchoolData] = useState<SchoolOption[]>([]);
  const [escolaCodigo, setEscolaCodigo] = useState<number | "">("");
  const [turmaId, setTurmaId] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [senha, setSenha] = useState("");
  const [step, setStep] = useState<Step>("escola");
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/escolas")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) setSchoolData(data.escolas);
      })
      .catch(() => {
        /* mantém sem escolas se a consulta falhar */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fixedEscola = ESCOLAS_MUNICIPAIS.find((ec) => ec.numero === escolaCodigo) ?? null;
  const selectedEscola = fixedEscola
    ? schoolData.find((e) => e.nome.toUpperCase() === fixedEscola.nome) ?? null
    : null;
  const selectedTurma = selectedEscola?.turmas.find((t) => t.id === turmaId) ?? null;

  const turmaAlunos = selectedTurma
    ? selectedTurma.alunos
        .slice()
        .sort((a, b) => (a.numeroChamada ?? 0) - (b.numeroChamada ?? 0))
    : ([] as { id: string; nome: string; numeroChamada: number | null }[]);

  const selectedAluno = turmaAlunos.find((a) => a.id === alunoId) ?? null;

  /** Avança para o próximo passo exibindo a mensagem de "carregando" do fluxo. */
  function advance(next: Step, msg: string) {
    setLoadingMsg(msg);
    setError("");
    window.setTimeout(() => {
      setLoadingMsg(null);
      setStep(next);
    }, 450);
  }

  function chooseEscola(codigo: number) {
    if (codigo === escolaCodigo) return;
    setEscolaCodigo(codigo);
    setTurmaId("");
    setAlunoId("");
    advance("turma", "Identificando a escola…");
  }

  function chooseTurma(id: string) {
    if (id === turmaId) return;
    setTurmaId(id);
    setAlunoId("");
    advance("aluno", "Carregando os alunos da turma…");
  }

  function chooseAluno(id: string) {
    setAlunoId(id);
    setError("");
    setStep("senha");
  }

  function goBack(to: Step) {
    setError("");
    if (to === "escola") {
      setEscolaCodigo("");
      setTurmaId("");
      setAlunoId("");
    }
    if (to === "turma") {
      setTurmaId("");
      setAlunoId("");
    }
    if (to === "aluno") setAlunoId("");
    setStep(to);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedAluno) {
      setError("Selecione o seu nome na lista da turma.");
      return;
    }
    if (!senha) {
      setError("Digite a sua senha.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/aluno/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: selectedAluno.nome, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar. Tente novamente.");
        setSaving(false);
        return;
      }
      router.push("/aluno/painel");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setSaving(false);
    }
  }

  const stepIndex = PROGRESS.findIndex((s) => s.key === step);

  return (
    <div className="space-y-5">
      {/* Indicador de progresso do passo a passo */}
      <ol className="flex items-center gap-1">
        {PROGRESS.map((s, i) => {
          const active = i === stepIndex;
          const done = i < stepIndex;
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center transition",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : done
                      ? "text-emerald-600"
                      : "text-slate-400"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 transition",
                    active && "border-indigo-600 bg-indigo-600 text-white",
                    done && "border-emerald-500 bg-emerald-500 text-white",
                    !active && !done && "border-slate-300"
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="text-[11px] font-semibold leading-tight">{s.label}</span>
              </div>
              {i < PROGRESS.length - 1 && (
                <div className={cn("h-0.5 flex-1 rounded", i < stepIndex ? "bg-emerald-400" : "bg-slate-200")} />
              )}
            </li>
          );
        })}
      </ol>

      {loadingMsg && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-4 py-5 text-sm font-medium text-indigo-700">
          <Loader2 className="h-5 w-5 animate-spin" /> {loadingMsg}
        </div>
      )}

      {!loadingMsg && step === "escola" && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Qual é a sua escola?</h3>
            <p className="text-xs text-slate-500">
              Selecione a unidade da rede municipal em que você estuda.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            {ESCOLAS_MUNICIPAIS.map((ec) => (
              <button
                key={ec.numero}
                type="button"
                onClick={() => chooseEscola(ec.numero)}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                  {String(ec.numero).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium text-slate-700 hover:text-inherit">
                  {escolaLabel(ec)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loadingMsg && step === "turma" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => goBack("escola")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Trocar de escola
          </button>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
            {escolaLabel(fixedEscola!)}
          </div>
          {(!selectedEscola || selectedEscola.turmas.length === 0) ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800">
                Essa escola ainda não tem turmas cadastradas. Procure a coordenação.
              </p>
              <button
                type="button"
                onClick={() => goBack("escola")}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Escolher outra escola
              </button>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              {selectedEscola.turmas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseTurma(t.id)}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                    {t.nome.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">{t.nome}</span>
                    <span className="block text-xs text-slate-400">
                      {t.ano} · {t.turno} · {t.alunos.length} aluno(s)
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loadingMsg && step === "aluno" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => goBack("turma")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Trocar de turma
          </button>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">
            {selectedTurma?.nome}
          </div>
          {turmaAlunos.length === 0 ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800">
                Essa turma ainda não tem alunos cadastrados. Procure a coordenação.
              </p>
              <button
                type="button"
                onClick={() => goBack("turma")}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Escolher outra turma
              </button>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              {turmaAlunos.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => chooseAluno(a.id)}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                    {String(a.numeroChamada ?? 0).padStart(2, "0")}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-700">{a.nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loadingMsg && step === "senha" && (
        <form onSubmit={submit} className="space-y-3">
          <button
            type="button"
            onClick={() => goBack("aluno")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Trocar de aluno
          </button>
          <div className="space-y-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-indigo-800">{escolaLabel(fixedEscola!)}</p>
            <p className="text-xs text-indigo-700">
              {selectedTurma?.nome} — {selectedAluno?.nome}
            </p>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" /> Senha
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setError("");
                }}
                placeholder="Senha informada pela escola"
                autoComplete="current-password"
                autoFocus
                className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Senha padrão: 123456</p>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {saving ? "Entrando…" : "Entrar no painel do aluno"}
          </button>
        </form>
      )}
    </div>
  );
}