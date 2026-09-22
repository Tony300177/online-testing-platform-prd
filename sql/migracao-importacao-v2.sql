-- ============================================================
-- MIGRAÇÃO: importação completa escolas/turmas/professores
-- 1) Colunas novas: escolas.tipo/ativo, turmas.ativo, professores.cpf/matricula/email/telefone/ativo
-- 2) Corrige a escola "CEM - VASCO PAPA" (cód. 1) para a nº 11 oficial
-- 3) Semeia as 19 escolas municipais (códigos 01-19)
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ---- 1. COLUNAS NOVAS ----
ALTER TABLE escolas ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE escolas ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE turmas ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE professores ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS matricula TEXT;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

-- ---- 2. CORRIGE A VASCO PAPA PARA O CÓDIGO OFICIAL 11 ----
UPDATE escolas
SET codigo = 11, nome = 'CENTRO DE EDUCAÇÃO MUNICIPAL VASCO PAPA', tipo = 'CEM', ativo = TRUE
WHERE codigo = 1 AND nome ILIKE '%VASCO PAPA%';

-- ---- 3. SEED DAS 19 ESCOLAS MUNICIPAIS ----
-- Garante unicidade em codigo para o ON CONFLICT abaixo (NULLs continuam permitidos).
CREATE UNIQUE INDEX IF NOT EXISTS escolas_codigo_uniq ON escolas (codigo);

INSERT INTO escolas (codigo, nome, tipo, ativo) VALUES
  (1,  'CENTRO DE EDUCAÇÃO INFANTIL ARCO IRIS',                            'CEI', TRUE),
  (2,  'CENTRO DE EDUCAÇÃO INFANTIL BRUNO LEONARDO DA COSTA CAMPOS',       'CEI', TRUE),
  (3,  'CENTRO DE EDUCAÇÃO INFANTIL CRIANÇA FELIZ',                        'CEI', TRUE),
  (4,  'CENTRO DE EDUCAÇÃO INFANTIL DOM FRANCO DALLA VALLE',               'CEI', TRUE),
  (5,  'CENTRO DE EDUCAÇÃO INFANTIL LUIZ FELIPE MARTINS MARQUES LUIZ',     'CEI', TRUE),
  (6,  'CENTRO DE EDUCAÇÃO INFANTIL MENINO JESUS',                         'CEI', TRUE),
  (7,  'CENTRO DE EDUCAÇÃO INFANTIL NOSSO LAR',                            'CEI', TRUE),
  (8,  'CENTRO DE EDUCAÇÃO MUNICIPAL DR. GUILHERME FREITAS DE ABREU LIMA', 'CEM', TRUE),
  (9,  'CENTRO DE EDUCAÇÃO MUNICIPAL PROFESSOR ORLANDO PEREIRA',           'CEM', TRUE),
  (10, 'CENTRO DE EDUCAÇÃO MUNICIPAL SÃO CRISTÓVÃO',                       'CEM', TRUE),
  (11, 'CENTRO DE EDUCAÇÃO MUNICIPAL VASCO PAPA',                          'CEM', TRUE),
  (12, 'ESCOLA MUNICIPAL PADRE JOSÉ DE ANCHIETA',                          'EM',  TRUE),
  (13, 'ESCOLA MUNICIPAL PAULO FREIRE',                                    'EM',  TRUE),
  (14, 'ESCOLA MUNICIPAL PROFESSORA MARIA HILDA PANAS',                    'EM',  TRUE),
  (15, 'ESCOLA MUNICIPAL RURAL EUCLIDES DA CUNHA',                         'EM',  TRUE),
  (16, 'ESCOLA MUNICIPAL VINICIUS DE MORAES',                              'EM',  TRUE),
  (17, 'ESCOLA RURAL MUNICIPAL ALVARES DE AZEVEDO',                        'ERM', TRUE),
  (18, 'ESCOLA RURAL MUNICIPAL CORA CORALINA',                             'ERM', TRUE),
  (19, 'ESCOLA RURAL MUNICIPAL OSVALDO CRUZ',                              'ERM', TRUE)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, tipo = EXCLUDED.tipo, ativo = EXCLUDED.ativo;