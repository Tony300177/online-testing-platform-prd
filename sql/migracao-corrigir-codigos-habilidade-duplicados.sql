-- ============================================================
-- MIGRAÇÃO: Canonicaliza códigos BNCC com dígito de dezenas divergente
--
-- Problema: o código BNCC carrega o ano no ÚLTIMO dígito do segmento
-- (ex.: EF05LP03 = ano 5, Língua Portuguesa, 3ª competência). Códigos como
-- EF15LP03 e EF35LP03 são a MESMA competência com ruído de digitação nas
-- dezenas. Como o catálogo aceitou as duas grafias:
--   1) a mesma competência passou a ter 2-3 entradas, fragmentando as
--      estatísticas por habilidade (o dashboard mostra a mesma competência
--      em linhas separadas, cada uma com parte dos acertos);
--   2) o seletor de habilidades passou a oferecer as grafias erradas.
--
-- Esta migration:
--   1) reescreve, em questoes.habilidade, os códigos divergentes JÁ
--      vinculados, apontando para a grafia canônica que já existe no catálogo;
--   2) inativa as entradas duplicadas do catálogo (reversível: basta reativar);
--   3) falha se sobrar qualquer inconsistência.
--
-- NÃO exclui nada: histórico de desempenho precisa continuar legível, e as
-- descrições dessas habilidades ainda serão preenchidas pela coordenação.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Reescreve as competências vinculadas para a grafia canônica
--
-- A lista é explícita de propósito: é o retrato verificado do banco, não uma
-- heurística. Os alvos já existem no catálogo (checado no passo 3).
-- ----------------------------------------------------------------
WITH mapa(codigo_de, codigo_para) AS (
  VALUES
    ('EF35LP03', 'EF05LP03'),
    ('EF35LP04', 'EF05LP04'),
    ('EF35LP05', 'EF05LP05'),
    ('EF35LP06', 'EF05LP06'),
    ('EF35LP15', 'EF05LP15'),
    ('EF35LP26', 'EF05LP26')
),
alvo AS (
  SELECT
    q.id,
    -- DISTINCT porque a questão pode já ter a grafia canônica: nesse caso a
    -- competência entra uma vez só. ORDER BY mantém o array determinístico.
    (
      SELECT COALESCE(
        array_agg(
          DISTINCT COALESCE(m.codigo_para, u.codigo)
          ORDER BY COALESCE(m.codigo_para, u.codigo)
        ) FILTER (WHERE u.codigo IS NOT NULL),
        ARRAY[]::text[]
      )
      FROM unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
      LEFT JOIN mapa m ON m.codigo_de = u.codigo
    ) AS novo_array
  FROM questoes q
  WHERE EXISTS (
    SELECT 1 FROM unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
    JOIN mapa m ON m.codigo_de = u.codigo
  )
)
UPDATE questoes q
SET habilidade = alvo.novo_array
FROM alvo
WHERE q.id = alvo.id;

-- ----------------------------------------------------------------
-- 2) Inativa as entradas duplicadas do catálogo
--
-- Só entram as divergentes do Fundamental I (1º-5º ano) que têm uma grafia
-- canônica correspondente já cadastrada. Fundamental II e Médio ficam de fora:
-- a convenção do dígito de dezenas para essas etapas não está documentada, e
-- adivinhar poderia inativar competências corretas.
--
-- Só inativa quem não está vinculado a nenhuma questão (o passo 1 já removeu
-- esses vínculos). Sem uso, é reversível: ativo = true no console.
-- ----------------------------------------------------------------
UPDATE habilidades h
SET ativo = false,
    atualizado_em = now()
WHERE h.etapa = 'fundamental_i'
  AND h.ano BETWEEN 1 AND 5
  AND substring(h.codigo FROM 3 FOR 1) <> '0'
  AND EXISTS (
    SELECT 1 FROM habilidades c
    WHERE c.codigo = 'EF0' || substring(h.codigo FROM 4 FOR 5)
      AND c.id <> h.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM questoes q WHERE h.codigo = ANY(COALESCE(q.habilidade, ARRAY[]::text[]))
  );

-- ----------------------------------------------------------------
-- 3) Confere o resultado
--
-- Qualquer divergência aborta a migration inteira (o runner roda cada arquivo
-- em uma transação), em vez de deixar o catálogo pela metade.
-- ----------------------------------------------------------------
DO $$
DECLARE
  questoes_com_duplicado integer;
  identidades_ativas_duplicadas integer;
  alvos_ausentes integer;
BEGIN
  -- 3a) Nenhuma questão pode ficar apontando para uma grafia divergente
  SELECT count(*) INTO questoes_com_duplicado
  FROM questoes q
  WHERE EXISTS (
    SELECT 1
    FROM unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
    JOIN habilidades h ON h.codigo = u.codigo
    WHERE h.etapa = 'fundamental_i'
      AND h.ano BETWEEN 1 AND 5
      AND substring(h.codigo FROM 3 FOR 1) <> '0'
  );
  IF questoes_com_duplicado > 0 THEN
    RAISE EXCEPTION
      'Ainda há % questão(ões) vinculada(s) a código BNCC divergente.', questoes_com_duplicado;
  END IF;

  -- 3b) Nenhuma competência pode ter duas grafias ativas ao mesmo tempo
  SELECT count(*) INTO identidades_ativas_duplicadas
  FROM (
    SELECT 1
    FROM habilidades
    WHERE ativo
    GROUP BY
      left(codigo, 2)
      || substring(codigo FROM 4 FOR 1)
      || substring(codigo FROM 5 FOR 2)
      || substring(codigo FROM 7 FOR 2)
    HAVING count(*) > 1
  ) duplicadas;
  IF identidades_ativas_duplicadas > 0 THEN
    RAISE EXCEPTION
      'Ainda há % competência(s) com mais de um código ativo.', identidades_ativas_duplicadas;
  END IF;

  -- 3c) A grafia canônica precisa existir para todo código reescrito
  SELECT count(*) INTO alvos_ausentes
  FROM (VALUES ('EF05LP03'), ('EF05LP04'), ('EF05LP05'), ('EF05LP06'), ('EF05LP15'), ('EF05LP26')) AS alvo(codigo)
  WHERE NOT EXISTS (SELECT 1 FROM habilidades h WHERE h.codigo = alvo.codigo);
  IF alvos_ausentes > 0 THEN
    RAISE EXCEPTION
      'A grafia canônica de % competência(s) não está no catálogo.', alvos_ausentes;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4) Relatório (para conferência manual)
-- ----------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE ativo) AS habilidades_ativas,
  count(*) FILTER (WHERE NOT ativo) AS habilidades_inativas
FROM habilidades;

-- Nota: EF35LP29, EF35LP30 e EF35LP31 seguem ATIVAS de propósito - não existe
-- grafia canônica (EF05LP29/30/31) no catálogo, então não há duplicata
-- comprovada. São 3 competências sem uso; se a coordenação quiser, basta
-- cadastrar as canônicas e inativar estas pelo console.
