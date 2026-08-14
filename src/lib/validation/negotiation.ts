import { z } from "zod";

/**
 * O contrato de entrada de `POST /api/v1/negotiations`.
 *
 * Vive fora do route handler para poder ser TESTADO. O motivo é concreto: o
 * formulário passou a mandar `contact_name` e o schema não tinha esse campo,
 * então o Zod descartava a chave em silêncio. O nome digitado sumia entre a
 * tela e o banco, o formulário parecia funcionar e o contato nunca nascia.
 * Nenhum teste pegou, porque as suítes chamam a action direto e as rotas
 * `/api/v1` ficam atrás de sessão, que teste não tem.
 *
 * Com o schema aqui, `test:m35` consegue provar que todo campo que a tela
 * manda sobrevive à validação, que é exatamente o degrau em que aquele defeito
 * morava.
 */

const itemSchema = z.object({
  category_id: z.string().min(1, "Informe a categoria dos animais"),
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  pasture_id: z.string().min(1).nullish(),
});

const parcelaSchema = z.object({
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }),
  amount: z.number().positive("O valor da parcela deve ser maior que zero"),
});

const custoSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva o custo adicional"),
  amount: z.number().nonnegative("Custo adicional não pode ser negativo"),
});

export const negotiationCreateSchema = z.object({
  type: z.enum(["compra_gado", "venda_gado"]),
  property_id: z.string().min(1, "Informe a fazenda"),
  itens: z.array(itemSchema).min(1, "Informe pelo menos uma categoria"),
  amount: z.number().positive("Informe o valor total do negócio"),
  contact_id: z.string().min(1).nullish(),
  /**
   * §5: o nome digitado, quando o produtor cadastra o contato na hora. A action
   * resolve ou cria dentro da transação, com busca exata, para que uma recusa
   * por saldo não deixe contato órfão.
   */
  contact_name: z.string().trim().min(1).max(200).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  /** §6.3 e §7.3: "o pagamento já foi feito?" */
  pago: z.boolean().nullish(),
  /**
   * §6.3 e §7.3: quando não foi pago, o vencimento é o primeiro dado pedido.
   * Sem ele a conta nasce vencendo hoje e o alerta de atraso dispara na hora.
   */
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }).nullish(),
  parcelas: z.array(parcelaSchema).nullish(),
  custos: z.array(custoSchema).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export type NegotiationCreateBody = z.infer<typeof negotiationCreateSchema>;
