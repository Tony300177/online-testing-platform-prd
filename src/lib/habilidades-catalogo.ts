/* ============================================================
 * CATÁLOGO DE HABILIDADES (BNCC) — domínio puro
 *
 * Fonte de verdade: tabela `habilidades` (ver sql/migracao-habilidades.sql).
 * As consultas ficam em @/lib/habilidades-queries (servidor).
 *
 * O código BNCC tem o formato AAAAANNDD (ex.: EF05MA01) e carrega
 * etapa, ano/série e componente:
 *   EF  -> Ensino Fundamental (I = 1º ao 5º ano, II = 6º ao 9º ano)
 *   EM  -> Ensino Médio
 *   NN  -> ano/série (o último dígito é sempre o ano da habilidade)
 * ============================================================ */

export type HabilidadeEtapa = "fundamental_i" | "fundamental_ii" | "medio";
export type HabilidadeComponente =
  | "matematica"
  | "lingua_portuguesa"
  | "lingua_inglesa"
  | "ciencias"
  | "historia"
  | "geografia"
  | "arte"
  | "educacao_fisica"
  | "outros";
export type HabilidadeCategoria = "vigente" | "sensivel" | "preditora";

export const HABILIDADE_CODIGO_REGEX = /^([A-Z]{2})([0-9]{2})([A-Z]{2})([0-9]{2})$/;

export const ETAPAS: { value: HabilidadeEtapa; label: string; anos: number[] }[] = [
  { value: "fundamental_i", label: "Ensino Fundamental I", anos: [1, 2, 3, 4, 5] },
  { value: "fundamental_ii", label: "Ensino Fundamental II", anos: [6, 7, 8, 9] },
  { value: "medio", label: "Ensino Médio", anos: [1, 2, 3] },
];

export const COMPONENTES: { value: HabilidadeComponente; label: string }[] = [
  { value: "matematica", label: "Matemática" },
  { value: "lingua_portuguesa", label: "Língua Portuguesa" },
  { value: "lingua_inglesa", label: "Língua Inglesa" },
  { value: "ciencias", label: "Ciências" },
  { value: "historia", label: "História" },
  { value: "geografia", label: "Geografia" },
  { value: "arte", label: "Arte" },
  { value: "educacao_fisica", label: "Educação Física" },
  { value: "outros", label: "Outros" },
];

export const CATEGORIAS: { value: HabilidadeCategoria; label: string }[] = [
  { value: "vigente", label: "Vigente" },
  { value: "sensivel", label: "Sensível" },
  { value: "preditora", label: "Preditora" },
];

export const ETAPA_LABEL: Record<HabilidadeEtapa, string> = {
  fundamental_i: "Ensino Fundamental I",
  fundamental_ii: "Ensino Fundamental II",
  medio: "Ensino Médio",
};

export const COMPONENTE_LABEL: Record<HabilidadeComponente, string> = COMPONENTES.reduce(
  (acc, c) => ({ ...acc, [c.value]: c.label }),
  {} as Record<HabilidadeComponente, string>
);

export const CATEGORIA_LABEL: Record<HabilidadeCategoria, string> = CATEGORIAS.reduce(
  (acc, c) => ({ ...acc, [c.value]: c.label }),
  {} as Record<HabilidadeCategoria, string>
);

export function anosDaEtapa(etapa: HabilidadeEtapa): number[] {
  return ETAPAS.find((e) => e.value === etapa)?.anos ?? [];
}

export function rotuloAno(etapa: HabilidadeEtapa, ano: number): string {
  if (etapa === "medio") return `${ano}ª série`;
  return `${ano}º ano`;
}

/** Normaliza o código digitado (maiúsculas, sem espaços). */
export function normalizarCodigo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toUpperCase().replace(/\s+/g, "") : "";
}

/** Extrai etapa e ano/série a partir do código BNCC (ou null se inválido). */
export function analisarCodigo(
  codigo: string
): { etapa: HabilidadeEtapa | null; ano: number | null; componente: HabilidadeComponente | null } | null {
  const m = HABILIDADE_CODIGO_REGEX.exec(codigo);
  if (!m) return null;
  const [, sigla, anoSegmento, letras] = m;
  const ano = Number(anoSegmento[1]);
  let etapa: HabilidadeEtapa | null = null;
  if (sigla === "EF") etapa = ano <= 5 ? "fundamental_i" : "fundamental_ii";
  else if (sigla === "EM") etapa = "medio";
  const componente: HabilidadeComponente | null =
    letras === "MA" ? "matematica" : letras === "LP" ? "lingua_portuguesa" : null;
  return { etapa, ano, componente };
}

