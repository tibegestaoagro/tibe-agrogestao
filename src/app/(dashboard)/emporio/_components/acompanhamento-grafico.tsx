"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { reaisBr } from "@/lib/numero-br";

type Dia = { date: string; sales: number; cumulative: number | null };

/**
 * Vendas acumuladas do mês contra o ponto de equilíbrio, com a projeção linear
 * até o fim do mês. As cores são os tokens do tema: o atributo SVG aceita
 * `var()`, então o modo escuro as troca sozinho.
 */
export function AcompanhamentoGrafico({
  dias,
  decorridos,
  projetado,
  pontoDeEquilibrio,
}: {
  dias: Dia[];
  decorridos: number;
  projetado: number | null;
  pontoDeEquilibrio: number | null;
}) {
  const dados = dias.map((d, i) => {
    const n = i + 1;
    let projecao: number | null = null;
    if (projetado !== null && decorridos > 0) {
      if (n === decorridos) projecao = d.cumulative;
      else if (n === dias.length) projecao = projetado;
    }
    return { dia: n, acumulado: d.cumulative, projecao };
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-texto-secundario">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primaria" aria-hidden="true" />
          Vendas acumuladas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-info-tinta" aria-hidden="true" />
          Projeção até o fim do mês
        </span>
        {pontoDeEquilibrio !== null && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-acento" aria-hidden="true" />
            Ponto de equilíbrio
          </span>
        )}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 11, fill: "var(--texto-discreto)" }}
              stroke="var(--borda-forte)"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--texto-discreto)" }}
              width={56}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => Number(v).toLocaleString("pt-BR")}
            />
            <Tooltip
              formatter={(valor) => reaisBr(Number(valor))}
              labelFormatter={(dia) => `Dia ${dia}`}
              contentStyle={{
                background: "var(--superficie)",
                border: "1px solid var(--borda)",
                color: "var(--texto)",
                fontSize: 12,
              }}
            />
            {pontoDeEquilibrio !== null && (
              <ReferenceLine y={pontoDeEquilibrio} stroke="var(--acento)" strokeDasharray="6 4" strokeWidth={2} />
            )}
            <Line
              type="monotone"
              dataKey="projecao"
              name="Projeção"
              stroke="var(--info-tinta)"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="acumulado"
              name="Vendas acumuladas"
              stroke="var(--primaria)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
