"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Point = { period: string; income: number; expense: number; balance: number };

export default function CashFlowChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-texto-discreto">Sem movimentação paga no período.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={56} />
          <Tooltip
            formatter={(value) =>
              Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            }
          />
          <Legend />
          <Line type="monotone" dataKey="income" name="Receita" stroke="#2E7D32" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="expense" name="Despesa" stroke="#DC2626" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="balance" name="Saldo" stroke="#1B5E20" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
