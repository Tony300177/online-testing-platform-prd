-- ============================================================
-- LIMIARES DE DESEMPENHO POR ESCOLA
--
-- Faixas que classificam a performance de uma habilidade: verde
-- (>= verde_min), amarelo, laranja e vermelho (abaixo de
-- laranja_min). Configuravel pela coordenacao por escola.
--
-- Por que este arquivo existe: a tabela era criada por um script
-- avulso na raiz (migrate-thresholds.js), fora do fluxo de
-- migrations. O resultado era que um banco novo, montado so pelo
-- `aplicar-migrations.cjs`, ficava sem a tabela -- e
-- `src/db/schema.ts:340` a declara, o TRUNCATE de
-- `scripts/zerar-e-importar.ts` a lista, e a rota de thresholds
-- (/api/admin/habilidades/thresholds) a consulta.
--
-- Espelha src/db/schema.ts. Seguro re-executar.
-- ============================================================

create table if not exists public.desempenho_thresholds (
    id serial primary key,
    escola_id uuid references public.escolas(id) on delete cascade,
    verde_min integer not null default 80,
    amarelo_min integer not null default 60,
    laranja_min integer not null default 40,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

-- Um registro por escola. ON CONFLICT (escola_id) nao serviria aqui
-- porque escola_id admite NULL (padrao global): um indice unico em
-- coluna nullable trata os NULLs como distintos, que e o desejado.
create unique index if not exists thresholds_escola_unique
    on public.desempenho_thresholds(escola_id);

create index if not exists thresholds_escola_idx
    on public.desempenho_thresholds(escola_id);

alter table public.desempenho_thresholds enable row level security;

drop policy if exists "usuarios autenticados podem visualizar thresholds"
    on public.desempenho_thresholds;

create policy "usuarios autenticados podem visualizar thresholds"
    on public.desempenho_thresholds for select to authenticated using (true);
