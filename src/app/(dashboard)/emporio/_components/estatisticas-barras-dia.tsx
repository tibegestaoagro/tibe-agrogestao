"use client";

import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { reaisBr } from "@/lib/numero-br";

type Dia = { date: string; total: number };

const diaBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * As vendas de cada dia do período, no cartão Vendas da Visão geral. As cores são os tokens do tema (o atributo SVG
 * aceita `var()`), como no `acompanhamento-grafico`.
 */
export function EstatisticasBarrasDia({ dias }: { dias: Dia[] }) {
  if (dias.length === 0) return null;
  const dados = dias.map((d) => ({ dia: diaBr(d.date), total: d.total }));
  return (
    <div
      className="h-24 w-full"
      role="img"
      aria-label={`Vendas por dia, de ${dados[0].dia} a ${dados[dados.length - 1].dia}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="dia" hide />
          <Tooltip
            formatter={(valor) => [reaisBr(Number(valor)), "Vendas"]}
            labelFormatter={(dia) => String(dia)}
            cursor={{ fill: "var(--superficie-afundada)" }}
            contentStyle={{
              background: "var(--superficie)",
              border: "1px solid var(--borda)",
              color: "var(--texto)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="total" fill="var(--primaria)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
