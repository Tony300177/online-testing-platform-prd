import CriarAvaliacaoWizard from "@/components/admin/criar-avaliacao-wizard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NovaAvaliacaoPage() {
  await requireUser(["admin"]);
  return <CriarAvaliacaoWizard />;
}