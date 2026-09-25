-- ============================================================
-- MIGRAÇÃO: Catálogo de habilidades (BNCC) — CADASTRO DE HABILIDADES
--
-- 0) Restaura questoes.habilidade para text[] (OBRIGATÓRIO, rodar primeiro)
-- 1) Tabela habilidades (catálogo oficial: etapa, ano/série, componente, código, descrição)
-- 2) Seed do catálogo atual (antes fixo em src/lib/habilidades.ts)
-- 3) Backfill: códigos já usados em questoes.habilidade que não estão no catálogo
-- 4) Normalização de questoes.habilidade (upper/trim, sem duplicar)
-- 5) CHECK de formato BNCC em questoes.habilidade (NOT VALID: seguro p/ dados legados)
--
-- Idempotente: pode rodar mais de uma vez.
-- Rodar ANTES de publicar o código que usa a tabela "habilidades".
-- ============================================================

-- ----------------------------------------------------------------
-- 0) Garante que a coluna existe
--
-- Em produção ela já existe (como TEXT, ver passo 0b) e este comando é no-op.
-- Em um banco novo criado por estrutura-provas.sql ela não existe, e os passos
-- 3-5 referenciam questoes.habilidade — sem esta linha a migration aborta.
-- ----------------------------------------------------------------
ALTER TABLE questoes ADD COLUMN IF NOT EXISTS habilidade TEXT;

-- ----------------------------------------------------------------
-- 0b) Tipo da coluna
--
-- No banco em produção a coluna questoes.habilidade está como TEXT
-- guardando o literal do array (ex.: {"EF05MA07","EF04MA03"}), enquanto
-- src/db/schema.ts a declara como text[] e todo o analytics usa
-- unnest() / cardinality() / = ANY(). Com a coluna em TEXT essas queries
-- quebram ("function cardinality(text) does not exist") e a gravação
-- pelo app cria um terceiro formato.
-- Esta etapa converte de volta para text[] preservando os valores.
-- É idempotente: só executa se a coluna ainda não for array.
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'questoes'
      AND column_name = 'habilidade'
      AND data_type <> 'ARRAY'
  ) THEN
    RAISE NOTICE 'Convertendo questoes.habilidade de TEXT para TEXT[]';
    ALTER TABLE questoes
      ALTER COLUMN habilidade TYPE text[]
      USING CASE
        WHEN habilidade IS NULL OR btrim(habilidade) = '' THEN NULL
        WHEN btrim(habilidade) LIKE '{%' THEN btrim(habilidade)::text[]
        ELSE ARRAY[btrim(habilidade)]
      END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS habilidades (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,                    -- EF05MA01 (AAAAANNDD)
  descricao TEXT NOT NULL DEFAULT '',            -- texto da habilidade (preenchido pela coordenação)
  etapa TEXT NOT NULL,                            -- 'fundamental_i' | 'fundamental_ii' | 'medio'
  ano INTEGER NOT NULL,                           -- 1..5 | 6..9 | 1..3 (série)
  componente TEXT NOT NULL,                       -- 'matematica' | 'lingua_portuguesa' | ...
  categoria TEXT,                                 -- 'vigente' | 'sensivel' | 'preditora' (opcional)
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por INTEGER REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT habilidades_codigo_formato_check CHECK (codigo ~ '^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{2}$'),
  CONSTRAINT habilidades_ano_check CHECK (
    (etapa = 'fundamental_i'  AND ano BETWEEN 1 AND 5) OR
    (etapa = 'fundamental_ii' AND ano BETWEEN 6 AND 9) OR
    (etapa = 'medio'          AND ano BETWEEN 1 AND 3)
  )
);

CREATE INDEX IF NOT EXISTS habilidades_filtros_idx ON habilidades(etapa, ano, componente);
CREATE INDEX IF NOT EXISTS habilidades_ativo_idx ON habilidades(ativo);

