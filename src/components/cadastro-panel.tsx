"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  School,
  Trash2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AlunoItem = { id: string; nome: string; numeroChamada: number | null };
type TurmaItem = { id: string; nome: string; ano: string; turno: string; professor: string | null; alunos: AlunoItem[] };
type EscolaItem = { id: string; nome: string; turmas: TurmaItem[] };

type TurmaForm = { nome: string; ano: string; turno: string; professor: string };

export default function CadastroPanel({ initialEscolas }: { initialEscolas: EscolaItem[] }) {
  const [escolas, setEscolas] = useState<EscolaItem[]>(initialEscolas);
  const [tab, setTab] = useState<"escola" | "aluno">("escola");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // ----- Formulário de escola -----
  const [escolaNome, setEscolaNome] = useState("");
  const [turmas, setTurmas] = useState<TurmaForm[]>([{ nome: "", ano: "", turno: "", professor: "" }]);

  // ----- Formulário de aluno -----
  const [alunoEscola, setAlunoEscola] = useState("");
  const [alunoTurma, setAlunoTurma] = useState("");
  const [alunoNome, setAlunoNome] = useState("");
  const [alunoChamada, setAlunoChamada] = useState("");
  const [alunoMatricula, setAlunoMatricula] = useState("");

  const selectedEscola = escolas.find((e) => e.id === alunoEscola);
  const selectedTurma = selectedEscola?.turmas.find((t) => t.id === alunoTurma);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/escolas");
      const data = await res.json();
      if (data?.ok) setEscolas(data.escolas);
    } catch {
      /* mantém a lista atual */
    }
  }, []);

  useEffect(() => {
    if (!alunoEscola) setAlunoTurma("");
  }, [alunoEscola]);

  function patchTurma(i: number, patch: Partial<TurmaForm>) {
    setTurmas((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function saveEscola(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    const validTurmas = turmas.filter((t) => t.nome.trim() && t.ano.trim() && t.turno.trim());
    setBusy(true);
    try {
      const res = await fetch("/api/escolas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: escolaNome, turmas: validTurmas }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível cadastrar a escola.");
        return;
      }
      setOk(`Escola "${data.nome}" cadastrada com ${data.turmas} turma(s).`);
      setEscolaNome("");
      setTurmas([{ nome: "", ano: "", turno: "", professor: "" }]);
      await refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAluno(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    setBusy(true);
    try {
      const res = await fetch("/api/alunos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escolaId: alunoEscola,
          turmaId: alunoTurma,
          nome: alunoNome,
          numeroChamada: alunoChamada ? Number(alunoChamada) : null,
          matricula: alunoMatricula,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível cadastrar o aluno.");
        return;
      }
      setOk(`Aluno ${data.nome} cadastrado na ${data.turma}. Senha de acesso: ${data.senha}.`);
      setAlunoNome("");
      setAlunoChamada("");
      setAlunoMatricula("");
      await refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const labelCls = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className="space-y-6">
      {/* Abas */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setTab("escola");
            setError("");
            setOk("");
          }}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
            tab === "escola" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Building2 className="h-4 w-4" /> Cadastrar escola
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("aluno");
            setError("");
            setOk("");
          }}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
            tab === "aluno" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <UserPlus className="h-4 w-4" /> Cadastrar aluno
        </button>
      </div>

      {(error || ok) && (
        <p
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
          )}
        >
          {ok ?? error}
        </p>
      )}

      {tab === "escola" ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Formulário */}
          <form onSubmit={saveEscola} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <School className="h-5 w-5 text-indigo-600" /> Nova escola
            </h2>
            <p className="mt-1 text-xs text-slate-400">A senha padrão dos alunos é 123456.</p>

            <div className="mt-5">
              <label className={labelCls}>Nome da escola</label>
              <input
                value={escolaNome}
                onChange={(e) => setEscolaNome(e.target.value.toUpperCase())}
                placeholder="Ex.: ESCOLA MUNICIPAL NOVA ERA"
                className={inputCls}
              />
            </div>

            <div className="mt-5">
              <p className={labelCls}>Turmas</p>
              <div className="space-y-3">
                {turmas.map((t, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Nome da turma</label>
                        <input
                          value={t.nome}
                          onChange={(e) => patchTurma(i, { nome: e.target.value })}
                          placeholder="Ex.: 6º A"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Ano / série</label>
                        <input
                          value={t.ano}
                          onChange={(e) => patchTurma(i, { ano: e.target.value })}
                          placeholder="Ex.: 6º Ano"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Turno</label>
                        <input
                          value={t.turno}
                          onChange={(e) => patchTurma(i, { turno: e.target.value })}
                          placeholder="Ex.: Matutino"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-slate-500">Professor (opcional)</label>
                          <input
                            value={t.professor}
                            onChange={(e) => patchTurma(i, { professor: e.target.value })}
                            placeholder="Nome do professor"
                            className={inputCls}
                          />
                        </div>
                        {turmas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTurmas((prev) => prev.filter((_, idx) => idx !== i))}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                            title="Remover turma"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTurmas((prev) => [...prev, { nome: "", ano: "", turno: "", professor: "" }])}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Plus className="h-4 w-4" /> Adicionar turma
              </button>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy ? "Cadastrando..." : "Cadastrar escola"}
            </button>
          </form>

          {/* Lista */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-900">Escolas cadastradas</h3>
            <p className="mt-1 text-xs text-slate-400">Ano letivo 2026</p>
            {escolas.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                Nenhuma escola cadastrada ainda.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {escolas.map((e) => (
                  <div key={e.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Building2 className="h-4 w-4 text-indigo-600" /> {e.nome}
                    </p>
                    {e.turmas.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-400">Sem turmas.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {e.turmas.map((t) => (
                          <li key={t.id} className="flex items-center justify-between text-xs text-slate-600">
                            <span>
                              {t.nome} · {t.turno}
                            </span>
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                              {t.alunos.length} alunos
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Formulário */}
          <form onSubmit={saveAluno} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <UserPlus className="h-5 w-5 text-indigo-600" /> Novo aluno
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              O aluno entrará com o nome completo e a senha padrão <strong>123456</strong>.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Escola</label>
                <select
                  value={alunoEscola}
                  onChange={(e) => setAlunoEscola(e.target.value)}
                  className={inputCls}
                >
                  <option value="" disabled>
                    Selecione a escola
                  </option>
                  {escolas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Turma</label>
                <select
                  value={alunoTurma}
                  onChange={(e) => setAlunoTurma(e.target.value)}
                  disabled={!selectedEscola}
                  className={cn(inputCls, "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")}
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
            </div>

            <div className="mt-4">
              <label className={labelCls}>Nome completo do aluno</label>
              <input
                value={alunoNome}
                onChange={(e) => setAlunoNome(e.target.value.toUpperCase())}
                placeholder="Como na chamada"
                className={inputCls}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Número de chamada</label>
                <input
                  value={alunoChamada}
                  onChange={(e) => setAlunoChamada(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ex.: 15"
                  inputMode="numeric"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Matrícula (opcional)</label>
                <input
                  value={alunoMatricula}
                  onChange={(e) => setAlunoMatricula(e.target.value)}
                  placeholder="Número da matrícula"
                  className={inputCls}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy ? "Cadastrando..." : "Cadastrar aluno"}
            </button>
          </form>

          {/* Alunos da turma selecionada */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Alunos da turma
            </h3>
            {!selectedTurma ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                Selecione uma escola e turma para ver os alunos.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedTurma.nome} · {selectedTurma.turno} · {selectedTurma.alunos.length} aluno(s)
                </p>
                {selectedTurma.alunos.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                    Nenhum aluno nesta turma ainda.
                  </p>
                ) : (
                  <ul className="mt-4 max-h-[420px] space-y-1 overflow-y-auto">
                    {selectedTurma.alunos.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-700">{a.nome}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          Nº {String(a.numeroChamada ?? 0).padStart(2, "0")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}