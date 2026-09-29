"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  School,
  UserRound,
  Users,
} from "lucide-react";

type Escola = { id: string; codigo: number | null; nome: string };
type Turma = { id: string; nome: string; ano: string; turno: string };

/**
 * Login do aluno em etapas: escola → turma → identificação do aluno.
 * Os nomes da turma nunca são listados publicamente: o aluno os informa junto
 * com a senha, evitando a enumeração de estudantes da rede.
 */
export default function StudentLoginForm() {
  const router = useRouter();

  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [escolaId, setEscolaId] = useState("");
  const [turmaId, setTurmaId] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [loadingEscolas, setLoadingEscolas] = useState(true);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const escolaSelecionada = escolas.find((escola) => escola.id === escolaId);
  const turmaSelecionada = turmas.find((turma) => turma.id === turmaId);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/aluno/escolas", { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!ctrl.signal.aborted && data?.ok) setEscolas(data.escolas ?? []);
      })
      .catch(() => {
        // Mantém a lista vazia se a consulta falhar.
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingEscolas(false);
      });
    return () => ctrl.abort();
  }, []);

  function handleChangeEscola(value: string) {
    setEscolaId(value);
    setTurmaId("");
    setNome("");
    setSenha("");
    setTurmas([]);
    setError("");
    abortRef.current?.abort();

    if (!value) {
      setLoadingTurmas(false);
      return;
    }

    setLoadingTurmas(true);
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
    setNome("");
    setSenha("");
    setError("");
  }

  const canSubmit = Boolean(escolaId && turmaId && nome.trim() && senha) && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!escolaId || !turmaId || !nome.trim() || !senha) return;

    setLoading(true);
    try {
      const res = await fetch("/api/aluno/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escolaId, turmaId, nome: nome.trim(), senha }),
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

  const etapaAtual = !escolaId ? 1 : !turmaId ? 2 : 3;

  return (
    <form onSubmit={submit} className="space-y-5">
      <ol aria-label="Etapas para entrar" className="grid grid-cols-3 gap-2">
        {[
          { numero: 1, titulo: "Escola", concluida: Boolean(escolaId) },
          { numero: 2, titulo: "Turma", concluida: Boolean(turmaId) },
          { numero: 3, titulo: "Aluno", concluida: false },
        ].map((etapa) => {
          const ativa = etapaAtual === etapa.numero;
          return (
            <li
              key={etapa.numero}
              aria-current={ativa ? "step" : undefined}
              className={`flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${
                ativa
                  ? "bg-indigo-600 text-white"
                  : etapa.concluida
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  ativa ? "bg-white/20" : etapa.concluida ? "bg-indigo-100" : "bg-white"
                }`}
              >
                {etapa.concluida ? <Check className="h-3.5 w-3.5" /> : etapa.numero}
              </span>
              {etapa.titulo}
            </li>
          );
        })}
      </ol>

      <section
        aria-labelledby="escola-title"
        className={`rounded-2xl border p-4 transition sm:p-5 ${
          escolaId ? "border-indigo-100 bg-indigo-50/50" : "border-slate-200 bg-white"
        }`}
      >
        <h2 id="escola-title" className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <School className="h-4 w-4" />
          </span>
          1. Escolha sua escola
        </h2>
        <label htmlFor="student-school" className="sr-only">
          Escola
        </label>
        <div className="relative mt-3">
          <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            id="student-school"
            value={escolaId}
            onChange={(e) => handleChangeEscola(e.target.value)}
            disabled={loadingEscolas || escolas.length === 0}
            className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="" disabled>
              {loadingEscolas
                ? "Carregando escolas..."
                : escolas.length === 0
                  ? "Nenhuma escola cadastrada"
                  : "Selecione sua escola"}
            </option>
            {escolas.map((escola) => (
              <option key={escola.id} value={escola.id}>
                {escola.codigo != null ? `${String(escola.codigo).padStart(2, "0")} | ` : ""}
                {escola.nome}
              </option>
            ))}
          </select>
        </div>
        {escolaSelecionada && (
          <p className="mt-2 text-xs font-medium text-indigo-800">
            Escola selecionada: {escolaSelecionada.nome}
          </p>
        )}
      </section>

      <section
        aria-labelledby="turma-title"
        className={`rounded-2xl border p-4 transition sm:p-5 ${
          turmaId ? "border-indigo-100 bg-indigo-50/50" : "border-slate-200 bg-white"
        }`}
      >
        <h2 id="turma-title" className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              escolaId ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            <Users className="h-4 w-4" />
          </span>
          2. Escolha sua turma
        </h2>

        {!escolaId ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
            Escolha uma escola para ver as turmas vinculadas.
          </p>
        ) : loadingTurmas ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando turmas da escola...
          </p>
        ) : turmas.length === 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
            Não há turmas ativas cadastradas para esta escola neste ano letivo.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {turmas.map((turma) => {
              const selecionada = turmaId === turma.id;
              return (
                <button
                  key={turma.id}
                  type="button"
                  aria-pressed={selecionada}
                  onClick={() => handleChangeTurma(turma.id)}
                  className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selecionada
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{turma.nome}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {turma.ano} · {turma.turno}
                    </span>
                  </span>
                  {selecionada ? (
                    <Check className="h-5 w-5 shrink-0 text-indigo-600" />
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {turmaSelecionada && escolaSelecionada && (
          <p className="mt-3 text-xs font-medium text-indigo-800">
            {escolaSelecionada.nome} <span aria-hidden="true">›</span> {turmaSelecionada.nome}
          </p>
        )}
      </section>

      <section
        aria-labelledby="aluno-title"
        className={`rounded-2xl border p-4 transition sm:p-5 ${
          turmaId ? "border-indigo-100 bg-white" : "border-slate-200 bg-slate-50/70"
        }`}
      >
        <h2 id="aluno-title" className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              turmaId ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-400"
            }`}
          >
            <UserRound className="h-4 w-4" />
          </span>
          3. Identifique-se
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {turmaSelecionada
            ? `Informe seus dados da turma ${turmaSelecionada.nome}. Os nomes dos alunos não são exibidos publicamente.`
            : "Selecione escola e turma para informar seus dados."}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="student-name" className="mb-1 block text-sm font-medium text-slate-700">
              Nome completo
            </label>
            <input
              id="student-name"
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setError("");
              }}
              placeholder="Como consta na matrícula"
              autoComplete="name"
              disabled={!turmaId}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label htmlFor="student-password" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="student-password"
                type="password"
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setError("");
                }}
                placeholder="Senha informada pela escola"
                autoComplete="current-password"
                disabled={!turmaId || !nome.trim()}
                className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Em caso de dúvida, procure o professor.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:hover:bg-slate-300"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        {loading ? "Entrando..." : "Entrar no painel do aluno"}
        {!loading && <KeyRound className="ml-1 h-4 w-4 opacity-80" />}
      </button>
    </form>
  );
}
