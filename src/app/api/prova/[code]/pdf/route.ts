import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { provas } from "@/db/schema";
import { resolverEscopoCodigo } from "@/lib/acesso-prova";
import { checarLimite, chavePorIp } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ code: string }> };

/**
 * PDF da prova para visualização.
 *
 * Aplica as mesmas regras do código (publicada e dentro da janela) e exige que a
 * turma da réplica esteja no escopo daquele código. Sai com `private, no-store`:
 * o anterior era `public, max-age=3600`, o que deixava o gabarito da prova
 * guardado em cache compartilhado e servido mesmo após o encerramento.
 */
export async function GET(req: Request, { params }: Ctx) {
  const limite = checarLimite(chavePorIp(req, "prova-pdf"), 30);
  if (!limite.ok) {
    return NextResponse.json(
      { ok: false, error: "Muitas solicitações. Aguarde um instante." },
      { status: 429 }
    );
  }

  const code = ((await params).code ?? "").trim().toUpperCase();
  const turmaId = new URL(req.url).searchParams.get("turmaId")?.trim() ?? "";

  const escopo = await resolverEscopoCodigo(code);
  if (!escopo.ok) {
    return NextResponse.json({ ok: false, error: "Prova não encontrada." }, { status: 404 });
  }

  let arquivo: typeof provas.$inferSelect | undefined;

  if (escopo.aplicacaoId === null) {
    // Prova avulsa: o próprio código é a credencial.
    [arquivo] = await db.select().from(provas).where(eq(provas.codigo, code)).limit(1);
  } else {
    // Aplicação: a réplica é por turma, e a turma precisa estar no escopo.
    if (!turmaId || !escopo.turmaIds.includes(turmaId)) {
      return NextResponse.json({ ok: false, error: "Prova não encontrada." }, { status: 404 });
    }
    [arquivo] = await db
      .select()
      .from(provas)
      .where(and(eq(provas.aplicacaoId, escopo.aplicacaoId), eq(provas.turmaId, turmaId)))
      .limit(1);
  }

  if (!arquivo?.arquivoBase64) {
    return NextResponse.json({ ok: false, error: "Prova não encontrada." }, { status: 404 });
  }

  const buffer = Buffer.from(arquivo.arquivoBase64, "base64");
  const safeName = (arquivo.arquivoNome ?? "prova.pdf").replace(/[^\w.\- ]/g, "");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
