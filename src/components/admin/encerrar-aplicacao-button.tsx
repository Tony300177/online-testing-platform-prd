"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";

export default function EncerrarAplicacaoButton({ id }: { id: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleEncerrar() {
    if (!window.confirm("Encerrar esta aplicação? As provas das turmas serão finalizadas.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/aplicacoes/${id}/encerrar`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        window.alert(data.error || "Não foi possível encerrar.");
        setLoading(false);
      }
    } catch {
      window.alert("Erro de conexão.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleEncerrar}
      disabled={loading}
      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
      Encerrar
    </button>
  );
}