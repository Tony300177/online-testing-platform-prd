"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";

/** Formulário de acesso rápido do aluno pelo código da prova. */
export default function AccessForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) {
      setError("Digite o código da prova.");
      return;
    }
    router.push(`/prova/${encodeURIComponent(value.toUpperCase())}`);
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-xl">
      <div className="rounded-2xl bg-white p-4 shadow-xl shadow-indigo-900/20">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError("");
              }}
              placeholder="Digite o código da prova (ex.: K7M2QX9P)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-lg font-bold uppercase tracking-[0.18em] text-slate-900 outline-none ring-indigo-500 transition focus:border-indigo-400 focus:bg-white focus:ring-2 placeholder:text-sm placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400"
              maxLength={20}
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-4 text-base font-bold tracking-wide text-white transition hover:bg-indigo-500 active:scale-[0.98]"
          >
            Acessar prova
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="mt-3 text-center text-sm font-semibold text-rose-600">{error}</p>}
        <p className="mt-3 border-t border-slate-100 pt-3 text-center text-sm font-medium text-slate-500">
          Sem cadastro e sem senha: informe apenas nome, turma e escola.
        </p>
      </div>
    </form>
  );
}