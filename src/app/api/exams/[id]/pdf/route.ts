import { NextResponse } from "next/server";
import { db } from "@/db";
import { provas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

/** Serve o PDF de uma prova (rascunho) para pré-visualização no formulário. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const id = Number((await params).id);
  const [prova] = await db.select().from(provas).where(eq(provas.id, id)).limit(1);
  if (!prova) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (user.role !== "admin" && user.id !== prova.professorId) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
  if (!prova.arquivoBase64) {
    return NextResponse.json({ error: "Esta prova não possui PDF." }, { status: 404 });
  }

  const buf = Buffer.from(prova.arquivoBase64, "base64");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(prova.arquivoNome ?? "prova.pdf")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}