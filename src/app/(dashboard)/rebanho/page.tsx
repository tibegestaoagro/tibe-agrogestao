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

// Módulo 25: linha unificada de /rebanho, cobrindo tanto o animal individual
// (Animal, brinco obrigatório) quanto o lote por categoria e quantidade
// (AnimalBatch), sem mexer no modelo individual.
type UnifiedRow =
  | {
      kind: "individual";
      id: string;
      label: string;
      detail: string;
      property_name: string | null;
      quantity_or_weight: string;
      status_label: string;
      status_variant: "green" | "gray" | "red";
      last_vaccination: string;
      created_at: Date;
    }
  | {
      kind: "lote";
      id: string;
      label: string;
      detail: string;
      property_name: string | null;
      quantity_or_weight: string;
      status_label: string;
      status_variant: "green" | "gray" | "red";
      last_vaccination: string;
      created_at: Date;
    };

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

  // Seletor de propriedade no topo (briefing de layout, seção 12): filtro
  // explícito na URL (o Select desta página) sempre vence; sem ele, cai pra
  // propriedade ativa escolhida no topo; sem nenhum dos dois, mostra tudo.
  const activePropertyId = await getActivePropertyId(db);
  const effectivePropertyId = searchParams.property_id ?? activePropertyId ?? undefined;

  const [animals, batches, propertiesRaw] = await Promise.all([
    db.animal.findMany({
      where: {
        ...(effectivePropertyId ? { property_id: effectivePropertyId } : {}),
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
    // Lotes não têm filtro por raça/status/brinco (não fazem sentido para
    // categoria/quantidade): só o filtro de propriedade, comum aos dois tipos.
    db.animalBatch.findMany({
      where: {
        ...(effectivePropertyId ? { property_id: effectivePropertyId } : {}),
      },
      orderBy: { created_at: "desc" },
      include: {
        category: { select: { name: true } },
        property: { select: { name: true } },
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

  const individualRows: UnifiedRow[] = animals.map((a) => {
    const st = STATUS[a.status] ?? { label: a.status, variant: "gray" as const };
    const weight = decToNum(a.current_weight);
    return {
      kind: "individual",
      id: a.id,
      label: a.ear_tag,
      detail: `${a.breed ?? "raça não informada"} · ${SEX[a.sex] ?? a.sex}`,
      property_name: a.property?.name ?? null,
      quantity_or_weight: weight != null ? `${weight} kg` : "sem valor",
      status_label: st.label,
      status_variant: st.variant,
      last_vaccination: a.vaccinations[0]
        ? a.vaccinations[0].applied_at.toLocaleDateString("pt-BR")
        : "sem data",
      created_at: a.created_at,
    };
  });

  const loteRows: UnifiedRow[] = batches.map((b) => {
    const weight = decToNum(b.average_weight);
    return {
      kind: "lote",
      id: b.id,
      label: b.category?.name ?? "categoria não informada",
      detail: `${b.quantity} cabeça(s)`,
      property_name: b.property?.name ?? null,
      quantity_or_weight: weight != null ? `${weight} kg (média)` : "sem valor",
      status_label: b.quantity > 0 ? "Ativo" : "Esgotado",
      status_variant: b.quantity > 0 ? "green" : "gray",
      last_vaccination: "não se aplica",
      created_at: b.created_at,
    };
  });

  const rows = [...individualRows, ...loteRows].sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime(),
  );

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
        defaultPropertyId={activePropertyId}
      />

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Identificação</TableHead>
              <TableHead>Detalhe</TableHead>
              <TableHead>Propriedade</TableHead>
              <TableHead>Peso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última vacinação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-gray-500">
                  Nenhum animal ou lote encontrado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={`${row.kind}-${row.id}`}>
                <TableCell>
                  <Badge variant={row.kind === "individual" ? "gray" : "blue"}>
                    {row.kind === "individual" ? "Individual" : "Lote"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={row.kind === "individual" ? `/rebanho/${row.id}` : `/rebanho/lote/${row.id}`}
                    className="text-tibe-dark hover:underline"
                  >
                    {row.label}
                  </Link>
                </TableCell>
                <TableCell>{row.detail}</TableCell>
                <TableCell>{row.property_name ?? "não informada"}</TableCell>
                <TableCell>{row.quantity_or_weight}</TableCell>
                <TableCell>
                  <Badge variant={row.status_variant}>{row.status_label}</Badge>
                </TableCell>
                <TableCell>{row.last_vaccination}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
