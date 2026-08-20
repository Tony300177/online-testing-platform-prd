-- ============================================================
-- ESTRUTURA DE PROVAS — ONLINE TESTING PLATFORM
-- Tabelas: provas, questoes, alternativas, respostas_alunos, resultados
-- Inclui migração dos dados do modelo antigo (exams/questions/submissions/answers).
-- Seguro re-executar (IF NOT EXISTS) — a migração só roda se as tabelas novas estiverem vazias.
-- ============================================================

begin;

-- ============================================================
-- 1) TABELAS
-- ============================================================

create table if not exists public.provas (
    id serial primary key,
    titulo text not null,
    disciplina text not null default '',
    turma text not null default '',
    turma_id uuid references public.turmas(id) on delete set null,
    escola_id uuid references public.escolas(id) on delete set null,
    arquivo_nome text,
    arquivo_base64 text,
    arquivo_tamanho integer,
    arquivo_url text,
    instrucoes text not null default '',
    data_inicio timestamptz,
    data_fim timestamptz,
    tempo_minutos integer,
    status text not null default 'draft',
    codigo text unique,
    professor_id integer references public.users(id),
    created_at timestamptz not null default now()
);

create index if not exists provas_status_idx on public.provas(status);
create index if not exists provas_escola_idx on public.provas(escola_id);

create table if not exists public.questoes (
    id serial primary key,
    prova_id integer not null references public.provas(id) on delete cascade,
    numero integer not null default 0,
    pergunta text not null,
    tipo text not null default 'multiple',
    valor numeric(5,2) not null default 1,
    ordem integer not null default 0
);

create index if not exists questoes_prova_idx on public.questoes(prova_id);

create table if not exists public.alternativas (
    id serial primary key,
    questao_id integer not null references public.questoes(id) on delete cascade,
    letra text not null,
    texto text not null,
    correta boolean not null default false
);

create index if not exists alternativas_questao_idx on public.alternativas(questao_id);

create table if not exists public.respostas_alunos (
    id serial primary key,
    prova_id integer not null references public.provas(id) on delete cascade,
    aluno_id uuid references public.alunos(id) on delete set null,
    turma_id uuid references public.turmas(id) on delete set null,
    aluno_nome text not null,
    aluno_turma text not null,
    escola_nome text not null,
    questao_id integer not null references public.questoes(id) on delete cascade,
    alternativa_id integer references public.alternativas(id) on delete set null,
    resultado_id integer,
    texto_resposta text,
    correta boolean,
    respondida_em timestamptz not null default now()
);

create index if not exists respostas_alunos_prova_idx on public.respostas_alunos(prova_id);
create index if not exists respostas_alunos_aluno_idx on public.respostas_alunos(aluno_id);
create index if not exists respostas_alunos_questao_idx on public.respostas_alunos(questao_id);
create index if not exists respostas_alunos_resultado_idx on public.respostas_alunos(resultado_id);

create table if not exists public.resultados (
    id serial primary key,
    prova_id integer not null references public.provas(id) on delete cascade,
    aluno_id uuid references public.alunos(id) on delete set null,
    aluno_nome text not null,
    aluno_turma text not null,
    escola_nome text not null,
    acertos integer not null default 0,
    erros integer not null default 0,
    nota numeric(6,2) not null default 0,
    percentual numeric(5,2) not null default 0,
    criado_em timestamptz not null default now()
);

create index if not exists resultados_prova_idx on public.resultados(prova_id);
create index if not exists resultados_aluno_idx on public.resultados(aluno_id);

-- ============================================================
-- 2) RLS (consistente com as tabelas do banco escolar)
-- ============================================================

alter table public.provas enable row level security;
alter table public.questoes enable row level security;
alter table public.alternativas enable row level security;
alter table public.respostas_alunos enable row level security;
alter table public.resultados enable row level security;

drop policy if exists "usuarios autenticados podem visualizar provas" on public.provas;
drop policy if exists "usuarios autenticados podem visualizar questoes" on public.questoes;
drop policy if exists "usuarios autenticados podem visualizar alternativas" on public.alternativas;
drop policy if exists "usuarios autenticados podem visualizar respostas_alunos" on public.respostas_alunos;
drop policy if exists "usuarios autenticados podem visualizar resultados" on public.resultados;

create policy "usuarios autenticados podem visualizar provas"
on public.provas for select to authenticated using (true);
create policy "usuarios autenticados podem visualizar questoes"
on public.questoes for select to authenticated using (true);
create policy "usuarios autenticados podem visualizar alternativas"
on public.alternativas for select to authenticated using (true);
create policy "usuarios autenticados podem visualizar respostas_alunos"
on public.respostas_alunos for select to authenticated using (true);
create policy "usuarios autenticados podem visualizar resultados"
on public.resultados for select to authenticated using (true);

