import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { redirect } from "next/navigation";
import { canWrite } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { AlertType, AlertStatus } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import AlertFilters from "@/components/alertas/alert-filters";
import AlertDismissButton from "@/components/alertas/alert-dismiss-button";

/**
 * Precisa listar TODOS os tipos do enum.
 *
 * Ficou nos 4 originais enquanto o banco chegava a 8, e o `?? a.alert_type` do
 * fallback fazia o produtor ler "maintenance_due" na coluna Tipo da unica tela
 * de alertas que ele abre. Ao acrescentar um `AlertType`, acrescente aqui.
 */
const TYPE_LABEL: Record<string, string> = {
  vaccine_due: "🐄 Vacina a vencer",
  harvest_near: "🌾 Colheita próxima",
  bill_due: "💰 Conta a vencer",
  low_balance: "⚠️ Saldo negativo",
  low_stock: "📦 Produto acabando",
  maintenance_due: "🔧 Manutenção de máquina",
  task_reminder: "📌 Lembrete de tarefa",
  trial_ending: "⏳ Fim do período de teste",
};

/**
 * O filtro e conferido contra a lista de verdade, nao afirmado por um cast.
 *
 * A versao anterior fazia `as "vaccine_due" | ...` com 4 dos 8 valores: nao
 * checava nada em runtime, entao `/alertas?type=xyz` chegava cru no Prisma e
 * derrubava a PAGINA. O mesmo defeito foi corrigido na rota de API; aqui
 * ficou uma pasta ao lado, intacto, ate um revisor apontar.
 */
const TIPOS_VALIDOS: readonly string[] = Object.keys(TYPE_LABEL);
const STATUS_VALIDOS: readonly string[] = ["pending", "sent", "dismissed"];
const STATUS: Record<string, { label: string; variant: "amber" | "green" | "gray" }> = {
  pending: { label: "Pendente", variant: "amber" },
  sent: { label: "Enviado", variant: "green" },
  dismissed: { label: "Resolvido", variant: "gray" },
};

export default async function AlertasPage(
  props: {
    searchParams: Promise<{ type?: string; status?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const writable = canWrite(user.role, "alertas");
  const db = await getTenantDb();

  const alerts = await db.alert.findMany({
    where: {
      ...(searchParams.type && TIPOS_VALIDOS.includes(searchParams.type)
        ? { alert_type: searchParams.type as AlertType }
        : {}),
      ...(searchParams.status && STATUS_VALIDOS.includes(searchParams.status)
        ? { status: searchParams.status as AlertStatus }
        : {}),
    },
    orderBy: { created_at: "desc" },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-texto">Alertas</h1>
      <AlertFilters />

      <div className="rounded-lg border border-borda bg-superficie">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-texto-discreto">
                  Nenhum alerta.
                </TableCell>
              </TableRow>
            )}
            {alerts.map((a) => {
              const st = STATUS[a.status];
              return (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {TYPE_LABEL[a.alert_type] ?? a.alert_type}
                  </TableCell>
                  <TableCell>{a.message}</TableCell>
                  <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  <TableCell>{a.created_at.toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    {writable && a.status !== "dismissed" && (
                      <AlertDismissButton alertId={a.id} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
