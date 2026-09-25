import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  CATEGORIAS,
  COMPONENTES,
  ETAPAS,
  anosDaEtapa,
  rotuloAno,
  type HabilidadeCategoria,
  type HabilidadeEtapa,
} from "@/lib/habilidades-catalogo";
import { listarHabilidades } from "@/lib/habilidades-queries";
import { Search, ListChecks, Plus, TriangleAlert } from "lucide-react";
import LinhaHabilidade from "./LinhaHabilidade";

export const dynamic = "force-dynamic";

export default async function ConsultarHabilidadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const q = get("q");
  const etapa = get("etapa");
  const ano = get("ano");
  const componente = get("componente");
  const categoria = get("categoria");
  const situacao = get("situacao") || "ativo";
  const semVinculo = get("semVinculo") === "1";
  const pendentes = get("pendentes") === "1";

  const habilidades = await listarHabilidades({
    busca: q || undefined,
    etapa: etapa || undefined,
    ano: ano ? Number(ano) : undefined,
    componente: componente || undefined,
    categoria: categoria || undefined,
    ativo: situacao === "inativo" ? "false" : situacao === "todos" ? "todos" : "true",
    semVinculo: semVinculo || undefined,
    somenteSemDescricao: pendentes || undefined,
  });

  const ativas = habilidades.filter((h) => h.ativo).length;
  const semDescricao = habilidades.filter((h) => !h.descricao.trim()).length;
  const semQuestao = habilidades.filter((h) => h.questoesCount === 0).length;

  const hrefSemDescricao = (() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (etapa) p.set("etapa", etapa);
    if (ano) p.set("ano", ano);
    if (componente) p.set("componente", componente);
    if (categoria) p.set("categoria", categoria);
    if (situacao) p.set("situacao", situacao);
    if (semVinculo) p.set("semVinculo", "1");
    p.set("pendentes", pendentes ? "0" : "1");
    const s = p.toString();
    return `/admin/habilidades/consultar${s ? `?${s}` : ""}`;
  })();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <ListChecks className="h-6 w-6 text-indigo-600" /> Consultar habilidades
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Catálogo de habilidades usado no cadastro de questões. {habilidades.length} registro(s) no filtro atual.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/habilidades/cadastrar"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Cadastrar habilidade
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-700">{ativas} ativas</span>
        <Link
          href={hrefSemDescricao}
          title={pendentes ? "Mostrar todas as habilidades" : "Filtrar só as que estão sem descrição"}
          className={
            pendentes
              ? "rounded-full bg-amber-500 px-3 py-1 font-semibold text-white"
              : "rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 hover:bg-amber-100"
          }
        >
          {semDescricao} sem descrição{pendentes ? " (filtrando)" : ""}
        </Link>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
          {semQuestao} sem questão vinculada
        </span>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Buscar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Código ou descrição"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Etapa</label>
          <select name="etapa" defaultValue={etapa} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
            <option value="">Todas</option>
            {ETAPAS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Ano/série</label>
          <select name="ano" defaultValue={ano} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
            <option value="">Todos</option>
            {anosDaEtapa((etapa || "fundamental_i") as HabilidadeEtapa).map((a) => (
              <option key={a} value={a}>
                {rotuloAno((etapa || "fundamental_i") as HabilidadeEtapa, a)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Componente</label>
          <select name="componente" defaultValue={componente} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
            <option value="">Todos</option>
            {COMPONENTES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Categoria</label>
          <select name="categoria" defaultValue={categoria} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Situação</label>
          <select name="situacao" defaultValue={situacao} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
            <option value="ativo">Ativas</option>
            <option value="inativo">Inativas</option>
            <option value="todos">Todas</option>
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="semVinculo"
              value="1"
              defaultChecked={semVinculo}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Sem questão vinculada
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="pendentes"
              value="1"
              defaultChecked={pendentes}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Só sem descrição
          </label>
          <button
            type="submit"
            className="ml-auto rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900"
          >
            Filtrar
          </button>
          <Link
            href="/admin/habilidades/consultar"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </Link>
        </div>
      </form>

      {habilidades.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Nenhuma habilidade encontrada com esses filtros.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 font-semibold">Ano/série</th>
                <th className="px-4 py-3 font-semibold">Componente</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 text-center font-semibold">Questões</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {habilidades.map((h) => (
                <LinhaHabilidade
                  key={h.id}
                  habilidade={{
                    id: h.id,
                    codigo: h.codigo,
                    descricao: h.descricao,
                    etapa: h.etapa,
                    ano: h.ano,
                    componente: h.componente,
                    categoria: h.categoria as HabilidadeCategoria | null,
                    ativo: h.ativo,
                    questoesCount: h.questoesCount,
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        Habilidades inativas continuam válida para as questões que já as utilizam, mas não aparecem nos seletores
        novos. O código não pode ser alterado enquanto houver questões vinculadas.
      </p>
    </div>
  );
}
