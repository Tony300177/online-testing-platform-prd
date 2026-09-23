import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** A importação de alunos foi unificada na tela de importação de planilhas. */
export default async function AdminImportarAlunosPage() {
  await requireUser(["admin"]);
  redirect("/admin/importar");
}