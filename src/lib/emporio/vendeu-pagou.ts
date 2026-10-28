import type { Prisma } from "@/generated/prisma/client";
import { scoped } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { createLinkedEntry } from "@/lib/financial";
import { custoMedio } from "@/lib/emporio/custo-medio";
import { mesDoInstante, ultimoDia } from "@/lib/emporio/mes";
import { INCLUDE_PRODUTO, lacradoEfetivo } from "@/lib/actions/emporio-catalogo";
import { lerMovimentos } from "@/lib/actions/emporio-estoque";

/**
 * Meu Empório, F4a: o "Vendeu, Pagou" gravado na transação da venda (Q97, Q98)
 * e desfeito no cancelamento (Q99).
 *
 * Mora fora de `emporio-vendas.ts` para a tela de Despesas poder importar o
 * que precisa de `emporio-caixa.ts` sem fechar um ciclo de importação
 * (vendas -> despesas -> caixa -> vendas). Não tem regra de permissão: quem a
 * chama é a venda, que já validou o ator.
 */

type Tx = Prisma.TransactionClient;

/** Nomes que já são categoria de lançamento do Empório: uma regra com eles se confundiria com a taxa ou a receita. */
export const CATEGORIAS_RESERVADAS = ["Vendas do Empório", "Devoluções de vendas do Empório", "Taxas de cartão", "Diferença de caixa"];

const arred2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const arred3 = (n: number) => Math.round(Number((n * 1000).toPrecision(14))) / 1000;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

export type VendaParaRegras = {
  sale_id: string;
  establishment_id: string;
  sold_at: Date;
  net: number;
  itens: { emporio_product_id: string; presentation_id: string; quantity: number; total: number }[];
  /** Forma e valor de cada parte paga (a troca inclusive). */
  pagamentos: { kind: string; amount: number }[];
};

