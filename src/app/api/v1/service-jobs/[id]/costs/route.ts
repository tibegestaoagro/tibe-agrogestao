import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { getServiceCosts, recordServiceCost, recordServiceFuel } from "@/lib/actions/service-costs";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/service-jobs/:id/costs   o custo do serviço (§25).
 * POST /api/v1/service-jobs/:id/costs   um custo novo (§21 a §24).
 *
 * O POST bifurca: com `product_id` ou `kind: "combustivel"`, é o combustível
 * do §21, que baixa do estoque; senão, é o custo comum do §24, que só vira
 * despesa quando `saiu_do_caixa` é marcado (decisão 17).
 *
 * Guard `servicos`: ver `src/app/api/v1/service-jobs/route.ts`.
 */

const KINDS = [
  "combustivel",
  "mao_de_obra",
  "pedagio",
  "alimentacao",
  "transporte",
  "manutencao",
  "pecas",
  "lubrificantes",
  "comissao",
  "outro",
] as const;

const schema = z.object({
  kind: z.enum(KINDS, { message: "Escolha a natureza do custo" }),
  description: z.string().trim().max(200).nullish(),
  product_id: z.string().nullish(),
  quantity: z.number().positive().nullish(),
  unit: z.string().trim().max(20).nullish(),
  unit_price: z.number().positive().nullish(),
  amount: z.number().positive("O valor precisa ser maior que zero").nullish(),
  occurred_at: z.string().datetime("Informe uma data válida").nullish(),
  notes: z.string().trim().max(500).nullish(),
  saiu_do_caixa: z.boolean().nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("servicos", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const res = await getServiceCosts(g.db, id);
  return apiOk(res);
}

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("servicos", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  const quando = d.occurred_at ? new Date(d.occurred_at) : null;

  if (d.kind === "combustivel" || d.product_id) {
    const res = await recordServiceFuel(g.db, {
      service_job_id: id,
      product_id: d.product_id ?? null,
      description: d.description ?? null,
      quantity: d.quantity ?? 0,
      unit: d.unit ?? null,
      unit_price: d.unit_price ?? null,
      amount: d.amount ?? null,
      occurred_at: quando,
      user_id: g.user.id,
    });
    if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
    return apiOk(res.data, {}, { status: 201 });
  }

  const res = await recordServiceCost(g.db, {
    service_job_id: id,
    kind: d.kind,
    description: d.description ?? "",
    amount: d.amount ?? null,
    occurred_at: quando,
    notes: d.notes ?? null,
    saiu_do_caixa: d.saiu_do_caixa ?? false,
    user_id: g.user.id,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
