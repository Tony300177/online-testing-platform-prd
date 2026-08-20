import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchAlunosDetalhados, parseAlunoFilters, type AlunoDetalhado } from "@/lib/admin";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Lista detalhada de alunos com filtros. Acesso: admin. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const url = new URL(req.url);
  const filters = parseAlunoFilters(url.searchParams);
  const rows = await fetchAlunosDetalhados(filters);

  if (url.searchParams.get("formato") === "csv") {
    return exportCsv(rows);
  }

  return NextResponse.json({ ok: true, total: rows.length, alunos: rows });
}

function exportCsv(rows: AlunoDetalhado[]): NextResponse {
  const header = [
    "Escola",
    "Turma",
    "Ano letivo",
    "Turno",
    "Professor",
    "Nº chamada",
    "Aluno",
    "Matrícula",
    "Sexo",
    "Etnia",
    "Bairro",
    "Data nascimento",
  ];
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [
      r.escolaNome,
      r.turmaNome,
      r.anoLetivo,
      r.turno ?? "",
      r.professorNome ?? "",
      r.numeroChamada ?? "",
      r.nome,
      r.matricula ?? "",
      r.sexo ?? "",
      r.etnia ?? "",
      r.bairro ?? "",
      r.dataNascimento ? formatDate(r.dataNascimento) : "",
    ]
      .map(escape)
      .join(";")
  );
  const csv = `\uFEFF${[header.map(escape).join(";"), ...body].join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alunos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}