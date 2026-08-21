import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { provas, turmas } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  CLASSIFICACAO_LABEL,
  getHabilidadesAnalise,
  type HabilidadeFilters,
} from "@/lib/habilidades-stats";
import { formatDateTime } from "@/lib/utils";

/** Relatório PDF da análise de desempenho por habilidades. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const userName = user.name;

  // Professores só podem gerar relatórios das próprias provas.
  let allowedProvaIds: number[] | undefined;
  if (user.role === "teacher") {
    const own = await db.select({ id: provas.id }).from(provas).where(eq(provas.professorId, user.id));
    allowedProvaIds = own.map((p) => p.id);
  }

  const sp = new URL(req.url).searchParams;
  const filters: HabilidadeFilters = { allowedProvaIds };
  if (sp.get("provaId")) filters.provaId = Number(sp.get("provaId"));
  if (sp.get("turmaId")) filters.turmaId = sp.get("turmaId")!;
  if (sp.get("habilidade")) filters.habilidade = sp.get("habilidade")!;
  if (sp.get("alunoId")) filters.alunoId = sp.get("alunoId")!;
  if (sp.get("periodoInicio")) filters.periodoInicio = sp.get("periodoInicio")!;
  if (sp.get("periodoFim")) filters.periodoFim = sp.get("periodoFim")!;

  const data = await getHabilidadesAnalise(filters);
  const [provaRow] = filters.provaId ? await db.select({ titulo: provas.titulo }).from(provas).where(eq(provas.id, filters.provaId)).limit(1) : [];
  const [turmaRow] = filters.turmaId ? await db.select({ nome: turmas.nome }).from(turmas).where(eq(turmas.id, filters.turmaId)).limit(1) : [];

  const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  function header(titulo: string) {
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageWidth, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(titulo, 14, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Gerado em ${formatDateTime(new Date())} por ${userName}`, 14, 19);
    doc.setTextColor(30, 30, 30);
  }

  header("SabeTudo — Análise de Desempenho por Habilidades");

  const filtrosTxt = [
    provaRow ? `Avaliação: ${provaRow.titulo}` : "Avaliação: todas",
    turmaRow ? `Turma: ${turmaRow.nome}` : "Turma: todas",
    filters.habilidade ? `Habilidade: ${filters.habilidade}` : "",
    filters.periodoInicio ? `De ${filters.periodoInicio}` : "",
    filters.periodoFim ? `Até ${filters.periodoFim}` : "",
  ].filter(Boolean).join("  |  ");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(filtrosTxt || "Sem filtros", 14, 33);

  const { resumo, habilidades, questoesPorHabilidade, alunosPorHabilidade, thresholds } = data;

  if (habilidades.length === 0) {
    doc.setFontSize(11);
    doc.text("Nenhuma resposta com habilidades encontrada para os filtros selecionados.", 14, 45);
    doc.save("analise-habilidades.pdf");
    return new NextResponse(Buffer.from(doc.output("arraybuffer")), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="analise-habilidades.pdf"' },
    });
  }

  autoTable(doc, {
    startY: 38,
    head: [["Indicador", "Valor"]],
    body: [
      ["Avaliação", provaRow?.titulo ?? "Todas"],
      ["Turma", turmaRow?.nome ?? "Todas"],
      ["Alunos participantes", String(resumo.totalAlunos)],
      ["Habilidades analisadas", String(resumo.totalHabilidades)],
      ["Questões envolvidas", String(resumo.totalQuestoes)],
      ["Total de oportunidades (questões × alunos)", String(resumo.totalOportunidades)],
      ["Acertos", `${resumo.totalAcertos} (${fmtPct(resumo.mediaAcerto)})`],
      ["Erros", String(resumo.totalErros)],
      ["Não responderam", `${resumo.totalNaoRespondeu} (contabilizados separadamente dos erros)`],
      ["Melhor desempenho", resumo.melhor ? `${resumo.melhor.habilidade} (${fmtPct(resumo.melhor.pctAcerto)})` : "—"],
      ["Menor desempenho", resumo.pior ? `${resumo.pior.habilidade} (${fmtPct(resumo.pior.pctAcerto)})` : "—"],
    ],
    theme: "striped",
    headStyles: { fillColor: [99, 102, 241] },
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 90 } },
  });

  let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45) + 8;

  // Tabela consolidada por habilidade
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text("Desempenho por habilidade", 14, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["Habilidade", "Questões", "Total", "Acertos", "Erros", "Não resp.", "% Acerto", "% Erro", "Classificação"]],
    body: habilidades.map((h) => [
      h.habilidade,
      h.questoesCount,
      h.total,
      h.acertos,
      h.erros,
      h.naoRespondeu,
      fmtPct(h.pctAcerto),
      fmtPct(h.pctErro),
      CLASSIFICACAO_LABEL[h.classificacao],
    ]),
    theme: "grid",
    headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "center" } },
    didDrawPage: () => header("SabeTudo — Análise de Desempenho por Habilidades"),
  });

  // Gráfico de barras proporcionais por habilidade (acertos / erros / não respondeu)
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Distribuição de respostas por habilidade", 14, y);
  const barX = 55;
  const barW = 110;
  const barH = 6;
  let by = y + 7;

  for (const h of habilidades) {
    if (by > 275) {
      doc.addPage();
      by = 20;
    }
    const total = Math.max(h.total, 1);
    const wA = (h.acertos / total) * barW;
    const wE = (h.erros / total) * barW;
    const wN = (h.naoRespondeu / total) * barW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`${h.habilidade}`, 14, by + 4.5);
    doc.setFillColor(16, 185, 129);
    doc.rect(barX, by, wA, barH, "F");
    doc.setFillColor(244, 63, 94);
    doc.rect(barX + wA, by, wE, barH, "F");
    if (wN > 0) {
      doc.setFillColor(148, 163, 184);
      doc.rect(barX + wA + wE, by, wN, barH, "F");
    }
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(fmtPct(h.pctAcerto), barX + barW + 4, by + 4.5);
    by += barH + 3.5;
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Legenda: verde = acertos · vermelho = erros · cinza = não respondeu · Classificação: >=${thresholds.verdeMin}% satisfatório, >=${thresholds.amareloMin}% atenção`, 14, by + 2);

  // Detalhamento por habilidade: questões e alunos
  for (const h of habilidades) {
    doc.addPage();
    header(`${h.habilidade} — Desempenho da habilidade`);
    let dy = 34;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);

    autoTable(doc, {
      startY: dy,
      head: [["Indicador", "Valor"]],
      body: [
        ["Questões que avaliaram", String(h.questoesCount)],
        ["Total de oportunidades", String(h.total)],
        ["Acertos", String(h.acertos)],
        ["Erros", String(h.erros)],
        ["Não respondeu", String(h.naoRespondeu)],
        ["Aproveitamento", fmtPct(h.pctAcerto)],
        ["Classificação", CLASSIFICACAO_LABEL[h.classificacao]],
      ],
      theme: "striped",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } },
    });

    dy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? dy) + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Questões que avaliam ${h.habilidade}`, 14, dy);
    autoTable(doc, {
      startY: dy + 3,
      head: [["Questão", "Enunciado", "Total", "Acertos", "% Acerto"]],
      body: (questoesPorHabilidade[h.habilidade] ?? []).map((q) => [
        `Q${q.numero}`,
        q.pergunta.slice(0, 90),
        q.total,
        q.acertos,
        fmtPct(q.pctAcerto),
      ]),
      theme: "grid",
      headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    dy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? dy) + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Desempenho individual dos alunos", 14, dy);
    autoTable(doc, {
      startY: dy + 3,
      head: [["Aluno", "Turma", `Questões ${h.habilidade}`, "Acertos", "Erros", "Não resp.", "Aproveitamento", "Situação"]],
      body: (alunosPorHabilidade[h.habilidade] ?? []).map((a) => [
        a.alunoNome,
        a.alunoTurma,
        a.questoes,
        a.acertos,
        a.erros,
        a.naoRespondeu,
        fmtPct(a.aproveitamento),
        CLASSIFICACAO_LABEL[a.classificacao],
      ]),
      theme: "grid",
      headStyles: { fillColor: [99, 102, 241], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      didParseCell: (cellData) => {
        if (cellData.section === "body" && cellData.column.index === 7) {
          const txt = String(cellData.cell.raw ?? "");
          if (txt === "Domínio satisfatório") cellData.cell.styles.textColor = [5, 122, 85];
          else if (txt === "Atenção") cellData.cell.styles.textColor = [180, 83, 9];
          else cellData.cell.styles.textColor = [190, 18, 60];
        }
      },
    });
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="analise-habilidades-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
