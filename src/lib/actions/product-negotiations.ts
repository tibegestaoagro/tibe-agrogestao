import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction, createLinkedEntry } from "@/lib/financial";
import { recordStockMovementInTx } from "@/lib/actions/stock-ledger";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * "Comprei produtos" e "Vendi produtos" (Módulo 31, §9).
 *
 * Reusa o MESMO envelope da compra e venda de gado: uma `Negotiation` com
 * `type: compra_produto`, apontando para os movimentos de estoque e para os
 * lançamentos financeiros. Não é um segundo modelo de negócio, é o mesmo com
 * filhos de outro tipo, e é por isso que cancelar, situação derivada e totais
 * funcionam igual nos dois.
 *
 * O §9.5 lista o que precisa acontecer depois da confirmação: registrar a
 * compra, criar a despesa, criar a conta a pagar quando necessário, acrescentar
 * ao estoque, vincular o produto à fazenda e salvar no histórico. Tudo isso
 * acontece aqui, numa transação só: uma compra com 3 produtos e 2 parcelas são
 * 5 escritas, e ou entram todas ou nenhuma.
 *
 * "Vendi produtos" não está descrito no documento como operação de entrada (as
 * quatro são comprei gado, vendi gado, comprei produtos e permuta), mas o
 * §10.1 lista "saída por venda". Decisão do usuário em 2026-08-14: incluir
 * agora, simétrico à compra, em vez de deixar o §10.1 sem porta.
 */

export type ItemProdutoInput = {
  product_id: string;
  quantity: number;
};

export type ParcelaInput = { due_date: Date; amount: number };
export type CustoInput = { descricao: string; amount: number };

export type NegociacaoProdutoInput = {
  type: "compra_produto" | "venda_produto";
  property_id: string;
  itens: ItemProdutoInput[];
  /** Valor total do §9.2, sem os custos adicionais. */
  amount: number;
  contact_id?: string | null;
  contact_name?: string | null;
  occurred_at?: Date | null;
  /** §9.4: "a compra já foi paga?" */
  pago?: boolean;
  due_date?: Date | null;
  parcelas?: ParcelaInput[];
  custos?: CustoInput[];
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

const CATEGORIA_FINANCEIRA = {
  compra_produto: "Compra de insumo",
  venda_produto: "Venda de produto",
} as const;

type Falha = { ok: false; code: string; message: string; status: number };

/** Ver o comentário gêmeo em `negotiations.ts`: `return` dentro de
 * `$transaction` CONFIRMA a transação; só `throw` faz rollback. */
class AbortarNegociacao extends Error {
  constructor(readonly falha: Falha) {
    super(falha.message);
    this.name = "AbortarNegociacao";
  }
}

async function comRollback<T>(operacao: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await operacao();
  } catch (err) {
    if (err instanceof AbortarNegociacao) return err.falha;
    throw err;
  }
}

function centavos(v: number): number {
  return Math.round(v * 100);
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function validar(input: NegociacaoProdutoInput): { code: string; message: string } | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { code: "VALIDATION_ERROR", message: "Informe o valor total da compra." };
  }
  if (!input.itens || input.itens.length === 0) {
    return { code: "VALIDATION_ERROR", message: "Informe pelo menos um produto." };
  }
  for (const item of input.itens) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { code: "VALIDATION_ERROR", message: "A quantidade precisa ser maior que zero." };
    }
  }
  for (const custo of input.custos ?? []) {
    if (!Number.isFinite(custo.amount) || custo.amount < 0) {
      return { code: "VALIDATION_ERROR", message: "Custo adicional não pode ser negativo." };
    }
  }

  const parcelas = input.parcelas ?? [];
  if (input.pago && parcelas.length > 0) {
    return {
      code: "VALIDATION_ERROR",
      message: "Uma compra já paga não pode ser parcelada. Escolha uma coisa ou outra.",
    };
  }
  if (!input.pago && parcelas.length > 0) {
    const soma = parcelas.reduce((s, p) => s + centavos(p.amount), 0);
    if (soma !== centavos(input.amount)) {
      return {
        code: "PARCELAS_NAO_FECHAM",
        message:
          `A soma das parcelas (${moeda(soma / 100)}) não corresponde ao valor ` +
          `da compra (${moeda(input.amount)}). Revise os valores.`,
      };
    }
    if (parcelas.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) {
      return { code: "VALIDATION_ERROR", message: "Cada parcela precisa de um valor maior que zero." };
    }
  }

  return null;
}

