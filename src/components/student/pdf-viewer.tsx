"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// pdf.js é carregado dinamicamente no client (evita ReferenceError de DOMMatrix no SSR)
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

/**
 * Visualizador de PDF integrado (pdf.js) com zoom, navegação de páginas,
 * miniaturas e ajuste à largura — tudo dentro da plataforma.
 */
export default function PdfViewer({ url, title }: { url: string; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fitWidth, setFitWidth] = useState(true);
  const [thumbSize, setThumbSize] = useState(0);

  const numPages = pdf?.numPages ?? 0;

  // Carrega o documento
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPdf(null);
    setPage(1);
    (async () => {
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

  // Renderiza a página atual
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    (async () => {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const containerWidth = wrapRef.current?.clientWidth ?? 800;
      let finalScale = scale;
      if (fitWidth) finalScale = containerWidth / base.width;
      finalScale = Math.min(Math.max(finalScale, MIN_SCALE), MAX_SCALE);
      const viewport = p.getViewport({ scale: finalScale });

      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = p.render({ canvas, viewport });
      await renderTask.promise;
      if (cancelled) return;
      // sincroniza o zoom exibido
      setScale(finalScale);
    })().catch(() => {});

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, page, scale, fitWidth]);

  // Gera miniaturas de todas as páginas
  useEffect(() => {
    if (!pdf || thumbSize <= 0) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
        const p = await pdf.getPage(n);
        const vp = p.getViewport({ scale: 0.35 });
        const el = document.getElementById(`thumb-${n}`);
        if (!el || el.children.length > 0) continue;
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        await p.render({ canvas, viewport: vp }).promise;
        el.appendChild(canvas);
        canvas.className = "w-full h-auto rounded";
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [pdf, thumbSize]);

  const zoomIn = () => {
    setFitWidth(false);
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  };
  const zoomOut = () => {
    setFitWidth(false);
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-2 text-sm font-medium text-slate-500">Carregando PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="max-w-sm text-center">
          <FileWarning className="mx-auto h-10 w-10 text-rose-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page <= 1}
            title="Página anterior"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7rem] text-center text-xs font-semibold text-slate-600">
            Página {page} de {numPages || 1}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(p + 1, numPages))}
            disabled={page >= numPages}
            title="Página seguinte"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            title="Diminuir zoom"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs font-semibold text-slate-600">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            title="Aumentar zoom"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFitWidth(true);
            }}
            title="Ajustar à largura"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border transition",
              fitWidth
                ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-[90px_minmax(0,1fr)]">
        {/* Miniaturas */}
        <div className="hidden max-h-[70vh] flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 p-2 sm:flex">
          <div
            ref={(el) => {
              if (el && el.clientWidth > 0) setThumbSize(el.clientWidth);
            }}
            className="flex flex-col gap-2"
          >
            {Array.from({ length: numPages }).map((_, i) => {
              const n = i + 1;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={cn(
                    "rounded-lg border p-1 transition",
                    page === n ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"
                  )}
                  title={`Página ${n}`}
                >
                  <div id={`thumb-${n}`} />
                  <span className="mt-0.5 block text-center text-[10px] font-semibold text-slate-500">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Página */}
        <div ref={wrapRef} className="max-h-[70vh] overflow-auto bg-slate-100 p-3">
          <div className="flex min-h-full items-start justify-center">
            <canvas ref={canvasRef} className="max-w-none rounded-md shadow" />
          </div>
          {title && <p className="mt-2 text-center text-[11px] text-slate-400">{title}</p>}
        </div>
      </div>
    </div>
  );
}