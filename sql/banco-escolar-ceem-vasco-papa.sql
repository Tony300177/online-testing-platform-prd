-- ============================================================
-- BANCO ESCOLAR - CEM VASCO PAPA | ANO LETIVO 2026
-- Gerado automaticamente em 2026-08-14
--   109 matrículas | 106 alunos únicos | 3 aluno(s) em 2 turmas
--   Turmas: 5º A (27), 5º B (27), 5º C (32), 5º D (23)
-- Instruções: colar no SQL Editor do Supabase e executar.
-- Seguro re-executar (usando IF NOT EXISTS, NOT EXISTS e ON CONFLICT).
-- ============================================================

-- ============================================================
-- 1) TABELAS
-- ============================================================

create table if not exists public.escolas (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    codigo integer,
    created_at timestamptz not null default now()
);

create table if not exists public.turmas (
    id uuid primary key default gen_random_uuid(),
    escola_id uuid not null references public.escolas(id) on delete cascade,
    codigo integer,
    nome text not null,
    ano text not null,
    turno text not null,
    professor text,
    professor_codigo integer,
    ano_letivo integer not null default 2026,
    created_at timestamptz not null default now()
);

create table if not exists public.alunos (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    matricula text,
    numero_chamada integer,
    created_at timestamptz not null default now()
);

create table if not exists public.matriculas (
    id uuid primary key default gen_random_uuid(),
    aluno_id uuid not null references public.alunos(id) on delete cascade,
    turma_id uuid not null references public.turmas(id) on delete cascade,
    ano_letivo integer not null,
    status text not null default 'ativo',
    created_at timestamptz not null default now(),
    unique (aluno_id, turma_id, ano_letivo)
);

-- ============================================================
-- 2) RLS
-- (o app conecta como usuário postgres/superuser, que ignora RLS;
--  os policies abaixo liberam leitura para usuários autenticados)
-- ============================================================

alter table public.escolas enable row level security;
alter table public.turmas enable row level security;
alter table public.alunos enable row level security;
alter table public.matriculas enable row level security;

drop policy if exists "usuarios autenticados podem visualizar escolas" on public.escolas;
drop policy if exists "usuarios autenticados podem visualizar turmas" on public.turmas;
drop policy if exists "usuarios autenticados podem visualizar alunos" on public.alunos;
drop policy if exists "usuarios autenticados podem visualizar matriculas" on public.matriculas;

create policy "usuarios autenticados podem visualizar escolas"
on public.escolas for select to authenticated using (true);

create policy "usuarios autenticados podem visualizar turmas"
on public.turmas for select to authenticated using (true);

create policy "usuarios autenticados podem visualizar alunos"
on public.alunos for select to authenticated using (true);

create policy "usuarios autenticados podem visualizar matriculas"
on public.matriculas for select to authenticated using (true);

-- ============================================================
-- 3) ESCOLA: CEM - VASCO PAPA
-- ============================================================

insert into public.escolas (codigo, nome)
select 1, 'CEM - VASCO PAPA'
where not exists (select 1 from public.escolas where codigo = 1);

-- ============================================================
-- 4) TURMAS: 5º A, B, C e D
-- ============================================================

insert into public.turmas (escola_id, codigo, nome, ano, turno, professor, professor_codigo, ano_letivo)
select
    e.id,
    dados.codigo,
    dados.nome,
    dados.ano,
    dados.turno,
    dados.professor,
    dados.professor_codigo,
    2026
from public.escolas e
cross join (
    values
        (1, '5º A', '5º Ano', 'Matutino', 'JANETE FRANCISCA DA SILVA', 168),
        (5, '5º B', '5º Ano', 'Vespertino', 'PEDRO TEZOLLIN JUNIOR', 172),
        (4, '5º C', '5º Ano', 'Vespertino', 'LUCINÉIA APARECIDA SANCHE', 88),
        (3, '5º D', '5º Ano', 'Matutino', 'ROSE POSSAMAI FLECK', 282)
) as dados(codigo, nome, ano, turno, professor, professor_codigo)
where e.codigo = 1
  and not exists (
      select 1
      from public.turmas t
      where t.escola_id = e.id
        and t.nome = dados.nome
        and t.ano_letivo = 2026
  );

-- ============================================================
-- 5) ALUNOS (106 únicos; deduplicados por nome)
--    Obs.: aluno em 2 turmas fica 1 registro (número de chamada = 1ª ocorrência)
-- ============================================================

