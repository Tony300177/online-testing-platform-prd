"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, ChevronDown } from "lucide-react";

interface DashboardFiltersProps {
  escolasList: { id: string; nome: string }[];
  turmasList: { id: string; nome: string }[];
  selectedEscola: { id: string; nome: string } | null;
  turmaValida: string;
  escola: string;
  turma: string;
  pageSize: string;
}

export default function DashboardFilters({
  escolasList,
  turmasList,
  selectedEscola,
  turmaValida,
  escola,
  turma,
  pageSize,
}: DashboardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const createUrl = (params: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value) sp.set(key, value);
      else sp.delete(key);
    });
    return `/admin/dashboard?${sp.toString()}`;
  };

  const handleEscolaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const params: Record<string, string> = { escola: value, page: "1" };
    if (!value) {
      delete params.escola;
      delete params.turma;
    }
    router.push(createUrl(params));
  };

  const handleTurmaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const params: Record<string, string> = { turma: value, page: "1" };
    if (!value) delete params.turma;
    router.push(createUrl(params));
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const params: Record<string, string> = { pageSize: value };
    router.push(createUrl(params));
  };

  const handleClear = () => {
    router.push("/admin/dashboard");
  };

  return (
    <form className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-[220px] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700">Escola</label>
        <div className="relative">
          <select
            value={escola}
            onChange={handleEscolaChange}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 appearance-none pr-10"
          >
            <option value="">Todas as escolas</option>
            {escolasList.map((e) => (
              <option key={e.id} value={e.nome}>
                {e.nome}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        </div>
      </div>
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700">Turma</label>
        <div className="relative">
          <select
            value={turmaValida}
            onChange={handleTurmaChange}
            disabled={!selectedEscola}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 appearance-none pr-10"
          >
            <option value="">Todas as turmas</option>
            {turmasList.map((t) => (
              <option key={t.id} value={t.nome}>
                {t.nome}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        </div>
      </div>
      <div className="min-w-[120px]">
        <label className="mb-1 block text-sm font-medium text-slate-700">Por página</label>
        <div className="relative">
          <select
            value={pageSize}
            onChange={handlePageSizeChange}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 appearance-none pr-10"
          >
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">Todos</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <X className="h-4 w-4" /> Limpar
        </button>
      </div>
    </form>
  );
}