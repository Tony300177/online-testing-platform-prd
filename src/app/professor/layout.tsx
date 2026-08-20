import Shell from "@/components/shell";
import { requireUser } from "@/lib/auth";

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["admin", "teacher"]);
  return <Shell user={{ name: user.name, role: user.role }}>{children}</Shell>;
}
