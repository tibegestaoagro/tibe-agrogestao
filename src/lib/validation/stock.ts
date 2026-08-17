import { z } from "zod";
import { STOCK_UNITS } from "@/lib/stock/units";

/**
 * Contratos de entrada do Estoque (Módulo 31, §9 e §10).
 *
 * Vivem fora dos route handlers para poderem ser TESTADOS. O motivo é
 * concreto: na missão 1 o formulário passou a mandar um campo que o schema da
 * rota não tinha, o Zod descartou a chave em silêncio, e o valor sumiu entre a
 * tela e o banco sem nenhuma suíte perceber. O `test:m37` monta o corpo exato
 * que a tela envia e prova, campo a campo, que todos sobrevivem.
 */

const UNIDADES = STOCK_UNITS.map((u) => u.id) as [string, ...string[]];

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do produto").max(160),
  category_id: z.string().min(1, "Escolha a categoria"),
  unit: z.enum(UNIDADES, { message: "Escolha a unidade de medida" }),
  brand: z.string().trim().max(120).nullish(),
  /** §10.8: nulo significa "sem alerta para este produto". */
  minimum_stock: z.number().nonnegative("O estoque mínimo não pode ser negativo").nullish(),
  storage_location: z.string().trim().max(160).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

/**
 * §10.3: utilização, e as saídas em geral.
 *
 * `ajuste` NÃO entra aqui de propósito: ele tem rota própria, porque o §10.6
 * pede que o produtor informe o saldo REAL contado, não a diferença. Aceitar
 * ajuste por esta rota obrigaria quem chama a calcular a diferença sozinho, que
 * é justamente a conta que o sistema existe para fazer.
 */
export const stockMovementSchema = z.object({
  product_id: z.string().min(1, "Escolha o produto"),
  property_id: z.string().min(1, "Informe a fazenda"),
  movement_type: z.enum(["compra", "venda", "utilizacao"], {
    message: "Tipo de movimentação inválido",
  }),
  quantity: z.number().positive("A quantidade precisa ser maior que zero"),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  /** §10.4, todos opcionais. */
  herd_category_id: z.string().min(1).nullish(),
  pasture_id: z.string().min(1).nullish(),
  purpose: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

/** §10.6: o produtor informa o que EXISTE, e o sistema calcula a diferença. */
export const stockAdjustSchema = z.object({
  product_id: z.string().min(1, "Escolha o produto"),
  property_id: z.string().min(1, "Informe a fazenda"),
  corrected_balance: z.number().nonnegative("O saldo corrigido não pode ser negativo"),
  reason: z.string().trim().max(300).nullish(),
});

const itemProdutoSchema = z.object({
  product_id: z.string().min(1, "Escolha o produto"),
  quantity: z.number().positive("A quantidade deve ser maior que zero"),
});

const parcelaSchema = z.object({
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }),
  amount: z.number().positive("O valor da parcela deve ser maior que zero"),
});

const custoSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva o custo adicional"),
  amount: z.number().nonnegative("Custo adicional não pode ser negativo"),
});

/** §9: "Comprei produtos" e "Vendi produtos". */
export const productNegotiationSchema = z.object({
  type: z.enum(["compra_produto", "venda_produto"]),
  property_id: z.string().min(1, "Informe a fazenda"),
  itens: z.array(itemProdutoSchema).min(1, "Informe pelo menos um produto"),
  amount: z.number().positive("Informe o valor total"),
  contact_id: z.string().min(1).nullish(),
  /** O nome digitado, quando o fornecedor é cadastrado na hora (§5). */
  contact_name: z.string().trim().min(1).max(200).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  pago: z.boolean().nullish(),
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }).nullish(),
  parcelas: z.array(parcelaSchema).nullish(),
  custos: z.array(custoSchema).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
