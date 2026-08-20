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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 via-indigo-700 to-violet-900">
      <header className="mx-auto w-full max-w-5xl px-4 py-6">
        <Link href="/" className="inline-flex items-center">
          <Logo className="h-16 w-auto" />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-2">
          <div className="hidden flex-col justify-center lg:flex">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white">
              <UserRound className="h-4 w-4" /> Acesso do aluno
            </span>
            <h1 className="mt-6 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Entre com seu nome
              <br />
              e veja suas provas
            </h1>
            <p className="mt-4 max-w-sm text-indigo-100">
              Acesse o painel com seu nome completo e a senha informada pela escola. Você também
              pode entrar direto com o código da prova fornecido pelo professor.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-8 shadow-2xl shadow-indigo-950/30">
            <AlunoAccessCard />
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-100 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao início
        </Link>
      </footer>
    </div>
  );
}