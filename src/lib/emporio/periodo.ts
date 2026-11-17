import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { ehDataCalendario, somarDiasCalendario } from "@/lib/dia-calendario";

/**
 * O período do A receber, do A pagar e dos filtros de data do Empório (frente A).
 *
 * Puro: sem Prisma. `de` e `ate` são dias de calendário "AAAA-MM-DD", os dois
 * inclusivos. `hoje` é a meia-noite UTC do dia de Brasília (`hojeEmBrasilia`).
 */

export type Periodo = { de: string; ate: string };

/** Uma faixa do resumo: o total em reais e quantos itens a compõem. */
export type Faixa = { total: number; count: number };

export type AtalhoDePeriodo = {
  id: "hoje" | "semana" | "mes" | "mes_passado";
  rotulo: string;
  de: string;
  ate: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Do dia 1 ao último dia do mês de `hoje`. */
function esteMes(hoje: Date): Periodo {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  return { de: iso(new Date(Date.UTC(ano, mes, 1))), ate: iso(new Date(Date.UTC(ano, mes + 1, 0))) };
}

/** `de` e `ate` da URL; ausente, inválido ou `de > ate` vira Este mês. */
export function periodoDaUrl(sp: { de?: string; ate?: string }, hoje: Date): Periodo {
  const { de, ate } = sp ?? {};
  if (ehDataCalendario(de) && ehDataCalendario(ate) && de <= ate) return { de, ate };
  return esteMes(hoje);
}

/**
 * O período das actions do A receber e do A pagar. Os dois ausentes viram Este mês; o que veio e
 * não é data, ou `de` depois de `ate`, é recusa com o campo (a tela já passa a URL por `periodoDaUrl`).
 * Só um dos dois informado também vale Este mês.
 */
export function conferirPeriodo(de: unknown, ate: unknown, hoje: Date): ActionResult<Periodo> {
  const veio = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (veio(de) && !(typeof de === "string" && ehDataCalendario(de))) {
    return fail("VALIDATION_ERROR", "Informe uma data inicial válida (AAAA-MM-DD).", 422, "de");
  }
  if (veio(ate) && !(typeof ate === "string" && ehDataCalendario(ate))) {
    return fail("VALIDATION_ERROR", "Informe uma data final válida (AAAA-MM-DD).", 422, "ate");
  }
  if (veio(de) && veio(ate) && (de as string) > (ate as string)) {
    return fail("VALIDATION_ERROR", "A data final não pode ser antes da inicial.", 422, "ate");
  }
  return ok(periodoDaUrl({ de: veio(de) ? (de as string) : undefined, ate: veio(ate) ? (ate as string) : undefined }, hoje));
}

/** Hoje, Esta semana (domingo a sábado), Este mês e Mês passado. */
export function atalhosDePeriodo(hoje: Date): AtalhoDePeriodo[] {
  const hojeIso = iso(hoje);
  const domingo = somarDiasCalendario(hojeIso, -hoje.getUTCDay());
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const passado: Periodo = {
    de: iso(new Date(Date.UTC(ano, mes - 1, 1))),
    ate: iso(new Date(Date.UTC(ano, mes, 0))),
  };
  const atual = esteMes(hoje);
  return [
    { id: "hoje", rotulo: "Hoje", de: hojeIso, ate: hojeIso },
    { id: "semana", rotulo: "Esta semana", de: domingo, ate: somarDiasCalendario(domingo, 6) },
    { id: "mes", rotulo: "Este mês", ...atual },
    { id: "mes_passado", rotulo: "Mês passado", ...passado },
  ];
}
