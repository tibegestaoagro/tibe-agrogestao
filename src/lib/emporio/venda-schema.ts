import { z } from "zod";

/**
 * Pedaços de Zod da venda do Meu Empório, compartilhados pela rota de venda e
 * pela de troca (a troca leva uma venda nova no mesmo formato). Só formato:
 * a regra de negócio é da action, que revalida em TypeScript puro.
 */

export const dataIso = z
  .string({ error: "Informe uma data válida." })
  .refine((v) => !Number.isNaN(Date.parse(v)), "Informe uma data válida.")
  .transform((v) => new Date(v));

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
});

export const corpoDaVendaSchema = z.object({
  contact_id: z.string().nullish(),
  sold_at: dataIso.nullish(),
  items: z.array(itemDeVendaSchema, { error: "Inclua os itens da venda." }),
  payments: z.array(pagamentoDeVendaSchema).nullish(),
  notes: z.string().nullish(),
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
