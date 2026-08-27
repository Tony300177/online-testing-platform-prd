import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alunos,
  escolas,
  matriculas,
  professores,
  turmas,
} from "@/db/schema";

const ANO_LETIVO = 2026;

export type AlunoFilters = {
  escola?: string;
  turma?: string;
  etnia?: string;
  genero?: string;
  bairro?: string;
  professor?: string;
  search?: string;
  anoLetivo?: number;
};

export type AlunoDetalhado = {
  id: string;
  nome: string;
  matricula: string | null;
  numeroChamada: number | null;
  sexo: string | null;
  etnia: string | null;
  bairro: string | null;
  dataNascimento: Date | null;
  turmaId: string;
  turmaNome: string;
  turno: string | null;
  anoLetivo: number;
  escolaNome: string;
  professorNome: string | null;
};

export type Serie = { label: string; value: number };

export type Estatisticas = {
  totalAlunos: number;
  totalTurmas: number;
  totalProfessores: number;
  totalEscolas: number;
  porEtnia: Serie[];
  porGenero: Serie[];
  porBairro: Serie[];
  porTurma: Serie[];
  porProfessor: Serie[];
};

function buildWhere(f: AlunoFilters) {
  const ano = f.anoLetivo ?? ANO_LETIVO;
  const c: ReturnType<typeof eq>[] = [eq(matriculas.anoLetivo, ano), eq(matriculas.status, "ativo")];
  if (f.escola) c.push(eq(escolas.nome, f.escola));
  if (f.turma) c.push(eq(turmas.nome, f.turma));
  if (f.etnia) c.push(eq(alunos.etnia, f.etnia));
  if (f.genero) c.push(eq(alunos.sexo, f.genero));
  if (f.bairro) c.push(eq(alunos.bairro, f.bairro));
  if (f.professor) c.push(eq(professores.nome, f.professor));
  if (f.search) c.push(ilike(alunos.nome, `%${f.search}%`));
  return c;
}

function buildJoins() {
  return db
    .select({
      alunoId: alunos.id,
      alunoNome: alunos.nome,
      matricula: alunos.matricula,
      numeroChamada: alunos.numeroChamada,
      sexo: alunos.sexo,
      etnia: alunos.etnia,
      bairro: alunos.bairro,
      dataNascimento: alunos.dataNascimento,
      turmaId: turmas.id,
      turmaNome: turmas.nome,
      turno: turmas.turno,
      anoLetivo: matriculas.anoLetivo,
      escolaNome: escolas.nome,
      professorNome: professores.nome,
    })
    .from(alunos)
    .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
    .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
    .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
    .leftJoin(professores, eq(turmas.professorId, professores.id));
}

/** Lista detalhada de alunos com turma/escola/professor, conforme filtros. */
export async function fetchAlunosDetalhados(f: AlunoFilters = {}): Promise<AlunoDetalhado[]> {
  const rows = await buildJoins()
    .where(and(...buildWhere(f)))
    .orderBy(asc(escolas.nome), asc(turmas.nome), asc(alunos.numeroChamada), asc(alunos.nome));

  return rows.map((r) => ({
    id: r.alunoId,
    nome: r.alunoNome,
    matricula: r.matricula,
    numeroChamada: r.numeroChamada,
    sexo: r.sexo,
    etnia: r.etnia,
    bairro: r.bairro,
    dataNascimento: r.dataNascimento,
    turmaId: r.turmaId,
    turmaNome: r.turmaNome,
    turno: r.turno,
    anoLetivo: r.anoLetivo,
    escolaNome: r.escolaNome,
    professorNome: r.professorNome,
  }));
}

/** Valores distintos dos campos demográficos (para montar os filtros). */
export async function fetchOpcoesFiltros() {
  const [etnias, generos, bairros, escolasList, turmasList, professoresList] = await Promise.all([
    db.select({ etnia: alunos.etnia }).from(alunos).where(sql`${alunos.etnia} is not null`).groupBy(alunos.etnia).orderBy(asc(alunos.etnia)),
    db.select({ sexo: alunos.sexo }).from(alunos).where(sql`${alunos.sexo} is not null`).groupBy(alunos.sexo).orderBy(asc(alunos.sexo)),
    db.select({ bairro: alunos.bairro }).from(alunos).where(sql`${alunos.bairro} is not null`).groupBy(alunos.bairro).orderBy(asc(alunos.bairro)),
    db.select({ nome: escolas.nome }).from(escolas).orderBy(asc(escolas.nome)),
    db
      .select({ id: turmas.id, nome: turmas.nome, escolaNome: escolas.nome })
      .from(turmas)
      .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
      .orderBy(asc(escolas.nome), asc(turmas.nome)),
    db.select({ nome: professores.nome }).from(professores).orderBy(asc(professores.nome)),
  ]);
  return {
    etnias: etnias.map((r) => r.etnia).filter(Boolean) as string[],
    generos: generos.map((r) => r.sexo).filter(Boolean) as string[],
    bairros: bairros.map((r) => r.bairro).filter(Boolean) as string[],
    escolas: escolasList.map((r) => r.nome),
    turmas: turmasList.map((r) => ({ nome: r.nome, escola: r.escolaNome })),
    professores: professoresList.map((r) => r.nome),
  };
}

