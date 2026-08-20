import type { ReactNode } from "react";

/**
 * Renderizador de "markdown leve" usado no editor de questões.
 * Suporta **negrito**, *itálico*, _itálico_, listas com "- " e "1. ".
 * O conteúdo é renderizado como elementos React (nunca com HTML bruto),
 * o que elimina o risco de XSS.
 */

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_]+_)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_RE);
  return parts
    .filter((p) => p.length > 0)
    .map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return part as unknown as ReactNode;
    });
}

export function renderPrompt(text: string): ReactNode {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`list-${key}`} className="list-decimal space-y-1 pl-5 marker:font-medium">
          {items}
        </ol>
      ) : (
        <ul key={`list-${key}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      )
    );
    key += 1;
    list = null;
  };

  const flushPara = () => {
    if (para.length === 0) return;
    const joined = para.join(" ");
    blocks.push(
      <p key={`p-${key}`} className="whitespace-pre-wrap">
        {renderInline(joined, `p-${key}`)}
      </p>
    );
    key += 1;
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);

    if (unordered) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(unordered[1]);
    } else if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
    } else if (line === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}

/** Remove marcações para exibir trechos simples (tabelas, PDFs, gráficos). */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[_*]([^_*]+)[_*]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
