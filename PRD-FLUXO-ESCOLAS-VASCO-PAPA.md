# PRD — Fluxo completíssimo: Escolas → Vasco Papa → Supabase → Dashboard → Relatórios

> **Projeto:** Plataforma de Provas Online — CEM Vasco Papa (SabeTudo)
> **Escopo:** Trajeto completo dos dados escolares, da planilha da secretaria ao relatório PDF/Excel
> **Data:** 2026-09-23
> **Stack:** Next.js 16 (App Router) · Supabase (PostgreSQL + Drizzle) · SheetJS (`xlsx`) · jspdf · recharts

---

## 1. Visão geral

```
┌───────────────────────────────┐
│     ESCOLAS / UNIDADES        │
│                               │
│ Enviam relatórios de alunos   │
│ e demais dados em Excel       │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│        VASCO PAPA             │
│                               │
│ Recebe os relatórios          │
│ das outras escolas            │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│       IMPORTAÇÃO              │
│          + VALIDAÇÃO          │
│                               │
│ • Conferência dos dados       │
│ • Padronização                │
│ • Identificação de erros      │
│ • Duplicidades                │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│          SUPABASE             │
│                               │
│ • Alunos                      │
│ • Turmas                      │
│ • Professores                 │
│ • Escolas                     │
│ • Bairros                     │
│ • Etnia                       │
│ • Gênero                      │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│          DASHBOARD            │
└───────────────┬───────────────┘
                ↓
       ┌────────┼────────┐
       ↓        ↓        ↓
    ALUNOS    ETNIA    GÊNERO
       ↓        ↓        ↓
   BAIRROS  PROFESSORES TURMAS
       └────────┼────────┘
                ↓
┌───────────────────────────────┐
│           FILTROS             │
│                               │
│ • Escola                      │
│ • Turma                       │
│ • Bairro                      │
│ • Etnia                       │
│ • Gênero                      │
│ • Professor                   │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│          RELATÓRIOS           │
│                               │
│        PDF / EXCEL            │
└───────────────────────────────┘
```

**Objetivo:** transformar as planilhas que a secretaria de cada escola entrega em dados estruturados no Supabase, sem cadastro manual, e disponibilizá-los em dashboards filtráveis e relatórios PDF/Excel para a gestão do CEM Vasco Papa (que opera toda a rede de 19 unidades municipais).

---

## 2. Atores e responsabilidades

| Ator | Papel no fluxo | Como atua |
|------|----------------|-----------|
| **Escolas / Unidades (secretarias)** | Origem dos dados | Exportam do censo/cadastro escolar a planilha da unidade (`01`–`19`) e entregam ao Vasco Papa |
| **CEM Vasco Papa (operador)** | Receptor central | Recebe as planilhas de todas as unidades, confere, importa e publica na plataforma |
| **Administrador (`role = "admin"`)** | Executor técnico | Faz upload, valida, publica, vê dashboards e gera relatórios (único com esse acesso) |
| **Professor (`role = "teacher"`)** | Consumidor | Cadastra aluno/escola individualmente e consulta a própria turma |
| **Aluno (sem cadastro)** | Consumidor | Entra na prova com nome + senha padrão |

> **Decisão:** importação, dados demográficos (etnia/gênero/bairro) e relatórios da base escolar são **apenas admin**. Professor mantém o acesso atual de provas.

---

## 3. Etapa 1 — Recebimento das planilhas das escolas

### 3.1 Origem

- **19 unidades municipais** (lista fixa em `src/lib/municipal-schools.ts`), numeradas `01`–`19`; o Vasco Papa é a unidade `11`.
- Cada unidade entrega sua planilha pelo canal combinado (envio direto, e-mail/WhatsApp para a coordenação e posterior upload, ou upload direto na plataforma).
- A plataforma fornece um **modelo baixável** para padronizar a entrega.

### 3.2 Visão unificada de importação

Todo o cadastro é feito em **uma tela** (`/admin/importar` — `src/components/import-tabs.tsx`) com **duas guias**:

| Guia | Conteúdo | Tela | Endpoint |
|------|----------|------|----------|
| **Turmas** | Uma linha por turma: nome da escola (`NOME`), turma, ano/série, turno e professor (opcional) | `/admin/importar` › Turmas (`import-panel.tsx`) | `POST /api/import` (valida) e `POST /api/import/commit` (grava) |
| **Alunos** | Uma linha por aluno: nome, nº chamada, INEP, matrícula, CPF, nascimento, turma, turno, ano/série e professor — **validado contra as turmas já cadastradas** | `/admin/importar` › Alunos (`import-unificado-panel.tsx`) | `POST /api/alunos/import` (valida) e `POST /api/alunos/import/commit` (valida + grava) |

