"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Loader2,
  Minus,
  Plus,
  Rocket,
  School,
  Send,
  Trash2,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import HabilidadePicker from "@/components/admin/habilidade-picker";

type AlternativaDraft = {
  key: string;
  texto: string;
  correta: boolean;
};

type QuestaoDraft = {
  key: string;
  tipo: "multiple";
  valor: number;
  habilidade: string[];
  disciplina: "LÍNGUA PORTUGUESA" | "MATEMÁTICA";
  alternativas: AlternativaDraft[];
};

type EscolaOption = {
  id: string;
  nome: string;
  turmas: {
    id: string;
    nome: string;
    ano: string;
    turno: string;
    professor: string | null;
    alunos: { id: string; nome: string; numeroChamada: number | null }[];
  }[];
};

const STEPS = [
  { num: 1, label: "Dados e PDF", icon: FileText },
  { num: 2, label: "Gabarito", icon: ClipboardList },
  { num: 3, label: "Selecionar Escolas", icon: Building2 },
  { num: 4, label: "Confirmar Destinos", icon: Send },
  { num: 5, label: "Publicar", icon: Rocket },
];

const KEY = () => Math.random().toString(36).slice(2);

const EMPTY_QUESTION = (): QuestaoDraft => ({
  key: KEY(),
  tipo: "multiple",
  valor: 1,
  habilidade: [],
  disciplina: "LÍNGUA PORTUGUESA",
  alternativas: [
    { key: KEY(), texto: "A", correta: false },
    { key: KEY(), texto: "B", correta: false },
    { key: KEY(), texto: "C", correta: false },
    { key: KEY(), texto: "D", correta: false },
  ],
});

function TreeCheckbox({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-white transition",
        checked
          ? "border-indigo-600 bg-indigo-600"
          : partial
            ? "border-indigo-400 bg-indigo-100"
            : "border-slate-300 bg-white"
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {!checked && partial && <Minus className="h-3.5 w-3.5 text-indigo-600" strokeWidth={3} />}
    </span>
  );
}

