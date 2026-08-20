"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, LogIn } from "lucide-react";

type SchoolAluno = { id: string; nome: string; numeroChamada: number | null };
type SchoolTurma = { id: string; nome: string; ano: string; turno: string; professor: string | null; alunos: SchoolAluno[] };
type SchoolOption = { id: string; nome: string; turmas: SchoolTurma[] };

/** Login do aluno: escola → turma → nome da turma → senha (padrão 123456). */
export default function StudentLoginForm() {
  const router = useRouter();
  const [schoolData, setSchoolData] = useState<SchoolOption[]>([]);
  const [escolaId, setEscolaId] = useState("");
  const [turmaId, setTurmaId] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const selectedEscola = schoolData.find((e) => e.id === escolaId);
  const selectedTurma = selectedEscola?.turmas.find((t) => t.id === turmaId);

  const turmaAlunos = useMemo(() => {
    if (!selectedTurma) return [] as { id: string; nome: string; numeroChamada: number | null }[];
    return selectedTurma.alunos
      .slice()
      .sort((a, b) => (a.numeroChamada ?? 0) - (b.numeroChamada ?? 0));
  }, [selectedTurma]);

  const selectedAluno = turmaAlunos.find((a) => a.id === alunoId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!escolaId) {
      setError("Selecione a sua escola.");
      return;
    }
    if (!turmaId) {
      setError("Selecione a sua turma.");
      return;
    }
    if (!selectedAluno) {
      setError("Selecione o seu nome na lista da turma.");
      return;
    }
    if (!senha) {
      setError("Digite a sua senha.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/aluno/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: selectedAluno.nome, senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar. Tente novamente.");
        setLoading(false);
        return;
      }
      router.push("/aluno/painel");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Escola</label>
        <select
          value={escolaId}
          onChange={(e) => {
            setEscolaId(e.target.value);
            setTurmaId("");
            setAlunoId("");
            setError("");
          }}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          <option value="" disabled>
            Selecione a escola
          </option>
          {schoolData.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Turma</label>
        <select
          value={turmaId}
          onChange={(e) => {
            setTurmaId(e.target.value);
            setAlunoId("");
            setError("");
          }}
          disabled={!selectedEscola}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="" disabled>
            {selectedEscola ? "Selecione a turma" : "Escolha a escola primeiro"}
          </option>
          {selectedEscola?.turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nome do aluno</label>
        <select
          value={alunoId}
          onChange={(e) => {
            setAlunoId(e.target.value);
            setError("");
          }}
          disabled={!selectedTurma}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="" disabled>
            {selectedTurma
              ? turmaAlunos.length > 0
                ? "Selecione o seu nome"
                : "Nenhum aluno nesta turma"
              : "Selecione a turma primeiro"}
          </option>
          {turmaAlunos.map((a) => (
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
        <p className="mt-1.5 text-xs text-slate-400">Senha padrão: 123456</p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        {loading ? "Entrando..." : "Entrar no painel do aluno"}
      </button>
    </form>
  );
}