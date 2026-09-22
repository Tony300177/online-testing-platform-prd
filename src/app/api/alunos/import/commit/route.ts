import { NextResponse } from "next/server";
import { commitAlunoImport } from "@/lib/aluno-import";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Confirma e grava a importação de alunos da escola selecionada. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const escolaId = typeof body.escolaId === "string" ? body.escolaId.trim() : "";
  const turmaId = typeof body.turmaId === "string" && body.turmaId.trim() ? body.turmaId.trim() : undefined;
  const anoLetivo = Number.isFinite(Number(body.anoLetivo)) ? Number(body.anoLetivo) : undefined;
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!escolaId) return NextResponse.json({ error: "Selecione a escola." }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: "Nenhuma linha de dados encontrada." }, { status: 400 });

  try {
    const report = await commitAlunoImport(rows, { escolaId, turmaId, anoLetivo });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("Erro ao importar alunos:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao importar a planilha." },
      { status: 500 }
    );
  }
}