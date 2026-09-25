"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Search, X } from "lucide-react";
import { CATEGORIA_LABEL } from "@/lib/habilidades-catalogo";
import { cn } from "@/lib/utils";

export type CatalogoHabilidade = {
  id: number;
  codigo: string;
  descricao: string;
  etapa: string;
  ano: number;
  componente: string;
  categoria: string | null;
};

const COMPONENTE_POR_DISCIPLINA: Record<string, string> = {
  "LÍNGUA PORTUGUESA": "lingua_portuguesa",
  MATEMÁTICA: "matematica",
  "Língua Portuguesa": "lingua_portuguesa",
  Matemática: "matematica",
};

/**
 * Seletor de habilidades do catálogo (BNCC) usado no cadastro de questões.
 * Busca no servidor em /api/habilidades (somente habilidades ativas).
 */
export default function HabilidadePicker({
  value,
  onChange,
  disciplina,
  mostrarDescricao = false,
}: {
  value: string[];
  onChange: (codigos: string[]) => void;
  disciplina?: string;
  mostrarDescricao?: boolean;
}) {
  const [catalogo, setCatalogo] = useState<CatalogoHabilidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/habilidades", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          if (!cancelado) setErro(json.error ?? "Não foi possível carregar o catálogo de habilidades.");
          return;
        }
        if (!cancelado) setCatalogo(json.habilidades ?? []);
      } catch {
        if (!cancelado) setErro("Erro de conexão ao carregar o catálogo de habilidades.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const componenteFiltro = disciplina ? COMPONENTE_POR_DISCIPLINA[disciplina] : undefined;

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const h of catalogo) {
      if (componenteFiltro && h.componente !== componenteFiltro) continue;
      set.add(h.ano);
    }
    return [...set].sort((a, b) => a - b);
  }, [catalogo, componenteFiltro]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return catalogo.filter((h) => {
      if (componenteFiltro && h.componente !== componenteFiltro) return false;
      if (ano && String(h.ano) !== ano) return false;
      if (!termo) return true;
      return h.codigo.toLowerCase().includes(termo) || h.descricao.toLowerCase().includes(termo);
    });
  }, [catalogo, componenteFiltro, ano, busca]);

  const porAno = useMemo(() => {
    const map = new Map<number, CatalogoHabilidade[]>();
    for (const h of filtradas) {
      const list = map.get(h.ano) ?? [];
      list.push(h);
      map.set(h.ano, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtradas]);

  // Códigos já gravados em provas antigas que não estão no catálogo
  const orfas = useMemo(
    () => value.filter((codigo) => !catalogo.some((h) => h.codigo === codigo)),
    [value, catalogo]
  );

  function toggle(codigo: string) {
    onChange(value.includes(codigo) ? value.filter((c) => c !== codigo) : [...value, codigo]);
  }

  return (
    <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">
          Habilidades
          {value.length > 0 && (
            <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
              {value.length}
            </span>
          )}
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-500"
          >
            <X className="h-3 w-3" /> Limpar
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <div className="relative min-w-[150px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar código ou descrição"
            className="w-full rounded-md border border-slate-200 py-1 pl-7 pr-2 text-[11px] outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
        </div>
        {anosDisponiveis.length > 1 && (
          <select
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px] outline-none focus:border-indigo-400"
          >
            <option value="">Todos os anos</option>
            {anosDisponiveis.map((a) => (
              <option key={a} value={a}>
                {a}º ano
              </option>
            ))}
          </select>
        )}
      </div>

      {erro && (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[10px] text-rose-600">{erro}</p>
      )}

      {carregando ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando catálogo...
        </p>
      ) : (
        <>
          {orfas.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                {orfas.join(", ")} não está no catálogo ativo. Cadastre em{" "}
                <b>Habilidades &gt; Cadastrar</b> ou remova o vínculo.
              </span>
            </p>
          )}

          {porAno.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">
              {disciplina
                ? "Nenhuma habilidade ativa para esta disciplina."
                : "Nenhuma habilidade encontrada no catálogo."}
            </p>
          ) : (
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
              {porAno.map(([anoGrupo, habs]) => (
                <div key={anoGrupo}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {anoGrupo}º ano · {habs.length}
                  </p>
                  <div className="space-y-0.5">
                    {habs.map((h) => {
                      const marcado = value.includes(h.codigo);
                      return (
                        <label
                          key={h.codigo}
                          title={h.descricao || "Sem descrição cadastrada"}
                          className={cn(
                            "flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-slate-50",
                            marcado && "bg-indigo-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggle(h.codigo)}
                            className="mt-0.5 h-3 w-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-medium text-slate-700">{h.codigo}</span>
                          {h.categoria && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                              {CATEGORIA_LABEL[h.categoria as keyof typeof CATEGORIA_LABEL] ?? h.categoria}
                            </span>
                          )}
                          {marcado && <Check className="ml-auto h-3 w-3 text-indigo-600" strokeWidth={3} />}
                          {mostrarDescricao && (
                            <span className="w-full truncate pl-4 text-[10px] text-slate-400">
                              {h.descricao || "Sem descrição cadastrada"}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
