import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import AlunoAccessCard from "@/components/student/aluno-access-card";
import Logo from "@/components/logo";
import { getSessionAluno } from "@/lib/auth";

export default async function AlunoPage() {
  const session = await getSessionAluno();
  if (session) redirect("/aluno/painel");

  return (
    <div className="tema-crianca min-h-screen bg-gradient-to-b from-indigo-50/70 via-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center">
              <Logo className="h-12 w-auto sm:h-14" />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                Área do aluno
              </p>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Acesso às provas
              </h1>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 sm:px-4"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar ao início</span>
            <span className="sm:hidden">Voltar</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700">
            <UserRound className="h-4 w-4" /> Acesso do aluno
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Entre para ver suas provas
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Selecione sua escola e turma e informe o nome completo e a senha fornecida pela escola.
            Você também pode entrar com o código enviado pelo professor.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <AlunoAccessCard />
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900/80">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <p>Se não conseguir entrar, peça ajuda ao professor da sua turma.</p>
        </div>
      </main>
    </div>
  );
}
