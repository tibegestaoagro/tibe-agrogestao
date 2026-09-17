import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canAccess, canWrite } from "@/lib/permissions";
import { listAlertPreferencesAction } from "@/lib/actions/alert-preferences";
import AlertPreferenceToggles from "./alert-preference-toggles";
import PushToggle from "./push-toggle";

const LABELS: Record<string, string> = {
  vaccine_due: "Vacina próxima do vencimento",
  harvest_near: "Colheita prevista se aproximando",
  bill_due: "Conta a pagar/receber vencendo",
  low_balance: "Saldo do mês negativo",
  trial_ending: "Período de teste terminando",
  maintenance_due: "Manutenção de máquina próxima",
  task_reminder: "Lembrete de tarefa (Meu Dia)",
  low_stock: "Produto acabando no estoque",
};

/**
 * Configurações → Alertas (Módulo 28). Preferência por TIPO de alerta, por
 * tenant (não por usuário, não por canal): a política de canal continua
 * sendo decisão do notify() (Onda 2).
 *
 * A página exige só LEITURA de "alertas": ligar notificação push é
 * preferência pessoal de qualquer papel que recebe alerta (a mesma regra que
 * `POST /api/v1/notifications/subscribe` já aplicava). Antes, o gate de
 * ESCRITA barrava OPERADOR e VISUALIZADOR na porta, sem nunca ver o
 * `<PushToggle />`. A lista de preferências por tipo é configuração do tenant
 * inteiro e continua exigindo escrita (Fase 6, correção de revisão).
 */
export default async function AlertasConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccess(user.role, "alertas")) redirect("/configuracoes");

  const podeEditarPreferencias = canWrite(user.role, "alertas");
  const prefs = podeEditarPreferencias
    ? await listAlertPreferencesAction(await getTenantDb())
    : [];

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-texto">Alertas</h1>
        <p className="mt-1 text-sm text-texto-discreto">
          Escolha quais tipos de aviso você quer receber. Desligar um tipo
          não muda como os demais são entregues (push, WhatsApp ou email).
        </p>
      </div>
      <PushToggle />
      {podeEditarPreferencias ? (
        <AlertPreferenceToggles
          preferences={prefs.map((p) => ({
            alert_type: p.alert_type,
            enabled: p.enabled,
            label: LABELS[p.alert_type] ?? p.alert_type,
          }))}
        />
      ) : (
        <p className="text-sm text-texto-discreto">
          Só quem tem permissão de escrita em Alertas escolhe quais tipos de
          aviso o tenant inteiro recebe. Fale com o dono ou administrador da
          conta para mudar isso.
        </p>
      )}
    </div>
  );
}
