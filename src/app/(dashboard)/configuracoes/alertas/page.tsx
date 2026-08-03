import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { listAlertPreferencesAction } from "@/lib/actions/alert-preferences";
import AlertPreferenceToggles from "./alert-preference-toggles";

const LABELS: Record<string, string> = {
  vaccine_due: "Vacina próxima do vencimento",
  harvest_near: "Colheita prevista se aproximando",
  bill_due: "Conta a pagar/receber vencendo",
  low_balance: "Saldo do mês negativo",
  trial_ending: "Período de teste terminando",
  maintenance_due: "Manutenção de máquina próxima",
  task_reminder: "Lembrete de tarefa (Meu Dia)",
};

/**
 * Configurações → Alertas (Módulo 28). Preferência por TIPO de alerta, por
 * tenant (não por usuário, não por canal): a política de canal continua
 * sendo decisão do notify() (Onda 2).
 */
export default async function AlertasConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canWrite(user.role, "alertas")) redirect("/configuracoes");

  const db = await getTenantDb();
  const prefs = await listAlertPreferencesAction(db);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Alertas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Escolha quais tipos de aviso você quer receber. Desligar um tipo
          não muda como os demais são entregues (push, WhatsApp ou email).
        </p>
      </div>
      <AlertPreferenceToggles
        preferences={prefs.map((p) => ({
          alert_type: p.alert_type,
          enabled: p.enabled,
          label: LABELS[p.alert_type] ?? p.alert_type,
        }))}
      />
    </div>
  );
}
