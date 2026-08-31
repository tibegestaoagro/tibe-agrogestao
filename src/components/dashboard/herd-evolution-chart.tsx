"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Point = { month: string; count: number };

export default function HerdEvolutionChart({ data }: { data: Point[] }) {
  if (data.every((d) => d.count === 0)) {
    return <p className="text-sm text-texto-discreto">Sem dado de rebanho no período.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="herdFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#649721" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#649721" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={40} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${value} cabeças`, "Rebanho"]} />
          <Area type="monotone" dataKey="count" stroke="#649721" strokeWidth={2} fill="url(#herdFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