> A rota legada `/admin/alunos/importar` agora **redireciona** para `/admin/importar`.

> **Fluxo recomendado:** importar primeiro a guia de **turmas/professores** — ela cria escolas, professores e turmas — e depois a de **alunos**, que faz as matrículas vinculadas às turmas já existentes. A importação de alunos **valida cada linha contra as turmas cadastradas da escola**: turma inexistente vira **erro** (linha ignorada) e Turma/Ano/Série/Turno/Professor divergentes viram **avisos** (linha importada, com conferência registrada).

### 3.3 Formato e cabeçalhos aceitos

Arquivos **`.xlsx`**, **`.xls`** e **`.csv`**, até **5.000 linhas** (turmas) e leitura da primeira aba. O cabeçalho é **auto-detectar** (aceita títulos acima dele) e os nomes das colunas são **flexíveis** (aliases normalizados sem acento/caixa/ºª).

**Planilha A — turmas/professores (`src/lib/import.ts`):**

| Campo canônico | Aliases | Obrigatório |
|----------------|---------|-------------|
| `ESCOLA` | **`NOME`**, `ESCOLA`, `NOME DA ESCOLA`, `NOME DA UNIDADE`, `UNIDADE` | sim (coluna `NOME` na planilha da secretaria) |
| `TURMA` | `TURMA`, `NOME DA TURMA`, `CLASSE`, `SALA` | sim |
| `ANO` | `ANO`, `SÉRIE`, `ANO/SÉRIE`, `TURMA_ANO` | sim |
| `TURNO` | `TURNO`, `PERÍODO`, `HORÁRIO` | sim |
| `PROFESSOR` | `PROFESSOR`, `NOME DO PROFESSOR`, `DOCENTE` | **opcional** |

> **Critério vigente:** `NOME, NOME DA TURMA, ANO/SÉRIE, TURNO e PROFESSOR (opcional) — uma linha por turma.` A coluna legada `CÓDIGO ESCOLA`, quando presente, ainda é aceita (vincula a unidade oficial 01–19).

**Planilha B — alunos (`src/lib/aluno-import.ts`):**

| Campo canônico | Aliases | Obrigatório |
|----------------|---------|-------------|
| `NUMERO_CHAMADA` | `Nº`, `N`, `NÚMERO`, `Nº CHAMADA`, `CHAMADA` | opcional |
| `NOME` | `NOME`, `NOME DO ALUNO`, `ALUNO`, `NOME COMPLETO` | sim |
| `INEP` | `INEP DO ALUNO`, `INEP`, `CÓDIGO INEP` | opcional |
| `MATRICULA` | `MATRÍCULA`, `Nº MATRÍCULA` | opcional |
| `CPF` | `CPF`, `CPF DO ALUNO` | opcional (chave de dedupe) |
| `DATA_NASCIMENTO` | `DATA DE NASCIMENTO`, `NASCIMENTO`, `DT NASCIMENTO`, `DATA` | opcional |
| `SEXO` | `SEXO`, `GÊNERO`, `GÊNERO DO ALUNO` | opcional (normaliza M/F → Masculino/Feminino) |
| `ETNIA` | `ETNIA`, `COR`, `COR/RAÇA`, `RAÇA`, `COR OU RAÇA` | opcional (normaliza para a classificação IBGE) |
| `BAIRRO` | `BAIRRO`, `BAIRRO DE RESIDÊNCIA`, `RESIDÊNCIA` | opcional |
| `TURMA` | `TURMA`, `NOME DA TURMA`, `CLASSE`, `SALA` | sim (salvo se a turma for definida no wizard) |
| `TURNO` | `TURNO`, `PERÍODO` | opcional (conferido contra a turma) |
| `ANO` | `ANO`, `SÉRIE`, `ANO/SÉRIE`, `TURMA_ANO` | opcional (conferido contra a turma) |
| `PROFESSOR` | `PROFESSOR`, `NOME DO PROFESSOR`, `DOCENTE` | opcional (conferido contra a turma) |

---

## 4. Etapa 2 — Importação + Validação

### 4.1 Wizard de importação

