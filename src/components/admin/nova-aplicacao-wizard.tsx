"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Rocket,
  School,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ProvaOption = {
  id: number;
  titulo: string;
  disciplina: string;
  status: string;
  totalQuestoes: number;
};

type EscolaOption = {
  id: string;
  nome: string;
  turmas: {
    id: string;
    nome: string;
    ano: string;
    turno: string;
  }[];
};

const STEPS = [
  { num: 1, label: "Prova e Data", icon: ClipboardList },
  { num: 2, label: "Escolas", icon: School },
  { num: 3, label: "Turmas", icon: Users },
  { num: 4, label: "Revisar", icon: CalendarDays },
];

export default function NovaAplicacaoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [provas, setProvas] = useState<ProvaOption[]>([]);
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [provaId, setProvaId] = useState<number | null>(null);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [escolaIds, setEscolaIds] = useState<string[]>([]);
  const [turmaIds, setTurmaIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [pRes, eRes] = await Promise.all([fetch("/api/admin/aplicacoes/provas"), fetch("/api/escolas")]);
        const pData = await pRes.json();
        const eData = await eRes.json();
        if (pData.ok) setProvas(pData.provas);
        if (eData.ok) setEscolas(eData.escolas);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const prova = provas.find((p) => p.id === provaId);

  const escolasSelecionadas = useMemo(() => escolas.filter((e) => escolaIds.includes(e.id)), [escolas, escolaIds]);

  const turmasDisponiveis = useMemo(
    () =>
      escolasSelecionadas.flatMap((e) =>
        e.turmas.map((t) => ({
          ...t,
          escolaId: e.id,
          escolaNome: e.nome,
        }))
      ),
    [escolasSelecionadas]
  );

  const turmasSelecionadas = turmasDisponiveis.filter((t) => turmaIds.includes(t.id));

  function toggleEscola(id: string) {
    setEscolaIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const escolhida = escolas.find((e) => e.id === id);
      if (escolhida) {
        const comTurmas = escolhida.turmas.map((t) => t.id);
        setTurmaIds((prevT) =>
          next.includes(id)
            ? Array.from(new Set([...prevT, ...comTurmas]))
            : prevT.filter((x) => !comTurmas.includes(x))
        );
      }
      return next;
    });
  }

  function toggleTurma(id: string) {
    setTurmaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const todasTurmas = turmasDisponiveis.map((t) => t.id);
  const tudoSelecionado = todasTurmas.length > 0 && todasTurmas.every((t) => turmaIds.includes(t));

  function toggleTudo() {
    setTurmaIds(tudoSelecionado ? [] : todasTurmas);
  }

  function canContinue(): boolean {
    if (step === 1) return Boolean(provaId);
    if (step === 2) return escolaIds.length > 0;
    if (step === 3) return turmaIds.length > 0;
    return true;
  }

  async function publish() {
    if (!provaId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/aplicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provaOrigemId: provaId,
          titulo: prova?.titulo,
          dataInicio: dataInicio ? new Date(dataInicio).toISOString() : null,
          dataFim: dataFim ? new Date(dataFim).toISOString() : null,
          turmaIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Não foi possível publicar a aplicação.");
        setSaving(false);
        return;
      }
      router.push("/admin/aplicacoes");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nova aplicação</h1>
        <p className="mt-1 text-sm text-slate-500">
          Agende uma prova do banco de provas aplicando-a para várias escolas e turmas.
        </p>
      </div>

      <ol className="mb-8 flex items-center gap-2 overflow-x-auto">
        {STEPS.map((s) => {
          const active = step === s.num;
          const done = step > s.num;
          return (
            <li key={s.num} className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium",
                  active && "bg-indigo-600 text-white",
                  done && "bg-emerald-100 text-emerald-700",
                  !active && !done && "bg-slate-100 text-slate-500"
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                <span>{s.label}</span>
              </button>
              {s.num < STEPS.length && <ArrowRight className="h-4 w-4 text-slate-300" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
              Escolha a prova do banco de provas
            </h2>
            {provas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Nenhuma prova disponível no banco de provas. Crie uma prova primeiro em &quot;Nova prova&quot;.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {provas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvaId(p.id)}
                    className={cn(
                      "rounded-2xl border bg-white p-4 text-left transition",
                      provaId === p.id
                        ? "border-indigo-500 ring-2 ring-indigo-100"
                        : "border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    <p className="font-semibold text-slate-800">{p.titulo}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{p.disciplina || "Sem disciplina"}</p>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {p.totalQuestoes} {p.totalQuestoes === 1 ? "questão" : "questões"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              Defina o período de aplicação (opcional)
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Data e hora de início</span>
                <input
                  type="datetime-local"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Data e hora de término</span>
                <input
                  type="datetime-local"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {step === 2 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Building2 className="h-4 w-4 text-indigo-600" />
            Selecione as escolas participantes
          </h2>
          {escolas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Nenhuma escola cadastrada.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {escolas.map((e) => {
                const selected = escolaIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleEscola(e.id)}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border bg-white p-4 text-left transition",
                      selected ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{e.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{e.turmas.length} turmas</p>
                    </div>
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border text-white",
                        selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                      )}
                    >
                      {selected && <CheckCircle2 className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users className="h-4 w-4 text-indigo-600" />
              Selecione as turmas participantes
            </h2>
            <button
              type="button"
              onClick={toggleTudo}
              disabled={turmasDisponiveis.length === 0}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                tudoSelecionado
                  ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              )}
            >
              {tudoSelecionado ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Limpar seleção
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Selecionar todas as turmas
                </>
              )}
            </button>
          </div>
          {turmasDisponiveis.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Selecione ao menos uma escola para escolher as turmas.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {turmasDisponiveis.map((t) => {
                const selected = turmaIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTurma(t.id)}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border bg-white p-4 text-left transition",
                      selected ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{t.nome}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {t.escolaNome}
                        {t.turno ? ` · ${t.turno}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border text-white",
                        selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                      )}
                    >
                      {selected && <CheckCircle2 className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Rocket className="h-4 w-4 text-indigo-600" />
            Revise e publique a aplicação
          </h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Prova</dt>
              <dd className="text-right font-semibold text-slate-800">{prova?.titulo ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Disciplina</dt>
              <dd className="text-right text-slate-700">{prova?.disciplina || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Período</dt>
              <dd className="text-right text-slate-700">
                {dataInicio ? new Date(dataInicio).toLocaleString("pt-BR") : "Sem data de início"}
                {" → "}
                {dataFim ? new Date(dataFim).toLocaleString("pt-BR") : "sem término"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Escolas</dt>
              <dd className="text-right font-semibold text-slate-800">{escolaIds.length}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Turmas</dt>
              <dd className="text-right font-semibold text-slate-800">{turmaIds.length}</dd>
            </div>
          </dl>
          {turmasSelecionadas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {turmasSelecionadas.map((t) => (
                <span key={t.id} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                  {t.escolaNome}: {t.nome}
                </span>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Ao publicar, a provas (questões e alternativas) serão duplicadas para cada turma selecionada e um{" "}
            <strong>código único</strong> será gerado para os alunos acessarem a aplicação.
          </p>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        {step < STEPS.length ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={publish}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {saving ? "Publicando..." : "Publicar / Ativar"}
          </button>
        )}
      </div>
    </div>
  );
}