import Link from "next/link";
import { redirect } from "next/navigation";
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
import TabNav from "@/components/prestador/tab-nav";
import ClientForm from "@/components/prestador/client-form";
import ServiceForm from "@/components/prestador/service-form";
import OrderForm from "@/components/prestador/order-form";
import OrderFilters from "@/components/prestador/order-filters";
import OrderStatusButton from "@/components/prestador/order-status-button";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PRICING: Record<string, string> = { hour: "Por hora", day: "Por dia", fixed: "Fixo" };
const ORDER_STATUS: Record<string, { label: string; variant: "blue" | "amber" | "green" }> = {
  scheduled: { label: "Agendada", variant: "blue" },
  completed: { label: "Concluída", variant: "amber" },
  invoiced: { label: "Faturada", variant: "green" },
};

export default async function PrestadorPage(
  props: {
    searchParams: Promise<{ tab?: string; status?: string; service_client_id?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("prestador")) redirect("/dashboard");

  const writable = canWrite(user.role, "prestador");
  const db = await getTenantDb();
  const tab = searchParams.tab ?? "clientes";

  const [clients, services, allOrders] = await Promise.all([
    db.serviceClient.findMany({ orderBy: { name: "asc" } }),
    db.service.findMany({ orderBy: { name: "asc" } }),
    db.serviceOrder.findMany({
      select: { service_client_id: true, status: true, total_value: true },
    }),
  ]);

  // Totais por cliente (faturado / pendente).
  const totals = new Map<string, { invoiced: number; pending: number }>();
  for (const o of allOrders) {
    const t = totals.get(o.service_client_id) ?? { invoiced: 0, pending: 0 };
    const v = decToNum(o.total_value) ?? 0;
    if (o.status === "invoiced") t.invoiced += v;
    else if (o.status === "completed") t.pending += v;
    totals.set(o.service_client_id, t);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Prestador de Serviço</h1>
        {writable && (
          <div className="flex gap-2">
            {tab === "clientes" && <ClientForm />}
            {tab === "servicos" && <ServiceForm />}
            {tab === "ordens" && clients.length > 0 && services.length > 0 && (
              <OrderForm
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
                services={services.map((s) => ({
                  id: s.id,
                  name: s.name,
                  pricing_type: s.pricing_type,
                  unit_price: decToNum(s.unit_price),
                }))}
              />
            )}
          </div>
        )}
      </div>

      <TabNav />

      {tab === "clientes" && (
        <TableCard>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Faturado</TableHead>
              <TableHead>Pendente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 && <Empty cols={4} text="Nenhum cliente." />}
            {clients.map((c) => {
              const t = totals.get(c.id) ?? { invoiced: 0, pending: 0 };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/prestador/clientes/${c.id}`} className="text-tibe-dark hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone ?? "sem telefone"}</TableCell>
                  <TableCell>{brl(t.invoiced)}</TableCell>
                  <TableCell>{brl(t.pending)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableCard>
      )}

      {tab === "servicos" && (
        <TableCard>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Precificação</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 && <Empty cols={4} text="Nenhum serviço no catálogo." />}
            {services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{PRICING[s.pricing_type] ?? s.pricing_type}</TableCell>
                <TableCell>{brl(decToNum(s.unit_price) ?? 0)}</TableCell>
                <TableCell className="text-right">
                  {writable && (
                    <ServiceForm
                      service={{
                        id: s.id,
                        name: s.name,
                        pricing_type: s.pricing_type,
                        unit_price: decToNum(s.unit_price),
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableCard>
      )}

      {tab === "ordens" && (
        <OrdersTab
          db={db}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          status={searchParams.status}
          clientId={searchParams.service_client_id}
          writable={writable}
        />
      )}
    </div>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <Table>{children}</Table>
    </div>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-6 text-center text-gray-500">
        {text}
      </TableCell>
    </TableRow>
  );
}

async function OrdersTab({
  db,
  clients,
  status,
  clientId,
  writable,
}: {
  db: Awaited<ReturnType<typeof getTenantDb>>;
  clients: { id: string; name: string }[];
  status?: string;
  clientId?: string;
  writable: boolean;
}) {
  const orders = await db.serviceOrder.findMany({
    where: {
      ...(status ? { status: status as "scheduled" | "completed" | "invoiced" } : {}),
      ...(clientId ? { service_client_id: clientId } : {}),
    },
    orderBy: { performed_at: "desc" },
    include: {
      service_client: { select: { name: true } },
      service: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-3">
      <OrderFilters clients={clients} />
      <TableCard>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Serviço</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 && <Empty cols={6} text="Nenhuma ordem." />}
          {orders.map((o) => {
            const st = ORDER_STATUS[o.status];
            return (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.service_client?.name ?? "não informado"}</TableCell>
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
      </TableCard>
    </div>
  );
}
