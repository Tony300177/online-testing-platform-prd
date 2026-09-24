"use client";

import { useState } from "react";
import { FileSpreadsheet, Layers, Users } from "lucide-react";
import ImportPanel from "@/components/import-panel";
import ImportUnificadoPanel from "@/components/import-unificado-panel";
import ImportPlanilhaUnicaPanel from "@/components/import-planilha-unica-panel";
import { cn } from "@/lib/utils";

type Guia = "unica" | "alunos" | "turmas";

/** Tela unificada de importação: planilha única (todas as escolas), alunos e turmas/professores. */
export default function ImportTabs() {
  const [guia, setGuia] = useState<Guia>("unica");

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setGuia("unica")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition",
            guia === "unica" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Layers className="h-4 w-4" /> Planilha única (todas as escolas)
        </button>
        <button
          type="button"
          onClick={() => setGuia("alunos")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition",
            guia === "alunos" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Users className="h-4 w-4" /> Alunos (planilha da escola)
        </button>
        <button
          type="button"
          onClick={() => setGuia("turmas")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition",
            guia === "turmas" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <FileSpreadsheet className="h-4 w-4" /> Turmas
        </button>
      </div>

      {guia === "unica" ? (
        <ImportPlanilhaUnicaPanel />
      ) : guia === "turmas" ? (
        <ImportPanel onIrAlunos={() => setGuia("alunos")} />
      ) : (
        <ImportUnificadoPanel />
      )}
    </div>
  );
}