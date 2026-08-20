-- Login do aluno: usuário = nome completo, senha padrão compartilhada.
-- A senha é armazenada como hash (bcrypt) por aluno, permitindo troca individual futura.
alter table public.alunos add column if not exists senha_hash text;
create index if not exists alunos_nome_idx on public.alunos(lower(nome));