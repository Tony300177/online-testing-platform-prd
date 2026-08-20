# PRD — Fluxo do Administrador: Importação, Gestão e Relatórios

> **Projeto:** Plataforma de Provas Online — CEM Vasco Papa (SabeTudo)
> **Escopo:** Pipeline completo de gestão administrativa
> **Data:** 2026-08-19
> **Stack atual:** Next.js 16 (App Router) · Supabase (PostgreSQL + Drizzle) · jspdf · recharts

---

## 1. Visão geral

Este documento especifica o fluxo que o **administrador** segue para alimentar e gerenciar a plataforma:

```
┌───────────────┐
│ EXCEL         │
│ Vasco Papa    │
└───────┬───────┘
        ↓
┌───────────────┐
│ IMPORTAÇÃO    │
│ + VALIDAÇÃO   │
└───────┬───────┘
        ↓
┌───────────────┐
│   SUPABASE    │
│               │
│ Alunos        │
│ Turmas        │
│ Professores   │
│ Escolas       │
└───────┬───────┘
        ↓
┌───────────────┐
│ DASHBOARD     │
└───────┬───────┘
        ↓
┌────────────────────┼────────────────────┐
↓                    ↓                    ↓
ALUNOS             ETNIA                GÊNERO
↓                    ↓                    ↓
BAIRROS         PROFESSORES             TURMAS
└────────────────────┼────────────────────┘
                     ↓
             ┌───────────────┐
             │   FILTROS     │
             └───────┬───────┘
                     ↓
             ┌───────────────┐
             │ RELATÓRIOS    │
             │ PDF / EXCEL   │
             └───────────────┘
```

O objetivo é eliminar o cadastro manual (hoje feito via SQL `sql/banco-escolar-ceem-vasco-papa.sql`) e permitir que o administrador importe a planilha da secretaria, valide e publique os dados em um único fluxo, com dashboards e relatórios filtráveis.

---

## 2. Atores e permissões

| Ator | Acesso | O que pode |
|------|--------|------------|
| **Administrador** (`role = "admin"`) | Tudo | Importar Excel, validar, publicar, editar escolas/turmas/professores/alunos, ver dashboard completo, gerar relatórios |
| **Professor** (`role = "teacher"`) | Parcial | Cadastrar escola/aluno individualmente (`/api/escolas`, `/api/alunos`), criar provas, ver resultados da própria turma |
| **Aluno** (sem cadastro) | Público | Entrar na prova via nome + senha padrão |

> **Decisão:** a importação e os relatórios de base escolar (etnia, gênero, bairro) ficam restritos a **admin**. O professor mantém o acesso atual.

---

## 3. Estado atual da aplicação (baseline)

O que **já existe** no código:

- **Tabelas** (`src/db/schema.ts`): `escolas`, `turmas`, `alunos`, `matriculas`, `users`, `provas`, `questoes`, `alternativas`, `respostas_alunos`, `resultados`.
- **Endpoints**: `POST/GET /api/escolas`, `POST /api/alunos`, `GET /api/exports/csv`, `GET /api/exports/pdf`.
- **Telas admin**: `/admin` (dashboard executivo global), `/admin/dashboard` (dashboard por escola/turma com filtros), `/admin/provas`, `/admin/respostas`.
- **Seed**: `sql/banco-escolar-ceem-vasco-papa.sql` (109 matrículas, 4 turmas do 5º ano).

### Lacunas em relação ao fluxo proposto

| Item do fluxo | Situação | Necessário |
|---------------|----------|------------|
| Importação de Excel | ✗ Não existe | Nova feature |
| Tabela `professores` | ✗ Professor é coluna texto em `turmas` | Migração |
| Campos `etnia`, `gênero`, `bairro` em alunos | ✗ Não existem | Migração |
| Dashboard por etnia/gênero/bairro | ✗ Parcial | Nova feature |
| Relatórios PDF/Excel da base escolar | ✗ Só exporta respostas | Extensão |

---

## 4. Etapa 1 — Importação do Excel

### 4.1 Origem dos dados

A planilha é fornecida pela secretaria da escola (**CEM Vasco Papa**), exportada do sistema de censo/cadastro escolar. É o mesmo conjunto de dados hoje embutido no seed SQL.

### 4.2 Formato esperado da planilha

Uma única aba (`.xlsx` ou `.csv`), com **linha de cabeçalho obrigatória**. Colunas previstas:

