import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { HERD_CHARGE_TYPES, HERD_STAY_TYPES } from "@/lib/actions/herd-ledger";
import { listStays, openStay } from "@/lib/actions/herd-stays";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/herd/stays   estadias, com o saldo aberto de cada uma
 * POST /api/v1/herd/stays   abre uma estadia (Módulo 30, fase 2)
 *
 * UMA rota para os cinco tipos, com `type` no corpo, pelo mesmo motivo de
 * `/herd/movements` ter uma só para os nove tipos: os cinco fluxos são o mesmo
 * ciclo (abre, encerra, cancela) com validação diferente, e cinco rotas finas
 * reintroduziriam no HTTP o caso-a-caso que o modelo eliminou.
 *
 * O Zod valida forma; a regra (o que cada tipo permite, o bloqueio de saldo
 * negativo, o lançamento financeiro) fica em `openStay`, onde é testada.
 */

const createSchema = z.object({
  type: z.enum(HERD_STAY_TYPES),
  property_id: z.string().min(1, "Fazenda é obrigatória"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  pasture_id: z.string().min(1).nullish(),
  counterparty_name: z.string().trim().max(200).nullish(),
  location_name: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  started_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  expected_end_at: z.string().datetime({ message: "Data prevista inválida" }).nullish(),
  charge_type: z.enum(HERD_CHARGE_TYPES).nullish(),
  charge_value: z.number().positive("O valor precisa ser maior que zero").nullish(),
  due_date: z.string().datetime({ message: "Vencimento inválido" }).nullish(),
  reason: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const result = await listStays(g.db, {
    property_id: url.searchParams.get("property_id") ?? undefined,
    type: HERD_STAY_TYPES.includes(type as (typeof HERD_STAY_TYPES)[number])
      ? (type as (typeof HERD_STAY_TYPES)[number])
      : undefined,
    apenas_abertas: url.searchParams.get("abertas") === "true",
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(
    result.data.map((estadia) => ({
      ...estadia,
      started_at: isoOrNull(estadia.started_at),
      expected_end_at: isoOrNull(estadia.expected_end_at),
      canceled_at: isoOrNull(estadia.canceled_at),
    })),
    { total: result.data.length },
  );
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const input = parsed.data;

  const result = await openStay(g.db, {
    type: input.type,
    property_id: input.property_id,
    category_id: input.category_id,
    quantity: input.quantity,
    pasture_id: input.pasture_id ?? null,
    counterparty_name: input.counterparty_name ?? null,
    location_name: input.location_name ?? null,
    city: input.city ?? null,
    started_at: input.started_at ? new Date(input.started_at) : null,
    expected_end_at: input.expected_end_at ? new Date(input.expected_end_at) : null,
    charge_type: input.charge_type ?? null,
    charge_value: input.charge_value ?? null,
    due_date: input.due_date ? new Date(input.due_date) : null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(
    { ...result.data, started_at: isoOrNull(result.data.started_at) },
    {},
    { status: 201 },
  );
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
