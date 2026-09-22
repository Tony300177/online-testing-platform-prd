import { Users } from "lucide-react";
import ImportarAlunosPanel from "@/components/import-alunos-panel";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminImportarAlunosPage() {
  await requireUser(["admin"]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Importar alunos</h1>
          <p className="text-sm text-slate-500">
            Importe alunos por escola: selecione a unidade, baixe o modelo, valide e confirme.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ImportarAlunosPanel />
      </div>
    </div>
  );
}