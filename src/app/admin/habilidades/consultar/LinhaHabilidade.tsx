"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Pencil, Power } from "lucide-react";
import {
  CATEGORIA_LABEL,
  COMPONENTE_LABEL,
  rotuloAno,
  type HabilidadeCategoria,
  type HabilidadeComponente,
  type HabilidadeEtapa,
} from "@/lib/habilidades-catalogo";

export type LinhaHabilidadeData = {
  id: number;
  codigo: string;
  descricao: string;
  etapa: HabilidadeEtapa;
  ano: number;
  componente: HabilidadeComponente;
  categoria: HabilidadeCategoria | null;
  ativo: boolean;
  questoesCount: number;
};

export default function LinhaHabilidade({ habilidade }: { habilidade: LinhaHabilidadeData }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function alternarSituacao() {
    if (habilidade.ativo && habilidade.questoesCount > 0) {
      const ok = window.confirm(
        `${habilidade.codigo} está vinculada a ${habilidade.questoesCount} questão(ões). Inativar mantém o histórico de desempenho; confirme para continuar.`
      );
      if (!ok) return;
    }
    setOcupado(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/habilidades/catalogo/${habilidade.id}`, {
        method: habilidade.ativo ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: habilidade.ativo ? undefined : JSON.stringify({ ativo: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.error ?? "Não foi possível alterar a situação.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <tr className="border-b border-slate-100 align-top hover:bg-slate-50/70">
      <td className="px-4 py-3">
        <span className="font-mono text-xs font-semibold text-indigo-700">{habilidade.codigo}</span>
        {!habilidade.ativo && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            inativa
          </span>
        )}
      </td>
      <td className="max-w-md px-4 py-3 text-slate-700">
        {habilidade.descricao.trim() ? (
          <span className="line-clamp-2">{habilidade.descricao}</span>
        ) : (
          <span className="text-xs italic text-amber-600">Descrição pendente</span>
        )}
        {erro && <p className="mt-1 text-xs text-rose-600">{erro}</p>}
      </td>
      <td className="px-4 py-3 text-slate-600">{rotuloAno(habilidade.etapa, habilidade.ano)}</td>
      <td className="px-4 py-3 text-slate-600">{COMPONENTE_LABEL[habilidade.componente] ?? habilidade.componente}</td>
      <td className="px-4 py-3 text-slate-600">
        {habilidade.categoria ? CATEGORIA_LABEL[habilidade.categoria] : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={
            habilidade.questoesCount > 0
              ? "rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400"
          }
        >
          {habilidade.questoesCount}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/admin/habilidades/cadastrar?id=${habilidade.id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Link>
          <button
            type="button"
            onClick={alternarSituacao}
            disabled={ocupado}
            title={habilidade.ativo ? "Inativar" : "Reativar"}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            {habilidade.ativo ? "Inativar" : "Ativar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
