/**
 * Regras puras do fiado do Empório (entrega 2 do financeiro): prazo, vencimento,
 * atraso e mensagem de cobrança. Sem servidor e sem banco. Toda conta de data é em
 * UTC por dia (`Date.UTC`), nunca no fuso do servidor.
 */

export const DIA_MS = 86_400_000;

/** Meia-noite UTC do dia de `d`, em ms. */
export function diaUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Dias corridos de atraso: 0 se ainda não venceu (o dia do vencimento não é atraso). */
export function diasDeAtraso(vencimento: Date, hoje: Date): number {
  const dias = (diaUtc(hoje) - diaUtc(vencimento)) / DIA_MS;
  return dias > 0 ? dias : 0;
}

/**
 * A primeira data ESTRITAMENTE depois do dia de `base` cujo dia do mês é `dia`
 * (ou o último dia do mês, quando o mês é curto). Meia-noite UTC.
 */
export function proximoDiaDoMes(base: Date, dia: number): Date {
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth();
  const ultimo = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const nesteMes = Date.UTC(ano, mes, Math.min(dia, ultimo(ano, mes)));
  if (nesteMes > diaUtc(base)) return new Date(nesteMes);
  return new Date(Date.UTC(ano, mes + 1, Math.min(dia, ultimo(ano, mes + 1))));
}

/** Meia-noite UTC do dia de `base`, mais `dias`. */
export function somarDias(base: Date, dias: number): Date {
  return new Date(diaUtc(base) + dias * DIA_MS);
}

export type RegraDePrazo =
  | { kind: "dias"; value: number; source: "cliente" | "conta" }
  | { kind: "dia_do_mes"; value: number; source: "cliente" };

/** O dia fixo do cliente vence os dias do cliente, que vencem o prazo da conta. */
export function regraDePrazo(
  cliente: { fiado_due_days: number | null; fiado_due_day: number | null },
  conta: { fiado_due_days: number },
): RegraDePrazo {
  if (cliente.fiado_due_day != null) {
    return { kind: "dia_do_mes", value: cliente.fiado_due_day, source: "cliente" };
  }
  if (cliente.fiado_due_days != null) {
    return { kind: "dias", value: cliente.fiado_due_days, source: "cliente" };
  }
  return { kind: "dias", value: conta.fiado_due_days, source: "conta" };
}

export function sugerirVencimento(regra: RegraDePrazo, vendaEm: Date): Date {
  return regra.kind === "dias" ? somarDias(vendaEm, regra.value) : proximoDiaDoMes(vendaEm, regra.value);
}

/**
 * `fiado_due_date` nulo é fiado antigo, sem data própria: vale a venda mais o prazo padrão.
 * Com data própria, a data editada da entrada (`due_date`) vence a original.
 */
export function vencimentoEfetivo(
  entrada: { due_date: Date | null; sold_at: Date; fiado_due_date: Date | null },
  prazoPadraoDias: number,
): Date {
  if (entrada.fiado_due_date == null) return somarDias(entrada.sold_at, prazoPadraoDias);
  return entrada.due_date ?? entrada.fiado_due_date;
}

export const MENSAGEM_DE_COBRANCA_PADRAO =
  "Olá, {nome}! Aqui é da {loja}. Consta um fiado de {valor} vencido há {dias} dias. Pode nos ajudar a acertar? Obrigado!";

export function mensagemDeCobranca(
  modelo: string | null,
  dados: { nome: string; valor: string; dias: number; loja: string },
): string {
  const texto = modelo && modelo.trim() !== "" ? modelo : MENSAGEM_DE_COBRANCA_PADRAO;
  return texto
    .replaceAll("{nome}", dados.nome)
    .replaceAll("{valor}", dados.valor)
    .replaceAll("{dias}", String(dados.dias))
    .replaceAll("{loja}", dados.loja);
}
