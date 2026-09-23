import { UploadCloud } from "lucide-react";
import ImportTabs from "@/components/import-tabs";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminImportarPage() {
  await requireUser(["admin"]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <UploadCloud className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Gestão de cadastros</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Importação de planilhas</h1>
          <p className="text-sm text-slate-500">
            Importe as turmas/professores e depois a planilha de alunos da escola (validada contra as turmas cadastradas).
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ImportTabs />
      </div>
    </div>
  );
}