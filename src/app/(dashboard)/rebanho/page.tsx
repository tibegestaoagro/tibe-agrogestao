import Link from "next/link";
import { redirect } from "next/navigation";
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
import AnimalForm from "@/components/rebanho/animal-form";
import AnimalFilters from "@/components/rebanho/animal-filters";
import PropertyManager from "@/components/rebanho/property-manager";
import { decToNum } from "@/lib/serialize";

const STATUS: Record<string, { label: string; variant: "green" | "gray" | "red" }> = {
  active: { label: "Ativo", variant: "green" },
  sold: { label: "Vendido", variant: "gray" },
  deceased: { label: "Morto", variant: "red" },
};

const SEX: Record<string, string> = { male: "Macho", female: "Fêmea" };

export default async function RebanhoPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    property_id?: string;
    status?: string;
    breed?: string;
  };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const [animals, propertiesRaw] = await Promise.all([
    db.animal.findMany({
      where: {
        ...(searchParams.property_id ? { property_id: searchParams.property_id } : {}),
        ...(searchParams.status
          ? { status: searchParams.status as "active" | "sold" | "deceased" }
          : {}),
        ...(searchParams.breed
          ? { breed: { contains: searchParams.breed, mode: "insensitive" } }
          : {}),
        ...(searchParams.q
          ? { ear_tag: { contains: searchParams.q, mode: "insensitive" } }
          : {}),
      },
      orderBy: { created_at: "desc" },
      include: {
        property: { select: { name: true } },
        vaccinations: {
          orderBy: { applied_at: "desc" },
          take: 1,
          select: { applied_at: true },
        },
      },
    }),
    db.property.findMany({
      where: { archived_at: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const properties = propertiesRaw.map((p) => ({
    id: p.id,
    name: p.name,
    area_hectares: decToNum(p.area_hectares),
    archived: p.archived_at != null,
  }));

  const breeds = Array.from(
    new Set(animals.map((a) => a.breed).filter((b): b is string => !!b)),
  ).sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Rebanho</h1>
        <div className="flex gap-2">
          <PropertyManager properties={properties} canWrite={writable} />
          {writable && properties.length > 0 && (
            <AnimalForm properties={properties.filter((p) => !p.archived)} />
          )}
        </div>
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cadastre uma propriedade antes de adicionar animais (botão
          &quot;Propriedades&quot;).
        </p>
      )}

      <AnimalFilters
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        breeds={breeds}
      />

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brinco</TableHead>
              <TableHead>Raça</TableHead>
              <TableHead>Sexo</TableHead>
              <TableHead>Propriedade</TableHead>
              <TableHead>Peso (kg)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última vacinação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {animals.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-gray-500">
                  Nenhum animal encontrado.
                </TableCell>
              </TableRow>
            )}
            {animals.map((a) => {
              const st = STATUS[a.status] ?? { label: a.status, variant: "gray" as const };
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <Link href={`/rebanho/${a.id}`} className="text-tibe-dark hover:underline">
                      {a.ear_tag}
                    </Link>
                  </TableCell>
                  <TableCell>{a.breed ?? "—"}</TableCell>
                  <TableCell>{SEX[a.sex] ?? a.sex}</TableCell>
                  <TableCell>{a.property?.name ?? "—"}</TableCell>
                  <TableCell>{decToNum(a.current_weight) ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {a.vaccinations[0]
                      ? a.vaccinations[0].applied_at.toLocaleDateString("pt-BR")
                      : "—"}
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
