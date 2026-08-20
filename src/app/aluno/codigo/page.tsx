import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import AccessForm from "@/components/access-form";
import Logo from "@/components/logo";

export default function AlunoCodigoPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 via-indigo-700 to-violet-900">
      <header className="mx-auto w-full max-w-5xl px-4 py-6">
        <Link href="/aluno" className="inline-flex items-center">
          <Logo className="h-16 w-auto" />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white">
          <KeyRound className="h-4 w-4" /> Acesso pelo código
        </span>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
          Digite o código da prova
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-indigo-100">
          Use o código informado pelo seu professor para abrir uma prova diretamente.
        </p>

        <div className="mt-8 w-full">
          <AccessForm />
        </div>

        <Link
          href="/aluno"
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-indigo-100 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para o login do aluno
        </Link>
      </main>
    </div>
  );
}