**Guias de alunos** (`src/components/import-unificado-panel.tsx`) segue o fluxo em **5 passos**:

1. **Receber arquivo** — upload por clique/arrastar do relatório XLSX da escola (1ª linha = cabeçalho; 1 linha por aluno).
2. **Selecionar escola** — busca por código ou nome; lista das 19 unidades com código + nome. Aviso se a escola ainda não tem turmas cadastradas.
3. **Confirmar importação** — card com escola (código + nome), arquivo e **alunos encontrados**; botões `Cancelar` / `Importar`.
4. **Importação + validação** — checklist de conferência (Nome do aluno ✓, Turma existente ✓, Ano/Série ✓, Turno ✓, Professor ○ opcional) e verificação de duplicidades.
5. **Resultado** — `✓ importados` (matrículas novas), `⚠ erros` (linhas ignoradas) e `⚠ duplicados` (já matriculados); botões `Ver erros` (detalhe por linha) e `Concluir`.

A guia de **turmas** (`import-panel.tsx`) mantém o wizard anterior (arquivo → validação → commit).

### 4.2 Conferência e padronização

| Dado | Procedimento |
|------|--------------|
| **Escola** | Confere a coluna `NOME` (nome da escola) contra as 19 unidades. Linhas **fora da escola selecionada são ignoradas** (contadas à parte). Nome divergente da oficial vira **aviso**. Código inexistente (coluna legada) vira **erro**. |
| **Ano/série** | Normaliza para `Berçário I/II`, `Maternal I/II`, `Pré I/II`, `1º–9º Ano` (aceita `5ºA`, `5`, `5 ANO`, `5ª SÉRIE`, `BERÇÁRIO I`, etc.). Valor fora da lista = erro. |
| **Turno** | Normaliza `Matutino/Vespertino/Noturno/Integral` (aceita `Mat`, `Manhã`, `1 - MATUTINO`, etc.). |
| **Professor** | Remove prefixo numérico (`168 - NOME` → `NOME`). Nome com códigos divergentes = **aviso**. Entidade própria em `professores`. **Opcional** — turma pode ser cadastrada sem professor. |
| **Aluno** | Nome em caixa alta; mínimo 3 caracteres. **CPF validado** (dígitos verificadores). **Data de nascimento** aceita `DD/MM/AAAA`, ISO e serial do Excel. |
| **Matrícula** | Tupla `(aluno, turma, ano letivo)` **única** → idempotência (reimportar não duplica). |

### 4.3 Saída do relatório

```
Total de linhas: 109
  ✓ Válidas:   105
  ⚠ Avisos:      3
  ✗ Erros:       1        ← bloqueia a publicação
```

- **Erros** bloqueiam o commit e são listados **linha a linha** com o motivo (ex.: *"Linha 12: TURNO ausente ou inválido"*).
- **Avisos** são gravados com observação (ex.: *"Turma já cadastrada nesta escola — será mantida/atualizada"*).
- O admin pode **baixar o CSV de validação** para corrigir a planilha original na origem.

### 4.4 Duplicidades

| Cenário | Tratamento |
|---------|------------|
| Mesma escola + turma no próprio arquivo | Aviso ("linha duplicada"), mantida |
| Turma idêntica já no banco (escola + nome + ano letivo) | Aviso; commit **atualiza** turno/ano/professor se mudou, senão mantém |
| Aluno repetido (por CPF → fallback nome normalizado) | Aviso/atualização; **nunca** cria segundo registro |
| Matrícula `(aluno, turma, ano)` repetida | `DO NOTHING` (idempotente) |

---

## 5. Etapa 3 — Persistência no Supabase

### 5.1 Modelo de dados (`src/db/schema.ts`)

| Tabela | Campos principais | Origem |
|--------|-------------------|--------|
| `escolas` | `id`, `nome`, `codigo` (01–19, único), `tipo` (CEI/CEM/EM/ERM), `ativo` | Planilha A |
| `professores` | `id`, `nome`, `codigo`, `cpf`, `matricula`, `email`, `telefone`, `ativo` | Planilha A |
| `turmas` | `id`, `escolaId`, `nome`, `ano`, `turno`, `anoLetivo`, `professorId` (+ `professor`/`professorCodigo` denormalizados) | Planilha A |
| `alunos` | `id`, `nome`, `matricula` (INEP), `cpf`, `numeroChamada`, **`sexo` (gênero)**, **`etnia`**, **`bairro`**, `dataNascimento`, `senhaHash` | Planilha B (+ demográficos) |
| `matriculas` | `alunoId`, `turmaId`, `anoLetivo`, `status`; unique `(aluno, turma, ano)` | Planilha B |

