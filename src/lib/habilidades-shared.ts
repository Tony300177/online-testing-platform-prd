/* Constantes e tipos compartilhados da análise por habilidades.
 * Módulo livre de dependências de servidor (seguro para importar em Client Components). */

/** Classificação pedagógica (limiares configuráveis na tabela desempenho_thresholds). */
export type Classificacao = "satisfatorio" | "atencao" | "intervencao";

export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  satisfatorio: "Domínio satisfatório",
  atencao: "Atenção",
  intervencao: "Necessita intervenção",
};

export const CLASSIFICACAO_COR: Record<Classificacao, { bg: string; text: string; bar: string }> = {
  satisfatorio: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "#10b981" },
  atencao: { bg: "bg-amber-50", text: "text-amber-700", bar: "#f59e0b" },
  intervencao: { bg: "bg-rose-50", text: "text-rose-700", bar: "#f43f5e" },
};

export function classificarPorLimiar(
  pct: number | null,
  thresholds: { verdeMin: number; amareloMin: number }
): Classificacao {
  if (pct === null) return "intervencao";
  if (pct >= thresholds.verdeMin) return "satisfatorio";
  if (pct >= thresholds.amareloMin) return "atencao";
  return "intervencao";
}