export async function gravarVendeuPagou(tx: Tx, ator: { id: string }, v: VendaParaRegras): Promise<void> {
  const regras = await tx.variableExpenseRule.findMany({
    where: { establishment_id: v.establishment_id, archived_at: null },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  if (regras.length === 0) return;

  const netCent = centavos(v.net);
  const vencimento = ultimoDia(mesDoInstante(v.sold_at));

  for (const regra of regras) {
    const valor = decToNum(regra.value) ?? 0;

    // Condições de produto e apresentação filtram os itens.
    const temCondicaoDeItem = !!regra.emporio_product_id || !!regra.presentation_id;
    const casam = v.itens.filter(
      (i) =>
        (!regra.emporio_product_id || i.emporio_product_id === regra.emporio_product_id) &&
        (!regra.presentation_id || i.presentation_id === regra.presentation_id),
    );
    if (temCondicaoDeItem && casam.length === 0) continue;

    // Condição de forma: só a parte paga naquela forma.
    let parteCent = netCent;
    if (regra.payment_kind) {
      parteCent = v.pagamentos.filter((p) => p.kind === regra.payment_kind).reduce((s, p) => s + centavos(p.amount), 0);
      if (parteCent <= 0) continue;
    }

    const snapshot: Record<string, unknown> = {
      name: regra.name,
      kind: regra.kind,
      value: valor,
      payment_kind: regra.payment_kind,
      emporio_product_id: regra.emporio_product_id,
      presentation_id: regra.presentation_id,
      packaging_emporio_product_id: regra.packaging_emporio_product_id,
    };
    const unidades = arred3(casam.reduce((s, i) => s + i.quantity, 0));

    if (regra.kind === "embalagem") {
      if (!regra.packaging_emporio_product_id || !(unidades > 0)) continue;
      const embalagem = await tx.emporioProduct.findFirst({
        where: { id: regra.packaging_emporio_product_id },
        include: INCLUDE_PRODUTO,
      });
      if (!embalagem) continue;
      const baixa = arred3(valor * unidades);
      if (!(baixa > 0)) continue;

      const movs = await lerMovimentos(tx, [v.establishment_id], [embalagem.product_id]);
      const resumo = custoMedio(movs);
      const custo = resumo.custo_medio === null ? null : arred4(resumo.custo_medio);
      const provisorio = custo === null || resumo.saldo - baixa < 0;
      const separa = lacradoEfetivo(embalagem);
      snapshot.units = unidades;
      snapshot.quantity = baixa;
      snapshot.unit_cost = custo;

      const despesa = await tx.saleVariableExpense.create({
        data: scoped({
          sale_id: v.sale_id,
          rule_id: regra.id,
          rule_snapshot: snapshot as Prisma.InputJsonValue,
          amount: arred2(baixa * (custo ?? 0)),
          cost_provisional: provisorio,
        }),
      });
      // Nunca bloqueia a venda: sem saldo, a embalagem fica negativa.
      await tx.stockMovement.create({
        data: scoped({
          product_id: embalagem.product_id,
          establishment_id: v.establishment_id,
          property_id: null,
          movement_type: "utilizacao" as const,
          quantity: baixa,
          occurred_at: v.sold_at,
          package_state: separa ? ("avulso" as const) : null,
          presentation_id: null,
          unit_cost: custo,
          sale_variable_expense_id: despesa.id,
          recorded_by_user_id: ator.id,
        }),
      });
      continue;
    }

    let valorCent = 0;
    if (regra.kind === "percentual") {
      const baseCent = casam.reduce((s, i) => s + centavos(i.total), 0);
      const fatia = netCent > 0 ? parteCent / netCent : 0;
      valorCent = Math.round(Number(((baseCent * valor * fatia) / 100).toPrecision(12)));
    } else if (regra.kind === "fixo_por_venda") {
      valorCent = centavos(valor);
    } else if (regra.kind === "por_unidade") {
      valorCent = centavos(valor * unidades);
    }
    if (valorCent <= 0) continue;

    const conta = await createLinkedEntry(tx, {
      entry_type: "expense",
      category: regra.name,
      amount: valorCent / 100,
      related_module: "emporio",
      related_id: v.sale_id,
      occurred_at: v.sold_at,
      status: "pending",
      due_date: vencimento,
      establishment_id: v.establishment_id,
    });
    await tx.saleVariableExpense.create({
      data: scoped({
        sale_id: v.sale_id,
        rule_id: regra.id,
        rule_snapshot: snapshot as Prisma.InputJsonValue,
        amount: valorCent / 100,
        financial_entry_id: conta.id,
      }),
    });
  }
}

/**
 * Cancelamento total da venda (Q99): a conta sem pagamento vira `cancelled`, a
 * paga fica, e a baixa da embalagem é cancelada. Devolução parcial não chama
 * isto.
 */
export async function cancelarVendeuPagou(tx: Tx, saleId: string, agora: Date, motivo: string): Promise<void> {
  const despesas = await tx.saleVariableExpense.findMany({
    where: { sale_id: saleId, canceled_at: null },
    select: { id: true, financial_entry_id: true },
  });
  if (despesas.length === 0) return;
  await tx.saleVariableExpense.updateMany({
    where: { id: { in: despesas.map((d) => d.id) } },
    data: { canceled_at: agora },
  });
  await tx.stockMovement.updateMany({
    where: { sale_variable_expense_id: { in: despesas.map((d) => d.id) }, canceled_at: null },
    data: { canceled_at: agora, canceled_reason: motivo },
  });
  for (const d of despesas) {
    if (!d.financial_entry_id) continue;
    const pagamentos = await tx.financialPayment.count({ where: { entry_id: d.financial_entry_id } });
    if (pagamentos > 0) continue;
    await tx.financialEntry.updateMany({
      where: { id: d.financial_entry_id, status: "pending" },
      data: { status: "cancelled" },
    });
  }
}
