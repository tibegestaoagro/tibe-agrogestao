import type { Prisma } from "@/generated/prisma/client";
import { decToNum, isoOrNull } from "@/lib/serialize";
import {
  custoDoSugerido,
  custoMedio,
  diferencaPct,
  type BaseCustoPreco,
  type MovimentoDeCusto,
  type OrigemCustoSugerido,
  type ResultadoCusto,
} from "@/lib/emporio/custo-medio";

/**
 * Leitura dos dois custos (médio e última compra) por loja e produto
 * (Módulo 39, Q293 a Q297). Nada é gravado: tudo sai das movimentações.
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
  ultima_compra_em: null,
};

const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const arred2 = (n: number) => Math.round(n * 100) / 100;
const arredOuNull = (n: number | null, f: number) => (n === null ? null : arred4(n * f));

export type CamposDeCusto = {
  average_cost: number | null;
  last_purchase_cost: number | null;
  last_purchase_on: string | null;
  price_cost_basis: BaseCustoPreco;
  suggested_cost: number | null;
  suggested_cost_source: OrigemCustoSugerido | null;
  cost_gap_pct: number | null;
};

/**
 * Os campos do contrato aditivo. `fator` converte do custo por unidade-base
 * para o da apresentação (1 no estoque). O custo médio aparece como "sem
 * estoque" (nulo) com saldo zero ou negativo (Q297); `cost_gap_pct` compara os
 * custos crus, antes da conversão.
 */
export function camposDeCusto(
  r: ResultadoCusto,
  base: BaseCustoPreco,
  referencia: number | null,
  fator = 1,
): CamposDeCusto {
  const medioVale = r.saldo > 0 ? r.custo_medio : null;
  const sug = custoDoSugerido(
    {
      saldo: r.saldo,
      custo_medio: r.custo_medio,
      ultima_compra_custo: r.ultima_compra_custo,
      referencia,
    },
    base,
  );
  const gap = diferencaPct(medioVale, r.ultima_compra_custo);
  return {
    average_cost: arredOuNull(medioVale, fator),
    last_purchase_cost: arredOuNull(r.ultima_compra_custo, fator),
    last_purchase_on: isoOrNull(r.ultima_compra_em),
    price_cost_basis: base,
    suggested_cost: arredOuNull(sug.custo, fator),
    suggested_cost_source: sug.origem,
    cost_gap_pct: gap === null ? null : arred2(gap),
  };
}
