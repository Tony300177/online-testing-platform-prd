"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AlunoFilters } from "@/lib/admin";

type TurmaOption = { nome: string; escola: string };

type Opcoes = {
  escolas: string[];
  turmas: TurmaOption[];
  etnias: string[];
  generos: string[];
  bairros: string[];
  professores: string[];
};

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

/** Barra de filtros global reutilizável (escola, turma, etnia, gênero, bairro, professor, busca). */
export default function FiltrosBar({
  action,
  opcoes,
  valores,
  extra,
}: {
  action: string;
  opcoes: Opcoes;
  valores: AlunoFilters;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [escola, setEscola] = useState(valores.escola ?? "");
  const [turma, setTurma] = useState(valores.turma ?? "");
  const [etnia, setEtnia] = useState(valores.etnia ?? "");
  const [genero, setGenero] = useState(valores.genero ?? "");
  const [bairro, setBairro] = useState(valores.bairro ?? "");
  const [professor, setProfessor] = useState(valores.professor ?? "");
  const [busca, setBusca] = useState(valores.search ?? "");

  const ativo =
    Boolean(escola) || Boolean(turma) || Boolean(etnia) || Boolean(genero) || Boolean(bairro) || Boolean(professor) || Boolean(busca);

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (escola) params.set("escola", escola);
    if (turma) params.set("turma", turma);
    if (etnia) params.set("etnia", etnia);
    if (genero) params.set("genero", genero);
    if (bairro) params.set("bairro", bairro);
    if (professor) params.set("professor", professor);
    if (busca.trim()) params.set("busca", busca.trim());
    const qs = params.toString();
    router.push(qs ? `${action}?${qs}` : action);
    router.refresh();
  }

  function limpar() {
    setEscola("");
    setTurma("");
    setEtnia("");
    setGenero("");
    setBairro("");
    setProfessor("");
    setBusca("");
    router.push(action);
    router.refresh();
  }

  return (
    <form onSubmit={aplicar} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Escola</label>
          <select
            value={escola}
            onChange={(e) => {
              setEscola(e.target.value);
              setTurma("");
            }}
            className={inputCls}
          >
            <option value="">Todas</option>
            {opcoes.escolas.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Turma</label>
          <select
            value={turma}
            onChange={(e) => {
              setTurma(e.target.value);
            }}
            className={inputCls}
          >
            <option value="">Todas</option>
            {opcoes.turmas
              .filter((t) => !escola || t.escola === escola)
              .map((t) => (
                <option key={t.nome} value={t.nome}>
                  {t.nome}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Etnia</label>
          <select value={etnia} onChange={(e) => setEtnia(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {opcoes.etnias.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Gênero</label>
          <select value={genero} onChange={(e) => setGenero(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {opcoes.generos.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Bairro</label>
          <select value={bairro} onChange={(e) => setBairro(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {opcoes.bairros.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Professor</label>
          <select value={professor} onChange={(e) => setProfessor(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {opcoes.professores.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">Buscar por nome</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do aluno" className={inputCls} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <Filter className="h-4 w-4" /> Aplicar
        </button>
        {ativo && (
          <button
            type="button"
            onClick={limpar}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" /> Limpar
          </button>
        )}
        {extra}
      </div>
    </form>
  );
}