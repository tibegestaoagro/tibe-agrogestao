import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { decToNum } from "@/lib/serialize";
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
import PlotForm from "@/components/lavoura/plot-form";

const CYCLE_STATUS: Record<string, { label: string; variant: "green" | "blue" | "gray" }> = {
  planted: { label: "Plantado", variant: "blue" },
  growing: { label: "Em crescimento", variant: "green" },
  harvested: { label: "Colhido", variant: "gray" },
};

export default async function LavouraPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "lavoura");
  const db = await getTenantDb();

  // Seletor de propriedade no topo (briefing de layout, seção 12).
  const activePropertyId = await getActivePropertyId(db);

  const [plots, properties] = await Promise.all([
    db.plot.findMany({
      where: activePropertyId ? { property_id: activePropertyId } : {},
      orderBy: { created_at: "desc" },
      include: {
        property: { select: { name: true } },
        cycles: {
          where: { status: { in: ["planted", "growing"] } },
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
    }),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
  ]);

  const activePropertyName = properties.find((p) => p.id === activePropertyId)?.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto">Lavoura</h1>
          {activePropertyName && (
            <p className="mt-0.5 text-sm text-texto-discreto">Filtrado por: {activePropertyName}</p>
          )}
        </div>
        {writable && properties.length > 0 && (
          <PlotForm properties={properties.map((p) => ({ id: p.id, name: p.name }))} />
        )}
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Cadastre uma fazenda (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ) antes de criar talhões.
        </p>
      )}

      <div className="rounded-lg border border-borda bg-superficie">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Talhão</TableHead>
              <TableHead>Propriedade</TableHead>
              <TableHead>Área (ha)</TableHead>
              <TableHead>Cultura atual</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Colheita prevista</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plots.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-texto-discreto">
                  Nenhum talhão cadastrado.
                </TableCell>
              </TableRow>
            )}
            {plots.map((p) => {
              const cycle = p.cycles[0];
              const st = cycle ? CYCLE_STATUS[cycle.status] : null;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/lavoura/${p.id}`} className="text-tibe-dark hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.property?.name ?? "não informada"}</TableCell>
                  <TableCell>{decToNum(p.area_hectares) ?? "sem valor"}</TableCell>
                  <TableCell>{p.current_crop ?? "não informada"}</TableCell>
                  <TableCell>{st ? <Badge variant={st.variant}>{st.label}</Badge> : "sem ciclo"}</TableCell>
                  <TableCell>
                    {cycle?.expected_harvest_at
                      ? cycle.expected_harvest_at.toLocaleDateString("pt-BR")
                      : "sem data"}
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
