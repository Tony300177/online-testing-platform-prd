"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning, Loader2 } from "lucide-react";

// pdf.js é carregado dinamicamente no client (evita ReferenceError de DOMMatrix no SSR)
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/**
 * Visualizador de PDF integrado (pdf.js) para o aluno — mostra todas as
 * páginas empilhadas com barra de rolagem, sem botões ou ícones de navegação.
 */
export default function PdfViewer({ url, title }: { url: string; title?: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Carrega o documento
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setPdf(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const res = await fetch(url);
        if (!res.ok) throw new Error("Não foi possível carregar o PDF.");
        const data = await res.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          (doc as unknown as { destroy?: () => void }).destroy?.();
          return;
        }
        setPdf(doc);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error)?.message ?? "Não foi possível carregar o PDF.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      (pdf as unknown as { destroy?: () => void } | null)?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Renderiza todas as páginas empilhadas, ajustadas à largura do container
  useEffect(() => {
    if (!pdf || !wrapRef.current || !pagesRef.current) return;
    let cancelled = false;
    const tasks: RenderTask[] = [];

    const pagesEl = pagesRef.current;
    pagesEl.innerHTML = "";
    const containerWidth = wrapRef.current.clientWidth - 24;

    (async () => {
      for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
        const p = await pdf.getPage(n);
        const base = p.getViewport({ scale: 1 });
        const scale = containerWidth / base.width;
        const viewport = p.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "max-w-full rounded-md shadow";
        const task = p.render({ canvas, viewport });
        tasks.push(task);
        pagesEl.appendChild(canvas);
        await task.promise;
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [pdf]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-11rem)] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-2 text-sm font-medium text-slate-500">Carregando PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-11rem)] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="max-w-sm text-center">
          <FileWarning className="mx-auto h-10 w-10 text-rose-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div ref={wrapRef} className="max-h-[calc(100vh-11rem)] overflow-auto bg-slate-100 p-3">
        <div ref={pagesRef} className="flex flex-col items-center gap-4"></div>
        {title && <p className="mt-2 text-center text-[11px] text-slate-400">{title}</p>}
      </div>
    </div>
  );
}