-- ============================================================
-- 3) MIGRAÇÃO DOS DADOS DO MODELO ANTIGO (somente se as tabelas novas estiverem vazias)
-- ============================================================

do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'exams')
       and not exists (select 1 from public.provas) then

        -- exams -> provas (preserva ids)
        insert into public.provas (id, titulo, disciplina, turma, escola_id, arquivo_nome, arquivo_base64,
                                   arquivo_tamanho, arquivo_url, instrucoes, data_inicio, data_fim,
                                   status, codigo, professor_id, created_at)
        select e.id, e.title, '', e.target_classes, null, e.pdf_name, e.pdf_data, e.pdf_size,
               null, e.description, null, e.deadline, e.status, e.slug, e.teacher_id, e.created_at
        from public.exams e;

        -- questions -> questoes (preserva ids)
        insert into public.questoes (id, prova_id, numero, pergunta, tipo, valor, ordem)
        select q.id, q.exam_id, q."order" + 1, q.prompt, q.type, 1, q."order"
        from public.questions q;

        -- options (jsonb) + correct_index -> alternativas
        insert into public.alternativas (questao_id, letra, texto, correta)
        select q.id, chr((64 + o.ordinal)::integer), o.valor, (o.ordinal - 1) = q.correct_index
        from public.questions q
        cross join lateral jsonb_array_elements_text(q.options) with ordinality as o(valor, ordinal);

        -- submissions + answers -> respostas_alunos
        insert into public.respostas_alunos (prova_id, aluno_id, turma_id, aluno_nome, aluno_turma,
                                             escola_nome, questao_id, alternativa_id, texto_resposta,
                                             correta, respondida_em)
        select s.exam_id, s.aluno_id, s.turma_id, s.student_name, s.student_class, s.school,
               a.question_id,
               (select alt.id from public.alternativas alt
                 where alt.questao_id = a.question_id
                   and a.selected_index is not null
                   and alt.letra = chr(64 + a.selected_index + 1)
                 limit 1),
               a.essay_text, a.is_correct, s.submitted_at
        from public.answers a
        join public.submissions s on s.id = a.submission_id;

        -- submissions -> resultados (resumo por aluno)
        insert into public.resultados (prova_id, aluno_id, aluno_nome, aluno_turma, escola_nome,
                                       acertos, erros, nota, percentual, criado_em)
        select s.exam_id, s.aluno_id, s.student_name, s.student_class, s.school,
               s.correct_count, greatest(s.total_multiple - s.correct_count, 0),
               coalesce(s.score, 0),
               case when s.total_multiple > 0
                    then round((s.correct_count::numeric / s.total_multiple) * 100, 2)
                    else 0 end,
               s.submitted_at
        from public.submissions s;

        -- ajusta as sequences (ids foram inseridos manualmente)
        perform setval(pg_get_serial_sequence('public.provas', 'id'), (select coalesce(max(id), 1) from public.provas));
        perform setval(pg_get_serial_sequence('public.questoes', 'id'), (select coalesce(max(id), 1) from public.questoes));
        perform setval(pg_get_serial_sequence('public.alternativas', 'id'), (select coalesce(max(id), 1) from public.alternativas));
        perform setval(pg_get_serial_sequence('public.respostas_alunos', 'id'), (select coalesce(max(id), 1) from public.respostas_alunos));
        perform setval(pg_get_serial_sequence('public.resultados', 'id'), (select coalesce(max(id), 1) from public.resultados));

        -- vincula cada resposta ao resultado correspondente (mesmos snapshots de aluno/prova)
        update public.respostas_alunos ra
        set resultado_id = r.id
        from public.resultados r
        where ra.prova_id = r.prova_id
          and ra.aluno_nome = r.aluno_nome
          and ra.aluno_turma = r.aluno_turma
          and ra.escola_nome = r.escola_nome;

    end if;
end $$;

-- ============================================================
-- 4) VERIFICAÇÃO
-- ============================================================

select 'provas' as tabela, count(*) as total from public.provas
union all select 'questoes', count(*) from public.questoes
union all select 'alternativas', count(*) from public.alternativas
union all select 'respostas_alunos', count(*) from public.respostas_alunos
union all select 'resultados', count(*) from public.resultados;

select p.id, p.codigo, p.status, p.titulo,
       (select count(*) from public.questoes q where q.prova_id = p.id) as questoes,
       (select count(*) from public.resultados r where r.prova_id = p.id) as resultados
from public.provas p
order by p.id;

commit;