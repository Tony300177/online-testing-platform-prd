-- ============================================================
-- MIGRAÇÃO: Aplicações (NOVA APLICAÇÃO)
-- 1) Tabela aplicacoes (agendamento de uma prova para várias turmas)
-- 2) Tabela aplicacao_turmas (seleção de turmas)
-- 3) Coluna provas.aplicacao_id (vincula as réplicas por turma)
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS aplicacoes (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  titulo TEXT NOT NULL,
  prova_origem_id INTEGER REFERENCES provas(id) ON DELETE SET NULL,
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'finished'
  criado_por INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aplicacoes_status_idx ON aplicacoes(status);

CREATE TABLE IF NOT EXISTS aplicacao_turmas (
  aplicacao_id INTEGER NOT NULL REFERENCES aplicacoes(id) ON DELETE CASCADE,
  turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  PRIMARY KEY (aplicacao_id, turma_id)
);

CREATE TABLE IF NOT EXISTS aplicacao_escolas (
  aplicacao_id INTEGER NOT NULL REFERENCES aplicacoes(id) ON DELETE CASCADE,
  escola_id UUID NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  PRIMARY KEY (aplicacao_id, escola_id)
);

ALTER TABLE provas ADD COLUMN IF NOT EXISTS aplicacao_id INTEGER REFERENCES aplicacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS provas_aplicacao_idx ON provas(aplicacao_id);