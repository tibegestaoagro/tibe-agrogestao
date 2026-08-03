"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Calendário do mês com marcador nos dias que têm evento (briefing de
 * layout, Fase 2). `eventDates` vem pronto do servidor (janela de ±60 dias
 * a partir de hoje: navegar mais que ~1 mês pra frente/trás pode mostrar
 * dias sem marcador mesmo havendo evento fora dessa janela, limitação
 * aceita nesta rodada).
 */
export default function MiniCalendar({ eventDates }: { eventDates: string[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const events = new Set(eventDates);
  const todayKey = toKey(today);

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const lastRowIsNextMonth = days.slice(35).every((d) => d.getMonth() !== cursor.getMonth());
  const visibleDays = lastRowIsNextMonth ? days.slice(0, 35) : days;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          {MONTH_NAMES[cursor.getMonth()]} de {cursor.getFullYear()}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 font-medium text-gray-400">
            {w}
          </span>
        ))}
        {visibleDays.map((d) => {
          const key = toKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          const hasEvent = events.has(key);
          return (
            <div key={key} className="flex flex-col items-center gap-0.5 py-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  isToday
                    ? "bg-tibe-primary font-semibold text-white"
                    : inMonth
                      ? "text-gray-700"
                      : "text-gray-300"
                }`}
              >
                {d.getDate()}
              </span>
              <span className={`h-1 w-1 rounded-full ${hasEvent ? "bg-tibe-accent" : "bg-transparent"}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
