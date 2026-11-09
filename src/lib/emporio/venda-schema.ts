import { z } from "zod";
import { ORIGENS_DA_VENDA } from "@/lib/emporio/frete";
import { BANDEIRAS } from "@/lib/emporio/cartao";

/**
 * Pedaços de Zod da venda do Meu Empório, compartilhados pela rota de venda e
 * pela de troca (a troca leva uma venda nova no mesmo formato). Só formato:
 * a regra de negócio é da action, que revalida em TypeScript puro.
 */

export const dataIso = z
  .string({ error: "Informe uma data válida." })
  .refine((v) => !Number.isNaN(Date.parse(v)), "Informe uma data válida.")
  .transform((v) => new Date(v));

/** O caixa (`cash_register_id`) opcional das operações de dinheiro da gaveta. */
export const caixaDoTurno = z.string().nullish();

export const itemDeVendaSchema = z.object({
  emporio_product_id: z.string({ error: "Escolha o produto." }).min(1, "Escolha o produto."),
  presentation_id: z.string({ error: "Escolha a apresentação." }).min(1, "Escolha a apresentação."),
  quantity: z.number({ error: "Informe a quantidade." }),
  unit_price: z.number({ error: "Informe o preço." }).nullish(),
});

export const pagamentoDeVendaSchema = z.object({
  kind: z.string({ error: "Escolha a forma de pagamento." }).min(1, "Escolha a forma de pagamento."),
  amount: z.number({ error: "Informe o valor do pagamento." }),
  bank_account_id: z.string().nullish(),
  due_date: dataIso.nullish(),
  /** Crédito parcelado (2 a 12): a regra de negócio é da action. */
  installments: z.number({ error: "Informe o número de parcelas." }).nullish(),
  /** Cartão (Q254): sem a adquirente vale a única com taxa vigente; sem a bandeira, só a linha `qualquer`. */
  acquirer_id: z.string().nullish(),
  brand: z.enum(BANDEIRAS, { error: "Escolha uma bandeira válida." }).nullish(),
  /** Cheque: número, banco e "bom para". Os três são exigidos pela action (422 `payments`). */
  check: z
    .object({
      number: z.string().nullish(),
      bank: z.string().nullish(),
      good_for: dataIso.nullish(),
    })
    .nullish(),
});

/** O pedido para entrega (orçamento e venda): só formato, a regra é de `resolverPedidoParaEntrega`. */
export const pedidoParaEntregaSchema = z.object({
  for_delivery: z.boolean({ error: "Marque ou desmarque o pedido para entrega." }).nullish(),
  delivery_address_kind: z.string().nullish(),
  delivery_zip: z.string().nullish(),
  delivery_street: z.string().nullish(),
  delivery_number: z.string().nullish(),
  delivery_complement: z.string().nullish(),
  delivery_district: z.string().nullish(),
  delivery_city: z.string().nullish(),
  delivery_state: z.string().nullish(),
});

export const corpoDaVendaSchema = z.object({
  ...pedidoParaEntregaSchema.shape,
  customer_id: z.string().nullish(),
  sold_at: dataIso.nullish(),
  items: z.array(itemDeVendaSchema, { error: "Inclua os itens da venda." }),
  payments: z.array(pagamentoDeVendaSchema).nullish(),
  notes: z.string().nullish(),
  /** Entrega 2: o caixa do turno; sem ele a action resolve pelo turno aberto. */
  cash_register_id: caixaDoTurno,
  /** Entrega 3: quem vendeu. Obrigatório para o Caixa (regra da action); na troca é ignorado (vale o da venda original). */
  seller_user_id: z.string().nullish(),
  /** Entrega 4: o orçamento que esta venda fatura. Na troca é ignorado (a venda nova não fatura orçamento). */
  quote_id: z.string().nullish(),
  /** Frete cobrado do cliente: soma ao que ele paga, não ao faturamento (Q244). */
  freight_amount: z.number({ error: "O frete deve ser um número." }).min(0, { error: "O frete não pode ser negativo." }).nullish(),
  /** De onde veio o pedido (Q248). */
  origin: z.enum(ORIGENS_DA_VENDA, { error: "Escolha a origem: balcão ou e-commerce." }).nullish(),
});

/**
 * Entrega 4: o corpo do orçamento. Sem pagamento, data nem caixa: o orçamento
 * não mexe em dinheiro. Cliente, vendedor, preço e desconto são regra da action.
 */
export const corpoDoOrcamentoSchema = z.object({
  ...pedidoParaEntregaSchema.shape,
  customer_id: z.string().nullish(),
  items: z.array(itemDeVendaSchema, { error: "Inclua os itens do orçamento." }),
  notes: z.string().nullish(),
  seller_user_id: z.string().nullish(),
});

export const itemDevolvidoSchema = z.object({
  sale_item_id: z.string({ error: "Escolha o item." }).min(1, "Escolha o item."),
  quantity: z.number({ error: "Informe a quantidade devolvida." }),
  loss_reason: z.string().nullish(),
});

export const chaveDeOperacao = z
  .string({ error: "Falta a chave da operação." })
  .trim()
  .min(1, "Falta a chave da operação.");
