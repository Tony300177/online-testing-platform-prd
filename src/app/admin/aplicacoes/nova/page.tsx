import NovaAplicacaoWizard from "@/components/admin/nova-aplicacao-wizard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NovaAplicacaoPage() {
  await requireUser(["admin"]);
  return <NovaAplicacaoWizard />;
}