import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Preferência de quais TIPOS de alerta o tenant quer receber (Módulo 28,
 * spec §2.4-2.5). Ausência de linha = habilitado: só existe linha quando
 * alguém desliga um tipo. Nunca mexe em canal (push/WhatsApp/email): isso
 * continua sendo política do notify(), Onda 2.
 */

const ALERT_TYPES = [
  "vaccine_due",
  "harvest_near",
  "bill_due",
  "low_balance",
  "trial_ending",
  "maintenance_due",
  "task_reminder",
  "low_stock",
] as const;
export type AlertTypeInput = (typeof ALERT_TYPES)[number];

/** True se o tipo está habilitado para o tenant (padrão: sim, ausência de linha = habilitado). */
export async function isAlertTypeEnabled(
  db: TenantPrismaClient,
  alertType: AlertTypeInput,
): Promise<boolean> {
  const pref = await db.alertPreference.findFirst({ where: { alert_type: alertType } });
  return pref?.enabled ?? true;
}

/** Lista todos os tipos com seu estado atual (habilitado por padrão, mesmo sem linha). */
export async function listAlertPreferencesAction(db: TenantPrismaClient) {
  const rows = await db.alertPreference.findMany();
  const byType = new Map(rows.map((r) => [r.alert_type, r.enabled]));
  return ALERT_TYPES.map((alert_type) => ({
    alert_type,
    enabled: byType.get(alert_type) ?? true,
  }));
}

export async function setAlertPreferenceAction(
  db: TenantPrismaClient,
  alertType: AlertTypeInput,
  enabled: boolean,
): Promise<ActionResult<{ alert_type: string; enabled: boolean }>> {
  if (!ALERT_TYPES.includes(alertType)) {
    return fail("VALIDATION_ERROR", "Tipo de alerta inválido", 422);
  }

  const existing = await db.alertPreference.findFirst({ where: { alert_type: alertType } });
  if (existing) {
    await db.alertPreference.update({ where: { id: existing.id }, data: { enabled } });
  } else {
    await db.alertPreference.create({ data: scoped({ alert_type: alertType, enabled }) });
  }
  return ok({ alert_type: alertType, enabled });
}
