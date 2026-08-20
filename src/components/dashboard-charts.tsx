"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DistributionBucket, GroupStat } from "@/lib/stats";

const BAR_COLORS = ["#f43f5e", "#f59e0b", "#10b981"];

function fmt(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function DistributionChart({ data }: { data: DistributionBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="faixa" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => [`${value} alunos`, "Alunos"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="alunos" radius={[8, 8, 0, 0]} maxBarSize={72}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupComparisonChart({
  data,
  color,
}: {
  data: GroupStat[];
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={data.length > 4 ? -18 : 0}
          textAnchor={data.length > 4 ? "end" : "middle"}
          height={data.length > 4 ? 52 : 30}
        />
        <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name, props) => [
            `${fmt(Number(value))}`,
            props?.payload ? `Média (${props.payload.alunos} alunos)` : "Média",
          ]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Bar dataKey="media" fill={color} radius={[8, 8, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LegendHint() {
  return (
    <p className="text-[11px] text-slate-400">
      Notas de 0 a 10 calculadas automaticamente sobre as questões de múltipla escolha.
    </p>
  );
}

export function ProgressionChart({
  data,
}: {
  data: { titulo: string; participantes: number; mediaPercentual: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="titulo"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          angle={-14}
          textAnchor="end"
          height={48}
        />
        <YAxis
          yAxisId="pct"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          yAxisId="n"
          orientation="right"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value, name) => {
            if (name === "Média %") return [`${Number(value)}%`, "Média %"];
            return [String(value), "Participantes"];
          }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Legend />
        <Bar
          yAxisId="n"
          dataKey="participantes"
          name="Participantes"
          fill="#c7d2fe"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
        <Line
          yAxisId="pct"
          dataKey="mediaPercentual"
          name="Média %"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={{ r: 4, fill: "#4f46e5" }}
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export { Legend };
