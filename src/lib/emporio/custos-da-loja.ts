import type { Prisma } from "@/generated/prisma/client";
import { decToNum } from "@/lib/serialize";
import {
  custoDoSugerido,
  custoMedio,
  type MovimentoDeCusto,
  type OrigemCustoSugerido,
  type ResultadoCusto,
} from "@/lib/emporio/custo-medio";

/**
 * Leitura do custo por loja e produto (Módulo 39, Q297 e Q299). Nada é
 * gravado: tudo sai das movimentações.
 */

type Tx = Prisma.TransactionClient;

export const chaveLojaProduto = (lojaId: string, productId: string) => `${lojaId}|${productId}`;

/** `productIds` são ids de `Product` (é o que a movimentação guarda), não de `EmporioProduct`. */
export async function lerCustosDasLojas(
  c: Tx,
  lojaIds: string[],
  productIds: string[],
): Promise<Map<string, ResultadoCusto>> {
  const saida = new Map<string, ResultadoCusto>();
  if (lojaIds.length === 0 || productIds.length === 0) return saida;
  const linhas = await c.stockMovement.findMany({
    where: { canceled_at: null, establishment_id: { in: lojaIds }, product_id: { in: productIds } },
    select: {
      product_id: true,
      establishment_id: true,
      movement_type: true,
      quantity: true,
      previous_balance: true,
      corrected_balance: true,
      unit_cost: true,
      occurred_at: true,
      created_at: true,
    },
  });
  const porPar = new Map<string, MovimentoDeCusto[]>();
  for (const l of linhas) {
    if (!l.establishment_id) continue;
    const k = chaveLojaProduto(l.establishment_id, l.product_id);
    const m: MovimentoDeCusto = {
      movement_type: l.movement_type,
      quantity: decToNum(l.quantity) ?? 0,
      previous_balance: decToNum(l.previous_balance),
      corrected_balance: decToNum(l.corrected_balance),
      unit_cost: decToNum(l.unit_cost),
      occurred_at: l.occurred_at,
      created_at: l.created_at,
    };
    const lista = porPar.get(k);
    if (lista) lista.push(m);
    else porPar.set(k, [m]);
  }
  for (const [k, movs] of porPar) saida.set(k, custoMedio(movs));
  return saida;
}

export const SEM_MOVIMENTO: ResultadoCusto = {
  saldo: 0,
  custo_medio: null,
  estimado: false,
  ultima_compra_custo: null,
};

const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const arredOuNull = (n: number | null, f: number) => (n === null ? null : arred4(n * f));

export type CamposDeCusto = {
  average_cost: number | null;
  suggested_cost: number | null;
  suggested_cost_source: OrigemCustoSugerido | null;
};

/**
 * `fator` converte do custo por unidade-base para o da apresentação (1 no
 * estoque). O custo médio aparece como "sem estoque" (nulo) com saldo zero ou
 * negativo (Q297); `suggested_cost` é o custo único do produto (Q299).
 */
export function camposDeCusto(r: ResultadoCusto, referencia: number | null, fator = 1): CamposDeCusto {
  const medioVale = r.saldo > 0 ? r.custo_medio : null;
  const sug = custoDoSugerido({
    saldo: r.saldo,
    custo_medio: r.custo_medio,
    ultima_compra_custo: r.ultima_compra_custo,
    referencia,
  });
  return {
    average_cost: arredOuNull(medioVale, fator),
    suggested_cost: arredOuNull(sug.custo, fator),
    suggested_cost_source: sug.origem,
  };
}
