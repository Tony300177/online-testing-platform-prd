import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  alternativas,
  provas,
  questoes,
  respostasAlunos,
  resultados,
  users,
  type User,
} from "./schema";

const NAMES = [
  "Maria Eduarda Silva",
  "João Pedro Santos",
  "Ana Clara Oliveira",
  "Lucas Gabriel Souza",
  "Beatriz Costa Lima",
  "Gabriel Henrique Rocha",
  "Laura Fernanda Alves",
  "Pedro Henrique Martins",
  "Isabela Cristina Nunes",
  "Matheus Vinícius Castro",
  "Sofia Helena Barbosa",
  "Davi Lucca Cardoso",
  "Alice Vitória Mendes",
  "Miguel Augusto Teixeira",
  "Manuela Rosa Pinto",
  "Arthur César Freitas",
  "Heloísa Maria Ramos",
  "Bernardo Antunes Vieira",
  "Valentina Duarte Moraes",
  "Heitor Sampaio Lopes",
  "Cecília Prado Farias",
  "Théo Almeida Bastos",
  "Lívia Ferraz Pires",
  "Samuel Marques Sales",
  "Eduarda Correia Monteiro",
  "Rafael Nogueira Teles",
  "Yasmin Campos Azevedo",
  "Enzo Bezerra Xavier",
];

const SCHOOLS = ["E.E. Monteiro Lobato", "Colégio Dom Pedro II", "E.M. Paulo Freire"];
const CLASSES = ["9º ano A", "9º ano B", "8º ano A", "8º ano B"];

