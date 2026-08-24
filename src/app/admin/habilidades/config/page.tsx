"use client";

import { useEffect, useState } from "react";
import { Settings, Save, ArrowLeft, CheckCircle, AlertTriangle, AlertCircle, XCircle } from "lucide-react";
import Link from "next/link";

type ThresholdData = { id: string; escolaId: string | null; verdeMin: number; amareloMin: number; laranjaMin: number };

export default function ConfigThresholdsPage() {
  const [items, setItems] = useState<ThresholdData[]>([]);
  const [form, setForm] = useState({ verdeMin: 80, amareloMin: 60, laranjaMin: 40 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/habilidades/thresholds")
      .then(r => r.json())
      .then(json => { if (json.ok) setItems(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!(form.laranjaMin < form.amareloMin && form.amareloMin < form.verdeMin && form.verdeMin <= 100 && form.laranjaMin >= 0)) {
      setMsg("Valores inválidos.");
      return;
    }
    setSaving(true); setMsg("");
    try {
      const r = await fetch("/api/admin/habilidades/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdeMin: form.verdeMin, amareloMin: form.amareloMin, laranjaMin: form.laranjaMin }),
      });
      const json = await r.json();
      if (json.ok) {
        setMsg("Limiares salvos com sucesso!");
        setItems(prev => {
          const idx = prev.findIndex(i => i.escolaId === null);
          if (idx >= 0) { const copy = [...prev]; copy[idx] = json.data; return copy; }
          return [...prev, json.data];
        });
      } else setMsg(json.error || "Erro ao salvar.");
    } catch { setMsg("Erro de conexão."); }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Settings className="h-6 w-6 text-indigo-600" /> Configurar Limiares
          </h1>
          <p className="mt-1 text-sm text-slate-500">Defina os percentuais de classificação de desempenho.</p>
        </div>
        <Link href="/admin/habilidades" className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Limiares Globais</h2>

          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-emerald-700 mb-1">
                <CheckCircle className="h-4 w-4" /> Alto — mínimo (%)
              </label>
              <input
                type="number" min={0} max={100} value={form.verdeMin}
                onChange={e => setForm({ ...form, verdeMin: +e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-1">
                <AlertTriangle className="h-4 w-4" /> Médio Alto — mínimo (%)
              </label>
              <input
                type="number" min={0} max={100} value={form.amareloMin}
                onChange={e => setForm({ ...form, amareloMin: +e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-orange-700 mb-1">
                <AlertCircle className="h-4 w-4" /> Médio Baixo — mínimo (%)
              </label>
              <input
                type="number" min={0} max={100} value={form.laranjaMin}
                onChange={e => setForm({ ...form, laranjaMin: +e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-2">Preview:</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> <span className="text-slate-700">Alto: <b>{form.verdeMin}%–100%</b></span></div>
              <div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> <span className="text-slate-700">Médio Alto: <b>{form.amareloMin}%–{form.verdeMin - 1}%</b></span></div>
              <div className="flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5 text-orange-600" /> <span className="text-slate-700">Médio Baixo: <b>{form.laranjaMin}%–{form.amareloMin - 1}%</b></span></div>
              <div className="flex items-center gap-2"><XCircle className="h-3.5 w-3.5 text-rose-600" /> <span className="text-slate-700">Baixo: <b>0%–{form.laranjaMin - 1}%</b></span></div>
            </div>
          </div>

          {msg && <p className={`mt-3 text-sm ${msg.includes("sucesso") ? "text-emerald-600" : "text-rose-600"}`}>{msg}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="mt-6 flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Configurações Existentes</h2>
          {loading ? (
            <p className="text-sm text-slate-400">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum limiar configurado. Use o formulário ao lado para definir os padrões.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    {item.escolaId ? `Escola: ${item.escolaId}` : "Padrão Global"}
                  </p>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="rounded bg-emerald-50 p-2 text-center"><p className="font-bold text-emerald-700">≥{item.verdeMin}%</p><p className="text-emerald-600">Verde</p></div>
                    <div className="rounded bg-amber-50 p-2 text-center"><p className="font-bold text-amber-700">≥{item.amareloMin}%</p><p className="text-amber-600">Amarelo</p></div>
                    <div className="rounded bg-orange-50 p-2 text-center"><p className="font-bold text-orange-700">≥{item.laranjaMin}%</p><p className="text-orange-600">Laranja</p></div>
                    <div className="rounded bg-rose-50 p-2 text-center"><p className="font-bold text-rose-700">&lt;{item.laranjaMin}%</p><p className="text-rose-600">Vermelho</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}