import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { closeMilkPeriod } from "@/lib/actions/milk-sales";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/milk/sales/close   o fechamento por período (§28 e §29).
 *
 * Não move leite: cobra o que JÁ SAIU. As entregas do período recebem o
 * `negotiation_id` do fechamento, e é isso que as tira da lista de pendentes.
 * Fechar duas vezes o mesmo período não cobra duas vezes, porque a segunda
 * chamada não encontra nada em aberto e devolve 422 `SEM_ENTREGAS`.
 *
 * O exemplo do §29 sai daqui: 15 dias, 7.200 litros a R$ 2,35, R$ 16.920,00.
 */

const parcela = z.object({
  due_date: z.coerce.date(),
  amount: z.number().positive("O valor da parcela deve ser maior que zero"),
});

const custo = z.object({
  descricao: z.string().trim().min(1, "Descreva o custo").max(120),
  amount: z.number().positive("O valor do custo deve ser maior que zero"),
});

const schema = z.object({
  buyer_id: z.string().min(1, "Escolha o comprador"),
  property_id: z.string().min(1, "Informe a fazenda"),
  de: z.coerce.date(),
  ate: z.coerce.date(),
  amount: z.number().positive("O valor deve ser maior que zero").max(100_000_000).nullish(),
  price_per_liter: z.number().positive("O preço por litro deve ser maior que zero").max(10_000).nullish(),
  pago: z.boolean().optional(),
  due_date: z.coerce.date().nullish(),
  parcelas: z.array(parcela).max(60).optional(),
  custos: z.array(custo).max(30).optional(),
  period_label: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await closeMilkPeriod(g.db, {
    ...parsed.data,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
