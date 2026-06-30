"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Point = { date: string; weight: number };

export default function WeightChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-500">Sem pesagens registradas ainda.</p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" unit="kg" width={56} />
          <Tooltip
            formatter={(value) => [`${value} kg`, "Peso"]}
            labelStyle={{ color: "#1B5E20" }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#2E7D32"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
