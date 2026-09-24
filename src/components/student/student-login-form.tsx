"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, LogIn, MapPin, School, UserRound, Users } from "lucide-react";

type Escola = { id: string; codigo: number | null; nome: string };
type Turma = { id: string; nome: string; ano: string; turno: string };
type Aluno = { id: string; nome: string; numeroChamada: number | null };

/** Login do aluno em cascata: escola → turma → aluno → senha (dados do Supabase). */
export default function StudentLoginForm() {
  const router = useRouter();

  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);

  const [escolaId, setEscolaId] = useState("");
  const [turmaId, setTurmaId] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [senha, setSenha] = useState("");

  const [loadingEscolas, setLoadingEscolas] = useState(true);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/aluno/escolas", { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!ctrl.signal.aborted && data?.ok) setEscolas(data.escolas ?? []);
      })
      .catch(() => {
        /* mantém lista vazia se a consulta falhar */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingEscolas(false);
      });
    return () => ctrl.abort();
  }, []);

  function handleChangeEscola(value: string) {
    setEscolaId(value);
    setTurmaId("");
    setAlunoId("");
    setSenha("");
    setTurmas([]);
    setAlunos([]);
    setError("");
    if (!value) {
      setLoadingTurmas(false);
      return;
    }
    setLoadingTurmas(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch(`/api/aluno/turmas?escolaId=${encodeURIComponent(value)}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!ctrl.signal.aborted && data?.ok) setTurmas(data.turmas ?? []);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setTurmas([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingTurmas(false);
      });
  }

  function handleChangeTurma(value: string) {
    setTurmaId(value);
    setAlunoId("");
    setSenha("");
    setAlunos([]);
    setError("");
    if (!value) {
      setLoadingAlunos(false);
      return;
    }
    setLoadingAlunos(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch(`/api/aluno/alunos?turmaId=${encodeURIComponent(value)}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!ctrl.signal.aborted && data?.ok) setAlunos(data.alunos ?? []);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAlunos([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingAlunos(false);
      });
  }

  const canSubmit = Boolean(escolaId && turmaId && alunoId && senha) && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!escolaId || !turmaId || !alunoId || !senha) return;
    setLoading(true);
    try {
      const res = await fetch("/api/aluno/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escolaId, turmaId, alunoId, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar. Tente novamente.");
        setLoading(false);
        return;
      }
      router.push(data.redirectTo ?? "/aluno/painel");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid items-stretch gap-5 sm:grid-cols-2">
        {/* Caixa 1 — Acesso escolar (esquerda) */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <School className="h-4 w-4 text-indigo-500" /> Acesso escolar
          </h2>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-slate-400" /> Escola
            </label>
            <select
              value={escolaId}
              onChange={(e) => handleChangeEscola(e.target.value)}
              disabled={loadingEscolas || escolas.length === 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="" disabled>
                {loadingEscolas
                  ? "Carregando escolas..."
                  : escolas.length === 0
                    ? "Nenhuma escola cadastrada"
                    : "Selecione a escola"}
              </option>
              {escolas.map((ec) => (
                <option key={ec.id} value={ec.id}>
                  {ec.codigo != null ? `${String(ec.codigo).padStart(2, "0")} | ` : ""}
                  {ec.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Users className="h-3.5 w-3.5 text-slate-400" /> Turma
            </label>
            <select
              value={turmaId}
              onChange={(e) => handleChangeTurma(e.target.value)}
              disabled={!escolaId || loadingTurmas}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="" disabled>
                {!escolaId
                  ? "Escolha uma escola primeiro"
                  : loadingTurmas
                    ? "Carregando turmas..."
                    : turmas.length === 0
                      ? "Nenhuma turma cadastrada para esta escola."
                      : "Selecione a turma"}
              </option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} · {t.ano} · {t.turno}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Caixa 2 — Dados do aluno (direita) */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <UserRound className="h-4 w-4 text-indigo-500" /> Dados do aluno
          </h2>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <UserRound className="h-3.5 w-3.5 text-slate-400" /> Nome do aluno
            </label>
            <select
              value={alunoId}
              onChange={(e) => {
                setAlunoId(e.target.value);
                setSenha("");
                setError("");
              }}
              disabled={!turmaId || loadingAlunos}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="" disabled>
                {!turmaId
                  ? "Selecione a turma primeiro"
                  : loadingAlunos
                    ? "Carregando alunos..."
                    : alunos.length === 0
                      ? "Nenhum aluno cadastrado nesta turma."
                      : "Selecione o aluno"}
              </option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${String(a.numeroChamada ?? 0).padStart(3, "0")} — ${a.nome}`}
                </option>
              ))}
            </select>
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
                disabled={!alunoId}
                className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {alunoId ? "Digite a senha informada pela escola." : "Senha padrão: 123456"}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:hover:bg-slate-300"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        {loading ? "Entrando..." : "Entrar no painel do aluno"}
      </button>
    </form>
  );
}