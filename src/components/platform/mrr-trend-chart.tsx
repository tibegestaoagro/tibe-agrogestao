"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Point = { period: string; mrr: number };

export default function MrrTrendChart({ data }: { data: Point[] }) {
  if (data.every((p) => p.mrr === 0)) {
    return <p className="text-sm text-gray-500">Sem assinatura ativa no período.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#4b5563" />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="#4b5563" width={64} />
          <Tooltip
            contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", fontSize: 12 }}
            labelStyle={{ color: "#e5e7eb" }}
            formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          />
          <Line type="monotone" dataKey="mrr" name="MRR" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
