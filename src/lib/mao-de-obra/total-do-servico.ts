import type { ServicePricing } from "@/generated/prisma/client";

/**
 * O total de um serviço contratado (§14, §15, §17, §18 e §19 do Módulo 33).
 *
 * DERIVADO, sempre. O `ServiceJob` guarda o COMBINADO (preço unitário ou valor
 * fechado), que é dado de entrada; a quantidade é a soma dos logs. Um total
 * gravado divergiria do que o produtor lançou, em silêncio, que é a mesma razão
 * de o saldo do rebanho e o do estoque também serem soma.
 *
 * ⚠️ `worker_count` multiplica o VALOR, nunca a quantidade. O §14 é explícito:
 * três homens por quatro dias são "12 diárias", mas **o serviço durou quatro
 * dias**. Somar 12 na quantidade faria a tela dizer que a cerca levou doze
 * dias, e o §19 (o mesmo serviço em vários dias) passaria a mentir sobre a
 * duração de tudo que tem mais de uma pessoa.
 */
export type ServicoParaTotal = {
  pricing: ServicePricing;
  unit_price: number | null;
  agreed_amount: number | null;
  worker_count: number;
};

export type LogParaTotal = { quantity: number; canceled_at: Date | null };

/**
 * A quantidade trabalhada: soma dos logs NÃO cancelados.
 *
 * Cancelar um log não o apaga, como em `HerdMovement`: ele para de contar e
 * continua no histórico, para "por que este serviço tinha 12 hectares ontem e
 * hoje tem 8" ter resposta.
 */
export function quantidadeTrabalhada(logs: LogParaTotal[]): number {
  return logs
    .filter((l) => l.canceled_at === null)
    .reduce((soma, l) => soma + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
}

export function totalDoServico(s: ServicoParaTotal, logs: LogParaTotal[]): number {
  if (s.pricing === "fechado") {
    /**
     * Empreito sem valor combinado vale ZERO, e nunca o `unit_price`.
     *
     * Cair no preço unitário aqui inventaria um número que ninguém combinou, e
     * o §15 é sobre valor fechado justamente porque não há unidade. Um empreito
     * sem valor é cadastro incompleto, e a tela precisa mostrar isso como zero
     * para o produtor perceber, em vez de exibir um total plausível e errado.
     */
    return Number.isFinite(s.agreed_amount ?? NaN) ? (s.agreed_amount as number) : 0;
  }

  if (!Number.isFinite(s.unit_price ?? NaN)) return 0;

  // Zero ou negativo conta como uma pessoa: o §14 fala de "3 homens", e um
  // `worker_count` inválido não pode zerar um serviço que aconteceu.
  const pessoas = Number.isFinite(s.worker_count) && s.worker_count > 0 ? s.worker_count : 1;

  // Centavos antes de multiplicar, para 2,5 horas a 250 dar 625 e não 624,99.
  const bruto = quantidadeTrabalhada(logs) * (s.unit_price as number) * pessoas;
  return Math.round(bruto * 100) / 100;
}
