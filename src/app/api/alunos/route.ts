import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alunos, matriculas, turmas } from "@/db/schema";
import { getSessionUser, STUDENT_DEFAULT_PASSWORD } from "@/lib/auth";
import { normalize } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;

/** Cadastra um aluno e o matricula na turma (acesso de professor ou administrador). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = (await req.json().catch(() => null)) ?? {};
  const escolaId = typeof body.escolaId === "string" ? body.escolaId.trim() : "";
  const turmaId = typeof body.turmaId === "string" ? body.turmaId.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const matricula = typeof body.matricula === "string" ? body.matricula.trim() : "";
  const numeroChamada = body.numeroChamada === "" || body.numeroChamada === null || body.numeroChamada === undefined
    ? null
    : Number(body.numeroChamada);

  if (!escolaId) return NextResponse.json({ error: "Selecione a escola." }, { status: 400 });
  if (!turmaId) return NextResponse.json({ error: "Selecione a turma." }, { status: 400 });
  if (nome.length < 3) {
    return NextResponse.json({ error: "Informe o nome completo do aluno (mínimo 3 letras)." }, { status: 400 });
  }
  if (numeroChamada !== null && (!Number.isFinite(numeroChamada) || numeroChamada <= 0)) {
    return NextResponse.json({ error: "Número de chamada inválido." }, { status: 400 });
  }

  const [turma] = await db
    .select({ id: turmas.id, escolaId: turmas.escolaId, nome: turmas.nome })
    .from(turmas)
    .where(and(eq(turmas.id, turmaId), eq(turmas.anoLetivo, ANO_LETIVO)))
    .limit(1);
  if (!turma || turma.escolaId !== escolaId) {
    return NextResponse.json({ error: "Turma não encontrada para a escola selecionada." }, { status: 400 });
  }

  const existing = await db.select().from(alunos).limit(1000);
  const samePerson = existing.find((a) => normalize(a.nome) === normalize(nome)) ?? null;

  if (samePerson) {
    const [mat] = await db
      .select({ id: matriculas.id })
      .from(matriculas)
      .where(
        and(
          eq(matriculas.alunoId, samePerson.id),
          eq(matriculas.turmaId, turmaId),
          eq(matriculas.anoLetivo, ANO_LETIVO)
        )
      )
      .limit(1);
    if (mat) {
      return NextResponse.json(
        { error: `O aluno ${samePerson.nome} já está cadastrado nesta turma.` },
        { status: 409 }
      );
    }
  }

  let alunoId = "";
  await db.transaction(async (tx) => {
    let novoId: string;
    if (samePerson) {
      await tx
        .update(alunos)
        .set({
          senhaHash: samePerson.senhaHash ?? bcrypt.hashSync(STUDENT_DEFAULT_PASSWORD, 10),
          numeroChamada: samePerson.numeroChamada ?? numeroChamada,
          matricula: samePerson.matricula ?? (matricula || null),
        })
        .where(eq(alunos.id, samePerson.id));
      novoId = samePerson.id;
    } else {
      const [novo] = await tx
        .insert(alunos)
        .values({
          nome,
          matricula: matricula || null,
          numeroChamada,
          senhaHash: bcrypt.hashSync(STUDENT_DEFAULT_PASSWORD, 10),
        })
        .returning({ id: alunos.id });
      novoId = novo.id;
    }
    await tx.insert(matriculas).values({
      alunoId: novoId,
      turmaId,
      anoLetivo: ANO_LETIVO,
      status: "ativo",
    });
    alunoId = novoId;
  });

  return NextResponse.json({
    ok: true,
    id: alunoId,
    nome: samePerson?.nome ?? nome,
    turma: turma.nome,
    senha: STUDENT_DEFAULT_PASSWORD,
  });
}