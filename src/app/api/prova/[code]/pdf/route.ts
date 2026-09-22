import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { aplicacoes, provas } from "@/db/schema";
import { isExamClosed } from "@/lib/utils";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Endpoint público que entrega o arquivo PDF da prova para visualização.
 * Só está disponível enquanto a prova estiver ativa (mesma regra do acesso às questões).
 * Aceita código de uma prova publicada ou de uma aplicação (com ?turmaId= para a réplica).
 */
export async function GET(req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const url = new URL(req.url);
  const turmaId = url.searchParams.get("turmaId");

  const [prova] = await db.select().from(provas).where(eq(provas.codigo, code)).limit(1);

  let arquivo = prova;
  if (!prova) {
    const [aplicacao] = await db.select().from(aplicacoes).where(eq(aplicacoes.codigo, code)).limit(1);
    if (aplicacao && turmaId) {
      [arquivo] = await db
        .select()
        .from(provas)
        .where(and(eq(provas.aplicacaoId, aplicacao.id), eq(provas.turmaId, turmaId)))
        .limit(1);
    }
  }

  if (!arquivo || arquivo.status === "draft" || isExamClosed(arquivo) || !arquivo.arquivoBase64) {
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
      "Cache-Control": "public, max-age=3600",
    },
  });
}