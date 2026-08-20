import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import LoginForm from "@/components/login-form";
import Logo from "@/components/logo";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/professor");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 via-indigo-700 to-violet-900">
      <header className="mx-auto w-full max-w-5xl px-4 py-6">
        <a href="/" className="inline-flex items-center">
          <Logo className="h-16 w-auto" />
        </a>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
          <div className="hidden flex-col justify-center lg:flex">
            <h1 className="text-3xl font-extrabold leading-tight text-white">
              Área restrita
              <br />
              para professores e administradores
            </h1>
            <p className="mt-4 max-w-sm text-indigo-100">
              Gerencie provas, acompanhe respostas em tempo real e consulte os relatórios
              estatísticos da sua escola.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-8 shadow-2xl shadow-indigo-950/30">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
