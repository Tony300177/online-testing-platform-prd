"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getHabilidadesPorDisciplina, CATEGORIA_LABEL, type HabilidadeCategoria } from "@/lib/habilidades";

export type AlternativaDraft = {
  key: string;
  texto: string;
  correta: boolean;
};

export type QuestaoDraft = {
  key: string;
  pergunta: string;
  tipo: "multiple";
  valor: number;
  habilidade: string[];
  alternativas: AlternativaDraft[];
};

export type ProvaDraft = {
  titulo: string;
  disciplina: string;
  escolaId: string;
  turma: string;
  instrucoes: string;
  dataInicio: string; // datetime-local
  dataFim: string; // datetime-local
  tempoMinutos: number | null;
  pdfName: string | null;
  questoes: QuestaoDraft[];
};

type EscolaOption = { id: string; nome: string; turmas: { id: string; nome: string }[] };

const KEY = () => Math.random().toString(36).slice(2);

const EMPTY_QUESTION = (): QuestaoDraft => ({
  key: KEY(),
  pergunta: "",
  tipo: "multiple",
  valor: 1,
  habilidade: [],
  alternativas: [
    { key: KEY(), texto: "", correta: false },
    { key: KEY(), texto: "", correta: false },
  ],
});

const DEFAULT_DATAFIM = () => {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ExamForm({
  examId,
  initial,
}: {
  examId?: number;
  initial?: ProvaDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProvaDraft>(
    initial ?? {
      titulo: "",
      disciplina: "",
      escolaId: "",
      turma: "",
      instrucoes: "",
      dataInicio: "",
      dataFim: DEFAULT_DATAFIM(),
      tempoMinutos: null,
      pdfName: null,
      questoes: [EMPTY_QUESTION()],
    }
  );
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [removePdf, setRemovePdf] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfFile]);

  useEffect(() => {
    fetch("/api/escolas")
      .then((r) => r.json())
      .then((data) => setEscolas(Array.isArray(data?.escolas) ? data.escolas : []))
      .catch(() => {});
  }, []);

  const update = (patch: Partial<ProvaDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateQuestao = (key: string, patch: Partial<QuestaoDraft>) =>
    setDraft((d) => ({
      ...d,
      questoes: d.questoes.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    }));

  function addQuestao() {
    setDraft((d) => ({ ...d, questoes: [...d.questoes, EMPTY_QUESTION()] }));
  }
  function removeQuestao(key: string) {
    setDraft((d) => ({ ...d, questoes: d.questoes.filter((q) => q.key !== key) }));
  }
  function moveQuestao(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d.questoes];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, questoes: next };
    });
  }
  function setAlternativa(questaoKey: string, altKey: string, patch: Partial<AlternativaDraft>) {
    updateQuestao(questaoKey, {
      alternativas: (draft.questoes.find((q) => q.key === questaoKey)?.alternativas ?? []).map((a) =>
        a.key === altKey ? { ...a, ...patch } : a
      ),
    });
  }
  function updateAlternativa(questaoKey: string, altKey: string, texto: string) {
    setAlternativa(questaoKey, altKey, { texto });
  }
  function markCorreta(questaoKey: string, altKey: string) {
    updateQuestao(questaoKey, {
      alternativas: (draft.questoes.find((q) => q.key === questaoKey)?.alternativas ?? []).map((a) => ({
        ...a,
        correta: a.key === altKey,
      })),
    });
  }
  function addAlternativa(questaoKey: string) {
    const q = draft.questoes.find((qq) => qq.key === questaoKey);
    if (!q || q.alternativas.length >= 8) return;
    updateQuestao(questaoKey, { alternativas: [...q.alternativas, { key: KEY(), texto: "", correta: false }] });
  }
  function removeAlternativa(questaoKey: string, altKey: string) {
    const q = draft.questoes.find((qq) => qq.key === questaoKey);
    if (!q || q.alternativas.length <= 2) return;
    updateQuestao(questaoKey, { alternativas: q.alternativas.filter((a) => a.key !== altKey) });
  }

  function validate(requirePublish = false): string {
    if (draft.titulo.trim().length < 3) return "Informe um título para a prova.";
    if (draft.questoes.length === 0) return "Adicione pelo menos uma questão.";
    for (let i = 0; i < draft.questoes.length; i++) {
      const q = draft.questoes[i];
      if (q.valor <= 0) return `A questão ${i + 1} precisa de um valor maior que zero.`;
      if (q.tipo === "multiple") {
        const filled = q.alternativas.filter((a) => a.texto.trim());
        if (filled.length < 1) return `A questão ${i + 1} precisa de pelo menos 1 alternativa preenchida.`;
        if (!q.alternativas.some((a) => a.correta && a.texto.trim()))
          return `Marque a alternativa correta da questão ${i + 1}.`;
      }
    }
    if (requirePublish && draft.dataFim && new Date(draft.dataFim).getTime() < Date.now()) {
      return "A data final precisa estar no futuro para publicar a prova.";
    }
    if (requirePublish && draft.dataInicio && draft.dataFim && new Date(draft.dataInicio) > new Date(draft.dataFim)) {
      return "A data de início deve ser anterior à data final.";
    }
    if (pdfFile) {
      if (!pdfFile.name.toLowerCase().endsWith(".pdf")) return "O arquivo da prova deve ser um PDF.";
      if (pdfFile.size > 4_000_000) return "O arquivo PDF deve ter no máximo 4 MB.";
    }
    return "";
  }

  async function save(publish: boolean) {
    setError("");
    const invalid = validate(publish);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(publish ? "publish" : "save");
    try {
      const questoesJson = JSON.stringify(
        draft.questoes.map((q) => ({
          pergunta: q.pergunta,
          tipo: q.tipo,
          valor: q.valor,
          habilidade: q.habilidade.length > 0 ? q.habilidade : null,
          alternativas: q.alternativas.map((a, i) => ({ letra: String.fromCharCode(65 + i), texto: a.texto, correta: a.correta })),
        }))
      );

      const fd = new FormData();
      fd.append("titulo", draft.titulo);
      fd.append("disciplina", draft.disciplina);
      fd.append("escolaId", draft.escolaId);
      fd.append("turma", draft.turma);
      fd.append("instrucoes", draft.instrucoes);
      fd.append("dataInicio", draft.dataInicio || "");
      fd.append("dataFim", draft.dataFim || "");
      if (draft.tempoMinutos) fd.append("tempoMinutos", String(draft.tempoMinutos));
      fd.append("publish", publish ? "1" : "0");
      fd.append("questoes", questoesJson);
      if (pdfFile) fd.append("pdf", pdfFile);
      if (removePdf) fd.append("removePdf", "1");

      const res = await fetch(examId ? `/api/exams/${examId}` : "/api/exams", {
        method: examId ? "PATCH" : "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a prova.");
        setBusy(null);
        return;
      }
      router.push(`/professor/exames/${examId ?? data.id}?saved=${publish ? "published" : "draft"}`);
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setBusy(null);
    }
  }

  const selectedEscola = escolas.find((e) => e.id === draft.escolaId);
  const turmaOptions = selectedEscola?.turmas ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {examId ? "Editar prova" : "Nova prova"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Defina as informações, adicione as questões e publique quando estiver pronto.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>

      {/* Informações gerais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Informações da prova</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
            <input
              value={draft.titulo}
              onChange={(e) => update({ titulo: e.target.value })}
              placeholder="Ex.: Avaliação de Matemática — 3º bimestre"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Disciplina</label>
              <select
                value={draft.disciplina}
                onChange={(e) => update({ disciplina: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Selecione a disciplina...</option>
                <option value="LÍNGUA PORTUGUESA">LÍNGUA PORTUGUESA</option>
                <option value="MATEMÁTICA">MATEMÁTICA</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Escola</label>
              <select
                value={draft.escolaId}
                onChange={(e) => update({ escolaId: e.target.value, turma: "" })}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Todas as escolas / não informada</option>
                {escolas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Turma</label>
              {turmaOptions.length > 0 ? (
                <select
                  value={draft.turma}
                  onChange={(e) => update({ turma: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Selecione a turma</option>
                  {turmaOptions.map((t) => (
                    <option key={t.id} value={t.nome}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={draft.turma}
                  onChange={(e) => update({ turma: e.target.value })}
                  placeholder="Ex.: 9º ano A"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Data/hora final de entrega</label>
              <input
                type="datetime-local"
                value={draft.dataFim}
                onChange={(e) => update({ dataFim: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Data/hora de liberação (opcional)</label>
              <input
                type="datetime-local"
                value={draft.dataInicio}
                onChange={(e) => update({ dataInicio: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="self-end">
              <p className="text-xs text-slate-400">Deixe em branco para liberar imediatamente ao publicar.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tempo limite da prova (minutos)</label>
              <input
                type="number"
                min={1}
                max={999}
                value={draft.tempoMinutos ?? ""}
                onChange={(e) => update({ tempoMinutos: e.target.value ? Number(e.target.value) : null })}
                placeholder="Ex.: 60 (deixe vazio para sem limite)"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="self-end">
              <p className="text-xs text-slate-400">
                Com tempo definido, o aluno verá um cronômetro e o envio é feito automaticamente ao zerar.
              </p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Instruções para os alunos</label>
            <textarea
              value={draft.instrucoes}
              onChange={(e) => update({ instrucoes: e.target.value })}
              rows={2}
              placeholder="Ex.: Leia as questões com atenção. Você tem até 60 minutos."
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Arquivo da prova (PDF) — opcional
            </label>
            {pdfFile || (draft.pdfName && !removePdf) ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
{pdfFile ? pdfFile.name : draft.pdfName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {pdfFile
                        ? `Novo arquivo (${(pdfFile.size / 1024 / 1024).toFixed(2)} MB) — será enviado ao salvar`
                        : "O aluno poderá visualizar este arquivo ao fazer a prova."}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        {showPreview ? "Ocultar pré-visualização" : "Ver pré-visualização"}
                      </button>
                      {showPreview && (
                        <iframe
                          src={pdfFile ? (previewUrl ?? "") : examId ? `/api/exams/${examId}/pdf` : ""}
                          title="Pré-visualização do PDF"
                          className="h-[60vh] w-full rounded-xl border border-slate-200 bg-slate-50"
                        />
                      )}
                    </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    setRemovePdf(true);
                  }}
                  className="text-xs font-semibold text-rose-600 transition hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40">
                <FileText className="h-6 w-6 text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">Enviar PDF da prova</span>
                <span className="text-xs text-slate-400">O aluno visualiza o arquivo ao fazer a prova (até 4 MB)</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setPdfFile(f);
                    if (f) setRemovePdf(false);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {pdfFile && draft.pdfName && !removePdf && (
              <p className="mt-1 text-xs text-amber-600">
                Ao salvar, o arquivo atual ({draft.pdfName}) será substituído pelo novo.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Questões */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Questões ({draft.questoes.length})
          </h2>
        </div>
        <div className="space-y-4">
          {draft.questoes.map((q, index) => (
            <div key={q.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-900">Questão {index + 1}</p>
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
                    disabled={index === draft.questoes.length - 1}
                    title="Mover para baixo"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeQuestao(q.key)}
                    disabled={draft.questoes.length === 1}
                    title="Remover questão"
                    className="rounded-lg border border-rose-200 p-1.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Seletor de habilidade */}
              <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-500">
                    Habilidades
                    {q.habilidade.length > 0 && (
                      <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        {q.habilidade.length}
                      </span>
                    )}
                  </label>
                  {q.habilidade.length > 0 && (
                    <button type="button" onClick={() => updateQuestao(q.key, { habilidade: [] })} className="text-[10px] text-slate-400 hover:text-rose-500">
                      Limpar
                    </button>
                  )}
                </div>
                {draft.disciplina ? (
                  <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-3">
                    {(["vigente", "sensivel", "preditora"] as HabilidadeCategoria[]).map((cat) => {
                      const habs = getHabilidadesPorDisciplina(draft.disciplina as "LÍNGUA PORTUGUESA" | "MATEMÁTICA").filter((h) => h.categoria === cat);
                      if (habs.length === 0) return null;
                      const catSelected = habs.filter((h) => q.habilidade.includes(h.codigo)).length;
                      return (
                        <div key={cat} className="rounded-lg bg-slate-50 p-2">
                          <p className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            <span>{CATEGORIA_LABEL[cat]}</span>
                            {catSelected > 0 && <span className="text-indigo-500">{catSelected}/{habs.length}</span>}
                          </p>
                          <div className="max-h-28 space-y-0.5 overflow-y-auto">
                            {habs.map((h) => (
                              <label key={h.codigo} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-slate-100">
                                <input
                                  type="checkbox"
                                  checked={q.habilidade.includes(h.codigo)}
                                  onChange={() => {
                                    const has = q.habilidade.includes(h.codigo);
                                    updateQuestao(q.key, {
                                      habilidade: has
                                        ? q.habilidade.filter((x) => x !== h.codigo)
                                        : [...q.habilidade, h.codigo],
                                    });
                                  }}
                                  className="h-3 w-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="font-medium text-slate-600">{h.codigo}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">Selecione a disciplina primeiro.</p>
                )}
              </div>

              {/* Alternativas */}
              <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    Alternativas — digite o texto e marque a correta
                  </p>
                  <div className="space-y-1.5">
                    {q.alternativas.map((a, oi) => (
                      <div key={a.key} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => markCorreta(q.key, a.key)}
                          title={a.correta ? "Alternativa correta" : "Clique para marcar como correta"}
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition",
                            a.correta
                              ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300"
                          )}
                        >
                          {a.correta ? "✓" : String.fromCharCode(65 + oi)}
                        </button>
                        <input
                          type="text"
                          value={a.texto}
                          onChange={(e) => updateAlternativa(q.key, a.key, e.target.value)}
                          placeholder={`Texto da alternativa ${String.fromCharCode(65 + oi)}`}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-indigo-400"
                        />
                        {q.alternativas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAlternativa(q.key, a.key)}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addAlternativa(q.key)}
                      disabled={q.alternativas.length >= 8}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar alternativa
                    </button>
                    {q.alternativas.some((a) => a.correta) && (
                      <button
                        type="button"
                        onClick={() => {
                          const firstFalse = q.alternativas.find((a) => !a.correta);
                          if (firstFalse) markCorreta(q.key, firstFalse.key);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                      >
                        Desmarcar correta
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

      {error && (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      {/* Barra de ações */}
      <div className="sticky bottom-0 z-30 mt-6 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => save(false)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar como rascunho
          </button>
          <button
            onClick={() => save(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Salvar e publicar
          </button>
        </div>
      </div>
    </div>
  );
}

export { toLocalInput };