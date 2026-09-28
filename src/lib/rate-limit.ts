/**
 * Rate limit em memória, por processo.
 *
 * Limitação real em produção exigiria um store compartilhado (Upstash, Postgres,
 * ...): no Vercel cada instância tem seu próprio Map, então o limite efetivo é
 * `limite x número de instâncias`. Ainda assim derruba o abuso trivial e o
 * oráculo de senha, que é o alvo aqui. Trocar `checar` por Redis/DB quando
 * houver orçamento para isso.
 */

type Entrada = { contagem: number; expiraEm: number };

const JANELA_MS = 60_000;
const MAX_ENTRADAS = 10_000;

const buckets = new Map<string, Entrada>();

function purgar(now: number): void {
  if (buckets.size < MAX_ENTRADAS) return;
  for (const [chave, entrada] of buckets) {
    if (entrada.expiraEm <= now) buckets.delete(chave);
  }
}

export type Limite = {
  ok: boolean;
  restantes: number;
  retryEmSegundos: number;
};

/**
 * Conta uma tentativa para `chave` e diz se ainda passa. A contagem é incrementada
 * mesmo quando a resposta é de bloqueio, senão um atacante que insistisse poderia
 * ficar só algumas requisições por janela e ainda assim testar senhas sem parar.
 */
export function checarLimite(chave: string, limite: number, janelaMs = JANELA_MS): Limite {
  const now = Date.now();
  purgar(now);

  const atual = buckets.get(chave);
  if (!atual || atual.expiraEm <= now) {
    buckets.set(chave, { contagem: 1, expiraEm: now + janelaMs });
    return { ok: true, restantes: limite - 1, retryEmSegundos: 0 };
  }

  atual.contagem += 1;
  const restantes = Math.max(0, limite - atual.contagem);
  return {
    ok: atual.contagem <= limite,
    restantes,
    retryEmSegundos: Math.max(1, Math.ceil((atual.expiraEm - now) / 1000)),
  };
}

/**
 * Chave por IP.
 *
 * `x-forwarded-for` chega com o que o cliente mandou antes do IP real, então a
 * última posição é a confiável; `x-vercel-forwarded-for` e `x-real-ip` são
 * preenchidos pela plataforma. Sem nenhum deles o fallback agrupa todos os
 * clientes atrás de um bucket só — o que falha para o lado restritivo, de propósito.
 */
export function chavePorIp(req: Request, prefixo: string): string {
  const xff = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    (xff && xff.length > 0 ? xff[xff.length - 1] : "") ||
    "desconhecido";
  return `${prefixo}:${ip}`;
}
