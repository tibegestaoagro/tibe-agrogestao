import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import {
  recordMilkCharge,
  listMilkCharges,
  type MilkChargeRecord,
} from "@/lib/actions/milk-storage";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/milk/charges   as cobranças por funcionar como ponto de coleta
 * POST /api/v1/milk/charges   registra uma (§22 da Área Leite)
 *
 * O valor é o que o produtor digitou, NUNCA calculado, mesmo quando a forma é
 * `por_litro`: o §22 dá o exemplo de R$ 0,05 sobre 5.000 litros mas não diz
 * sobre qual PERÍODO somar esses litros, e isso só aparece no §28, que é a
 * fase 3. Mesma decisão da cobrança do confinamento, que está em produção.
 *
 * A receita alimenta o Financeiro com `related_module: "leite"` e nasce PAGA:
 * o §22 fala de cobrar pelo serviço prestado, não de faturar a prazo.
 */

const createSchema = z.object({
  owner_id: z.string().min(1, "Escolha o produtor"),
  type: z.enum(["por_litro", "por_produtor", "por_coleta", "mensal", "fixo", "outro"]),
  amount: z.number().positive("O valor deve ser maior que zero").max(100_000_000),
  site_id: z.string().min(1).nullish(),
  occurred_at: z.coerce.date().nullish(),
  period_label: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

function serializar(c: MilkChargeRecord) {
  return {
    id: c.id,
    owner_id: c.owner_id,
    site_id: c.site_id,
    type: c.type,
    amount: c.amount,
    occurred_at: c.occurred_at.toISOString(),
    period_label: c.period_label,
    notes: c.notes,
    financial_entry_id: c.financial_entry_id,
    canceled: c.canceled_at != null,
    canceled_at: isoOrNull(c.canceled_at),
  };
}

async function GETHandler(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const url = new URL(request.url);
  const cobrancas = await listMilkCharges(g.db, {
    owner_id: url.searchParams.get("owner_id") ?? undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
  });

  const total = cobrancas
    .filter((c) => c.canceled_at == null)
    .reduce((s, c) => s + c.amount, 0);

  return apiOk(cobrancas.map(serializar), {
    total: cobrancas.length,
    total_valor: Math.round(total * 100) / 100,
  });
}

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const result = await recordMilkCharge(g.db, {
    ...parsed.data,
    recorded_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(serializar(result.data), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
