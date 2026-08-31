import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { listConfinementLots, openConfinementStay } from "@/lib/actions/confinement";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/confinement/stays   lotes de confinamento (§9, §25 "lotes ativos")
 * POST /api/v1/confinement/stays   abre uma estadia de confinamento (§6, §7)
 *
 * Reusa `openStay` (Módulo 30, fase 2): o `type` da estadia (`confinamento`
 * ou `boitel`) é derivado do `confinement_site_id`, não escolhido aqui, para
 * um site `proprio` nunca virar uma estadia `boitel` por engano.
 */

const openSchema = z.object({
  confinement_site_id: z.string().min(1, "Confinamento é obrigatório"),
  category_id: z.string().min(1, "Categoria é obrigatória"),
  quantity: z.number().int().positive("A quantidade deve ser maior que zero"),
  property_id: z.string().min(1).nullish(),
  pasture_id: z.string().min(1).nullish(),
  started_at: z.string().datetime({ message: "Data inválida" }).nullish(),
  expected_end_at: z.string().datetime({ message: "Data prevista inválida" }).nullish(),
  charge_type: z.enum(["por_cabeca", "por_mes", "por_periodo", "fechado"]).nullish(),
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
  const lotes = await listConfinementLots(g.db, {
    confinement_site_id: url.searchParams.get("confinement_site_id") ?? undefined,
    type: type === "confinamento" || type === "boitel" ? type : undefined,
    apenas_abertas: url.searchParams.get("abertas") === "true",
  });

  return apiOk(
    lotes.map((lote) => ({ ...lote, started_at: isoOrNull(lote.started_at), canceled_at: isoOrNull(lote.canceled_at) })),
    { total: lotes.length },
  );
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = openSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const input = parsed.data;

  const result = await openConfinementStay(g.db, {
    confinement_site_id: input.confinement_site_id,
    category_id: input.category_id,
    quantity: input.quantity,
    property_id: input.property_id ?? null,
    pasture_id: input.pasture_id ?? null,
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

  return apiOk({ ...result.data, started_at: isoOrNull(result.data.started_at) }, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
