import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  PencilLine,
  QrCode,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import Logo from "@/components/logo";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Topo */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center">
            <Logo className="h-14 w-auto" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            <a href="#como-funciona" className="transition hover:text-indigo-600">
              Como funciona
            </a>
            <Link href="/aluno" className="transition hover:text-indigo-600">
              Sou aluno
            </Link>
            <Link href="/login" className="transition hover:text-indigo-600">
              Área do professor
            </Link>
          </nav>
          <Link
            href="/login"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-900 via-indigo-700 to-violet-900 text-white">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium">
            <QrCode className="h-4 w-4" />
            Provas online com correção automática
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Crie, aplique e avalie provas sem complicação
          </h1>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-20 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Feito para os três momentos da avaliação
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Uma plataforma única para professores, alunos e gestores escolares.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <PencilLine className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Professor cria em minutos</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Monte questões de múltipla escolha e dissertativas com editor de texto, defina o
                prazo de entrega e compartilhe o link ou QR Code com a turma.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <UserRound className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Aluno responde sem cadastro</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Basta informar nome, turma e escola. A interface guia o aluno com progresso visível
                e salva as respostas automaticamente contra quedas de conexão.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <BarChart3 className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Gestor acompanha tudo</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Dashboard executivo com notas por faixa, comparativos entre turmas e escolas,
                questões mais erradas e exportação em PDF e Excel.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Áreas de acesso */}
      <section className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3">
          <Link
            href="/aluno"
            className="group rounded-2xl border-2 border-slate-100 bg-slate-50 p-6 transition hover:border-indigo-200 hover:bg-indigo-50/50"
          >
            <Users className="h-7 w-7 text-indigo-600" />
            <h3 className="mt-3 text-lg font-semibold text-slate-900">Sou aluno</h3>
            <p className="mt-1 text-sm text-slate-600">
              Tenho um código ou link da prova e quero responder agora.
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-indigo-600 group-hover:underline">
              Acessar prova →
            </span>
          </Link>
          <Link
            href="/login"
            className="group rounded-2xl border-2 border-slate-100 bg-slate-50 p-6 transition hover:border-indigo-200 hover:bg-indigo-50/50"
          >
            <ClipboardList className="h-7 w-7 text-indigo-600" />
            <h3 className="mt-3 text-lg font-semibold text-slate-900">Sou professor</h3>
            <p className="mt-1 text-sm text-slate-600">
              Quero criar, publicar e acompanhar as provas da minha turma.
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-indigo-600 group-hover:underline">
              Entrar no painel →
            </span>
          </Link>
          <Link
            href="/login"
            className="group rounded-2xl border-2 border-slate-100 bg-slate-50 p-6 transition hover:border-indigo-200 hover:bg-indigo-50/50"
          >
            <LayoutDashboard className="h-7 w-7 text-indigo-600" />
            <h3 className="mt-3 text-lg font-semibold text-slate-900">Sou administrador</h3>
            <p className="mt-1 text-sm text-slate-600">
              Gestão completa com relatórios, gráficos e estatísticas consolidadas.
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-indigo-600 group-hover:underline">
              Acessar painel →
            </span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Dados dos alunos tratados com segurança e privacidade.
          </p>
          <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-4 sm:flex-row">
            <p className="text-sm text-slate-500">© {new Date().getFullYear()} SabeTudo — Secretaria Municipal de Educação.</p>
            <p className="text-sm font-semibold text-slate-700">Desenvolvido pelo Departamento de Tecnologia/SME.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
