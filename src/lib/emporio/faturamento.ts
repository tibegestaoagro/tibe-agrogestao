import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { inicioDoMesInstante, somarMeses, type MesCivil } from "@/lib/emporio/mes";

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

/** Vendas líquidas em centavos: `net_amount` das vendas menos o valor das devoluções. */
export function faturamentoLiquidoCent(vendas: { net_amount: unknown }[], devolucoes: { amount: unknown }[]): number {
  return (
    vendas.reduce((s, v) => s + centavos(decToNum(v.net_amount) ?? 0), 0) -
    devolucoes.reduce((s, d) => s + centavos(decToNum(d.amount) ?? 0), 0)
  );
}

/**
 * O faturamento líquido de uma loja num mês, em centavos: a mesma soma de vendas do `margemDaJanela`
 * (vendas concluídas por `sold_at` no mês, menos as devoluções por `returned_at`), que é a base do rateio
 * automático da despesa fixa.
 */
export async function faturamentoLiquidoDoMes(db: TenantPrismaClient, lojaId: string, mes: MesCivil): Promise<number> {
  const de = inicioDoMesInstante(mes);
  const ate = inicioDoMesInstante(somarMeses(mes, 1));
  const [vendas, devolucoes] = await Promise.all([
    db.emporioSale.findMany({
      where: { establishment_id: lojaId, status: "concluida", sold_at: { gte: de, lt: ate } },
      select: { net_amount: true },
    }),
    db.emporioSaleReturn.findMany({
      where: { returned_at: { gte: de, lt: ate }, sale: { establishment_id: lojaId } },
      select: { amount: true },
    }),
  ]);
  return faturamentoLiquidoCent(vendas, devolucoes);
}
