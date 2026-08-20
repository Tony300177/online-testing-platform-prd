"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

/** Cartão de compartilhamento: link único + QR Code da prova. */
export default function ShareCard({ slug, examTitle }: { slug: string; examTitle: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}/p/${slug}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold text-indigo-900">
          <QrCode className="h-4 w-4" /> Link de acesso da prova
        </p>
        <p className="mt-1 text-xs text-indigo-700/70">
          Compartilhe este link ou o QR Code com os alunos de {examTitle}. Eles só precisam informar
          nome, turma e escola.
        </p>
        {url ? (
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-medium text-slate-700">
              {url}
            </code>
            <button
              onClick={copy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        ) : (
          <div className="mt-3 h-9 w-full animate-pulse rounded-lg bg-indigo-100" />
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir a prova como um aluno veria
          </a>
        )}
      </div>
      <div className="shrink-0 self-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-indigo-100">
        {url ? (
          <QRCodeSVG value={url} size={128} level="M" />
        ) : (
          <div className="h-32 w-32 animate-pulse rounded bg-indigo-100" />
        )}
      </div>
    </div>
  );
}
