"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type Row = { utm_source: string | null; trials_created: number; converted: number; conversion_rate_pct: number };

export default function FunnelChart({ data }: { data: Row[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">Sem trials criados no período.</p>;
  }

  const chartData = data.map((r) => ({
    source: r.utm_source ?? "Direto / sem origem",
    trials: r.trials_created,
    converted: r.converted,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="source" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#4b5563" />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#4b5563" allowDecimals={false} />
          <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", fontSize: 12 }} labelStyle={{ color: "#e5e7eb" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="trials" name="Trials" fill="#6b7280" radius={[4, 4, 0, 0]} />
          <Bar dataKey="converted" name="Convertidos" fill="#34d399" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
