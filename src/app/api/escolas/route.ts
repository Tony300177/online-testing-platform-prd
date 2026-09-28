import { asc, eq, and, inArray, max } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, escolas, matriculas, turmas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { resolverEscopoCodigo } from "@/lib/acesso-prova";

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
 * Escolas, turmas e alunos para a identificação na tela da prova.
 *
 * Antes isto era público e devolvia a rede inteira — 19 escolas, todas as turmas
 * e os ~5.000 alunos — em um único GET sem autenticação. Agora exige uma das
 * duas credenciais: sessão de professor/admin, ou o código da prova (que
 * restringe o resultado às turmas que aquele código cobre).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();

  const url = new URL(req.url);
  const codigo = url.searchParams.get("codigo") ?? "";
  const escopo = codigo ? await resolverEscopoCodigo(codigo) : null;

  // Escopo do código: só as turmas que ele cobre. Sem turma no escopo (prova
  // avulsa sem turma vinculada, ou código expirado) não há o que mostrar.
  if (escopo && (!escopo.ok || escopo.turmaIds.length === 0)) {
    return NextResponse.json({ error: "Código da prova inválido ou fora do prazo." }, { status: 403 });
  }

  // Sem sessão, o escopo tem de vir do código: é o que impede a enumeração da rede.
  if (!user && !escopo?.ok) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const limiteTurmas = escopo?.ok ? escopo.turmaIds : null;

  const todasTurmas = await db
    .select()
    .from(turmas)
    .where(eq(turmas.anoLetivo, ANO_LETIVO))
    .orderBy(asc(turmas.nome));
  const turmasRows = user ? todasTurmas : todasTurmas.filter((t) => limiteTurmas!.includes(t.id));

  // Escolas visíveis: as do escopo, mais as das turmas liberadas (a aplicação pode
  // não ter linha em aplicacao_escolas; a turma sempre traz a escola dela).
  const todasEscolas = await db.select().from(escolas).orderBy(asc(escolas.codigo));
  const schools = user
    ? todasEscolas
    : todasEscolas.filter(
        (e) =>
          escopo!.ok &&
          (escopo!.escolaIds.includes(e.id) || turmasRows.some((t) => t.escolaId === e.id))
      );

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
      user
        ? and(eq(matriculas.anoLetivo, ANO_LETIVO), eq(matriculas.status, "ativo"))
        : and(
            eq(matriculas.anoLetivo, ANO_LETIVO),
            eq(matriculas.status, "ativo"),
            inArray(matriculas.turmaId, limiteTurmas!)
          )
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
