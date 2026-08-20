import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import MaintenanceForm from "@/components/maquinas/maintenance-form";
import { decToNum } from "@/lib/serialize";

const STATUS: Record<string, { label: string; variant: "green" | "amber" | "gray" | "red" }> = {
  active: { label: "Ativa", variant: "green" },
  maintenance: { label: "Em manutenção", variant: "amber" },
  sold: { label: "Vendida", variant: "gray" },
  inactive: { label: "Inativa", variant: "red" },
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export default async function MachineDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "maquinas");
  const db = await getTenantDb();

  const machine = await db.machine.findFirst({
    where: { id: params.id },
    include: {
      property: { select: { name: true } },
      maintenances: { orderBy: { performed_at: "desc" } },
    },
  });
  if (!machine) notFound();

  const st = STATUS[machine.status] ?? { label: machine.status, variant: "gray" as const };
  const acquisitionCost = decToNum(machine.acquisition_cost);
  const hourMeter = decToNum(machine.hour_meter);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/maquinas" className="text-sm text-primaria-tinta hover:underline">
          ← Máquinas
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            {machine.name}
            <Badge variant={st.variant}>{st.label}</Badge>
          </h1>
          {writable && <MaintenanceForm machineId={machine.id} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-5 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Tipo" value={machine.type} />
        <Stat label="Marca / Modelo" value={[machine.brand, machine.model].filter(Boolean).join(" / ") || "não informado"} />
        <Stat label="Ano" value={machine.year != null ? String(machine.year) : "não informado"} />
        <Stat label="Horímetro" value={hourMeter != null ? `${hourMeter} h` : "não informado"} />
        <Stat
          label="Custo de aquisição"
          value={acquisitionCost != null ? brl(acquisitionCost) : "não informado"}
        />
        <Stat label="Propriedade" value={machine.property?.name ?? "não informada"} />
        <Stat
          label="Próxima manutenção"
          value={machine.next_maintenance_at ? machine.next_maintenance_at.toLocaleDateString("pt-BR") : "sem previsão"}
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b px-5 py-3 text-sm font-medium text-gray-700">
          Histórico de manutenções
        </h2>
        <div className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>O que foi feito</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>Próxima prevista</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machine.maintenances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-4 text-center text-gray-500">
                    Nenhuma manutenção registrada.
                  </TableCell>
                </TableRow>
              )}
              {machine.maintenances.map((mm) => {
                const cost = decToNum(mm.cost);
                return (
                  <TableRow key={mm.id}>
                    <TableCell>{mm.performed_at.toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{mm.description}</TableCell>
                    <TableCell>{cost != null ? brl(cost) : "sem custo"}</TableCell>
                    <TableCell>
                      {mm.next_due_at ? mm.next_due_at.toLocaleDateString("pt-BR") : "não informada"}
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
