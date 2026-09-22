import { asc, eq, and, max } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, escolas, matriculas, turmas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;

type TurmaInput = { nome: string; ano: string; turno: string; professor?: string | null };

/** Cadastra uma escola com suas turmas (acesso de professor ou administrador). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = (await req.json().catch(() => null)) ?? {};
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const tipo = typeof body.tipo === "string" && body.tipo.trim() ? body.tipo.trim() : null;
  const codigoInput = Number.isFinite(Number(body.codigo)) && Number(body.codigo) > 0 ? Math.trunc(Number(body.codigo)) : null;
  const turmasInput = Array.isArray(body.turmas) ? (body.turmas as TurmaInput[]) : [];

  if (nome.length < 3) {
    return NextResponse.json({ error: "Informe o nome da escola (mínimo 3 letras)." }, { status: 400 });
  }
  if (turmasInput.length > 0) {
    for (const t of turmasInput) {
      if (!t || typeof t.nome !== "string" || t.nome.trim().length < 2) {
        return NextResponse.json({ error: "Informe o nome de cada turma." }, { status: 400 });
      }
      if (typeof t.ano !== "string" || !t.ano.trim()) {
        return NextResponse.json({ error: "Informe o ano/série de cada turma." }, { status: 400 });
      }
      if (typeof t.turno !== "string" || !t.turno.trim()) {
        return NextResponse.json({ error: "Informe o turno de cada turma." }, { status: 400 });
      }
    }
  }

  const [maxEscola] = await db.select({ m: max(escolas.codigo) }).from(escolas);
  const [maxTurma] = await db.select({ m: max(turmas.codigo) }).from(turmas);
  const escolaCodigo = codigoInput ?? (maxEscola?.m ?? 0) + 1;
  let turmaCodigo = (maxTurma?.m ?? 0) + 1;

  const { id: escolaId, created } = await db.transaction(async (tx) => {
    // Escola pré-cadastrada (19 unidades): reutiliza/atualiza pelo código em vez de criar duplicada.
    const existing = codigoInput !== null ? await tx.select().from(escolas).where(eq(escolas.codigo, codigoInput)) : [];
    if (existing.length > 0) {
      await tx
        .update(escolas)
        .set({ nome: existing[0].nome, tipo: tipo ?? existing[0].tipo, ativo: true })
        .where(eq(escolas.id, existing[0].id));
      for (const t of turmasInput) {
        await tx.insert(turmas).values({
          escolaId: existing[0].id,
          codigo: turmaCodigo++,
          nome: t.nome.trim(),
          ano: t.ano.trim(),
          turno: t.turno.trim(),
          professor: typeof t.professor === "string" && t.professor.trim() ? t.professor.trim() : null,
          anoLetivo: ANO_LETIVO,
        });
      }
      return { id: existing[0].id, created: false };
    }
    const [escola] = await tx
      .insert(escolas)
      .values({ nome, codigo: escolaCodigo, tipo })
      .returning({ id: escolas.id });
    for (const t of turmasInput) {
      await tx.insert(turmas).values({
        escolaId: escola.id,
        codigo: turmaCodigo++,
        nome: t.nome.trim(),
        ano: t.ano.trim(),
        turno: t.turno.trim(),
        professor: typeof t.professor === "string" && t.professor.trim() ? t.professor.trim() : null,
        anoLetivo: ANO_LETIVO,
      });
    }
    return { id: escola.id, created: true };
  });

  return NextResponse.json({ ok: true, id: escolaId, nome, turmas: turmasInput.length, created });
}

/**
 * Endpoint público usado na identificação do aluno (tela da prova).
 * Retorna escolas com suas turmas e os alunos matriculados no ano letivo.
 */
export async function GET() {
  const schools = await db.select().from(escolas).orderBy(asc(escolas.codigo));

  const turmasRows = await db
    .select()
    .from(turmas)
    .where(eq(turmas.anoLetivo, ANO_LETIVO))
    .orderBy(asc(turmas.nome));

  const matRows = await db
    .select({
      alunoId: matriculas.alunoId,
      turmaId: matriculas.turmaId,
      nome: alunos.nome,
      numeroChamada: alunos.numeroChamada,
    })
    .from(matriculas)
    .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
    .where(
      and(eq(matriculas.anoLetivo, ANO_LETIVO), eq(matriculas.status, "ativo"))
    )
    .orderBy(asc(alunos.numeroChamada));

  const byTurma = new Map<string, { id: string; nome: string; numeroChamada: number | null }[]>();
  for (const m of matRows) {
    const list = byTurma.get(m.turmaId) ?? [];
    list.push({ id: m.alunoId, nome: m.nome, numeroChamada: m.numeroChamada });
    byTurma.set(m.turmaId, list);
  }

  const result = schools.map((e) => ({
    id: e.id,
    nome: e.nome,
    turmas: turmasRows
      .filter((t) => t.escolaId === e.id)
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        ano: t.ano,
        turno: t.turno,
        professor: t.professor,
        alunos: byTurma.get(t.id) ?? [],
      })),
  }));

  return NextResponse.json({ ok: true, anoLetivo: ANO_LETIVO, escolas: result });
}