| Coluna (cabeçalho) | Tipo | Obrigatório | Observação |
|--------------------|------|-------------|------------|
| `ESCOLA` | texto | sim | nome da escola |
| `ESCOLA_CODIGO` | número | opcional | código da escola (único) |
| `TURMA` | texto | sim | ex.: `5º A` |
| `TURMA_ANO` | texto | sim | ex.: `5º Ano` |
| `TURNO` | texto | sim | ex.: `Matutino`, `Vespertino` |
| `ANO_LETIVO` | número | sim | ex.: `2026` |
| `PROFESSOR` | texto | sim | nome do professor responsável |
| `PROFESSOR_CODIGO` | número | opcional | matrícula/funcional do professor (único) |
| `ALUNO` | texto | sim | nome completo do aluno |
| `NUMERO_CHAMADA` | número | opcional | nº da chamada na turma |
| `MATRICULA` | texto | opcional | nº de matrícula do aluno |
| `SEXO` | texto | opcional | `M` / `F` → deriva **gênero** |
| `COR_RACA` | texto | opcional | etnia: `Branca`, `Preta`, `Parda`, `Amarela`, `Indígena` |
| `BAIRRO` | texto | opcional | bairro de residência |
| `DATA_NASCIMENTO` | data | opcional | `DD/MM/AAAA` |

### 4.3 Fluxo de upload

1. Admin acessa **`/admin/importar`**.
2. Arrasta/seleciona o arquivo (`.xlsx`, `.xls` ou `.csv`).
3. O sistema **lê no cliente** (ex.: `xlsx` via SheetJS) e envia o conteúdo normalizado para a API `POST /api/import` (JSON), ou envia o binário para parse no servidor.
4. O sistema executa a **validação** (Etapa 2) e devolve um **relatório de pré-visualização** sem gravar nada no banco.
5. Admin confere o resumo (linhas válidas / com erro / ignoradas) e clica em **Publicar** → `POST /api/import/commit`.
6. Confirmado, os dados são gravados de forma **idempotente** (mesmo arquivo re-enviado não duplica).

### 4.4 Bibliotecas propostas

- **`xlsx` (SheetJS)** para ler `.xlsx`/`.csv` no cliente e no servidor (adicionar ao `package.json`).
- Parse CSV nativo (sem dependência) ou mesma lib com `csv` mode.

---

## 5. Etapa 2 — Validação

### 5.1 Regras de validação

**Estrutura da planilha**
- Cabeçalho presente e com as colunas obrigatórias.
- Sem linhas totalmente vazias no meio do arquivo.

**Escola**
- `ESCOLA` não vazio; nome com mínimo de 3 caracteres.
- `ESCOLA_CODIGO` único (se informado) — conflito é erro de validação.

**Turma**
- `TURMA`, `TURMA_ANO`, `TURNO` obrigatórios.
- Combinação `(escola, turma, ano_letivo)` única.
- Turno normalizado para `Matutino` / `Vespertino` / `Noturno` / `Integral` (aceita sinônimos: `Mat`, `Vesp`).

**Professor**
- `PROFESSOR` obrigatório; `PROFESSOR_CODIGO` deve ser único quando informado.
- Mesmo nome de professor com códigos diferentes → aviso (não bloqueia).

**Aluno**
- `ALUNO` obrigatório, mínimo 3 caracteres.
- Nomes **deduplicados por normalização** (ignora maiúsculas/minúsculas e acentos) — mesmo aluno em 2 turmas = 1 registro, como no seed atual.
- `NUMERO_CHAMADA` inteiro positivo, opcional.
- `SEXO` ∈ {M, F, Masculino, Feminino} → normaliza para `Masculino`/`Feminino`.
- `COR_RACA` ∈ lista IBGE (`Branca`, `Preta`, `Parda`, `Amarela`, `Indígena`) → normaliza para **etnia**.
- `DATA_NASCIMENTO` no formato `DD/MM/AAAA` (aceita também ISO `YYYY-MM-DD`).

**Matrícula**
- Aluno deve ter pelo menos uma turma no ano letivo.
- Duplicidade `(aluno, turma, ano_letivo)` → linha ignorada (idempotência).

### 5.2 Saída da validação

O resultado é um objeto com **3 listas**:

| Status | Descrição | Ação |
|--------|-----------|------|
| `válidas` | Linhas prontas para gravar | Serão inseridas |
| `erros` | Linhas que violam regra **bloqueante** | Não gravadas; motivo por linha |
| `avisos` | Linhas aceitas, mas com ressalva (ex.: professor duplicado) | Gravadas com observação |

Contadores exibidos ao admin:
```
Total de linhas: 109
  ✓ Válidas: 105
  ⚠ Avisos: 3
  ✗ Erros: 1
```
Erros são apresentados **linha a linha** com a coluna responsável: *"Linha 12: `TURNO` vazio"*.

### 5.3 Pré-visualização (dry-run)

