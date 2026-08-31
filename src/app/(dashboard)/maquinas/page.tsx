import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { getActivePropertyId } from "@/lib/active-property";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import MachineForm from "@/components/maquinas/machine-form";

const STATUS: Record<string, { label: string; variant: "green" | "amber" | "gray" | "red" }> = {
  active: { label: "Ativa", variant: "green" },
  maintenance: { label: "Em manutenção", variant: "amber" },
  sold: { label: "Vendida", variant: "gray" },
  inactive: { label: "Inativa", variant: "red" },
  negociada: { label: "Negociada", variant: "gray" },
};

export default async function MaquinasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "maquinas");
  const db = await getTenantDb();

  // Seletor de propriedade no topo (briefing de layout, seção 12).
  const activePropertyId = await getActivePropertyId(db);

  const [machines, propertiesRaw] = await Promise.all([
    db.machine.findMany({
      where: activePropertyId ? { property_id: activePropertyId } : {},
      orderBy: { created_at: "desc" },
      include: { property: { select: { name: true } } },
    }),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
  ]);

  const properties = propertiesRaw.map((p) => ({ id: p.id, name: p.name }));

  const activePropertyName = properties.find((p) => p.id === activePropertyId)?.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Máquinas e equipamentos</h1>
          {activePropertyName && (
            <p className="mt-0.5 text-sm text-texto-discreto">Filtrado por: {activePropertyName}</p>
          )}
        </div>
        {writable && properties.length > 0 && <MachineForm properties={properties} />}
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Cadastre uma fazenda antes de adicionar máquinas (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      )}

      <div className="rounded-lg border border-borda bg-superficie">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Marca / Modelo</TableHead>
              <TableHead>Propriedade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Próxima manutenção</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {machines.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-texto-discreto">
                  Nenhuma máquina cadastrada.
                </TableCell>
              </TableRow>
            )}
            {machines.map((m) => {
              const st = STATUS[m.status] ?? { label: m.status, variant: "gray" as const };
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <Link href={`/maquinas/${m.id}`} className="text-tibe-dark hover:underline">
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell>
                    {[m.brand, m.model].filter(Boolean).join(" / ") || "não informado"}
                  </TableCell>
                  <TableCell>{m.property?.name ?? "não informada"}</TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.next_maintenance_at
                      ? m.next_maintenance_at.toLocaleDateString("pt-BR")
                      : "sem previsão"}
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
