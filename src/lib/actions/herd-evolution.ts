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
  // Filtra pela propriedade ATUAL do lote (AnimalBatch.property_id): uma
  // transferência entre propriedades não é reconstruída retroativamente
  // aqui, mesma aproximação já aceita no resto do módulo (sem histórico de
  // property_id por data).
  const propertyFilter = opts.propertyId ? { property_id: opts.propertyId } : {};
  const movementPropertyFilter = opts.propertyId
    ? { batch: { property_id: opts.propertyId } }
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
  //
  // A aposta: os dois `findMany` não têm `take`, então trazem uma linha (só
  // a data) por animal/movimento CRIADO na janela. Vale porque um `take`
  // daria gráfico errado, e empurrar o agrupamento pro SQL exigiria
  // `$queryRaw`, que burla a extensão de isolamento por tenant. Se algum dia
  // um tenant registrar dezenas de milhares de animais por ano, o custo vira
  // transferência de linhas (render lento), nunca dado errado.
  // Soma CABEÇAS, não linhas: no modelo de lote, uma linha pode valer 20
  // cabeças. Contar linhas (como fazia o modelo antigo, de 1 animal por
  // linha) daria um gráfico silenciosamente errado.
  const [registeredBefore, departedBefore, registeredDates, departedDates] = await Promise.all([
    db.animalBatch.aggregate({
      where: { created_at: { lt: windowStart }, ...propertyFilter },
      _sum: { quantity: true },
    }),
    db.animalMovement.aggregate({
      where: {
        movement_type: { in: ["sale", "death"] },
        occurred_at: { lt: windowStart },
        ...movementPropertyFilter,
      },
      _sum: { quantity: true },
    }),
    db.animalBatch.findMany({
      where: { created_at: { gte: windowStart, lte: windowEnd }, ...propertyFilter },
      select: { created_at: true, quantity: true },
    }),
    db.animalMovement.findMany({
      where: {
        movement_type: { in: ["sale", "death"] },
        occurred_at: { gte: windowStart, lte: windowEnd },
        ...movementPropertyFilter,
      },
      select: { occurred_at: true, quantity: true },
    }),
  ]);

  // `monthEnds` está em ordem crescente, então uma varredura só resolve os N
  // meses: cada data entra na contagem no mês em que cai e nunca mais é
  // revisitada. Ordenar uma vez é o que permite isso.
  const registeredTimes = registeredDates
    .map((b) => ({ t: b.created_at.getTime(), q: b.quantity }))
    .sort((a, b) => a.t - b.t);
  const departedTimes = departedDates
    .map((m) => ({ t: m.occurred_at.getTime(), q: m.quantity }))
    .sort((a, b) => a.t - b.t);

  let registered = registeredBefore._sum.quantity ?? 0;
  let departed = departedBefore._sum.quantity ?? 0;
  let iRegistered = 0;
  let iDeparted = 0;

  return monthEnds.map((monthEnd) => {
    const limite = monthEnd.getTime();
    while (iRegistered < registeredTimes.length && registeredTimes[iRegistered].t <= limite) {
      registered += registeredTimes[iRegistered].q;
      iRegistered++;
    }
    while (iDeparted < departedTimes.length && departedTimes[iDeparted].t <= limite) {
      departed += departedTimes[iDeparted].q;
      iDeparted++;
    }
    return {
      month: monthEnd.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      count: Math.max(registered - departed, 0),
    };
  });
}
