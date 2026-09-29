-- ============================================================
-- USUARIOS INTERNOS (professores e administradores)
--
-- Por que este arquivo existe: `estrutura-provas.sql` cria
-- `provas.professor_id references public.users(id)`, e varios
-- handlers referenciam a mesma tabela. Sem ela aqui, a segunda
-- migration da ordem aborta num banco vazio.
--
-- `users` NAO vem do Supabase Auth. E uma tabela comum da
-- aplicacao: guarda `password_hash` (bcrypt) e o papel, e o
-- login le dela diretamente. O README dizia o contrario e por
-- isso o DDL nunca foi escrito -- nenhuma migration dependia
-- dele num banco que ja estava pronto.
--
-- Espelha src/db/schema.ts. O Aluno nao tem cadastro aqui:
-- o acesso do aluno usa sessao propria (ver src/lib/auth.ts).
-- Seguro re-executar.
-- ============================================================

create table if not exists public.users (
    id serial primary key,
    name text not null,
    email text not null unique,
    password_hash text not null,
    role text not null default 'teacher',
    school text,
    created_at timestamptz not null default now()
);

-- O login administrativo busca por e-mail a cada tentativa, entao o
-- indice unico acima ja cobre. Este e so para listagem por papel.
create index if not exists users_role_idx on public.users(role);

-- Aluno/prova sao gravados pela acao do usuario interno; o padrao do
-- projeto (banco-escolar) habilita RLS e so libera leitura para
-- `authenticated`, com o app entrando como superuser (que ignora RLS).
alter table public.users enable row level security;

drop policy if exists "usuarios autenticados podem visualizar usuarios"
    on public.users;

create policy "usuarios autenticados podem visualizar usuarios"
    on public.users for select to authenticated using (true);
