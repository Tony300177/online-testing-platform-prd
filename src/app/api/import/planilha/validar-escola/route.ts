import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { validarEscolaPlanilha } from "@/lib/planilha-unica";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10000;

/** Passo 4-7: valida (dry-run) turmas e alunos de UMA escola da planilha. Não grava nada. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const escolaCodigo = Number.isFinite(Number(body.escolaCodigo)) ? Number(body.escolaCodigo) : undefined;
  const anoLetivo = Number.isFinite(Number(body.anoLetivo)) ? Number(body.anoLetivo) : undefined;

  if (rows.length === 0) return NextResponse.json({ error: "Nenhuma linha para validar." }, { status: 400 });
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por arquivo.` }, { status: 400 });
  }
  if (!escolaCodigo) return NextResponse.json({ error: "Informe a escola." }, { status: 400 });

  try {
    const data = await validarEscolaPlanilha(rows, escolaCodigo, anoLetivo);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("Erro ao validar escola da planilha:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao validar a planilha." }, { status: 500 });
  }
}