insert into public.alunos (nome, numero_chamada)
select v.nome, v.numero_chamada
from (
    values
        ('YASMIN DAMACENO SANTOS FERREIRA', 1),
        ('HELOISA PEREIRA DA SILVA', 7),
        ('GUILHERME SANTIAGO DE FARIAS LIMA', 9),
        ('GUSTAVO DE OLIVEIRA TEIXEIRA', 11),
        ('EVELYN KAUANI PADILHA LOERCIO', 12),
        ('DAVI LUIZ DE SOUSA PESCADOR', 14),
        ('DEIVID CAUAN MEIRELLES SANTOS', 16),
        ('ISABELLI ALMEIDA TEIXEIRA', 17),
        ('VITOR GABRIEL LIMA DO OURO', 23),
        ('ANTONIO PEDRO ALVES DE ARRUDA', 25),
        ('FLAVIO DA SILVA MATOS', 27),
        ('JENIFFER KAUANE LEAL ALVES', 28),
        ('LAIS RODRIGUES BLOEMER', 29),
        ('RAFAELA VALENTINA SANTOS MAGALHÃES', 30),
        ('ANA LUIZA DE PAULA FERREIRA', 31),
        ('LUIZ EDUARDO DIAS SOZIO', 34),
        ('RICARDO GONÇALVES ANTONIO', 35),
        ('YASMIN BATISTA NUNES', 37),
        ('JOSE FELIPE DA SILVA', 38),
        ('HELOISA RODRIGUES SOARES', 39),
        ('BIANCA ANDREANE VIANA', 40),
        ('MARIA LUIZA DE SOUZA MAIA', 41),
        ('LUCAS GABRIEL ALVES DE OLIVEIRA', 42),
        ('JONATHAS BATISTA ALMEIDA DE JESUS', 43),
        ('JOSIEL SANTOS CINTA LARGA', 44),
        ('IVAN OLIVEIRA ROSA', 45),
        ('JOAO CARLOS MUNIZ NEVES', 46),
        ('MATHEUS EDUARDO GOMES DE SOUZA', 1),
        ('JOSE GABRIEL CELESTINO JOSCA', 5),
        ('VICTOR LUIZ RAMOS NUNES', 6),
        ('ISAAC MENDES DOS REIS', 8),
        ('GUSTTAVO HENRIQUE RODRIGUES DE SOUZA', 11),
        ('ANA BEATRICY DA SILVA BASTOS', 13),
        ('LUDMILA ROZENIO DOS SANTOS', 15),
        ('RAFAELA QUIEL DUDAR', 18),
        ('LUIZ GUSTAVO DOS SANTOS CANGUSSU', 19),
        ('LIVIA SOUZA DONATO', 24),
        ('ELOISA CARIOCA RAMOS', 25),
        ('JOAO LUCAS DE JESUS BATISTA', 26),
        ('GUILHERME HENRIQUE SANTOS MEDEIROS', 27),
        ('KAROLINA EDUARDA FERREIRA DE SA', 28),
        ('EZEQUIEL SOUZA LIMA DA COSTA', 29),
        ('LARISSA KAWANY AMORIM TRAJANO', 30),
        ('KAUA LUCAS MOURA DA COSTA', 31),
        ('JULIA OLIVEIRA DE SOUZA', 32),
        ('ELOYSA MISSIAS LOPES', 33),
        ('MIGUEL ALEJANDRO COSTA RIBAS', 34),
        ('ELOISA FROHLICH DE ALMEIDA', 35),
        ('AMANDA FROHLICH DE ALMEIDA', 36),
        ('PAOLLA FLORES NEVES', 37),
        ('SOFIA DO NASCIMENTO STREGE', 38),
        ('HELOA PADILHA BATISTA', 39),
        ('LEANDRO DE SOUZA KLAUSS', 41),
        ('MATHEUS NATHAN GONÇALVES TABORDA DE MELLO', 1),
        ('LARISSA RAMOS DE SOUZA FONTOURA', 2),
        ('ANA SOPHIA OLIVEIRA DA CRUZ', 3),
        ('CEZAR ARTHUR DOS SANTOS PEREIRA', 4),
        ('HENRY GABRIEL SOUZA DO NASCIMENTO', 5),
        ('SOFIA DE OLIVEIRA KRINDGES', 6),
        ('JULIA DE OLIVEIRA KRINDGES', 7),
        ('THALLES RODRIGO GIRARDI ROSA', 8),
        ('WESLLEY BRUNNO SANTOS DE JESUS DA SILVA', 9),
        ('GEOVANNA BARBOZA DA SILVA', 10),
        ('WALACY CARDOSO DE ARRUDA', 11),
        ('EMANUELLY LIMA DA TRINDADE', 13),
        ('SOPHIA GABRIELLY OLIVEIRA DOS SANTOS', 14),
        ('ENZO GABRIEL BATISTA BARBOSA', 15),
        ('THAYLAN CALIZARIO DA SILVA', 16),
        ('EMILLY GABRIELLY OLIVEIRA DA SILVA', 17),
        ('WALEFFER FAUSTINO DE MELO', 18),
        ('LEONARA SAMYRA DO VALLE SILVA', 19),
        ('HELOISA FERREIRA DA SILVA', 20),
        ('MELISSA MANUELA DUARTE LOPES', 21),
        ('EMANUELLY DE PAULA PARDIM', 23),
        ('BENJAMIM FERNANDES DE ARAUJO', 24),
        ('IRIS FERNANDA NOGUEIRA DE CAMPOS', 25),
        ('MARIA ELLOIZA MATOS FELIZARDO', 26),
        ('LUIZZA SOPHIA GOMES SILVA', 27),
        ('KAUANNY DA SILVA HENRIQUE', 28),
        ('HELOIZA KOELHERT DOS SANTOS', 30),
        ('KAYLA ELOISA PEREIRA TAVARES', 32),
        ('GEOVANA MIKAELA FERREIRA DE OLIVEIRA', 33),
        ('HELENA TIEMANN DOS SANTOS', 34),
        ('LUANA EMANUELI DOS SANTOS SILVA', 35),
        ('RUBIANA DE SOUSA ICKERT', 36),
        ('MARCELO GABRIEL SOUZA DE OLIVEIRA', 1),
        ('ANNY KAROLINY SANTOS SILVA', 2),
        ('DAVI MIGUEL DA SILVA', 4),
        ('EMANUELLY SOUZA QUERINO', 5),
        ('FERNANDO DE OLIVEIRA ANTUNES', 6),
        ('FRANCISCO DE OLIVEIRA ANTUNES', 7),
        ('GUSTAVO DA SILVA MARCELINO', 8),
        ('ISIS PEGORARO SANCHES', 11),
        ('MARIANY SOPHIA JESUS GUERRA', 15),
        ('RAIANE SOFIA MACHADO SCHERER', 16),
        ('TAIANA WEIRICH ROSA', 17),
        ('LUCAS GABRIEL DOS SANTOS MARTINS', 18),
        ('STHEFANY LARISSA UCHOA WAGNER', 19),
        ('JOÃO VICTOR COSTA CAVALHEIRO', 21),
        ('GIULIA RAFAELLY DE ALMEIDA JUSTINO', 22),
        ('JULIA RAPHAELA CESARIA FONSECA', 23),
        ('KAUANY GABRIELLY GOMES MISSIAS', 24),
        ('RAFAELLA DA SILVA SIQUEIRA', 25),
        ('BRUNA GABRIELI DA SILVA FURTADO', 26),
        ('IRACY GABRIELI SILVA FERREIRA', 27),
        ('ISIS ADRIANY REZENDE GWIAZDECKI', 28)
) as v(nome, numero_chamada)
where not exists (select 1 from public.alunos a where a.nome = v.nome);

