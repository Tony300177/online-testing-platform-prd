-- ============================================================
-- MIGRAÇÃO - PERFIL DEMOGRÁFICO (ADMIN) | 2026
--   • Nova tabela professores
--   • Colunas demográficas em alunos (sexo, etnia, bairro, data_nascimento)
--   • professor_id em turmas (FK -> professores)
--   • Backfill: transforma turmas.professor (texto) em registros de professores
-- Instruções: colar no SQL Editor do Supabase e executar.
-- Seguro re-executar (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- ============================================================
-- 1) TABELA professores
-- ============================================================

create table if not exists public.professores (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    codigo integer,
    created_at timestamptz not null default now()
);

create index if not exists professores_nome_idx on public.professores (nome);

-- ============================================================
-- 2) COLUNAS NOVAS EM alunos
-- ============================================================

alter table public.alunos
    add column if not exists sexo text,
    add column if not exists etnia text,
    add column if not exists bairro text,
    add column if not exists data_nascimento date;

create index if not exists alunos_etnia_idx on public.alunos (etnia);
create index if not exists alunos_bairro_idx on public.alunos (bairro);

-- ============================================================
-- 3) professor_id EM turmas
-- ============================================================

alter table public.turmas
    add column if not exists professor_id uuid references public.professores(id) on delete set null;

create index if not exists turmas_professor_idx on public.turmas (professor_id);

-- ============================================================
-- 4) BACKFILL: professores a partir de turmas.professor
--    (agrupa por nome normalizado; vincula por professor_codigo quando houver)
-- ============================================================

-- 4.1) Insere professores que ainda não existem (por nome normalizado)
insert into public.professores (nome, codigo)
select distinct on (lower(regexp_replace(trim(t.professor), '[^[:alnum:][:space:]]', '', 'g')))
    trim(t.professor) as nome,
    t.professor_codigo as codigo
from public.turmas t
where t.professor is not null and trim(t.professor) <> ''
on conflict (id) do nothing;

-- 4.2) Vínculo com turma: tenta por professor_codigo, senão por nome normalizado
update public.turmas t
set professor_id = p.id
from public.professores p
where t.professor_id is null
  and t.professor is not null and trim(t.professor) <> ''
  and (
      (t.professor_codigo is not null and p.codigo = t.professor_codigo)
      or (
          t.professor_codigo is null
          and lower(regexp_replace(trim(t.professor), '[^[:alnum:][:space:]]', '', 'g'))
              = lower(regexp_replace(trim(p.nome), '[^[:alnum:][:space:]]', '', 'g'))
      )
  );

-- ============================================================
-- 5) RLS
-- ============================================================

alter table public.professores enable row level security;

drop policy if exists "usuarios autenticados podem visualizar professores" on public.professores;

create policy "usuarios autenticados podem visualizar professores"
on public.professores for select to authenticated using (true);

-- ============================================================
-- 6) VERIFICAÇÃO
-- ============================================================

select 'professores' as tabela, count(*) as total from public.professores
union all select 'turmas com professor vinculado', count(*) from public.turmas where professor_id is not null
union all select 'alunos com sexo', count(*) from public.alunos where sexo is not null
union all select 'alunos com etnia', count(*) from public.alunos where etnia is not null
union all select 'alunos com bairro', count(*) from public.alunos where bairro is not null;