import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getBillingAccess, ARCHIVE_WINDOW_DAYS } from "@/lib/billing-access";
import { listSubscriptionPayments, AsaasNotConfiguredError } from "@/lib/asaas";
import SubscribeForm from "@/components/billing/subscribe-form";
import CancelSubscription from "@/components/billing/cancel-subscription";
import { Badge } from "@/components/ui/badge";

const PLAN_LABEL: Record<string, string> = { campo: "Campo", fazenda: "Fazenda", grupo: "Grupo" };
const STATUS_LABEL: Record<string, { label: string; variant: "green" | "amber" | "red" | "blue" }> = {
  trial: { label: "Período de teste", variant: "blue" },
  active: { label: "Ativa", variant: "green" },
  overdue: { label: "Pagamento pendente", variant: "amber" },
  canceled: { label: "Cancelada", variant: "red" },
};
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  RECEIVED: "Recebido",
  OVERDUE: "Vencido",
};

/**
 * Configurações → Assinatura / Billing (spec 5.9). Acesso exclusivo do Owner.
 * Única página do dashboard que continua acessível mesmo com a conta
 * bloqueada: é por aqui que o tenant regulariza.
 */
export default async function AssinaturaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasMinRole(user.role, "OWNER")) redirect("/dashboard");

  const db = await getTenantDb();
  const [tenant, subscription, access] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenant_id } }),
    db.subscription.findFirst({}),
    getBillingAccess(user.tenant_id),
  ]);

  // `Date.now()` num Server Component roda uma vez por requisicao, nao a cada
  // pintura: a regra de pureza do React 19 mira re-render de cliente. Ler o
  // relogio aqui e o comportamento desejado, e nao ha caminho mais puro sem
  // fingir que a data vem de fora.
  // eslint-disable-next-line react-hooks/purity
  const agora = Date.now();
  const isPendingFirstPayment =
    subscription?.status === "overdue" &&
    subscription.next_due_date &&
    subscription.next_due_date.getTime() > agora;

  const statusKey = subscription
    ? subscription.status
    : tenant?.status === "trial"
      ? "trial"
      : null;
  const st = statusKey ? STATUS_LABEL[statusKey] : null;

  let payments: Awaited<ReturnType<typeof listSubscriptionPayments>> = [];
  if (subscription?.asaas_subscription_id) {
    try {
      payments = await listSubscriptionPayments(subscription.asaas_subscription_id);
    } catch (e) {
      if (!(e instanceof AsaasNotConfiguredError)) {
        console.error("Falha ao buscar histórico de cobranças:", e);
      }
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-texto">Assinatura</h1>

      <div className="rounded-lg border border-borda bg-superficie p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-texto-discreto">Plano atual</p>
          <p className="text-lg font-semibold text-tibe-dark">
            {PLAN_LABEL[subscription?.plan ?? tenant?.plan ?? ""] ?? "não informado"}
          </p>
          {st && (
            <Badge variant={isPendingFirstPayment ? "blue" : st.variant}>
              {isPendingFirstPayment ? "Aguardando 1º pagamento" : st.label}
            </Badge>
          )}
        </div>

        {tenant?.status === "trial" && tenant.trial_ends_at && (
          <p className="mt-2 text-sm text-texto-discreto">
            Teste gratuito até {tenant.trial_ends_at.toLocaleDateString("pt-BR")}.
          </p>
        )}
        {subscription?.next_due_date && (
          <p className="mt-2 text-sm text-texto-discreto">
            Próxima cobrança: {subscription.next_due_date.toLocaleDateString("pt-BR")}
          </p>
        )}

        {access !== "full" && (
          <p className="mt-3 rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">
            {access === "blocked"
              ? "Acesso bloqueado por pendência de pagamento. Regularize abaixo."
              : "Pagamento em atraso: regularize para recuperar acesso total de escrita."}
          </p>
        )}
      </div>

      <SubscribeForm currentPlan={(subscription?.plan as "campo" | "fazenda" | "grupo") ?? null} />

      <div className="rounded-lg border border-borda bg-superficie p-5">
        <p className="text-sm font-medium text-texto-secundario">Histórico de cobranças</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-texto-discreto">
            Nenhuma cobrança encontrada ainda.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {p.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <span className="text-texto-discreto">
                  {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Só aparece quando existe assinatura ativa no Asaas para cancelar:
          em trial (sem Subscription) ou já cancelada, não há o que fazer. */}
      {subscription?.asaas_subscription_id && subscription.status !== "canceled" && (
        <CancelSubscription
          paidUntil={subscription?.next_due_date ?? null}
          archiveWindowDays={ARCHIVE_WINDOW_DAYS}
        />
      )}
    </div>
  );
}