### 5.2 Escrita idempotente

Tudo roda em **transação**:
1. **Escolas** — resolve por código oficial ou nome; insere se nova.
2. **Professores** — resolve por código ou nome normalizado; insere se novo.
3. **Turmas** — chave natural `(escola, nome, anoLetivo)`; insere ou atualiza.
4. **Alunos** — **dedupe por CPF, fallback por nome normalizado**; insere com senha padrão `123456` (bcrypt) **somente se novo**; nunca sobrescreve senha existente.
5. **Matrículas** — `ON CONFLICT (aluno, turma, ano)` → `DO NOTHING`.

> **Demográficos:** as colunas `SEXO`, `ETNIA/COR` e `BAIRRO` da planilha B são lidas e normalizadas — gênero para `Masculino`/`Feminino` (aceita `M`/`F`) e etnia para a lista IBGE (`Branca`, `Preta`, `Parda`, `Amarela`, `Indígena`). Valores não reconhecidos viram **aviso** (linha importada) — sem bloqueio.

---

## 6. Etapa 4 — Dashboard (visões do diagrama)

| Visão | Onde | Conteúdo |
|-------|------|----------|
| **Alunos** | `/admin/alunos` | Tabela com nº de chamada, turma, escola, professor, sexo, etnia, bairro, nascimento; busca por nome; botões de importação/PDF/CSV |
| **Etnia** | `/admin/estatisticas` | Gráfico "Alunos por etnia" (cor/raça IBGE) |
| **Gênero** | `/admin/estatisticas` | Gráfico "Alunos por gênero" |
| **Bairros** | `/admin/estatisticas` | Gráfico "Alunos por bairro" (top 12) |
| **Professores** | `/admin/estatisticas` | "Matrículas por professor" (top 12) e card com total |
| **Turmas** | `/admin/estatisticas` | "Matrículas por turma" + card de total |
| **Desempenho** (adicional) | `/admin/dashboard` | Provas, participantes, nota média, linha progressiva, diagnóstico por questão, filtro escola/turma |

Métricas em cards: total de **alunos**, **turmas**, **professores** e **escolas** do escopo. Gráficos `recharts` (componente `SerieChart`) e dados via `GET /api/admin/estatisticas` / `GET /api/admin/alunos` (**admin-only**) — `src/lib/admin.ts`.

---

## 7. Etapa 5 — Filtros globais

Reutilizável em `/admin/alunos` e `/admin/estatisticas` (`src/components/admin/filtros-bar.tsx`):

| Filtro | Tipo | Observação |
|--------|------|------------|
| Escola | select | encadeada com Turma (escolher escola filtra turmas) |
| Turma | select | turmas da escola selecionada |
| Etnia | select | valores distintos do banco (Branca, Preta, Parda, Amarela, Indígena) |
| Gênero | select | Masculino / Feminino |
| Bairro | select | bairros cadastrados |
| Professor | select | professores ativos |
| Busca | texto | por nome do aluno |

- Estado nos **`searchParams`** → URLs **compartilháveis** (ex.: `/admin/alunos?escola=CEM%20VASCO%20PAPA&etnia=Parda`).
- Botão **Limpar** restaura o escopo global.
- As consultas montam `WHERE` dinâmico com joins `alunos → matriculas → turmas → escolas → professores` em `src/lib/admin.ts`.

---

## 8. Etapa 6 — Relatórios PDF / Excel

Disponíveis em `/admin/alunos` e `/admin/estatisticas`, **respeitando os filtros ativos**:

| Formato | Endpoint | Conteúdo |
|---------|----------|----------|
| **PDF** | `GET /api/exports/relatorio-alunos` | Cabeçalho SabeTudo (índigo), data de geração, **filtros declarados**, resumo por etnia/gênero, tabela de alunos (nº, nome, turma, escola, professor, sexo, etnia, bairro, nascimento), rodapé numerado — `jspdf` + `autoTable` |
| **Excel (CSV)** | `GET /api/admin/alunos?formato=csv` | planilha com BOM UTF-8 (acentuação correta no Excel), colunas escola/turma/ano/turno/professor/nº/aluno/matrícula/sexo/etnia/bairro/nascimento |

