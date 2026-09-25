# Banco de dados

SQL puro, aplicado por script. Não usar `drizzle-kit generate/push`: o schema do
Drizzle (`src/db/schema.ts`) é apenas a leitura do TypeScript, o banco é
versionado por aqui.

## Como aplicar

```bash
node scripts/aplicar-migrations.cjs            # lista o que falta (não altera nada)
node scripts/aplicar-migrations.cjs --aplicar   # aplica as pendentes
node scripts/aplicar-migrations.cjs --marcar estrutura-provas.sql   # registra sem executar
```

`--marcar` é para banco que já recebeu SQL por outro meio (pgAdmin, importação
antiga): grava o registro sem rodar o arquivo, para que a próxima execução não
tente aplicá-lo de novo. A ordem fica em `ORDEM`, no próprio script — o alfabeto
não funciona, porque `estrutura-provas.sql` referencia `turmas`/`escolas`, que
`banco-escolar` cria. `users` não é criada por aqui (vem do Supabase).

O script usa `DATABASE_URL` do `.env.local`, aplica **um arquivo por transação**
(`lock_timeout` de 5s para não travar o app) e grava o que rodou em
`schema_migrations`, com checksum — se um arquivo já aplicado for editado
depois, ele avisa que houve drift.

Arquivos são executados na ordem do `ORDEM` e devem ser **idempotentes**
(`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), porque rodar duas vezes não pode
quebrar nada. Atenção com `ON CONFLICT (id)`: em tabela com `SERIAL` ele nunca
dispara — é preciso `NOT EXISTS` para o backfill não duplicar linhas.

| Arquivo | O que faz |
| --- | --- |
| `aluno-login.sql` | Login do aluno (hash bcrypt por aluno) |
| `banco-escolar-ceem-vasco-papa.sql` | Carga do banco escolar |
| `estrutura-provas.sql` | Tabelas de provas, questões, alternativas, respostas |
| `migracao-aplicacoes.sql` | Tabela de aplicações (agendamento por turma) |
| `migracao-habilidades.sql` | Catálogo BNCC + restaura `questoes.habilidade` para `text[]` |
| `migracao-importacao-v2.sql` | Colunas de importação de escolas/turmas/professores |
| `migracao-importar-alunos-cpf.sql` | CPF como chave de aluno |
| `migracao-perfil-demografico.sql` | Perfil demográfico do admin |

Regra: **rodar a migration antes de publicar o código** que depende dela.
`migracao-habilidades.sql` é a exceção mais delicada — sem ela, o seletor de
habilidades e as telas de análise não funcionam.

## Modelo de habilidades (BNCC)

Duas peças, e é importante saber por que são duas:

- **`habilidades`** — catálogo. Uma linha por habilidade BNCC
  (`codigo`, `descricao`, `etapa`, `ano`, `componente`, `categoria`, `ativo`).
  O código é a identidade: `AAAAANNDD` (ex.: `EF05MA01`), com CHECK de formato
  no banco. O código **não pode ser alterado** se já houver questão vinculada
  (o app bloqueia com 409), porque as questões guardam o código, não o id.

- **`questoes.habilidade`** — `text[]` com os códigos vinculados à questão.
  Continua sendo array, e não uma tabela ponte, por decisão deliberada: toda a
  camada analítica (`src/lib/habilidades-stats.ts` e as telas de análise) é
  chaveada pelo **código**, não por id. Uma tabela ponte exigiria JOIN em ~11
  consultas só para recuperar o código, sem ganho. Como o código é imutável, o
  array desnormalizado é seguro.

Garantias em camadas:

| Camada | O que garante |
| --- | --- |
| Banco | `habilidades_codigo_formato_check`, `habilidades_ano_check`, `questoes_habilidade_formato_check` |
| Banco | `habilidade_codigos_validos()` — formato de cada elemento do array |
| API | `exam-validation.ts` — normaliza (maiúsculas, sem duplicata) e exige que o código exista no catálogo |
| API | publicação de prova exige ao menos uma habilidade em todas as questões |
| UI | o seletor só oferece habilidades ativas do catálogo |

`descricao` começa vazia no seed (212 habilidades do Fundamental I de Língua
Portuguesa e Matemática). Para preencher: **Habilidades > Consultar > "Só sem
descrição"** e editar; a busca por descrição depende desse preenchimento.

## Convenção

- Tabela no plural, snake_case; chave `id SERIAL`; timestamps `criado_em` /
  `atualizado_em`.
- Dinheiro/percentual: `NUMERIC`, nunca float.
- Segredo só no `.env.local` (já no `.gitignore`). `drizzle.config.ts` lê
  `DATABASE_URL`; a connection string já esteve commitada em
  `drizzle.config.json` (removido) — se o banco for compartilhado, a senha
  precisa ser rotacionada.
