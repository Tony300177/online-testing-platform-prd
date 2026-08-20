"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Megaphone, PencilLine, Trash2, XCircle } from "lucide-react";

type Props = {
  examId: number;
  status: string;
  editHref?: string;
};

/** Ações rápidas: publicar, encerrar, editar e excluir uma prova. */
export default function ExamActions({ examId, status, editHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function act(kind: "publish" | "finish" | "delete") {
    setError("");
    if (kind === "delete" && !window.confirm("Excluir esta prova definitivamente? Esta ação não pode ser desfeita.")) {
      return;
    }
    if (kind === "publish" && !window.confirm("Publicar a prova agora? Um link e QR Code serão gerados para os alunos.")) {
      return;
    }
    setBusy(kind);
    try {
      let res: Response;
      if (kind === "delete") {
        res = await fetch(`/api/exams/${examId}`, { method: "DELETE" });
      } else {
        res = await fetch(`/api/exams/${examId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: kind === "publish" ? "active" : "finished" }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível concluir a ação.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <button
            onClick={() => act("publish")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
            Publicar
          </button>
        )}
        {status === "draft" && editHref && (
          <button
            onClick={() => router.push(editHref)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <PencilLine className="h-3.5 w-3.5" /> Editar
          </button>
        )}
        {status === "active" && (
          <button
            onClick={() => act("finish")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-400 disabled:opacity-60"
          >
            {busy === "finish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Encerrar
          </button>
        )}
        <button
          onClick={() => act("delete")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
        >
          {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Excluir
        </button>
      </div>
      {error && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
          <CheckCircle2 className="hidden h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
