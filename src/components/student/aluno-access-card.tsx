"use client";

import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import StudentLoginForm from "@/components/student/student-login-form";
import AccessForm from "@/components/access-form";

/** Cartão de acesso do aluno: login (nome + senha) ou código da prova. */
export default function AlunoAccessCard() {
  const [mode, setMode] = useState<"login" | "code">("login");

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
            mode === "login" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <LogIn className="h-4 w-4" /> Entrar com login
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
            mode === "code" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <KeyRound className="h-4 w-4" /> Tenho um código
        </button>
      </div>

      {mode === "login" ? <StudentLoginForm /> : <AccessForm />}
    </div>
  );
}