Relatórios complementares existentes:
- Desempenho/respostas: `GET /api/exports/pdf` e `GET /api/exports/csv` (resultados do aluno).
- Prova em PDF: `GET /api/exams/[id]/pdf` e `GET /api/prova/[code]/pdf`.

**Acesso:** todos os endpoints de base escolar exigem `role = "admin"` via `getSessionUser()`.

---

## 9. Estado da implementação x fluxo desejado (gap)

| Item do fluxo | Situação atual | O que falta |
|---------------|----------------|-------------|
| Recebimento de planilha das escolas | **Tela única** (`/admin/importar`) com guias Turmas e Alunos + modelo baixável; `/admin/alunos/importar` redireciona | Nada |
| Importação + validação (turmas/professores) | Completa (dry-run, erros/avisos, idempotência) | Nada |
| Importação + validação (alunos) | Completa (nome, CPF, INEP, matrícula, nascimento, nº chamada) + **conferência Ano/Série, Turno e Professor contra a turma cadastrada** (avisos) | Nada |
| **Etnia, gênero, bairro no import de alunos** | ✗ **Não lidos das planilhas** | Adicionar colunas `COR_RACA`/`SEXO`/`ETNIA` e `BAIRRO` ao `HEADER_ALIASES` de `src/lib/aluno-import.ts`, com normalização IBGE, e gravá-los em `alunos` no commit |
| Persistência no Supabase | Schema completo + escrita idempotente | Sem preenchimento demográfico automático (ver acima) |
| Dashboard Alunos/Etnia/Gênero/Bairros/Professores/Turmas | Completo (`/admin/estatisticas`, `/admin/alunos`) | Nada (popular dados) |
| Filtros (escola, turma, bairro, etnia, gênero, professor) | Completo | Nada (popular dados) |
| Relatórios PDF / Excel | Completo (base escolar + resultados) | Nada (popular dados) |

> **Critério de aceite do fluxo:** a secretaria entrega as planilhas da unidade; o admin importa pela tela única (turmas e depois alunos) e consegue ver nos dashboards a distribuição por etnia, gênero e bairro e emitir relatórios PDF/Excel com filtros, sem tocar no banco.

---

## 10. Regras de negócio resumidas

1. **Importar primeiro a planilha de turmas/professores**, depois a de alunos.
2. **Dry-run antes de publicar** — sempre ver o relatório antes do commit.
3. **Idempotência** — reimportar o mesmo arquivo não duplica registros.
4. **Dedupe de alunos** por CPF, fallback nome normalizado; senha padrão só em alunos novos.
5. **Professor é entidade própria**; `turmas.professor` (texto) mantém compatibilidade.
6. **Turmas inexistentes na escola = erro** na importação de alunos (linha ignorada, avisa para importar as turmas antes); divergências de Ano/Turno/Professor viram **avisos**.
7. **Admin-only** para importação, dados demográficos e relatórios.
8. **Cascata preservada** — excluir escola remove turmas e matrículas (`onDelete: cascade`).

---

## 11. Referências no código

| Ponto | Arquivo |
|-------|---------|
| Schema (escolas, professores, turmas, alunos, matriculas) | `src/db/schema.ts` |
| Lista das 19 unidades municipais | `src/lib/municipal-schools.ts` |
| Importação turmas/professores (parse, validar, commit) | `src/lib/import.ts` |
| Importação alunos (parse, validar, commit) | `src/lib/aluno-import.ts` |
| Painel UI turmas/professores | `src/components/import-panel.tsx` |
| Painel UI alunos (wizard único: arquivo → escola → confirma → resultado) | `src/components/import-unificado-panel.tsx` |
| Abas da tela unificada | `src/components/import-tabs.tsx` |
| Telas | `src/app/admin/importar/page.tsx` (unificada); `/admin/alunos/importar` redireciona |
| APIs de importação | `src/app/api/import/route.ts`, `src/app/api/import/commit/route.ts`, `src/app/api/alunos/import/route.ts`, `src/app/api/alunos/import/commit/route.ts` |
| Listagem/filtros/estatísticas | `src/lib/admin.ts`, `src/components/admin/filtros-bar.tsx` |
| Dashboard desempenho | `src/lib/dashboard.ts`, `src/app/admin/dashboard/page.tsx` |
| Relatórios PDF/CSV | `src/app/api/exports/relatorio-alunos/route.ts`, `src/app/api/admin/alunos/route.ts`, `src/lib/exports.ts` |
| Autenticação/autorização | `src/lib/auth.ts` |