-- ============================================================
-- 6) MATRÍCULAS (109 matrículas em 2026)
-- ============================================================

insert into public.matriculas (aluno_id, turma_id, ano_letivo)
select a.id, t.id, 2026
from (
    values
        ('5º A', 'YASMIN DAMACENO SANTOS FERREIRA'),
        ('5º A', 'HELOISA PEREIRA DA SILVA'),
        ('5º A', 'GUILHERME SANTIAGO DE FARIAS LIMA'),
        ('5º A', 'GUSTAVO DE OLIVEIRA TEIXEIRA'),
        ('5º A', 'EVELYN KAUANI PADILHA LOERCIO'),
        ('5º A', 'DAVI LUIZ DE SOUSA PESCADOR'),
        ('5º A', 'DEIVID CAUAN MEIRELLES SANTOS'),
        ('5º A', 'ISABELLI ALMEIDA TEIXEIRA'),
        ('5º A', 'VITOR GABRIEL LIMA DO OURO'),
        ('5º A', 'ANTONIO PEDRO ALVES DE ARRUDA'),
        ('5º A', 'FLAVIO DA SILVA MATOS'),
        ('5º A', 'JENIFFER KAUANE LEAL ALVES'),
        ('5º A', 'LAIS RODRIGUES BLOEMER'),
        ('5º A', 'RAFAELA VALENTINA SANTOS MAGALHÃES'),
        ('5º A', 'ANA LUIZA DE PAULA FERREIRA'),
        ('5º A', 'LUIZ EDUARDO DIAS SOZIO'),
        ('5º A', 'RICARDO GONÇALVES ANTONIO'),
        ('5º A', 'YASMIN BATISTA NUNES'),
        ('5º A', 'JOSE FELIPE DA SILVA'),
        ('5º A', 'HELOISA RODRIGUES SOARES'),
        ('5º A', 'BIANCA ANDREANE VIANA'),
        ('5º A', 'MARIA LUIZA DE SOUZA MAIA'),
        ('5º A', 'LUCAS GABRIEL ALVES DE OLIVEIRA'),
        ('5º A', 'JONATHAS BATISTA ALMEIDA DE JESUS'),
        ('5º A', 'JOSIEL SANTOS CINTA LARGA'),
        ('5º A', 'IVAN OLIVEIRA ROSA'),
        ('5º A', 'JOAO CARLOS MUNIZ NEVES'),
        ('5º B', 'MATHEUS EDUARDO GOMES DE SOUZA'),
        ('5º B', 'JOSE GABRIEL CELESTINO JOSCA'),
        ('5º B', 'VICTOR LUIZ RAMOS NUNES'),
        ('5º B', 'ISAAC MENDES DOS REIS'),
        ('5º B', 'GUSTTAVO HENRIQUE RODRIGUES DE SOUZA'),
        ('5º B', 'ANA BEATRICY DA SILVA BASTOS'),
        ('5º B', 'LUDMILA ROZENIO DOS SANTOS'),
        ('5º B', 'RAFAELA QUIEL DUDAR'),
        ('5º B', 'LUIZ GUSTAVO DOS SANTOS CANGUSSU'),
        ('5º B', 'LIVIA SOUZA DONATO'),
        ('5º B', 'ELOISA CARIOCA RAMOS'),
        ('5º B', 'JOAO LUCAS DE JESUS BATISTA'),
        ('5º B', 'GUILHERME HENRIQUE SANTOS MEDEIROS'),
        ('5º B', 'KAROLINA EDUARDA FERREIRA DE SA'),
        ('5º B', 'EZEQUIEL SOUZA LIMA DA COSTA'),
        ('5º B', 'LARISSA KAWANY AMORIM TRAJANO'),
        ('5º B', 'KAUA LUCAS MOURA DA COSTA'),
        ('5º B', 'JULIA OLIVEIRA DE SOUZA'),
        ('5º B', 'ELOYSA MISSIAS LOPES'),
        ('5º B', 'MIGUEL ALEJANDRO COSTA RIBAS'),
        ('5º B', 'ELOISA FROHLICH DE ALMEIDA'),
        ('5º B', 'AMANDA FROHLICH DE ALMEIDA'),
        ('5º B', 'PAOLLA FLORES NEVES'),
        ('5º B', 'SOFIA DO NASCIMENTO STREGE'),
        ('5º B', 'HELOA PADILHA BATISTA'),
        ('5º B', 'ISABELLI ALMEIDA TEIXEIRA'),
        ('5º B', 'LEANDRO DE SOUZA KLAUSS'),
        ('5º C', 'MATHEUS NATHAN GONÇALVES TABORDA DE MELLO'),
        ('5º C', 'LARISSA RAMOS DE SOUZA FONTOURA'),
        ('5º C', 'ANA SOPHIA OLIVEIRA DA CRUZ'),
        ('5º C', 'CEZAR ARTHUR DOS SANTOS PEREIRA'),
        ('5º C', 'HENRY GABRIEL SOUZA DO NASCIMENTO'),
        ('5º C', 'SOFIA DE OLIVEIRA KRINDGES'),
        ('5º C', 'JULIA DE OLIVEIRA KRINDGES'),
        ('5º C', 'THALLES RODRIGO GIRARDI ROSA'),
        ('5º C', 'WESLLEY BRUNNO SANTOS DE JESUS DA SILVA'),
        ('5º C', 'GEOVANNA BARBOZA DA SILVA'),
        ('5º C', 'WALACY CARDOSO DE ARRUDA'),
        ('5º C', 'EMANUELLY LIMA DA TRINDADE'),
        ('5º C', 'SOPHIA GABRIELLY OLIVEIRA DOS SANTOS'),
        ('5º C', 'ENZO GABRIEL BATISTA BARBOSA'),
        ('5º C', 'THAYLAN CALIZARIO DA SILVA'),
        ('5º C', 'EMILLY GABRIELLY OLIVEIRA DA SILVA'),
        ('5º C', 'WALEFFER FAUSTINO DE MELO'),
        ('5º C', 'LEONARA SAMYRA DO VALLE SILVA'),
        ('5º C', 'HELOISA FERREIRA DA SILVA'),
        ('5º C', 'MELISSA MANUELA DUARTE LOPES'),
        ('5º C', 'EMANUELLY DE PAULA PARDIM'),
        ('5º C', 'BENJAMIM FERNANDES DE ARAUJO'),
        ('5º C', 'IRIS FERNANDA NOGUEIRA DE CAMPOS'),
        ('5º C', 'MARIA ELLOIZA MATOS FELIZARDO'),
        ('5º C', 'LUIZZA SOPHIA GOMES SILVA'),
        ('5º C', 'KAUANNY DA SILVA HENRIQUE'),
        ('5º C', 'HELOIZA KOELHERT DOS SANTOS'),
        ('5º C', 'KAYLA ELOISA PEREIRA TAVARES'),
        ('5º C', 'GEOVANA MIKAELA FERREIRA DE OLIVEIRA'),
        ('5º C', 'HELENA TIEMANN DOS SANTOS'),
        ('5º C', 'LUANA EMANUELI DOS SANTOS SILVA'),
        ('5º C', 'RUBIANA DE SOUSA ICKERT'),
        ('5º D', 'MARCELO GABRIEL SOUZA DE OLIVEIRA'),
        ('5º D', 'ANNY KAROLINY SANTOS SILVA'),
        ('5º D', 'DAVI MIGUEL DA SILVA'),
        ('5º D', 'EMANUELLY SOUZA QUERINO'),
        ('5º D', 'FERNANDO DE OLIVEIRA ANTUNES'),
        ('5º D', 'FRANCISCO DE OLIVEIRA ANTUNES'),
        ('5º D', 'GUSTAVO DA SILVA MARCELINO'),
        ('5º D', 'ISIS PEGORARO SANCHES'),
        ('5º D', 'LEANDRO DE SOUZA KLAUSS'),
        ('5º D', 'MARIANY SOPHIA JESUS GUERRA'),
        ('5º D', 'RAIANE SOFIA MACHADO SCHERER'),
        ('5º D', 'TAIANA WEIRICH ROSA'),
        ('5º D', 'LUCAS GABRIEL DOS SANTOS MARTINS'),
        ('5º D', 'STHEFANY LARISSA UCHOA WAGNER'),
        ('5º D', 'JOSIEL SANTOS CINTA LARGA'),
        ('5º D', 'JOÃO VICTOR COSTA CAVALHEIRO'),
        ('5º D', 'GIULIA RAFAELLY DE ALMEIDA JUSTINO'),
        ('5º D', 'JULIA RAPHAELA CESARIA FONSECA'),
        ('5º D', 'KAUANY GABRIELLY GOMES MISSIAS'),
        ('5º D', 'RAFAELLA DA SILVA SIQUEIRA'),
        ('5º D', 'BRUNA GABRIELI DA SILVA FURTADO'),
        ('5º D', 'IRACY GABRIELI SILVA FERREIRA'),
        ('5º D', 'ISIS ADRIANY REZENDE GWIAZDECKI')
) as v(turma, nome)
join public.alunos a on a.nome = v.nome
join public.turmas t on t.nome = v.turma and t.ano_letivo = 2026
on conflict (aluno_id, turma_id, ano_letivo) do nothing;

-- ============================================================
-- 7) VERIFICAÇÃO
-- ============================================================

select 'escolas' as tabela, count(*) as total from public.escolas
union all select 'turmas', count(*) from public.turmas
union all select 'alunos', count(*) from public.alunos
union all select 'matriculas', count(*) from public.matriculas;

select
    e.nome as escola,
    t.nome as turma,
    a.numero_chamada,
    a.nome as aluno,
    t.professor,
    m.ano_letivo,
    m.status
from public.matriculas m
join public.alunos a on a.id = m.aluno_id
join public.turmas t on t.id = m.turma_id
join public.escolas e on e.id = t.escola_id
where m.ano_letivo = 2026
order by t.nome, a.numero_chamada;
