import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { identificarPlanilha } from "@/lib/planilha-unica";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10000;

/** Passo 1-3: lê o arquivo, agrupa as linhas por escola e compara com o banco. Não grava nada. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) ?? {};
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha para identificar." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por arquivo.` }, { status: 400 });
  }

  try {
    const data = await identificarPlanilha(rows);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("Erro ao identificar planilha:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao analisar a planilha." }, { status: 500 });
  }
}