export async function createProductNegotiation(
  db: TenantPrismaClient,
  input: NegociacaoProdutoInput,
): Promise<ActionResult<{ id: string }>> {
  const erro = validar(input);
  if (erro) return fail(erro.code, erro.message, 422);

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida", 422);
  if (input.contact_id) {
    const contato = await db.contact.findFirst({ where: { id: input.contact_id } });
    if (!contato) return fail("INVALID_CONTACT", "Contato inválido", 422);
  }

  const occurred_at = input.occurred_at ?? new Date();
  const compra = input.type === "compra_produto";

  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
      let contactId = input.contact_id ?? null;
      if (!contactId && input.contact_name?.trim()) {
        contactId = (await findOrCreateContact(tx, input.contact_name)).id;
      }

      const negociacao = await tx.negotiation.create({
        data: scoped({
          type: input.type,
          occurred_at,
          property_id: input.property_id,
          contact_id: contactId,
          amount: input.amount,
          notes: input.notes ?? null,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        }),
      });

      // O estoque. Numa compra entra; numa venda sai, e é o livro-razão que
      // barra saldo negativo (§10.7), com a mesma trava já testada no m37.
      for (const item of input.itens) {
        const movimento = await recordStockMovementInTx(db, tx, {
          product_id: item.product_id,
          property_id: input.property_id,
          movement_type: compra ? "compra" : "venda",
          quantity: item.quantity,
          occurred_at,
          negotiation_id: negociacao.id,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        });
        // throw, não return: é o único jeito de desfazer a negociação já criada.
        if (!movimento.ok) throw new AbortarNegociacao(movimento);
      }

      // §9.4 e §9.5: o dinheiro. Uma linha à vista, ou uma por parcela.
      const parcelas: ParcelaInput[] =
        input.pago || !input.parcelas || input.parcelas.length === 0
          ? [
              {
                // Sem vencimento informado, a conta vence HOJE e não na data do
                // negócio: num registro retroativo ela nasceria vencida e
                // dispararia alerta de atraso na criação. Mesma regra da compra
                // de gado, corrigida lá por um revisor.
                due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
                amount: input.amount,
              },
            ]
          : input.parcelas;

      for (const parcela of parcelas) {
        await createLinkedEntry(tx, {
          entry_type: compra ? "expense" : "income",
          category: CATEGORIA_FINANCEIRA[input.type],
          amount: parcela.amount,
          related_module: "geral",
          related_id: negociacao.id,
          occurred_at,
          due_date: parcela.due_date,
          status: input.pago ? "paid" : "pending",
          negotiation_id: negociacao.id,
          negotiation_role: "principal",
        });
      }

      // §15: frete e taxas são DESPESA sempre, mesmo numa venda.
      // Custo ZERO não vira lançamento: o caminho do WhatsApp já filtrava, o da
      // API não, e um "Frete = 0" criava um `FinancialEntry` de R$ 0,00 que só
      // suja o extrato. `validar` recusa negativo; aqui o zero é ignorado.
      for (const custo of (input.custos ?? []).filter((c) => c.amount > 0)) {
        await createLinkedEntry(tx, {
          entry_type: "expense",
          category: custo.descricao,
          amount: custo.amount,
          related_module: "geral",
          related_id: negociacao.id,
          occurred_at,
          due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
          status: input.pago ? "paid" : "pending",
          negotiation_id: negociacao.id,
          negotiation_role: "custo_adicional",
        });
      }

      return ok({ id: negociacao.id });
    }),
  );
}

/** Só para a resposta ao produtor: "10 sacas de Sal mineral 60 P". */
export function descreverItensProduto(
  itens: { nome: string; unidade: string; quantidade: number }[],
): string {
  return itens
    .map((i) => `${descreverQuantidade(i.quantidade, i.unidade)} de ${i.nome}`)
    .join(" e ");
}
