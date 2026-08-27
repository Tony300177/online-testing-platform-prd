"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser } from "lucide-react";

export default function LimparProvasButton() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function limpar() {
    const ok = confirm(
      "Excluir permanentemente todas as provas de teste (título com 'teste') e todas as provas encerradas? Questões, respostas e resultados associados também serão removidos. Esta ação não pode ser desfeita."
    );
    if (!ok) return;

    setCarregando(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/admin/provas/limpar", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMensagem(`Erro: ${data.error ?? "Não foi possível limpar."}`);
      } else {
        setMensagem(`Foram excluídas ${data.excluidas} prova(s).`);
      }
      router.refresh();
    } catch {
      setMensagem("Erro de conexão ao limpar as provas.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={limpar}
        disabled={carregando}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Eraser className="h-3.5 w-3.5" />
        {carregando ? "Limpando..." : "Limpar provas de teste e encerradas"}
      </button>
      {mensagem && <span className="text-xs text-slate-500">{mensagem}</span>}
    </div>
  );
}
