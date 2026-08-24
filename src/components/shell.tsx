"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PieChart,
  School,
  Target,
  UploadCloud,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/logo";

type NavItem = { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  children?: NavItem[];
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { 
    label: "Escolar", 
    icon: School, 
    children: [
      { href: "/admin/dashboard", label: "Turma/Escola", icon: School },
      { href: "/admin/alunos", label: "Alunos", icon: Users },
    ] 
  },
  { 
    label: "Avaliações", 
    icon: ClipboardList, 
    children: [
      { href: "/professor", label: "Provas", icon: ClipboardList },
      { href: "/professor/nova", label: "Nova prova", icon: FilePlus2 },
      { href: "/admin/respostas", label: "Respostas", icon: ListChecks },
    ] 
  },
  { href: "/professor/cadastro", label: "Cadastro", icon: Building2 },
  { href: "/admin/importar", label: "Importar", icon: UploadCloud },
  { href: "/admin/estatisticas", label: "Estatísticas", icon: PieChart },
  { href: "/admin/habilidades", label: "Habilidades", icon: Target },
];

export default function Shell({
  user,
  children,
}: {
  user: { name: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const home = "/admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={home} className="flex items-center">
            <Logo className="h-14 w-auto" />
          </Link>

          <nav className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
            {NAV.map((item) => {
              const active =
                item.href === "/professor" || item.href === "/admin"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const childActive = item.children?.some(
                (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
              );

              if (item.children) {
                const [open, setOpen] = useState(false);
                const dropdownRef = useRef<HTMLDivElement>(null);
                useEffect(() => {
                  function handleClickOutside(e: MouseEvent) {
                    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                      setOpen(false);
                    }
                  }
                  if (open) {
                    document.addEventListener("mousedown", handleClickOutside);
                  }
                  return () => document.removeEventListener("mousedown", handleClickOutside);
                }, [open]);
                return (
                  <div key={item.label} className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setOpen(!open)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                        (active || childActive) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div className="absolute right-0 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-50">
                        {item.children.map((child) => {
                          const childIsActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                          return (
                            <Link
                              key={child.href}
                              href={child.href!}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 text-sm font-medium transition",
                                childIsActive
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              )}
                            >
                              <child.icon className="h-4 w-4" />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                <p className="text-[11px] text-slate-400">Professor & Administrador</p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sair"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 sm:flex-row">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            SabeTudo — plataforma de avaliações online
          </p>
          <p className="text-sm font-medium text-slate-600">
            Desenvolvido pelo Departamento de Tecnologia/SME de Juina-MT.
          </p>
        </div>
      </footer>
    </div>
  );
}
