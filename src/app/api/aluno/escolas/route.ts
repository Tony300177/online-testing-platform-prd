import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { escolas } from "@/db/schema";
import { checarLimite, chavePorIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Escolas ativas para a cascata de acesso do aluno. Não é dado pessoal (nome e
 * código), mas fica com rate limit para conter varredura automatizada.
 */
export async function GET(req: Request) {
  const limite = checarLimite(chavePorIp(req, "aluno-escolas"), 30);
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde um instante e tente novamente." },
      { status: 429 }
    );
  }

  const rows = await db
    .select({ id: escolas.id, codigo: escolas.codigo, nome: escolas.nome })
    .from(escolas)
    .where(eq(escolas.ativo, true))
    .orderBy(asc(escolas.codigo), asc(escolas.nome));

  return NextResponse.json({ ok: true, escolas: rows });
}