/** Agregações por etnia, gênero, bairro, turma e professor (com filtros). */
export async function fetchEstatisticas(f: AlunoFilters = {}): Promise<Estatisticas> {
  const where = buildWhere(f);

  async function byField(field: typeof alunos.etnia | typeof alunos.sexo | typeof alunos.bairro): Promise<Serie[]> {
    const rows = await db
      .select({ label: field, value: count() })
      .from(alunos)
      .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
      .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
      .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
      .leftJoin(professores, eq(turmas.professorId, professores.id))
      .where(and(...where, sql`${field} is not null`))
      .groupBy(field)
      .orderBy(descCount());
    return rows.map((r) => ({ label: String(r.label ?? ""), value: Number(r.value) }));
  }

  const [porEtnia, porGenero, porBairro, porTurma, porProfessor, totalAlunos] = await Promise.all([
    byField(alunos.etnia),
    byField(alunos.sexo),
    byField(alunos.bairro),
    db
      .select({ label: turmas.nome, value: count() })
      .from(alunos)
      .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
      .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
      .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
      .leftJoin(professores, eq(turmas.professorId, professores.id))
      .where(and(...where))
      .groupBy(turmas.id, turmas.nome)
      .orderBy(descCount()),
    db
      .select({ label: professores.nome, value: count() })
      .from(alunos)
      .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
      .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
      .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
      .innerJoin(professores, eq(turmas.professorId, professores.id))
      .where(and(...where))
      .groupBy(professores.id, professores.nome)
      .orderBy(descCount()),
    db
      .select({ value: count() })
      .from(alunos)
      .innerJoin(matriculas, eq(matriculas.alunoId, alunos.id))
      .innerJoin(turmas, eq(matriculas.turmaId, turmas.id))
      .innerJoin(escolas, eq(turmas.escolaId, escolas.id))
      .leftJoin(professores, eq(turmas.professorId, professores.id))
      .where(and(...where)),
  ]);

  const [totalTurmas, totalProfessores, totalEscolas] = await Promise.all([
    db
      .select({ value: count() })
      .from(turmas)
      .where(eq(turmas.anoLetivo, f.anoLetivo ?? ANO_LETIVO)),
    db.select({ value: count() }).from(professores),
    db.select({ value: count() }).from(escolas),
  ]);

  return {
    totalAlunos: totalAlunos[0]?.value ?? 0,
    totalTurmas: totalTurmas[0]?.value ?? 0,
    totalProfessores: totalProfessores[0]?.value ?? 0,
    totalEscolas: totalEscolas[0]?.value ?? 0,
    porEtnia,
    porGenero,
    porBairro: porBairro.slice(0, 12),
    porTurma,
    porProfessor: porProfessor.slice(0, 12),
  };
}

function descCount() {
  return sql`count(*) desc`;
}

/** Converte query string em filtros tipados. */
export function parseAlunoFilters(params: URLSearchParams): AlunoFilters {
  const get = (k: string) => {
    const v = params.get(k);
    return v ? v.trim() : undefined;
  };
  const filters: AlunoFilters = {};
  const escola = get("escola");
  const turma = get("turma");
  const etnia = get("etnia");
  const genero = get("genero");
  const bairro = get("bairro");
  const professor = get("professor");
  const search = get("busca");
  const ano = get("ano");
  if (escola) filters.escola = escola;
  if (turma) filters.turma = turma;
  if (etnia) filters.etnia = etnia;
  if (genero) filters.genero = genero;
  if (bairro) filters.bairro = bairro;
  if (professor) filters.professor = professor;
  if (search) filters.search = search;
  if (ano && Number.isFinite(Number(ano))) filters.anoLetivo = Number(ano);
  return filters;
}