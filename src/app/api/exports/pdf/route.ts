import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { alternativas, respostasAlunos } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fetchExportData, hardestQuestions } from "@/lib/exports";
import { formatDateTime } from "@/lib/utils";

/** Gera um relatório PDF formatado com resumo e lista de respostas. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const url = new URL(req.url);
  const provaId = url.searchParams.get("examId") ?? url.searchParams.get("provaId");
  const id = provaId ? Number(provaId) : undefined;
  const school = url.searchParams.get("school") || undefined;
  const studentClass = url.searchParams.get("class") || undefined;

  const { rows, prova, questions } = await fetchExportData(user, { provaId: id, school, studentClass });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cabeçalho colorido
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SabeTudo — Relatório de Respostas", 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatDateTime(new Date())} por ${user.name}`, 14, 20);

  // Filtros aplicados
  const filterParts: string[] = [];
  if (prova) filterParts.push(`Prova: ${prova.titulo}`);
  if (school) filterParts.push(`Escola: ${school}`);
  if (studentClass) filterParts.push(`Turma: ${studentClass}`);
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.text(
    filterParts.length > 0 ? `Filtros: ${filterParts.join("  |  ")}` : "Filtros: todas as respostas",
    14,
    39
  );

  // Resumo
  const total = rows.length;
  const withScore = rows.filter((r) => r.score !== null);
  const avgScore = withScore.length > 0 ? withScore.reduce((acc, r) => acc + (r.score ?? 0), 0) / withScore.length : null;
  const totalMc = rows.reduce((acc, r) => acc + r.correctCount + r.erros, 0);
  const totalCorrect = rows.reduce((acc, r) => acc + r.correctCount, 0);
  const correctRate = totalMc > 0 ? (totalCorrect / totalMc) * 100 : null;

  autoTable(doc, {
    startY: 44,
    head: [["Métrica", "Valor"]],
    body: [
      ["Total de respostas enviadas", String(total)],
      ["Média de notas (múltipla escolha)", avgScore === null ? "—" : avgScore.toLocaleString("pt-BR", { maximumFractionDigits: 2 })],
      ["Taxa média de acertos", correctRate === null ? "—" : `${correctRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`],
      ["Total de questões objetivas respondidas", String(totalMc)],
    ],
    theme: "striped",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: "bold" } },
  });

  const afterSummary = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 48) + 8;

  // Lista de respostas
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Respostas dos alunos", 14, afterSummary);

  const hasPerQuestion = Boolean(prova && questions.length > 0);
  const head = hasPerQuestion
    ? ["Aluno", "Nº", "Turma", "Escola", "Nota", "Acertos", ...questions.map((_, i) => `Q${i + 1}`)]
    : ["Aluno", "Nº", "Turma", "Escola", "Prova", "Nota", "Acertos", "Enviada em"];

  if (rows.length > 0) {
    // Busca as respostas por questão quando filtrado por uma única prova
    let answerMap = new Map<number, Map<number, { letra: string | null; textoResposta: string | null; correta: boolean | null }>>();
    if (hasPerQuestion && id) {
      const ans = await db
        .select({
          resultadoId: respostasAlunos.resultadoId,
          questaoId: respostasAlunos.questaoId,
          letra: alternativas.letra,
          textoResposta: respostasAlunos.textoResposta,
          correta: respostasAlunos.correta,
        })
        .from(respostasAlunos)
        .leftJoin(alternativas, eq(alternativas.id, respostasAlunos.alternativaId));
      for (const a of ans) {
        const rid = a.resultadoId ?? 0;
        if (!answerMap.has(rid)) answerMap.set(rid, new Map());
        answerMap.get(rid)!.set(a.questaoId, a);
      }
    }

    autoTable(doc, {
      startY: afterSummary + 3,
      head: [head],
      body: rows.map((r) => {
        const base = [
          r.alunoNome,
          r.numeroChamada === null ? "—" : String(r.numeroChamada).padStart(3, "0"),
          r.alunoTurma,
          r.escolaNome,
        ];
        const score = r.score === null ? "—" : r.score.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
        if (!hasPerQuestion) {
          return [...base, r.provaTitulo, score, `${r.correctCount}/${r.correctCount + r.erros}`, formatDateTime(r.submittedAt)];
        }
        const qValues = questions.map((q) => {
          const a = answerMap.get(r.id)?.get(q.id);
          if (!a) return "";
          if (q.tipo === "multiple" && a.letra) {
            return `${a.letra}${a.correta ? " ✓" : " ✗"}`;
          }
          const text = a.textoResposta ?? "";
          return text.length > 40 ? `${text.slice(0, 40)}…` : text;
        });
        return [...base, score, `${r.correctCount}/${r.correctCount + r.erros}`, ...qValues];
      }),
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 2 },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index >= 5) data.cell.styles.halign = "center";
      },
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Nenhuma resposta encontrada com os filtros selecionados.", 14, afterSummary + 8);
  }

  // Questões com maior índice de erro
  if (id) {
    const hardest = await hardestQuestions(id);
    if (hardest.length > 0) {
      const prevY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterSummary) + 12;
      if (prevY > pageHeight - 60) doc.addPage();
      const y = prevY > pageHeight - 60 ? 20 : prevY;

      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Questões com maior índice de erro", 14, y);

      autoTable(doc, {
        startY: y + 3,
        head: [["Questão", "Erros", "Respostas", "% de erro"]],
        body: hardest.map((h) => {
          const excerpt = h.prompt.length > 90 ? `${h.prompt.slice(0, 90)}…` : h.prompt;
          return [excerpt, String(h.errors), String(h.total), `${h.rate}%`];
        }),
        theme: "striped",
        headStyles: { fillColor: [225, 29, 72] },
        styles: { fontSize: 8.5, cellPadding: 2 },
        columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } },
      });
    }
  }

  // Rodapé com numeração
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`SabeTudo • Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: "right" });
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const name = `relatorio${prova ? `-${prova.codigo ?? prova.id}` : ""}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}