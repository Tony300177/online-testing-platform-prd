import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchEstatisticas, parseAlunoFilters } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Agregações por etnia, gênero, bairro, turma e professor. Acesso: admin. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const url = new URL(req.url);
  const filters = parseAlunoFilters(url.searchParams);
  const stats = await fetchEstatisticas(filters);

  return NextResponse.json({ ok: true, ...stats });
}