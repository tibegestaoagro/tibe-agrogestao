import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  HERD_MOVEMENT_TYPES,
  HERD_OWNERS,
  HERD_SITUATIONS,
  listMovements,
  recordMovement,
  serializeHerdMovement,
  serializeHerdMovementRecord,
  type HerdMovementFilter,
} from "@/lib/actions/herd-ledger";

/**
 * GET  /api/v1/herd/movements   histórico do rebanho (§10.7)
 * POST /api/v1/herd/movements   registra uma movimentação (Módulo 30)
 *
 * UMA rota de escrita para os 9 tipos, com `movement_type` no corpo, e não uma
 * rota por tipo. O motivo é a decisão central do módulo: mudança de categoria
 * não é caso especial, é um movimento com categorias diferentes nas duas
 * pontas. Nove rotas finas reintroduziriam no HTTP exatamente o caso-a-caso
 * que o modelo de dados eliminou, e a fase 2 (leilão, boitel, confinamento)
 * viraria mais seis rotas em vez de seis valores de enum.
 *
 * O Zod valida forma de dado; a regra de negócio (qual tipo aceita origem,
 * destino ou os dois, e o bloqueio de saldo negativo) fica em `recordMovement`,
 * onde é testada. A rota não repete a regra.
 */

const positionSchema = z.object({
  category_id: z.string().min(1, "Categoria é obrigatória"),
  property_id: z.string().min(1, "Fazenda é obrigatória"),
  pasture_id: z.string().min(1).nullish(),
  situation: z.enum(HERD_SITUATIONS).default("presente"),
  owner: z.enum(HERD_OWNERS).default("proprio"),
});

const createSchema = z.object({
  movement_type: z.enum(HERD_MOVEMENT_TYPES),
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  from: positionSchema.nullish(),
  to: positionSchema.nullish(),
  value: z.number().nonnegative().nullish(),
  reason: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  occurred_at: z.string().datetime({ message: "Data inválida" }).nullish(),
});

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const filter: HerdMovementFilter = {};

  const categoryId = params.get("category_id");
  if (categoryId) filter.category_id = categoryId;

  const propertyId = params.get("property_id");
  if (propertyId) filter.property_id = propertyId;

  const pastureId = params.get("pasture_id");
  if (pastureId) filter.pasture_id = pastureId;

  const movementType = params.get("movement_type");
  if (movementType && (HERD_MOVEMENT_TYPES as readonly string[]).includes(movementType)) {
    filter.movement_type = movementType as HerdMovementFilter["movement_type"];
  }

  filter.since = parseDate(params.get("since"));
  filter.until = parseDate(params.get("until"));

  // Canceladas aparecem por padrão: o §10.8 exige que o registro cancelado
  // continue identificado no histórico. `include_canceled=false` é para quem
  // quer ver só o que conta no saldo.
  if (params.get("include_canceled") === "false") filter.include_canceled = false;

  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));

  const { items, total } = await listMovements(g.db, filter, {
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    offset: Number.isFinite(offset) && offset > 0 ? offset : undefined,
  });

  return apiOk(items.map(serializeHerdMovement), { total });
}

export async function POST(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const input = parsed.data;

  const result = await recordMovement(g.db, {
    movement_type: input.movement_type,
    quantity: input.quantity,
    from: input.from ? { ...input.from, pasture_id: input.from.pasture_id ?? null } : null,
    to: input.to ? { ...input.to, pasture_id: input.to.pasture_id ?? null } : null,
    value: input.value ?? null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    occurred_at: input.occurred_at ? new Date(input.occurred_at) : null,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  return apiOk(serializeHerdMovementRecord(result.data), {}, { status: 201 });
}
