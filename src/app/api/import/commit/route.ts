import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { commitImport } from "@/lib/import";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/** Valida e grava a planilha de forma idempotente. Acesso: admin. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const body = (await req.json().catch(() => null)) ?? {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const anoLetivo = Number.isFinite(Number(body.anoLetivo)) ? Number(body.anoLetivo) : undefined;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Máximo de ${MAX_ROWS} linhas por arquivo.` }, { status: 400 });
  }

  const report = await commitImport(rows, anoLetivo);
  return NextResponse.json({ ok: true, report });
}