import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { decToNum } from "@/lib/serialize";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import OrderStatusButton from "@/components/prestador/order-status-button";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ORDER_STATUS: Record<string, { label: string; variant: "blue" | "amber" | "green" }> = {
  scheduled: { label: "Agendada", variant: "blue" },
  completed: { label: "Concluída", variant: "amber" },
  invoiced: { label: "Faturada", variant: "green" },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <p className="text-xs text-texto-discreto">{label}</p>
      <p className="mt-1 text-lg font-semibold text-tibe-dark">{value}</p>
    </div>
  );
}

export default async function ClientDetail(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("prestador")) redirect("/dashboard");

  const db = await getTenantDb();
  const client = await db.serviceClient.findFirst({ where: { id: params.id } });
  if (!client) notFound();

  const writable = canWrite(user.role, "prestador");
  const orders = await db.serviceOrder.findMany({
    where: { service_client_id: params.id },
    orderBy: { performed_at: "desc" },
    include: { service: { select: { name: true } } },
  });

  let invoiced = 0;
  let pending = 0;
  for (const o of orders) {
    const v = decToNum(o.total_value) ?? 0;
    if (o.status === "invoiced") invoiced += v;
    else if (o.status === "completed") pending += v;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/prestador" className="text-sm text-primaria-tinta hover:underline">
          ← Prestador
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-texto">{client.name}</h1>
        <p className="text-sm text-texto-discreto">
          {[client.document, client.phone, client.email].filter(Boolean).join(" · ") || "sem dados de contato"}
        </p>
        {client.notes && <p className="mt-1 text-sm text-texto-secundario">{client.notes}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Total faturado" value={brl(invoiced)} />
        <Stat label="Total pendente" value={brl(pending)} />
        <Stat label="Ordens" value={String(orders.length)} />
      </div>

      <div className="rounded-lg border border-borda bg-superficie">
        <h2 className="border-b px-5 py-3 text-sm font-medium text-texto-secundario">
          Histórico de ordens
        </h2>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-4 text-center text-texto-discreto">
                    Nenhuma ordem.
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => {
                const st = ORDER_STATUS[o.status];
                return (
                  <TableRow key={o.id}>
                    <TableCell>{o.service?.name ?? "não informado"}</TableCell>
                    <TableCell>{o.performed_at ? o.performed_at.toLocaleDateString("pt-BR") : "sem data"}</TableCell>
                    <TableCell>{brl(decToNum(o.total_value) ?? 0)}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      {writable && <OrderStatusButton orderId={o.id} status={o.status} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