-- ----------------------------------------------------------------
-- 2) Seed: catálogo usado antes da migração
--    (etapa/ano/componente derivados do próprio código BNCC)
--    A descrição fica vazia: preencher em "Habilidades > Cadastrar/Editar".
-- ----------------------------------------------------------------
INSERT INTO habilidades (codigo, etapa, ano, componente, categoria)
VALUES
    ('EF03LP01', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP02', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP03', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP04', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP05', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP06', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP07', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP08', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP09', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP10', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP11', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP12', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP13', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP14', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP15', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP16', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP17', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP18', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP19', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP20', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP21', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP22', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP23', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP24', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP25', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP26', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03LP27', 'fundamental_i', 3, 'lingua_portuguesa', 'preditora'),
    ('EF03MA01', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA02', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA03', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA04', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA05', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA06', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA07', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA08', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA09', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA10', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA11', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA12', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA13', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA14', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA15', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA16', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA17', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA18', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA19', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA20', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA21', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA22', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA23', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA24', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA25', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA26', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA27', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF03MA28', 'fundamental_i', 3, 'matematica', 'preditora'),
    ('EF04LP01', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP02', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP03', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP04', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP05', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP06', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP07', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP08', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP09', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP10', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP11', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP12', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP13', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP14', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP15', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP16', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP17', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP18', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP19', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP20', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP21', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP22', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP23', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP24', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP25', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04LP26', 'fundamental_i', 4, 'lingua_portuguesa', 'sensivel'),
    ('EF04MA01', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA02', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA03', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA04', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA05', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA06', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA07', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA08', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA09', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA10', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA11', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA12', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA13', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA14', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA15', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA16', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA17', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA18', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA19', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA20', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA21', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA22', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA23', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA24', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA25', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA26', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA27', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF04MA28', 'fundamental_i', 4, 'matematica', 'sensivel'),
    ('EF05LP01', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP02', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP03', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP04', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP05', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP06', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP07', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP08', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP09', 'fundamental_i', 5, 'lingua_portuguesa', 'sensivel'),
    ('EF05LP10', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP11', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP12', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP13', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP14', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP15', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP16', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP17', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP18', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP19', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP20', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP21', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP22', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP23', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP24', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP25', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP26', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP27', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05LP28', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF05MA01', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA02', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA03', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA04', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA05', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA06', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA07', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA08', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA09', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA10', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA11', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA12', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA13', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA14', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA15', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA16', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA17', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA18', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA19', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA20', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA21', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA22', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA23', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA24', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF05MA25', 'fundamental_i', 5, 'matematica', 'vigente'),
    ('EF15LP01', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP02', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP03', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP04', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP05', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP06', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP07', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP08', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP09', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP10', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP11', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP12', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP13', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP14', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP15', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP16', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP17', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP18', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF15LP19', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP01', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP02', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP03', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP04', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP05', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP06', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP07', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP08', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP09', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP10', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP11', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP12', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP13', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP14', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP15', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP16', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP17', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP18', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP19', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP20', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP21', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP22', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP23', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP24', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP25', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP26', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP27', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP28', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP29', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP30', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente'),
    ('EF35LP31', 'fundamental_i', 5, 'lingua_portuguesa', 'vigente')
ON CONFLICT (codigo) DO UPDATE SET
  etapa = EXCLUDED.etapa,
  ano = EXCLUDED.ano,
  componente = EXCLUDED.componente,
  categoria = COALESCE(EXCLUDED.categoria, habilidades.categoria),
  atualizado_em = now();

-- ----------------------------------------------------------------
-- 3) Backfill: códigos já vinculados a questões que não estão no catálogo
--    (mantém as estatísticas históricas sem alteração)
-- ----------------------------------------------------------------
INSERT INTO habilidades (codigo, etapa, ano, componente, descricao)
SELECT DISTINCT
  upper(btrim(u.codigo)),
  CASE
    WHEN u.codigo LIKE 'EM%' THEN 'medio'
    WHEN substring(u.codigo from 4 for 1)::int <= 5 THEN 'fundamental_i'
    ELSE 'fundamental_ii'
  END,
  substring(u.codigo from 4 for 1)::int,
  CASE
    WHEN substring(u.codigo from 5 for 2) = 'LP' THEN 'lingua_portuguesa'
    WHEN substring(u.codigo from 5 for 2) = 'MA' THEN 'matematica'
    ELSE 'outros'
  END,
  ''
FROM questoes q
CROSS JOIN LATERAL unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
WHERE u.codigo ~ '^[A-Za-z]{2}[0-9]{2}[A-Za-z]{2}[0-9]{2}$'
  AND (
    (u.codigo LIKE 'EM%' AND substring(u.codigo from 4 for 1)::int BETWEEN 1 AND 3)
    OR (u.codigo NOT LIKE 'EM%' AND substring(u.codigo from 4 for 1)::int BETWEEN 1 AND 9)
  )
  AND NOT EXISTS (SELECT 1 FROM habilidades h WHERE h.codigo = upper(btrim(u.codigo)))
ON CONFLICT (codigo) DO NOTHING;

-- ----------------------------------------------------------------
-- 4) Normalização: maiúsculas, sem espaços e sem duplicatas
--    Duplicata importa: o analytics faz unnest() e contaria a mesma
--    habilidade mais de uma vez, inflando o total de acertos/erros.
-- ----------------------------------------------------------------
UPDATE questoes q
SET habilidade = ARRAY(
  SELECT DISTINCT upper(btrim(u.codigo))
  FROM unnest(q.habilidade) AS u(codigo)
  ORDER BY 1
)
WHERE q.habilidade IS NOT NULL
  AND q.habilidade IS DISTINCT FROM ARRAY(
    SELECT DISTINCT upper(btrim(u.codigo))
    FROM unnest(q.habilidade) AS u(codigo)
    ORDER BY 1
  );

-- ----------------------------------------------------------------
-- 5) CHECK de formato em questoes.habilidade
--    (NOT VALID: vale para novas gravações; dados legados são
--     reportados na verificação abaixo antes do VALIDATE)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION habilidade_codigos_validos(codigos TEXT[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT codigos IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(codigos) AS u(codigo)
        WHERE NOT (codigo ~ '^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{2}$')
      )
$fn$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questoes_habilidade_formato_check'
  ) THEN
    ALTER TABLE questoes
      ADD CONSTRAINT questoes_habilidade_formato_check
      CHECK (habilidade_codigos_validos(habilidade))
      NOT VALID;
  END IF;
END $$;

-- Valida de forma definitiva. Se alguma linha legada estiver fora do formato,
-- o VALIDATE falha e a migration inteira é desfeita (transação) — é o
-- comportamento desejado: melhor não aplicar do que aplicar um CHECK frouxo.
ALTER TABLE questoes VALIDATE CONSTRAINT questoes_habilidade_formato_check;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
SELECT etapa, ano, componente, categoria, count(*) AS habilidades
FROM habilidades
GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

-- Códigos vinculados a questões que NÃO existem no catálogo (deve retornar 0 linhas)
SELECT DISTINCT u.codigo
FROM questoes q
CROSS JOIN LATERAL unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
LEFT JOIN habilidades h ON h.codigo = u.codigo
WHERE h.id IS NULL
ORDER BY 1;

-- Questões com código fora do formato BNCC (deve retornar 0 linhas)
SELECT q.id, q.prova_id, u.codigo
FROM questoes q
CROSS JOIN LATERAL unnest(COALESCE(q.habilidade, ARRAY[]::text[])) AS u(codigo)
WHERE u.codigo !~ '^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{2}$'
ORDER BY q.id;
