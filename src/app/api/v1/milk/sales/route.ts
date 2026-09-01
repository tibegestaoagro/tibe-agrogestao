import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { recordMilkSale } from "@/lib/actions/milk-sales";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/milk/sales   a venda avulsa de leite (§23 a §27).
 *
 * Vender JÁ RETIRA o leite: os litros saem do local e a venda nasce na mesma
 * transação. O §23 lista a quantidade vendida como obrigatória, e é assim que
 * o produtor fala ("vendi 500 litros por R$ 2,40").
 *
 * ⚠️ **Não existe rota de cancelamento aqui.** Cancelar é
 * `POST /api/v1/negotiations/:id/cancel`, que passou a desfazer o leite junto.
 * Uma segunda porta deixaria o leite para trás justamente por onde o produtor
 * mais cancela, que é a tela de Negociações.
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
  site_id: z.string().min(1, "Escolha de onde saiu o leite"),
  property_id: z.string().min(1, "Informe a fazenda"),
  liters: z.number().positive("Informe quantos litros foram vendidos").max(1_000_000),
  buyer_id: z.string().min(1).nullish(),
  // §25: um dos dois, nunca os dois. A action recusa o par com
  // `VALOR_DUPLICADO`, e é lá que a regra mora, para o WhatsApp herdá-la.
  amount: z.number().positive("O valor deve ser maior que zero").max(100_000_000).nullish(),
  price_per_liter: z.number().positive("O preço por litro deve ser maior que zero").max(10_000).nullish(),
  occurred_at: z.coerce.date().nullish(),
  pago: z.boolean().optional(),
  due_date: z.coerce.date().nullish(),
  parcelas: z.array(parcela).max(60).optional(),
  custos: z.array(custo).max(30).optional(),
  notes: z.string().trim().max(1000).nullish(),
});

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await recordMilkSale(g.db, {
    ...parsed.data,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const POST = withApi(POSTHandler);
