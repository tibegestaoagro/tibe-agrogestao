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

/**
 * Missão 3: a remessa para leilão, feira ou evento (§8).
 *
 * NÃO tem `amount`, e isso é o contrato inteiro em uma linha: o §17.8 diz que
 * o envio não pode gerar venda antes da confirmação, e um campo de valor aqui
 * seria o convite para gerar. O valor entra no encerramento.
 */
export const eventConsignmentSchema = z.object({
  property_id: z.string().min(1, "Informe a fazenda"),
  category_id: z.string().min(1, "Informe a categoria dos animais"),
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  pasture_id: z.string().min(1).nullish(),
  /** §8.1: nome do evento, tipo do evento, município, organizador. */
  event_name: z.string().trim().min(1, "Informe o nome do evento").max(200),
  event_type: z.string().trim().min(1).max(100).nullish(),
  city: z.string().trim().min(1).max(120).nullish(),
  organizer_name: z.string().trim().min(1).max(200).nullish(),
  contact_id: z.string().min(1).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  expected_end_at: z.string().datetime({ message: "Data prevista inválida" }).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export type EventConsignmentBody = z.infer<typeof eventConsignmentSchema>;

/**
 * Os destinos possíveis do "outro destino" no encerramento.
 *
 * `terceiro_na_fazenda` fica de fora: aquele tipo troca o DONO das cabeças, e
 * o gado do produtor não passa a ser de outra pessoa por mudar de lugar. A
 * action recusa pela mesma razão, e ter a lista nos dois lugares é de
 * propósito: o schema recusa a forma, a action recusa a regra.
 */
const outroDestinoSchema = z.object({
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  type: z.enum(["pasto_terceiro", "boitel", "evento", "desaparecimento"]),
  counterparty_name: z.string().trim().min(1).max(200).nullish(),
  location_name: z.string().trim().min(1).max(200).nullish(),
  city: z.string().trim().min(1).max(120).nullish(),
  expected_end_at: z.string().datetime({ message: "Data prevista inválida" }).nullish(),
});

/**
 * O encerramento da remessa: quantos venderam, quantos voltaram e quantos
 * seguiram para outro destino. A soma tem que bater com o enviado, e quem
 * confere isso é a action, que conhece o saldo.
 */
export const eventCloseSchema = z.object({
  vendidos: z.number().int().nonnegative().nullish(),
  retornados: z.number().int().nonnegative().nullish(),
  outro_destino: outroDestinoSchema.nullish(),
  amount: z.number().positive("O valor da venda deve ser maior que zero").nullish(),
  pago: z.boolean().nullish(),
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }).nullish(),
  parcelas: z.array(parcelaSchema).nullish(),
  custos: z.array(custoSchema).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
});

export type EventCloseBody = z.infer<typeof eventCloseSchema>;

/**
 * Missão 4: a permuta (§12).
 *
 * Cada lado é um objeto com `kind` e os campos que aquele `kind` exige. O
 * discriminador vive no schema para o Zod recusar um lado de animais sem
 * categoria antes de a action ver o corpo, e para o lado ENTREGUE (uma máquina
 * que já existe) não aceitar por engano os campos de cadastro do lado
 * RECEBIDO (uma máquina que nasce agora).
 */
const ladoEntregueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("animais"),
    category_id: z.string().min(1, "Informe a categoria dos animais"),
    quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
    pasture_id: z.string().min(1).nullish(),
  }),
  z.object({
    kind: z.literal("produtos"),
    product_id: z.string().min(1, "Informe o produto"),
    quantity: z.number().positive("A quantidade deve ser maior que zero"),
  }),
  z.object({
    kind: z.literal("maquina"),
    machine_id: z.string().min(1, "Informe a máquina entregue"),
  }),
  z.object({
    kind: z.literal("descricao"),
    texto: z.string().trim().min(1, "Descreva o que foi entregue").max(300),
  }),
]);

const ladoRecebidoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("animais"),
    category_id: z.string().min(1, "Informe a categoria dos animais"),
    quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
    pasture_id: z.string().min(1).nullish(),
  }),
  z.object({
    kind: z.literal("produtos"),
    product_id: z.string().min(1, "Informe o produto"),
    quantity: z.number().positive("A quantidade deve ser maior que zero"),
  }),
  z.object({
    kind: z.literal("maquina"),
    name: z.string().trim().min(1, "Informe o nome da máquina").max(200),
    type: z.string().trim().min(1, "Informe o tipo da máquina").max(100),
    brand: z.string().trim().min(1).max(100).nullish(),
    model: z.string().trim().min(1).max(100).nullish(),
    year: z.number().int().min(1900).max(2200).nullish(),
  }),
  z.object({
    kind: z.literal("descricao"),
    texto: z.string().trim().min(1, "Descreva o que foi recebido").max(300),
  }),
]);

export const barterSchema = z.object({
  property_id: z.string().min(1, "Informe a fazenda"),
  entregue: ladoEntregueSchema.nullish(),
  recebido: ladoRecebidoSchema.nullish(),
  /** §12.2: "houve diferença em dinheiro?". É o valor da negociação. */
  diferenca: z
    .object({
      direcao: z.enum(["paguei", "recebi"]),
      amount: z.number().positive("A diferença deve ser maior que zero"),
    })
    .nullish(),
  contact_id: z.string().min(1).nullish(),
  contact_name: z.string().trim().min(1).max(200).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  pago: z.boolean().nullish(),
  due_date: z.string().datetime({ message: "Data de vencimento inválida" }).nullish(),
  parcelas: z.array(parcelaSchema).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export type BarterBody = z.infer<typeof barterSchema>;