- Antes de publicar, o admin vê um **resumo agregado por turma** (nº de alunos, professor) e pode **baixar o CSV de erros** para corrigir a planilha original.
- Nada é gravado até o clique em **Publicar**.

---

## 6. Etapa 3 — Persistência no Supabase

### 6.1 Migração do schema

Adicionar ao `src/db/schema.ts` (e ao SQL do Supabase):

**Nova tabela `professores`:**
```sql
create table if not exists public.professores (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    codigo integer unique,
    created_at timestamptz not null default now()
);
```

**Novas colunas em `alunos`:**
```sql
alter table public.alunos
    add column if not exists sexo text,          -- 'Masculino' | 'Feminino'
    add column if not exists etnia text,          -- 'Branca' | 'Preta' | 'Parda' | 'Amarela' | 'Indígena'
    add column if not exists bairro text,
    add column if not exists data_nascimento date;
```

**Novas colunas em `turmas`:**
```sql
alter table public.turmas
    add column if not exists professor_id uuid references public.professores(id) on delete set null;
```

> Migração retroativa: rodar script que transforma `turmas.professor` (texto) em registros em `professores` e vincula por `professor_codigo`. Manter a coluna texto como fallback/denormalizada para compatibilidade.

### 6.2 Estratégia de escrita (idempotente)

Processo em transação:
1. **Escolas**: `ON CONFLICT (codigo)` → atualiza nome se mudou.
2. **Professores**: `ON CONFLICT (codigo)` → atualiza nome.
3. **Alunos**: dedupe por nome normalizado; `INSERT` ou atualiza campos demográficos (`sexo`, `etnia`, `bairro`, `data_nascimento`) e nunca sobrescreve `senha_hash` existente.
4. **Turmas**: `ON CONFLICT` pela chave natural `(escola_id, nome, ano_letivo)`.
5. **Matrículas**: `ON CONFLICT (aluno_id, turma_id, ano_letivo)` → `DO NOTHING`.

Senha padrão do aluno (`123456`) gerada com bcrypt apenas para alunos **novos**.

### 6.3 Nível de acesso da API

- `POST /api/import` (validação) e `POST /api/import/commit` (gravação): exigem `role = "admin"` via `getSessionUser()`.

---

## 7. Etapa 4 — Dashboard do administrador

### 7.1 Estrutura de navegação

```
/admin
  ├─ /admin/dashboard        → Dashboard por escola/turma (existe)
  ├─ /admin/importar         → Importação Excel (nova)
  ├─ /admin/alunos           → Gestão de alunos (nova)
  ├─ /admin/professores      → Gestão de professores (nova)
  ├─ /admin/turmas           → Gestão de turmas (nova)
  ├─ /admin/provas           → Provas (existe)
  └─ /admin/respostas        → Respostas (existe)
```

### 7.2 Visões (seguindo o diagrama)

| Visão | O que mostra | Gráficos sugeridos |
|-------|--------------|--------------------|
| **Alunos** | Total de alunos, por turma, ativos | Cards, tabela com busca |
| **Etnia** | Distribuição por cor/raça | Pizza / donut + barras |
| **Gênero** | Masculino × Feminino | Donut + barras |
| **Bairros** | Alunos por bairro | Barras horizontais (top 10) |
| **Professores** | Professores ativos, turmas por professor | Cards + tabela |
| **Turmas** | Alunos por turma, turno, professor | Barras agrupadas |

Os gráficos reutilizam `recharts` (já instalado) e o padrão de componentes de `src/components/dashboard-charts.tsx`.

### 7.3 Endpoints de dados

- `GET /api/admin/alunos` — lista com filtros (turma, etnia, gênero, bairro, busca por nome).
- `GET /api/admin/estatisticas` — agregações para as visões acima (etnia/gênero/bairro/turma/professor), aceitando os mesmos filtros.
- `GET /api/admin/professores` — CRUD básico.
- `GET /api/admin/turmas` — CRUD básico.

Todas exigem `role = "admin"`.

---

## 8. Etapa 5 — Filtros

Filtro global reutilizável no dashboard e nos relatórios:

| Filtro | Tipo | Valores |
|--------|------|---------|
| Escola | select | lista de escolas |
| Turma | select | turmas da escola selecionada |
| Etnia | select (múltiplo) | Branca, Preta, Parda, Amarela, Indígena |
| Gênero | select (múltiplo) | Masculino, Feminino |
| Bairro | select (com busca) | bairros cadastrados |
| Professor | select | professores ativos |
| Ano letivo | select | ex.: 2026 |

- Filtros encadeados: escolher escola limita turmas e professores.
- Estado nos `searchParams` (padrão do `/admin/dashboard` atual) → URLs compartilháveis.
- Botão **Limpar** restaura o escopo global.

