"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { reaisBr } from "@/lib/numero-br";

type Semana = { numero: number; closing_balance: number };

/**
 * O saldo ao fim de cada semana, a partir do saldo de hoje. Semana com saldo
 * negativo ganha o ponto na cor de perigo, e a linha do zero marca o limite.
 * Cores são tokens do tema (o atributo SVG aceita `var()`).
 */
export function FluxoProjetadoGrafico({ abertura, semanas }: { abertura: number; semanas: Semana[] }) {
  const dados = [
    { rotulo: "Hoje", saldo: abertura },
    ...semanas.map((s) => ({ rotulo: `Sem. ${s.numero}`, saldo: s.closing_balance })),
  ];
  const negativas = semanas.filter((s) => s.closing_balance < 0).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-texto-secundario">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primaria" aria-hidden="true" />
          Saldo ao fim da semana
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-perigo-tinta" aria-hidden="true" />
          Saldo negativo
        </span>
        {negativas > 0 && (
          <span className="font-medium text-perigo-tinta">
            {negativas === 1 ? "1 semana fica negativa" : `${negativas} semanas ficam negativas`}
          </span>
        )}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 11, fill: "var(--texto-discreto)" }}
              stroke="var(--borda-forte)"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--texto-discreto)" }}
              width={64}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => Number(v).toLocaleString("pt-BR")}
            />
            <Tooltip
              formatter={(valor) => reaisBr(Number(valor))}
              contentStyle={{
                background: "var(--superficie)",
                border: "1px solid var(--borda)",
                color: "var(--texto)",
                fontSize: 12,
              }}
            />
            <ReferenceLine y={0} stroke="var(--perigo-tinta)" strokeDasharray="6 4" strokeWidth={1.5} />
            <Line
              type="monotone"
              dataKey="saldo"
              name="Saldo"
              stroke="var(--primaria)"
              strokeWidth={2.5}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: { saldo: number }; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
                const neg = payload.saldo < 0;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={neg ? 5 : 3}
                    fill={neg ? "var(--perigo-tinta)" : "var(--primaria)"}
                    stroke="var(--superficie)"
                    strokeWidth={1}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
