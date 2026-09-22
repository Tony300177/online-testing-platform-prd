-- ============================================================
-- MIGRAÇÃO - IMPORTAR ALUNOS POR ESCOLA | 2026
--   • Coluna cpf em alunos (chave de dedupe da importação)
-- Seguro re-executar (ADD COLUMN IF NOT EXISTS).
-- ============================================================

alter table public.alunos
    add column if not exists cpf text;

create index if not exists alunos_cpf_idx on public.alunos (cpf);

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================

select 'alunos com cpf' as item, count(*) as total from public.alunos where cpf is not null;