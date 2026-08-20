import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { provas } from "@/db/schema";
import { isExamClosed } from "@/lib/utils";

type Ctx = { params: Promise<{ code: string }> };

/**
 * Endpoint público que entrega o arquivo PDF da prova para visualização.
 * Só está disponível enquanto a prova estiver ativa (mesma regra do acesso às questões).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = ((await params).code ?? "").trim().toUpperCase();
  const [prova] = await db.select().from(provas).where(eq(provas.codigo, code)).limit(1);

  if (!prova || prova.status === "draft" || isExamClosed(prova) || !prova.arquivoBase64) {
    return NextResponse.json({ ok: false, error: "Prova não encontrada." }, { status: 404 });
  }

  const buffer = Buffer.from(prova.arquivoBase64, "base64");
  const safeName = (prova.arquivoNome ?? "prova.pdf").replace(/[^\w.\- ]/g, "");

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