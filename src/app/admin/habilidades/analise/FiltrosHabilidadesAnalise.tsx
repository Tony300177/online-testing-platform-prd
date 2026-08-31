"use client";

import { Filter } from "lucide-react";

interface FiltrosHabilidadesAnaliseProps {
  provaId: string;
  escolaId: string;
  turmaId: string;
  habilidade: string;
  alunoId: string;
  periodoInicio: string;
  periodoFim: string;
  etnia: string;
  sexo: string;
  bairro: string;
  professorId: string;
  alunoNome: string;
  provasRows: { id: number; titulo: string }[];
  escolasList: { id: string; nome: string }[];
  turmasList: { id: string; nome: string }[];
  etniasList: { etnia: string | null }[];
  sexosList: { sexo: string | null }[];
  bairrosList: { bairro: string | null }[];
  professoresList: { id: string; nome: string }[];
  habRows: { habilidade: string }[];
  alunosRows: { alunoId: string; alunoNome: string; alunoTurma: string }[];
}

export default function FiltrosHabilidadesAnalise({
  provaId,
  escolaId,
  turmaId,
  habilidade,
  alunoId,
  periodoInicio,
  periodoFim,
  etnia,
  sexo,
  bairro,
  professorId,
  alunoNome,
  provasRows,
  escolasList,
  turmasList,
  etniasList,
  sexosList,
  bairrosList,
  professoresList,
  habRows,
  alunosRows,
}: FiltrosHabilidadesAnaliseProps) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Escola</label>
        <select name="escolaId" defaultValue={escolaId} onChange={(e) => { const form = e.currentTarget.form; if (form) form.submit(); }} className="max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todas as escolas</option>
          {escolasList.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Avaliação</label>
        <select name="provaId" defaultValue={provaId} className="max-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todas as avaliações</option>
          {provasRows.map((p) => (
            <option key={p.id} value={p.id}>{p.titulo}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Turma</label>
        <select name="turmaId" defaultValue={turmaId} onChange={(e) => { const form = e.currentTarget.form; if (form) form.submit(); }} className="max-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todas as turmas</option>
          {turmasList.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Habilidade</label>
        <select name="habilidade" defaultValue={habilidade} className="max-w-[170px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todas</option>
          {habRows.map((h) => (
            <option key={h.habilidade} value={h.habilidade}>{h.habilidade}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Aluno</label>
        <select name="alunoId" defaultValue={alunoId} className="max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos os alunos</option>
          {alunosRows.map((a) => (
            <option key={a.alunoId} value={a.alunoId}>{a.alunoNome} — {a.alunoTurma}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Etnia</label>
        <select name="etnia" defaultValue={etnia} className="max-w-[150px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todas</option>
          {etniasList.map((e: { etnia: string | null }) => e.etnia && (
            <option key={e.etnia} value={e.etnia}>{e.etnia}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Gênero</label>
        <select name="sexo" defaultValue={sexo} className="max-w-[130px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos</option>
          {sexosList.map((s: { sexo: string | null }) => s.sexo && (
            <option key={s.sexo} value={s.sexo}>{s.sexo}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Bairro</label>
        <select name="bairro" defaultValue={bairro} className="max-w-[150px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos</option>
          {bairrosList.map((b: { bairro: string | null }) => b.bairro && (
            <option key={b.bairro} value={b.bairro}>{b.bairro}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Professor</label>
        <select name="professorId" defaultValue={professorId} className="max-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos</option>
          {professoresList.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Buscar por nome</label>
        <input type="text" name="alunoNome" defaultValue={alunoNome} placeholder="Nome do aluno..." className="max-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Período (de)</label>
        <input type="date" name="periodoInicio" defaultValue={periodoInicio} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Período (até)</label>
        <input type="date" name="periodoFim" defaultValue={periodoFim} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
        <Filter className="h-4 w-4 mr-1" /> Filtrar
      </button>
      <a href="/admin/habilidades/analise" className="px-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
        Limpar
      </a>
    </form>
  );
}