const ESSAY_TEXTS = [
  "Na minha opinião, o tema abordado mostra como pequenas atitudes podem mudar a sociedade. É importante refletir sobre nossas escolhas todos os dias.",
  "O texto trata de um assunto muito presente no nosso cotidiano. Acredito que a educação é o caminho para conscientizar as pessoas sobre esse tema.",
  "Eu entendi que o problema apresentado precisa de soluções coletivas. Cada um deve fazer a sua parte, começando dentro de casa e na escola.",
  "A leitura me fez pensar sobre responsabilidade e empatia. Um bom exemplo é o trabalho em equipe, que exige respeito e cooperação.",
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // Acesso único: nome "admin@" / senha "123" — professor e administrador
  let admin: User;
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(inArray(users.email, ["admin@", "admin", "admin@avalialab.com.br"]))
    .limit(1);

  if (existingAdmin) {
    [admin] = await db
      .update(users)
      .set({ name: "admin@", email: "admin@", passwordHash: hash("123"), role: "admin", school: "Secretaria de Educação" })
      .where(eq(users.id, existingAdmin.id))
      .returning();
  } else {
    [admin] = await db
      .insert(users)
      .values({ name: "admin@", email: "admin@", passwordHash: hash("123"), role: "admin", school: "Secretaria de Educação" })
      .returning();
  }

  // Remove contas de demonstração antigas, transferindo as provas para o acesso único
  const demoAccounts = await db
    .select()
    .from(users)
    .where(inArray(users.email, ["ana.souza@avalialab.com.br", "carlos.lima@avalialab.com.br"]));
  for (const acc of demoAccounts) {
    await db.update(provas).set({ professorId: admin.id }).where(eq(provas.professorId, acc.id));
    await db.delete(users).where(eq(users.id, acc.id));
  }

  // Se já existem provas, mantém os dados existentes e apenas garante o acesso único
  const [existingProva] = await db.select({ id: provas.id }).from(provas).limit(1);
  if (existingProva) {
    console.log("Seed: dados existentes mantidos.");
    console.log("  • Acesso único: nome admin@ / senha 123 (professor e administrador)");
    return;
  }

  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

  async function insertProva({
    titulo,
    disciplina,
    turma,
    instrucoes,
    status,
    dataFim,
    codigo,
  }: {
    titulo: string;
    disciplina: string;
    turma: string;
    instrucoes: string;
    status: string;
    dataFim: Date | null;
    codigo: string | null;
  }) {
    const [prova] = await db
      .insert(provas)
      .values({
        titulo,
        disciplina,
        turma,
        instrucoes,
        professorId: admin.id,
        status,
        dataFim,
        codigo,
      })
      .returning();
    return prova;
  }

  type SeedQuestao = {
  pergunta: string;
  tipo?: "multiple" | "essay";
  valor?: number;
  alternativas?: { texto: string; correta: boolean }[];
};

  async function insertQuestao(
    provaId: number,
    q: SeedQuestao
  ) {
    const [questao] = await db
      .insert(questoes)
      .values({ provaId, pergunta: q.pergunta, tipo: q.tipo ?? "multiple", valor: String(q.valor ?? 1), ordem: 0, numero: 0 })
      .returning();
    if (q.alternativas && q.alternativas.length > 0) {
      await db.insert(alternativas).values(
        q.alternativas.map((a, i) => ({ questaoId: questao.id, letra: String.fromCharCode(65 + i), texto: a.texto, correta: a.correta }))
      );
    }
    return questao;
  }

  // ---------- Prova 1: Matemática (ativa) ----------
  const mathProva = await insertProva({
    titulo: "Avaliação de Matemática — 3º bimestre",
    disciplina: "Matemática",
    turma: "9º ano A",
    instrucoes: "Leia cada questão com atenção. Use rascunho para os cálculos e envie ao final.",
    status: "active",
    dataFim: days(7),
    codigo: "MAT9B3M",
  });

  const mathQuestions: SeedQuestao[] = [
    { pergunta: "Quanto é **3 × (4 + 5)**?", alternativas: [{ texto: "27", correta: true }, { texto: "21", correta: false }, { texto: "17", correta: false }, { texto: "24", correta: false }] },
    { pergunta: "Qual é o resultado de **12²**?", alternativas: [{ texto: "124", correta: false }, { texto: "144", correta: true }, { texto: "132", correta: false }, { texto: "120", correta: false }] },
    { pergunta: "Se um triângulo tem base **10 cm** e altura **6 cm**, qual é a sua área?", alternativas: [{ texto: "60 cm²", correta: false }, { texto: "16 cm²", correta: false }, { texto: "30 cm²", correta: true }, { texto: "36 cm²", correta: false }] },
    { pergunta: "Resolva a equação: **2x + 6 = 18**. Qual é o valor de x?", alternativas: [{ texto: "x = 12", correta: false }, { texto: "x = 6", correta: true }, { texto: "x = 3", correta: false }, { texto: "x = 9", correta: false }] },
    { pergunta: "O que significa o número **π (pi)**?", alternativas: [{ texto: "A razão entre o perímetro e o raio de qualquer círculo", correta: false }, { texto: "A razão entre a circunferência e o diâmetro de qualquer círculo", correta: true }, { texto: "O dobro do raio de uma circunferência", correta: false }, { texto: "Um número inteiro usado em equações", correta: false }] },
    { pergunta: "Qual fração é equivalente a **0,75**?", alternativas: [{ texto: "2/3", correta: false }, { texto: "1/4", correta: false }, { texto: "3/4", correta: true }, { texto: "7/10", correta: false }] },
    {
      pergunta: "**Problema:** uma loja dá 20% de desconto em um produto de R$ 250,00. \n\nExplique passo a passo como você calcularia o preço final e qual o valor do desconto.",
      tipo: "essay",
      valor: 2,
    },
    {
      pergunta: "Descreva com suas palavras a diferença entre *média aritmética* e *mediana*, dando um pequeno exemplo numérico.",
      tipo: "essay",
      valor: 2,
    },
  ];

  const mathQs: { id: number; tipo: string; corretaId: number | null }[] = [];
  for (let i = 0; i < mathQuestions.length; i++) {
    const q = await insertQuestao(mathProva.id, mathQuestions[i]);
    const alts = q.tipo === "multiple" ? await db.select().from(alternativas).where(eq(alternativas.questaoId, q.id)) : [];
    mathQs.push({
      id: q.id,
      tipo: q.tipo,
      corretaId: alts.find((a) => a.correta)?.id ?? null,
    });
  }

  // ---------- Prova 2: Ciências (ativa) ----------
  const sciProva = await insertProva({
    titulo: "Prova de Ciências — O Sistema Solar",
    disciplina: "Ciências",
    turma: "8º ano A",
    instrucoes: "Responda as questões sobre os planetas e o universo. Boa sorte!",
    status: "active",
    dataFim: days(5),
    codigo: "CIEN8SOL",
  });

  const sciQuestions: SeedQuestao[] = [
    { pergunta: "Qual é o **maior planeta** do Sistema Solar?", alternativas: [{ texto: "Terra", correta: false }, { texto: "Saturno", correta: false }, { texto: "Júpiter", correta: true }, { texto: "Netuno", correta: false }] },
    { pergunta: "Quantos planetas compõem o Sistema Solar?", alternativas: [{ texto: "7", correta: false }, { texto: "8", correta: true }, { texto: "9", correta: false }, { texto: "10", correta: false }] },
    { pergunta: "Qual astro é a **fonte principal de luz e calor** do nosso sistema?", alternativas: [{ texto: "A Lua", correta: false }, { texto: "O Sol", correta: true }, { texto: "A Estrela Polar", correta: false }, { texto: "Marte", correta: false }] },
    { pergunta: "O movimento de **rotação** da Terra é responsável por qual fenômeno?", alternativas: [{ texto: "As estações do ano", correta: false }, { texto: "O dia e a noite", correta: true }, { texto: "As fases da Lua", correta: false }, { texto: "Os eclipses", correta: false }] },
    { pergunta: "Qual planeta é conhecido como **Planeta Vermelho**?", alternativas: [{ texto: "Vênus", correta: false }, { texto: "Júpiter", correta: false }, { texto: "Marte", correta: true }, { texto: "Mercúrio", correta: false }] },
  ];

  const sciQs: { id: number; tipo: string; corretaId: number | null }[] = [];
  for (let i = 0; i < sciQuestions.length; i++) {
    const q = await insertQuestao(sciProva.id, sciQuestions[i]);
    const alts = await db.select().from(alternativas).where(eq(alternativas.questaoId, q.id));
    sciQs.push({ id: q.id, tipo: q.tipo, corretaId: alts.find((a) => a.correta)?.id ?? null });
  }

  // ---------- Prova 3: Redação (finalizada) ----------
  const essayProva = await insertProva({
    titulo: "Redação — Literatura Brasileira",
    disciplina: "Redação",
    turma: "9º ano A",
    instrucoes: "Produza um texto dissertativo sobre o papel da literatura na formação do cidadão.",
    status: "finished",
    dataFim: hoursAgo(24 * 3),
    codigo: "RED9BR",
  });
  const essayQs: { id: number; tipo: string; corretaId: number | null }[] = [];
  {
    const q = await insertQuestao(essayProva.id, {
      pergunta: "Escreva um texto dissertativo de **10 a 15 linhas** sobre:\n\n- A importância da leitura na juventude\n- Como os clássicos brasileiros ajudam a entender o país\n- Conclua com sua opinião pessoal",
      tipo: "essay",
      valor: 10,
    });
    essayQs.push({ id: q.id, tipo: q.tipo, corretaId: null });
  }

  // ---------- Rascunho ----------
  await insertProva({
    titulo: "Quiz de História — Brasil Colônia",
    disciplina: "História",
    turma: "8º ano A",
    instrucoes: "Quiz rápido para revisão antes da prova principal.",
    status: "draft",
    dataFim: days(10),
    codigo: null,
  });

  // ---------- Resultados fictícios ----------
  const rng = mulberry32(42);

  async function seedResultados(
    provaId: number,
    qs: { id: number; tipo: string; corretaId: number | null }[],
    count: number,
    classPool: string[]
  ) {
    for (let i = 0; i < count; i++) {
      const name = NAMES[Math.floor(rng() * NAMES.length)];
      const studentClass = classPool[Math.floor(rng() * classPool.length)];
      const school = SCHOOLS[Math.floor(rng() * SCHOOLS.length)];

      const mcQuestions = qs.filter((q) => q.tipo !== "essay");
      let acertos = 0;
      const rows: { questaoId: number; alternativaId: number | null; textoResposta: string | null; correta: boolean | null }[] = [];

      for (const q of qs) {
        if (q.tipo === "essay") {
          rows.push({ questaoId: q.id, alternativaId: null, textoResposta: ESSAY_TEXTS[Math.floor(rng() * ESSAY_TEXTS.length)], correta: null });
        } else {
          const isCorrect = rng() < 0.68;
          let selected: number | null = null;
          if (isCorrect) {
            selected = q.corretaId;
            acertos += 1;
          } else {
            const wrong = await db
              .select({ id: alternativas.id })
              .from(alternativas)
              .where(eq(alternativas.questaoId, q.id));
            const pool = wrong.filter((a) => a.id !== q.corretaId);
            selected = pool[Math.floor(rng() * pool.length)]?.id ?? null;
          }
          rows.push({ questaoId: q.id, alternativaId: selected, textoResposta: null, correta: isCorrect });
        }
      }

      const totalMultiple = mcQuestions.length;
      const erros = totalMultiple - acertos;
      const percentual = totalMultiple > 0 ? Math.round((acertos / totalMultiple) * 10000) / 100 : 0;
      const nota = Math.round((percentual / 10) * 100) / 100;

      const [resultado] = await db
        .insert(resultados)
        .values({
          provaId,
          alunoNome: name,
          alunoTurma: studentClass,
          escolaNome: school,
          acertos,
          erros,
          nota: String(nota),
          percentual: String(percentual),
          criadoEm: hoursAgo(Math.floor(rng() * 24 * 6)),
        })
        .returning();

      await db.insert(respostasAlunos).values(
        rows.map((r) => ({
          provaId,
          alunoNome: name,
          alunoTurma: studentClass,
          escolaNome: school,
          resultadoId: resultado.id,
          respondidaEm: resultado.criadoEm,
          ...r,
        }))
      );
    }
  }

  await seedResultados(mathProva.id, mathQs, 26, ["9º ano A", "9º ano B"]);
  await seedResultados(sciProva.id, sciQs, 18, ["8º ano A", "8º ano B"]);
  await seedResultados(essayProva.id, essayQs, 9, ["9º ano A"]);

  console.log("Seed concluído:");
  console.log("  • Acesso único: nome admin@ / senha 123 (professor e administrador)");
  console.log("  • Prova aluno (Matemática): /prova/MAT9B3M");
  console.log("  • Prova aluno (Ciências): /prova/CIEN8SOL");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });