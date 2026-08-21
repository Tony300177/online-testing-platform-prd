import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ============================================================
 * BANCO ESCOLAR (tabelas criadas via SQL — ver sql/banco-escolar-*.sql)
 * ============================================================ */

/** Escolas da rede. */
export const escolas = pgTable("escolas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  codigo: integer("codigo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Professores da rede (entidade própria; turmas referenciam por professor_id). */
export const professores = pgTable(
  "professores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    codigo: integer("codigo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("professores_nome_idx").on(t.nome)]
);

/** Turmas de uma escola (ano letivo, turno e professor). */
export const turmas = pgTable(
  "turmas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolas.id, { onDelete: "cascade" }),
    codigo: integer("codigo"),
    nome: text("nome").notNull(),
    ano: text("ano").notNull(),
    turno: text("turno").notNull(),
    professor: text("professor"), // denormalizado (compatibilidade); fonte oficial: professor_id
    professorCodigo: integer("professor_codigo"),
    professorId: uuid("professor_id").references(() => professores.id, { onDelete: "set null" }),
    anoLetivo: integer("ano_letivo").notNull().default(2026),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("turmas_escola_idx").on(t.escolaId), index("turmas_professor_idx").on(t.professorId)]
);

/** Alunos (único registro por pessoa, sem turma). */
export const alunos = pgTable(
  "alunos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    matricula: text("matricula"),
    numeroChamada: integer("numero_chamada"),
    sexo: text("sexo"), // "Masculino" | "Feminino"
    etnia: text("etnia"), // IBGE: Branca | Preta | Parda | Amarela | Indígena
    bairro: text("bairro"),
    dataNascimento: date("data_nascimento", { mode: "date" }),
    senhaHash: text("senha_hash"), // login do aluno: hash bcrypt da senha (padrão compartilhado)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("alunos_nome_idx").on(t.nome), index("alunos_etnia_idx").on(t.etnia), index("alunos_bairro_idx").on(t.bairro)]
);

/** Matrículas: liga o aluno à turma em um ano letivo. */
export const matriculas = pgTable(
  "matriculas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alunoId: uuid("aluno_id")
      .notNull()
      .references(() => alunos.id, { onDelete: "cascade" }),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => turmas.id, { onDelete: "cascade" }),
    anoLetivo: integer("ano_letivo").notNull(),
    status: text("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("matriculas_aluno_turma_ano_idx").on(t.alunoId, t.turmaId, t.anoLetivo)]
);

export type Escola = typeof escolas.$inferSelect;
export type Professor = typeof professores.$inferSelect;
export type Turma = typeof turmas.$inferSelect;
export type Aluno = typeof alunos.$inferSelect;
export type Matricula = typeof matriculas.$inferSelect;

/* ============================================================ */

/** Usuários internos (professores e administradores). Alunos não têm cadastro. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("teacher"), // "admin" | "teacher"
  school: text("school"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Provas criadas pelos professores. */
