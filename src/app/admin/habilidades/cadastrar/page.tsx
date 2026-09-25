"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Save, Sparkles } from "lucide-react";
import {
  CATEGORIAS,
  COMPONENTES,
  DESCRICAO_MAX,
  DESCRICAO_MIN,
  ETAPAS,
  analisarCodigo,
  anosDaEtapa,
  normalizarCodigo,
  rotuloAno,
  type HabilidadeCategoria,
  type HabilidadeComponente,
  type HabilidadeEtapa,
} from "@/lib/habilidades-catalogo";
import { cn } from "@/lib/utils";

type FormState = {
  etapa: HabilidadeEtapa | "";
  ano: string;
  componente: HabilidadeComponente | "";
  categoria: HabilidadeCategoria | "";
  codigo: string;
  descricao: string;
};

const VAZIO: FormState = { etapa: "", ano: "", componente: "", categoria: "", codigo: "", descricao: "" };

export default function CadastrarHabilidadePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editandoId = searchParams.get("id");

  const [form, setForm] = useState<FormState>(VAZIO);
  const [erros, setErros] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(Boolean(editandoId));
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [aviso, setAviso] = useState("");

  const anos = useMemo(() => (form.etapa ? anosDaEtapa(form.etapa) : []), [form.etapa]);

  useEffect(() => {
    if (!editandoId) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/habilidades/catalogo/${editandoId}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) {
          const h = json.habilidade;
          setForm({
            etapa: h.etapa,
            ano: String(h.ano),
            componente: h.componente,
            categoria: h.categoria ?? "",
            codigo: h.codigo,
            descricao: h.descricao ?? "",
          });
        } else {
          setAviso(json.error ?? "Habilidade não encontrada.");
        }
      } catch {
        setAviso("Erro de conexão ao carregar a habilidade.");
      } finally {
        setCarregando(false);
      }
    })();
  }, [editandoId]);

  const codigoNormalizado = normalizarCodigo(form.codigo);
  const inferido = useMemo(() => (codigoNormalizado ? analisarCodigo(codigoNormalizado) : null), [codigoNormalizado]);

  function definir(patch: Partial<FormState>) {
    setSalvo(false);
    setForm((f) => ({ ...f, ...patch }));
  }

  /** Preenche etapa/ano/componente a partir do código digitado. */
  function preencherPeloCodigo() {
    if (!inferido) return;
    const patch: Partial<FormState> = {};
    if (inferido.etapa) patch.etapa = inferido.etapa;
    if (inferido.ano) patch.ano = String(inferido.ano);
    if (inferido.componente) patch.componente = inferido.componente;
    definir(patch);
  }

  function validar(): string[] {
    const lista: string[] = [];
    if (!form.etapa) lista.push("Selecione a etapa.");
    if (!form.ano) lista.push("Selecione o ano/série.");
    if (!form.componente) lista.push("Selecione o componente.");
    if (!codigoNormalizado) lista.push("Informe o código da habilidade.");
    else if (!inferido) lista.push("Código inválido. Use o formato BNCC AAAAANNDD (ex.: EF05MA01).");
    const descricao = form.descricao.trim();
    if (descricao.length < DESCRICAO_MIN) lista.push(`Informe a descrição (mínimo ${DESCRICAO_MIN} caracteres).`);
    if (descricao.length > DESCRICAO_MAX) lista.push(`A descrição deve ter no máximo ${DESCRICAO_MAX} caracteres.`);
    if (inferido && form.etapa && inferido.etapa && inferido.etapa !== form.etapa) {
      lista.push("O código não pertence à etapa selecionada.");
    }
    if (inferido && form.ano && inferido.ano !== null && String(inferido.ano) !== form.ano) {
      lista.push("O código não pertence ao ano/série selecionado.");
    }
    return lista;
  }

  async function salvar() {
    const problemas = validar();
    setErros(problemas);
    if (problemas.length > 0) return;

    setSalvando(true);
    try {
      const payload = {
        etapa: form.etapa,
        ano: Number(form.ano),
        componente: form.componente,
        categoria: form.categoria || null,
        codigo: codigoNormalizado,
        descricao: form.descricao.trim(),
      };
      const res = await fetch(
        editandoId ? `/api/admin/habilidades/catalogo/${editandoId}` : "/api/admin/habilidades/catalogo",
        {
          method: editandoId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErros([json.error ?? "Não foi possível salvar a habilidade."]);
        setSalvando(false);
        return;
      }
      setSalvo(true);
      setErros([]);
      if (!editandoId) setForm(VAZIO);
      router.refresh();
    } catch {
      setErros(["Erro de conexão. Tente novamente."]);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {editandoId ? "Editar habilidade" : "Cadastrar habilidade"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Etapa, ano/série, componente, código e descrição. O código é o identificador usado ao vincular
            habilidades às questões.
          </p>
        </div>
        <Link
          href="/admin/habilidades/consultar"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Consultar habilidades
        </Link>
      </div>

      <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs">
        {["Etapa", "Ano/série", "Componente", "Código", "Descrição"].map((passo, i) => (
          <li key={passo} className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 font-semibold",
                i === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              )}
            >
              {i + 1}. {passo}
            </span>
            {i < 4 && <span className="text-slate-300">›</span>}
          </li>
        ))}
      </ol>

      {carregando ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando habilidade...
        </p>
      ) : (
        <div className="mt-6 max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {aviso && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{aviso}</p>
          )}
          {salvo && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {editandoId ? "Habilidade atualizada com sucesso." : "Habilidade cadastrada com sucesso."}
            </p>
          )}
          {erros.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Etapa *</label>
              <select
                value={form.etapa}
                onChange={(e) => definir({ etapa: e.target.value as HabilidadeEtapa, ano: "" })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Selecione...</option>
                {ETAPAS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Ano/série *</label>
              <select
                value={form.ano}
                disabled={!form.etapa}
                onChange={(e) => definir({ ano: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{form.etapa ? "Selecione..." : "Selecione a etapa primeiro"}</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {rotuloAno(form.etapa as HabilidadeEtapa, a)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Componente *</label>
              <select
                value={form.componente}
                onChange={(e) => definir({ componente: e.target.value as HabilidadeComponente })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Selecione...</option>
                {COMPONENTES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Categoria (opcional)</label>
              <select
                value={form.categoria}
                onChange={(e) => definir({ categoria: e.target.value as HabilidadeCategoria })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">Sem categoria</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Código da habilidade *</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={form.codigo}
                onChange={(e) => definir({ codigo: normalizarCodigo(e.target.value).slice(0, 10) })}
                placeholder="EF05MA01"
                maxLength={10}
                className="w-44 rounded-xl border border-slate-300 px-4 py-2 font-mono text-sm uppercase outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
              {inferido && (
                <button
                  type="button"
                  onClick={preencherPeloCodigo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Preencher com o código
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Formato BNCC: sigla da etapa + ano + sigla do componente + numeração (ex.: EF05MA01).
            </p>
            {inferido && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  (form.etapa && inferido.etapa && inferido.etapa !== form.etapa) ||
                    (form.ano && inferido.ano !== null && String(inferido.ano) !== form.ano)
                    ? "text-amber-600"
                    : "text-slate-400"
                )}
              >
                O código indica:{" "}
                {inferido.etapa ? ETAPAS.find((e) => e.value === inferido.etapa)?.label : "etapa inválida"} ·{" "}
                {inferido.ano !== null ? rotuloAno((inferido.etapa ?? "fundamental_i") as HabilidadeEtapa, inferido.ano) : "ano inválido"}{" "}
                {inferido.componente
                  ? `· ${COMPONENTES.find((c) => c.value === inferido.componente)?.label}`
                  : ""}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Descrição *</label>
            <textarea
              value={form.descricao}
              onChange={(e) => definir({ descricao: e.target.value })}
              rows={3}
              maxLength={DESCRICAO_MAX}
              autoFocus={Boolean(editandoId) && !carregando}
              placeholder="Cole aqui o texto da habilidade da BNCC."
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {form.descricao.trim().length}/{DESCRICAO_MAX}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {salvando ? "Salvando..." : "Salvar habilidade"}
            </button>
            {editandoId ? (
              <Link
                href="/admin/habilidades/consultar"
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => definir(VAZIO)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Limpar campos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
