import { asc, eq, and } from "drizzle-orm";
import { Building2, UserPlus } from "lucide-react";
import CadastroPanel from "@/components/cadastro-panel";
import { db } from "@/db";
import { alunos, escolas, matriculas, turmas } from "@/db/schema";

export const dynamic = "force-dynamic";

const ANO_LETIVO = 2026;

export default async function CadastroPage() {
  const schools = await db.select().from(escolas).orderBy(asc(escolas.nome));
  const turmasRows = await db
    .select()
    .from(turmas)
    .where(eq(turmas.anoLetivo, ANO_LETIVO))
    .orderBy(asc(turmas.nome));
  const matRows = await db
    .select({
      alunoId: matriculas.alunoId,
      turmaId: matriculas.turmaId,
      nome: alunos.nome,
      numeroChamada: alunos.numeroChamada,
    })
    .from(matriculas)
    .innerJoin(alunos, eq(matriculas.alunoId, alunos.id))
    .where(and(eq(matriculas.anoLetivo, ANO_LETIVO), eq(matriculas.status, "ativo")))
    .orderBy(asc(alunos.numeroChamada));

  const byTurma = new Map<string, { id: string; nome: string; numeroChamada: number | null }[]>();
  for (const m of matRows) {
    const list = byTurma.get(m.turmaId) ?? [];
    list.push({ id: m.alunoId, nome: m.nome, numeroChamada: m.numeroChamada });
    byTurma.set(m.turmaId, list);
  }

  const escolasData = schools.map((e) => ({
    id: e.id,
    nome: e.nome,
    turmas: turmasRows
      .filter((t) => t.escolaId === e.id)
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        ano: t.ano,
        turno: t.turno,
        professor: t.professor,
        alunos: byTurma.get(t.id) ?? [],
      })),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Building2 className="h-6 w-6 text-indigo-600" /> Cadastro
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre escolas e alunos no padrão do fluxo da plataforma. Alunos entram com a senha{" "}
            <strong>123456</strong>.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
          <UserPlus className="h-3.5 w-3.5" /> {escolasData.length} escola(s) cadastrada(s)
        </span>
      </div>

      <div className="mt-6">
        <CadastroPanel initialEscolas={escolasData} />
      </div>
    </div>
  );
}