/* ============================================================
 * Validação do payload (criar/editar habilidade)
 * ============================================================ */

export type HabilidadeInput = {
  codigo: string;
  descricao: string;
  etapa: HabilidadeEtapa;
  ano: number;
  componente: HabilidadeComponente;
  categoria: HabilidadeCategoria | null;
};

export const DESCRICAO_MIN = 5;
export const DESCRICAO_MAX = 500;

/** Normaliza texto para comparação de duplicidade (sem acento e caixa). */
export function chaveComparacao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valida o corpo da requisição de cadastro/edição.
 * `parcial` = true (PATCH): só valida os campos enviados.
 */
export function parseHabilidadePayload(
  body: unknown,
  opts: { parcial?: boolean } = {}
): { ok: true; value: Partial<HabilidadeInput> } | { ok: false; errors: string[] } {
  const parcial = opts.parcial === true;
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;
  const value: Partial<HabilidadeInput> = {};

  if (!parcial || b.codigo !== undefined) {
    const codigo = normalizarCodigo(b.codigo);
    if (!codigo) {
      errors.push("Informe o código da habilidade.");
    } else if (!HABILIDADE_CODIGO_REGEX.test(codigo)) {
      errors.push("Código inválido. Use o formato BNCC AAAAANNDD (ex.: EF05MA01).");
    } else {
      value.codigo = codigo;
    }
  }

  if (!parcial || b.descricao !== undefined) {
    const descricao = typeof b.descricao === "string" ? b.descricao.trim() : "";
    if (descricao.length < DESCRICAO_MIN) {
      errors.push(`Informe a descrição da habilidade (mínimo ${DESCRICAO_MIN} caracteres).`);
    } else if (descricao.length > DESCRICAO_MAX) {
      errors.push(`A descrição deve ter no máximo ${DESCRICAO_MAX} caracteres.`);
    } else {
      value.descricao = descricao;
    }
  }

  const etapaBruta = typeof b.etapa === "string" ? b.etapa : "";
  if (!parcial || etapaBruta !== "") {
    if (!ETAPAS.some((e) => e.value === etapaBruta)) {
      errors.push("Selecione a etapa de ensino.");
    } else {
      value.etapa = etapaBruta as HabilidadeEtapa;
    }
  }

  if (!parcial || b.ano !== undefined) {
    const ano = Number(b.ano);
    if (!Number.isInteger(ano) || ano <= 0) {
      errors.push("Selecione o ano/série.");
    } else {
      value.ano = ano;
    }
  }

  const componenteBruto = typeof b.componente === "string" ? b.componente : "";
  if (!parcial || componenteBruto !== "") {
    if (!COMPONENTES.some((c) => c.value === componenteBruto)) {
      errors.push("Selecione o componente curricular.");
    } else {
      value.componente = componenteBruto as HabilidadeComponente;
    }
  }

  if (b.categoria !== undefined && b.categoria !== null && b.categoria !== "") {
    if (!CATEGORIAS.some((c) => c.value === b.categoria)) {
      errors.push("Categoria inválida.");
    } else {
      value.categoria = b.categoria as HabilidadeCategoria;
    }
  } else if (!parcial) {
    value.categoria = null;
  }

  // Coerência entre o código e os campos informados
  if (value.codigo) {
    const info = analisarCodigo(value.codigo);
    if (info) {
      if (value.etapa && info.etapa && value.etapa !== info.etapa) {
        errors.push(
          `O código ${value.codigo} pertence a ${ETAPA_LABEL[info.etapa]}, mas a etapa selecionada é ${ETAPA_LABEL[value.etapa]}.`
        );
      }
      if (value.ano !== undefined && info.ano !== null && value.ano !== info.ano) {
        errors.push(
          `O código ${value.codigo} é do ${rotuloAno(info.etapa ?? "fundamental_i", info.ano)}, mas o ano selecionado é ${value.ano}.`
        );
      }
    }
  }
  if (value.etapa && value.ano !== undefined) {
    const anos = anosDaEtapa(value.etapa);
    if (anos.length > 0 && !anos.includes(value.ano)) {
      errors.push(
        `O ano ${value.ano} não pertence a ${ETAPA_LABEL[value.etapa]}. Anos válidos: ${anos.join(", ")}.`
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}
