import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { commitEscolaPlanilha } from "@/lib/planilha-unica";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10000;

/** Passo 8-9: grava turmas e alunos de UMA escola da planilha (em chunks, com retry). */
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

  if (rows.length === 0) return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por arquivo.` }, { status: 400 });
  }
  if (!escolaCodigo) return NextResponse.json({ error: "Informe a escola." }, { status: 400 });

  try {
    const data = await commitEscolaPlanilha(rows, escolaCodigo, anoLetivo);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("Erro ao importar escola da planilha:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao importar a planilha." },
      { status: 500 }
    );
  }
}