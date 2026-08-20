import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SabeTudo — Plataforma de Provas Online",
  description:
    "Plataforma simples e intuitiva para professores criarem provas online, alunos responderem sem cadastro e gestores acompanharem resultados.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