export const provas = pgTable(
  "provas",
  {
    id: serial("id").primaryKey(),
    titulo: text("titulo").notNull(),
    disciplina: text("disciplina").notNull().default(""),
    turma: text("turma").notNull().default(""),
    turmaId: uuid("turma_id").references(() => turmas.id, { onDelete: "set null" }),
    escolaId: uuid("escola_id").references(() => escolas.id, { onDelete: "set null" }),
    arquivoNome: text("arquivo_nome"), // PDF: nome original
    arquivoBase64: text("arquivo_base64"), // PDF: conteúdo em base64
    arquivoTamanho: integer("arquivo_tamanho"),
    arquivoUrl: text("arquivo_url"), // URL externa opcional
    instrucoes: text("instrucoes").notNull().default(""),
    dataInicio: timestamp("data_inicio", { withTimezone: true }),
    dataFim: timestamp("data_fim", { withTimezone: true }),
    tempoMinutos: integer("tempo_minutos"), // tempo limite da prova (opcional)
    status: text("status").notNull().default("draft"), // "draft" | "active" | "finished"
    codigo: text("codigo").unique(), // código/link de acesso gerado ao publicar
    professorId: integer("professor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("provas_status_idx").on(t.status), index("provas_escola_idx").on(t.escolaId)]
);

/** Questões de uma prova. */
export const questoes = pgTable(
  "questoes",
  {
    id: serial("id").primaryKey(),
    provaId: integer("prova_id")
      .notNull()
      .references(() => provas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull().default(0),
    pergunta: text("pergunta").notNull(),
    tipo: text("tipo").notNull().default("multiple"),
    valor: numeric("valor", { precision: 5, scale: 2 }).notNull().default("1"),
    habilidade: text("habilidade").array(),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [index("questoes_prova_idx").on(t.provaId)]
);

/** Alternativas de uma questão de múltipla escolha. */
export const alternativas = pgTable(
  "alternativas",
  {
    id: serial("id").primaryKey(),
    questaoId: integer("questao_id")
      .notNull()
      .references(() => questoes.id, { onDelete: "cascade" }),
    letra: text("letra").notNull(), // "A", "B", "C"...
    texto: text("texto").notNull(),
    correta: boolean("correta").notNull().default(false),
  },
  (t) => [index("alternativas_questao_idx").on(t.questaoId)]
);

/** Respostas dos alunos (uma linha por questão respondida). */
export const respostasAlunos = pgTable(
  "respostas_alunos",
  {
    id: serial("id").primaryKey(),
    provaId: integer("prova_id")
      .notNull()
      .references(() => provas.id, { onDelete: "cascade" }),
    alunoId: uuid("aluno_id").references(() => alunos.id, { onDelete: "set null" }),
    turmaId: uuid("turma_id").references(() => turmas.id, { onDelete: "set null" }),
    alunoNome: text("aluno_nome").notNull(),
    alunoTurma: text("aluno_turma").notNull(),
    escolaNome: text("escola_nome").notNull(),
    questaoId: integer("questao_id")
      .notNull()
      .references(() => questoes.id, { onDelete: "cascade" }),
    alternativaId: integer("alternativa_id").references(() => alternativas.id, { onDelete: "set null" }),
    resultadoId: integer("resultado_id"), // vínculo com resultados.id (sem FK para evitar ordem circular)
    textoResposta: text("texto_resposta"),
    correta: boolean("correta"),
    respondidaEm: timestamp("respondida_em", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("respostas_alunos_prova_idx").on(t.provaId),
    index("respostas_alunos_aluno_idx").on(t.alunoId),
    index("respostas_alunos_questao_idx").on(t.questaoId),
    index("respostas_alunos_resultado_idx").on(t.resultadoId),
  ]
);

/** Resultado resumido por aluno. */
export const resultados = pgTable(
  "resultados",
  {
    id: serial("id").primaryKey(),
    provaId: integer("prova_id")
      .notNull()
      .references(() => provas.id, { onDelete: "cascade" }),
    alunoId: uuid("aluno_id").references(() => alunos.id, { onDelete: "set null" }),
    alunoNome: text("aluno_nome").notNull(),
    alunoTurma: text("aluno_turma").notNull(),
    escolaNome: text("escola_nome").notNull(),
    acertos: integer("acertos").notNull().default(0),
    erros: integer("erros").notNull().default(0),
    nota: numeric("nota", { precision: 6, scale: 2 }).notNull().default("0"),
    percentual: numeric("percentual", { precision: 5, scale: 2 }).notNull().default("0"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("resultados_prova_idx").on(t.provaId),
    index("resultados_aluno_idx").on(t.alunoId),
  ]
);

export type User = typeof users.$inferSelect;
export type Prova = typeof provas.$inferSelect;
export type Questao = typeof questoes.$inferSelect;
export type Alternativa = typeof alternativas.$inferSelect;
export type RespostaAluno = typeof respostasAlunos.$inferSelect;
export type Resultado = typeof resultados.$inferSelect;

/** Configuração de limiares de desempenho (configurável pela coordenação). */
export const desempenhoThresholds = pgTable("desempenho_thresholds", {
  id: serial("id").primaryKey(),
  escolaId: uuid("escola_id").references(() => escolas.id, { onDelete: "cascade" }),
  verdeMin: integer("verde_min").notNull().default(80),    // 80-100: Satisfatório
  amareloMin: integer("amarelo_min").notNull().default(60), // 60-79: Em desenvolvimento
  laranjaMin: integer("laranja_min").notNull().default(40), // 40-59: Necessita acompanhamento
  // vermelho: 0-39: Necessita intervenção
  criadoEm: timestamp("criado_em", { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("thresholds_escola_idx").on(t.escolaId),
  unique("thresholds_escola_unique").on(t.escolaId),
]);