---

## 9. Etapa 6 — Relatórios PDF / Excel

### 9.1 Tipos de relatório

**A. Relatório da base escolar (novo)**
Conteúdo: alunos com turma, professor, etnia, gênero, bairro, nº de chamada.
- `GET /api/exports/relatorio-alunos?escola=&turma=&etnia=&genero=&bairro=&professor=` → **PDF** (jspdf + autotable, mesmo padrão de `src/app/api/exports/pdf/route.ts`) e **CSV/Excel**.
- Cabeçalho com data de geração, filtros aplicados e métricas de resumo (total de alunos, por etnia, por gênero).

**B. Relatório de respostas (existe)**
`/api/exports/pdf` e `/api/exports/csv` — ganham os filtros novos (etnia, gênero, bairro) e passam a cruzar com a base escolar (`alunos`).

**C. Relatório de desempenho (existente)**
Dashboard executivo `/admin` e `/admin/dashboard` já exportam; manter.

### 9.2 Formato Excel

- **CSV** com BOM UTF-8 (como o atual `/api/exports/csv`), abrindo direto no Excel com acentuação correta.
- Nome do arquivo: `alunos-{escola}-{data}.csv`.

### 9.3 Formato PDF

- A4, cabeçalho colorido (padrão SabeTudo: índigo), filtros declarados, tabela com `autoTable`, rodapé com paginação.
- Quando filtrado por **uma** turma, inclui colunas adicionais (nº de chamada ordenado).

---

## 10. Regras de negócio resumidas

1. **Importação é dry-run primeiro**: admin sempre vê o relatório antes de publicar.
2. **Idempotência**: reimportar o mesmo arquivo não duplica registros.
3. **Dedupe de alunos por nome normalizado** (sem acentos/caixa) — padrão já usado em `/api/alunos`.
4. **Professor vira entidade própria**; `turmas.professor` (texto) mantém compatibilidade.
5. **Senha padrão** `123456` só é definida em alunos novos; nunca sobrescreve a existente.
6. **Admin-only** para importação e dados demográficos.
7. **Cascata de exclusão** preservada: excluir escola remove turmas e matrículas (`onDelete: cascade`).

---

## 11. Requisitos não funcionais

| Aspecto | Requisito |
|---------|-----------|
| Segurança | Endpoints protegidos por `getSessionUser()` + checagem de `role`; RLS mantido para leitura autenticada |
| Performance | Agregações via SQL agrupado (drizzle `groupBy`), não processamento em memória para listas grandes |
| Usabilidade | Feedback por linha de erro; tempo de importação exibido; arquivos de até ~5 MB |
| Compatibilidade | Importação aceita `.xlsx`, `.xls` e `.csv` |
| Acessibilidade | Tabelas com `aria-label`, foco visível nos filtros |

---

## 12. Roteiro de implementação

| Fase | Entregável | Esforço |
|------|-----------|---------|
| **1** | Migração de schema (professores, sexo, etnia, bairro, data_nascimento) + backfill | M |
| **2** | API de importação (`/api/import`, `/api/import/commit`) com validação + idempotência | L |
| **3** | Tela `/admin/importar` com upload, preview e relatório de erros | L |
| **4** | Endpoints de dados e visões do dashboard (alunos, etnia, gênero, bairros, professores, turmas) | M |
| **5** | Filtros globais compartilhados | M |
| **6** | Relatórios PDF/Excel da base escolar + extensão dos existentes | M |
| **7** | Testes manuais com a planilha real do Vasco Papa + lint/typecheck | S |

> **Critério de aceite:** o administrador consegue importar a planilha da secretaria, ver os dashboards por etnia/gênero/bairro e gerar relatórios PDF/Excel sem tocar no banco.

---

## 13. Referências no código

| Ponto de alteração | Arquivo |
|--------------------|---------|
| Schema | `src/db/schema.ts` |
| Seed atual (referência dos dados) | `sql/banco-escolar-ceem-vasco-papa.sql` |
| Cadastro manual (referência de regras) | `src/app/api/escolas/route.ts`, `src/app/api/alunos/route.ts` |
| Dashboard por escola/turma (referência de filtros) | `src/app/admin/dashboard/page.tsx`, `src/lib/dashboard.ts` |
| Export PDF (referência de layout) | `src/app/api/exports/pdf/route.ts` |
| Export CSV (referência de formato) | `src/app/api/exports/csv/route.ts`, `src/lib/exports.ts` |
| Componentes de gráficos | `src/components/dashboard-charts.tsx` |
| Autenticação/autorização | `src/lib/auth.ts` |