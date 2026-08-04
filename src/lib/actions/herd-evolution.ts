import type { TenantPrismaClient } from "@/lib/prisma";

/**
 * Série histórica do tamanho do rebanho, usada pelo gráfico do dashboard.
 * Separada de `animals.ts` na auditoria de 2026-08-04 (ver comentário lá).
 */

/**
 * Série mensal do tamanho do rebanho ativo, para o gráfico "Evolução do
 * rebanho" (briefing de layout, Fase 2). Não existe snapshot histórico
 * gravado: reconstrói cada ponto por diferença (animais já cadastrados até
 * o fim do mês, menos os que já saíram por venda/morte até lá), mesmo
 * espírito de `calculatePendingDaysOverdue` (status computado, nunca
 * armazenado).
 */
export async function getHerdEvolution(
  db: TenantPrismaClient,
  opts: { months: number; propertyId?: string | null },
): Promise<{ month: string; count: number }[]> {
  const now = new Date();
  // Filtra pela propriedade ATUAL do animal (Animal.property_id): uma
  // transferência entre propriedades não é reconstruída retroativamente
  // aqui, mesma aproximação já aceita no resto do módulo (sem histórico de
  // property_id por data).
  const propertyFilter = opts.propertyId ? { property_id: opts.propertyId } : {};
  const movementPropertyFilter = opts.propertyId
    ? { animal: { property_id: opts.propertyId } }
    : {};

  if (opts.months < 1) return [];

  const monthEnds = Array.from({ length: opts.months }, (_, idx) => {
    const i = opts.months - 1 - idx;
    return new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
  });
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (opts.months - 1), 1);
  const windowEnd = monthEnds[monthEnds.length - 1];

  // 4 queries no total, em vez de 2 por mês (auditoria de performance,
  // 2026-08-04: com 6 meses eram 12 idas ao banco, ~29% das queries do
  // dashboard inteiro). O resultado é idêntico ao do laço anterior, incluindo
  // o piso em zero: o que estava fora da janela vira uma contagem só, e o que
  // está dentro dela é acumulado sem voltar ao banco.
  const [registeredBefore, departedBefore, registeredDates, departedDates] = await Promise.all([
    db.animal.count({ where: { created_at: { lt: windowStart }, ...propertyFilter } }),
    db.animalMovement.count({
      where: {
        movement_type: { in: ["sale", "death"] },
        occurred_at: { lt: windowStart },
        ...movementPropertyFilter,
      },
    }),
    db.animal.findMany({
      where: { created_at: { gte: windowStart, lte: windowEnd }, ...propertyFilter },
      select: { created_at: true },
    }),
    db.animalMovement.findMany({
      where: {
        movement_type: { in: ["sale", "death"] },
        occurred_at: { gte: windowStart, lte: windowEnd },
        ...movementPropertyFilter,
      },
      select: { occurred_at: true },
    }),
  ]);

  // `monthEnds` está em ordem crescente, então uma varredura só resolve os N
  // meses: cada data entra na contagem no mês em que cai e nunca mais é
  // revisitada. Ordenar uma vez é o que permite isso.
  const registradas = registeredDates.map((a) => a.created_at.getTime()).sort((a, b) => a - b);
  const baixadas = departedDates.map((m) => m.occurred_at.getTime()).sort((a, b) => a - b);

  let registered = registeredBefore;
  let departed = departedBefore;
  let iReg = 0;
  let iBaixa = 0;

  return monthEnds.map((monthEnd) => {
    const limite = monthEnd.getTime();
    while (iReg < registradas.length && registradas[iReg] <= limite) {
      registered++;
      iReg++;
    }
    while (iBaixa < baixadas.length && baixadas[iBaixa] <= limite) {
      departed++;
      iBaixa++;
    }
    return {
      month: monthEnd.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      count: Math.max(registered - departed, 0),
    };
  });
}
