import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { fetchAlunosDetalhados, parseAlunoFilters, type AlunoDetalhado } from "@/lib/admin";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Gera o relatório PDF da base escolar com filtros demográficos. Acesso: admin. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const url = new URL(req.url);
  const filters = parseAlunoFilters(url.searchParams);
  const rows = await fetchAlunosDetalhados(filters);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cabeçalho
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SabeTudo — Relatório da Base Escolar", 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatDate(new Date())} por ${user.name}`, 14, 20);

  // Filtros
  const filterParts: string[] = [];
  if (filters.escola) filterParts.push(`Escola: ${filters.escola}`);
  if (filters.turma) filterParts.push(`Turma: ${filters.turma}`);
  if (filters.etnia) filterParts.push(`Etnia: ${filters.etnia}`);
  if (filters.genero) filterParts.push(`Gênero: ${filters.genero}`);
  if (filters.bairro) filterParts.push(`Bairro: ${filters.bairro}`);
  if (filters.professor) filterParts.push(`Professor: ${filters.professor}`);
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.text(
    filterParts.length > 0 ? `Filtros: ${filterParts.join("  |  ")}` : "Filtros: toda a base",
    14,
    39
  );

  // Resumo
  const porEtnia = new Map<string, number>();
  const porGenero = new Map<string, number>();
  for (const r of rows) {
    if (r.etnia) porEtnia.set(r.etnia, (porEtnia.get(r.etnia) ?? 0) + 1);
    if (r.sexo) porGenero.set(r.sexo, (porGenero.get(r.sexo) ?? 0) + 1);
  }
  autoTable(doc, {
    startY: 44,
    head: [["Métrica", "Valor"]],
    body: [
      ["Total de alunos", String(rows.length)],
      ...Array.from(porEtnia.entries()).map(([k, v]) => [`Etnia — ${k}`, String(v)]),
      ...Array.from(porGenero.entries()).map(([k, v]) => [`Gênero — ${k}`, String(v)]),
    ],
    theme: "striped",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: "bold" } },
  });

  const afterSummary = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 48) + 8;

  // Tabela de alunos
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Alunos", 14, afterSummary);

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Nenhum aluno encontrado com os filtros selecionados.", 14, afterSummary + 8);
  } else {
    const toCell = (r: AlunoDetalhado) => [
      r.numeroChamada === null ? "" : String(r.numeroChamada).padStart(3, "0"),
      r.nome,
      r.turmaNome,
      r.escolaNome,
      r.professorNome ?? "",
      r.sexo ?? "",
      r.etnia ?? "",
      r.bairro ?? "",
      r.dataNascimento ? formatDate(r.dataNascimento) : "",
    ];
    autoTable(doc, {
      startY: afterSummary + 3,
      head: [["Nº", "Aluno", "Turma", "Escola", "Professor", "Sexo", "Etnia", "Bairro", "Nascimento"]],
      body: rows.map(toCell),
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
      },
    });
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
  const name = `relatorio-alunos-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}