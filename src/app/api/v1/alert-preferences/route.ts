import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { listAlertPreferencesAction, setAlertPreferenceAction } from "@/lib/actions/alert-preferences";

/**
 * GET   /api/v1/alert-preferences    lista os 7 tipos com seu estado (Módulo 28)
 * PATCH /api/v1/alert-preferences    liga/desliga um tipo
 *
 * Por tenant, não por usuário; por TIPO de alerta, nunca por canal (a
 * política de canal continua sendo decisão do notify(), Onda 2).
 */

const schema = z.object({
  alert_type: z.enum([
    "vaccine_due",
    "harvest_near",
    "bill_due",
    "low_balance",
    "trial_ending",
    "maintenance_due",
    "task_reminder",
    "low_stock",
  ]),
  enabled: z.boolean(),
});

export async function GET() {
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  const prefs = await listAlertPreferencesAction(g.db);
  return apiOk(prefs, { total: prefs.length });
}

export async function PATCH(request: Request) {
  const g = await guard("alertas", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await setAlertPreferenceAction(g.db, parsed.data.alert_type, parsed.data.enabled);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
