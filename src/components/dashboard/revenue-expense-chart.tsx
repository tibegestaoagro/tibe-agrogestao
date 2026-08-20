"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Point = { period: string; income: number; expense: number; balance: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RevenueExpenseChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">Sem movimentação paga no período.</p>;
  }

  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);
  const saldo = totalIncome - totalExpense;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 text-gray-600">
          <span className="h-2.5 w-2.5 rounded-full bg-tibe-primary" aria-hidden="true" />
          Receitas <span className="font-semibold text-tibe-dark">{brl(totalIncome)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-gray-600">
          <span className="h-2.5 w-2.5 rounded-full bg-tibe-accent" aria-hidden="true" />
          Despesas <span className="font-semibold text-tibe-dark">{brl(totalExpense)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-gray-600">
          Saldo{" "}
          <span className={`font-semibold ${saldo >= 0 ? "text-primaria-tinta" : "text-red-600"}`}>
            {brl(saldo)}
          </span>
        </span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#9ca3af" axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" width={48} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => brl(Number(value))} />
            <Bar dataKey="income" name="Receitas" fill="#649721" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="#E97D0F" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