export default function CriarAvaliacaoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  const [titulo, setTitulo] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [tempoMinutos, setTempoMinutos] = useState<number | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [questoes, setQuestoes] = useState<QuestaoDraft[]>([EMPTY_QUESTION()]);
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [turmaIds, setTurmaIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewUrlRef = useRef<string | null>(null);

  function setArquivo(f: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = f ? URL.createObjectURL(f) : null;
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPdfFile(f);
  }

  useEffect(() => {
    (async () => {
      try {
        const eRes = await fetch("/api/escolas");
        const eData = await eRes.json();
        if (eData.ok) setEscolas(eData.escolas);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const escolasSelecionadas = useMemo(
    () => escolas.filter((e) => e.turmas.some((t) => turmaIds.includes(t.id))),
    [escolas, turmaIds]
  );

  const turmasDisponiveis = useMemo(
    () =>
      escolasSelecionadas.flatMap((e) =>
        e.turmas.map((t) => ({ ...t, escolaId: e.id, escolaNome: e.nome }))
      ),
    [escolasSelecionadas]
  );

  const turmasSelecionadas = turmasDisponiveis.filter((t) => turmaIds.includes(t.id));

  const totalParticipantes = turmasSelecionadas.reduce((acc, t) => acc + t.alunos.length, 0);

  function toggleEscola(id: string) {
    const escola = escolas.find((e) => e.id === id);
    if (!escola || escola.turmas.length === 0) return;
    const turmasDaEscola = escola.turmas.map((t) => t.id);
    const todasSelecionadas = turmasDaEscola.every((t) => turmaIds.includes(t));
    setTurmaIds((prev) =>
      todasSelecionadas
        ? prev.filter((x) => !turmasDaEscola.includes(x))
        : Array.from(new Set([...prev, ...turmasDaEscola]))
    );
  }

  function toggleTurma(id: string) {
    setTurmaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const todasTurmas = useMemo(() => escolas.flatMap((e) => e.turmas.map((t) => t.id)), [escolas]);
  const tudoSelecionado = todasTurmas.length > 0 && todasTurmas.every((t) => turmaIds.includes(t));

  function toggleTudo() {
    setTurmaIds(tudoSelecionado ? [] : todasTurmas);
  }

  // ---- Questões / gabarito ----
  const updateQuestao = (key: string, patch: Partial<QuestaoDraft>) =>
    setQuestoes((d) => d.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  function addQuestao() {
    setQuestoes((d) => [...d, EMPTY_QUESTION()]);
  }
  function removeQuestao(key: string) {
    if (questoes.length === 1) return;
    setQuestoes((d) => d.filter((q) => q.key !== key));
  }
  function moveQuestao(index: number, dir: -1 | 1) {
    setQuestoes((d) => {
      const next = [...d];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function markCorreta(questaoKey: string, altKey: string) {
    updateQuestao(questaoKey, {
      alternativas: (questoes.find((q) => q.key === questaoKey)?.alternativas ?? []).map((a) => ({
        ...a,
        correta: a.key === altKey,
      })),
    });
  }
  function updateAlternativa(questaoKey: string, altKey: string, texto: string) {
    updateQuestao(questaoKey, {
      alternativas: (questoes.find((q) => q.key === questaoKey)?.alternativas ?? []).map((a) =>
        a.key === altKey ? { ...a, texto } : a
      ),
    });
  }
  function addAlternativa(questaoKey: string) {
    const q = questoes.find((qq) => qq.key === questaoKey);
    if (!q || q.alternativas.length >= 8) return;
    updateQuestao(questaoKey, { alternativas: [...q.alternativas, { key: KEY(), texto: "", correta: false }] });
  }
  function removeAlternativa(questaoKey: string, altKey: string) {
    const q = questoes.find((qq) => qq.key === questaoKey);
    if (!q || q.alternativas.length <= 2) return;
    updateQuestao(questaoKey, { alternativas: q.alternativas.filter((a) => a.key !== altKey) });
  }

  function validateQuestoes(): string {
    if (questoes.length === 0) return "Adicione pelo menos uma questão.";
    for (let i = 0; i < questoes.length; i++) {
      const q = questoes[i];
      if (q.valor <= 0) return `A questão ${i + 1} precisa de um valor maior que zero.`;
      const filled = q.alternativas.filter((a) => a.texto.trim());
      if (filled.length < 1) return `A questão ${i + 1} precisa de pelo menos 1 alternativa preenchida.`;
      if (!q.alternativas.some((a) => a.correta && a.texto.trim()))
        return `Marque a alternativa correta da questão ${i + 1}.`;
      if (q.habilidade.length === 0)
        return `Vincule ao menos uma habilidade à questão ${i + 1} (obrigatório para publicar).`;
    }
    return "";
  }

  function validateStep(current: number): string {
    if (current === 1) {
      if (titulo.trim().length < 3) return "Informe o título da avaliação.";
      if (!pdfFile) return "Envie o arquivo da prova em PDF (passo 2 importa o gabarito).";
      if (!pdfFile.name.toLowerCase().endsWith(".pdf")) return "O arquivo da prova deve ser um PDF.";
      if (pdfFile.size > 4_000_000) return "O arquivo PDF deve ter no máximo 4 MB.";
    }
    if (current === 2) return validateQuestoes();
    if (current === 3 && turmaIds.length === 0) return "Selecione ao menos uma escola ou turma.";
    return "";
  }

  function canContinue(): boolean {
    if (step === 1) return titulo.trim().length >= 3 && Boolean(pdfFile);
    if (step === 2) return questoes.length > 0;
    if (step === 3) return turmaIds.length > 0;
    return true;
  }

  function goNext() {
    setError("");
    const invalid = validateStep(step);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStep((s) => Math.min(STEPS.length, s + 1));
  }

  async function publish() {
    setError("");
    if (step < STEPS.length) {
      goNext();
      return;
    }
    const invalidText = validateStep(2);
    if (invalidText) {
      setError(invalidText);
      setStep(2);
      return;
    }
    if (dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim)) {
      setError("A data de início deve ser anterior à data final.");
      setStep(1);
      return;
    }
    if (dataFim && new Date(dataFim).getTime() < Date.now()) {
      setError("A data final precisa estar no futuro para publicar a avaliação.");
      setStep(1);
      return;
    }

    setSaving(true);
    try {
      const questoesJson = JSON.stringify(
        questoes.map((q) => ({
          tipo: q.tipo,
          valor: q.valor,
          habilidade: q.habilidade.length > 0 ? q.habilidade : null,
          alternativas: q.alternativas.map((a, i) => ({
            letra: String.fromCharCode(65 + i),
            texto: a.texto,
            correta: a.correta,
          })),
        }))
      );

      // 1) Cria a prova base no banco de provas (rascunho) com PDF e gabarito
      const fd = new FormData();
      fd.append("titulo", titulo.trim());
      fd.append("disciplina", questoes[0]?.disciplina || "");
      fd.append("escolaId", "");
      fd.append("turma", "");
      fd.append("instrucoes", instrucoes);
      fd.append("dataInicio", dataInicio || "");
      fd.append("dataFim", dataFim || "");
      if (tempoMinutos) fd.append("tempoMinutos", String(tempoMinutos));
      fd.append("publish", "0");
      fd.append("questoes", questoesJson);
      if (pdfFile) fd.append("pdf", pdfFile);

      const res = await fetch("/api/exams", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Não foi possível salvar a prova.");
        setSaving(false);
        return;
      }

      // 2) Publica a aplicação (réplicas por turma) com o mesmo período
      const appRes = await fetch("/api/admin/aplicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provaOrigemId: data.id,
          titulo: titulo.trim(),
          dataInicio: dataInicio ? new Date(dataInicio).toISOString() : null,
          dataFim: dataFim ? new Date(dataFim).toISOString() : null,
          turmaIds,
        }),
      });
      const appData = await appRes.json().catch(() => ({}));
      if (!appRes.ok || !appData.ok) {
        setError(appData.error ?? "Não foi possível publicar a avaliação.");
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Criar avaliação</h1>
        <p className="mt-1 text-sm text-slate-500">
          Importe o PDF, cadastre o gabarito, selecione escolas e turmas, confirme os destinos e publique.
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

      {/* Passo 1: Dados e PDF */}
      {step === 1 && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Dados da avaliação</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Avaliação de Matemática — 3º bimestre"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Data/hora de liberação (opcional)</label>
                  <input
                    type="datetime-local"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Data/hora final de entrega</label>
                  <input
                    type="datetime-local"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tempo limite da prova (minutos)</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={tempoMinutos ?? ""}
                  onChange={(e) => setTempoMinutos(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Ex.: 60 (deixe vazio para sem limite)"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Instruções para os alunos</label>
                <textarea
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                  rows={2}
                  placeholder="Ex.: Leia as questões com atenção. Você tem até 60 minutos."
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Arquivo da prova (PDF) <span className="text-rose-500">*</span>
            </h2>
            {pdfFile ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{pdfFile.name}</p>
                  <p className="text-xs text-slate-500">
                    {(pdfFile.size / 1024 / 1024).toFixed(2)} MB — o aluno poderá visualizar ao fazer a prova.
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowPreview((v) => !v)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      {showPreview ? "Ocultar pré-visualização" : "Ver pré-visualização"}
                    </button>
                  </div>
                  {showPreview && previewUrl && (
                    <iframe
                      src={previewUrl}
                      title="Pré-visualização do PDF"
                      className="mt-2 h-[70vh] w-full rounded-xl border border-slate-200 bg-slate-50"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setArquivo(null)}
                  className="text-xs font-semibold text-rose-600 transition hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40">
                <FileText className="h-6 w-6 text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">Enviar PDF da prova</span>
                <span className="text-xs text-slate-400">O aluno visualiza o arquivo ao fazer a prova (até 4 MB)</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setArquivo(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </section>
        </div>
      )}

      {/* Passo 2: Gabarito */}
      {step === 2 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Gabarito — Questões ({questoes.length})
            </h2>
          </div>
          <div className="space-y-4">
            {questoes.map((q, index) => (
              <div key={q.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className={`font-bold ${q.disciplina === "LÍNGUA PORTUGUESA" ? "text-emerald-700" : "text-slate-900"}`}>
                      Questão {index + 1}
                    </p>
                    <select
                      value={q.disciplina}
                      onChange={(e) =>
                        updateQuestao(q.key, { disciplina: e.target.value as "LÍNGUA PORTUGUESA" | "MATEMÁTICA", habilidade: [] })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="LÍNGUA PORTUGUESA">Língua Portuguesa</option>
                      <option value="MATEMÁTICA">Matemática</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                      Valor
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={q.valor}
                        onChange={(e) => updateQuestao(q.key, { valor: Number(e.target.value) || 0 })}
                        className="w-14 rounded-md border border-slate-200 px-1.5 py-0.5 text-center outline-none focus:border-indigo-400"
                      />
                    </label>
                    <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                      Múltipla escolha
                    </span>
                    <button
                      onClick={() => moveQuestao(index, -1)}
                      disabled={index === 0}
                      title="Mover para cima"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveQuestao(index, 1)}
                      disabled={index === questoes.length - 1}
                      title="Mover para baixo"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeQuestao(q.key)}
                      disabled={questoes.length === 1}
                      title="Remover questão"
                      className="rounded-lg border border-rose-200 p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <HabilidadePicker
                  value={q.habilidade}
                  onChange={(habilidade) => updateQuestao(q.key, { habilidade })}
                  disciplina={q.disciplina}
                />

                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-semibold text-slate-500">Gabarito</p>
                  <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Gabarito da questão">
                    {q.alternativas.map((a, oi) => (
                      <button
                        key={a.key}
                        type="button"
                        role="radio"
                        aria-checked={a.correta}
                        aria-label={`Alternativa ${String.fromCharCode(65 + oi)}${a.correta ? ", selecionada" : ""}`}
                        onClick={() => markCorreta(q.key, a.key)}
                        className={cn(
                          "relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-all duration-150 ease-out",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1",
                          "active:scale-[0.95] hover:scale-[1.02]",
                          a.correta
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm"
                            : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50"
                        )}
                      >
                        <span className="transition-transform duration-150">{String.fromCharCode(65 + oi)}</span>
                        {a.correta && (
                          <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
                            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => addAlternativa(q.key)}
                      disabled={q.alternativas.length >= 8}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-300 px-2 py-1 text-[10px] font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" /> Alt.
                    </button>
                    {q.alternativas.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last = q.alternativas[q.alternativas.length - 1];
                          removeAlternativa(q.key, last.key);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addQuestao}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-4 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" /> Adicionar questão
          </button>
        </section>
      )}

      {/* Passo 3: Selecionar Escolas */}
      {step === 3 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Selecione as escolas e turmas participantes
            </h2>
            <button
              type="button"
              onClick={toggleTudo}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
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
          {escolas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Nenhuma escola cadastrada. Importe as escolas pelas planilhas em &quot;Gestão de cadastros&quot;.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {escolas.map((e) => {
                const turmasDaEscola = e.turmas;
                const todasSelecionadas = turmasDaEscola.length > 0 && turmasDaEscola.every((t) => turmaIds.includes(t.id));
                const algumasSelecionadas = turmasDaEscola.some((t) => turmaIds.includes(t.id));
                const alunos = turmasDaEscola.reduce((acc, t) => acc + t.alunos.length, 0);
                return (
                  <div
                    key={e.id}
                    className={cn(
                      "rounded-2xl border bg-white shadow-sm transition",
                      todasSelecionadas
                        ? "border-indigo-500 ring-2 ring-indigo-100"
                        : algumasSelecionadas
                          ? "border-indigo-300 ring-2 ring-indigo-50"
                          : "border-slate-200"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleEscola(e.id)}
                      disabled={turmasDaEscola.length === 0}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        <TreeCheckbox checked={todasSelecionadas} partial={algumasSelecionadas && !todasSelecionadas} />
                        <div>
                          <p className="font-semibold text-slate-800">{e.nome}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{turmasDaEscola.length} turmas · {alunos} alunos</p>
                        </div>
                      </div>
                    </button>
                    <div className="border-t border-slate-100 px-4 py-2">
                      {turmasDaEscola.length === 0 ? (
                        <p className="py-2 text-xs text-slate-400">Nenhuma turma cadastrada.</p>
                      ) : (
                        <ul className="space-y-1">
                          {turmasDaEscola.map((t) => {
                            const sel = turmaIds.includes(t.id);
                            return (
                              <li key={t.id}>
                                <button
                                  type="button"
                                  onClick={() => toggleTurma(t.id)}
                                  className={cn(
                                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition",
                                    sel ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                                  )}
                                >
                                  <TreeCheckbox checked={sel} />
                                  <span className="font-medium">{t.nome}</span>
                                  <span className="ml-auto text-xs text-slate-400">
                                    {t.turno ? `${t.turno} · ` : ""}{t.alunos.length} alunos
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Passo 4: Confirmar Destinos */}
      {step === 4 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              Confirmar destinos
            </h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {escolasSelecionadas.length} escolas · {turmasSelecionadas.length} turmas · {totalParticipantes} alunos
            </span>
          </div>
          {turmasSelecionadas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Selecione ao menos uma escola ou turma para publicar a prova.
            </p>
          ) : (
            <div className="space-y-6">
              {escolasSelecionadas.map((escola) => {
                const turmasDaEscola = turmasSelecionadas.filter((t) => t.escolaId === escola.id);
                if (turmasDaEscola.length === 0) return null;
                return (
                  <div key={escola.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                        <School className="h-4 w-4 text-indigo-500" />
                        {escola.nome}
                      </h3>
                      <span className="text-xs font-medium text-slate-400">
                        {turmasDaEscola.reduce((acc, t) => acc + t.alunos.length, 0)} alunos
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turmasDaEscola.map((t) => (
                        <div key={t.id} className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-700">{t.nome}</span>
                          <span className="text-[10px] font-medium text-emerald-500">
                            {t.alunos.length} alunos
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            A mesma prova (PDF, questões e gabarito) ficará disponível para todas as escolas e turmas selecionadas
            acima. Confira os destinos antes de publicar.
          </p>
        </section>
      )}

      {/* Passo 5: Publicar */}
      {step === 5 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Rocket className="h-4 w-4 text-indigo-600" />
            Revise e publique a avaliação
          </h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Título</dt>
              <dd className="text-right font-semibold text-slate-800">{titulo}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Disciplina</dt>
              <dd className="text-right text-slate-700">{questoes[0]?.disciplina || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Questões</dt>
              <dd className="text-right font-semibold text-slate-800">{questoes.length}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">PDF</dt>
              <dd className="text-right text-slate-700">{pdfFile?.name ?? "—"}</dd>
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
              <dt className="text-slate-500">Tempo limite</dt>
              <dd className="text-right text-slate-700">{tempoMinutos ? `${tempoMinutos} min` : "Sem limite"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Escolas</dt>
              <dd className="text-right font-semibold text-slate-800">{escolasSelecionadas.length}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Turmas</dt>
              <dd className="text-right font-semibold text-slate-800">{turmaIds.length}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">Participantes</dt>
              <dd className="text-right font-semibold text-slate-800">{totalParticipantes} alunos</dd>
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
            Ao publicar, a prova (PDF, questões e gabarito) será duplicada para cada turma selecionada e um{" "}
            <strong>código único</strong> será gerado para os alunos acessarem a avaliação.
          </p>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setError("");
            setStep((s) => Math.max(1, s - 1));
          }}
          disabled={step === 1}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <button
          type="button"
          onClick={publish}
          disabled={!canContinue() || saving}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-semibold text-white transition",
            step < STEPS.length
              ? "bg-indigo-600 hover:bg-indigo-700"
              : "bg-emerald-600 hover:bg-emerald-500",
            (saving || !canContinue()) && "cursor-not-allowed opacity-40"
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step < STEPS.length ? (
            <>
              Continuar <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          {saving ? "Publicando..." : step < STEPS.length ? "" : "Publicar / Ativar"}
        </button>
      </div>
    </div>
  );
}