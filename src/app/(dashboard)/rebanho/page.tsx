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
import { decToNum } from "@/lib/serialize";

const SEX: Record<string, string> = { male: "Macho", female: "Fêmea" };

/**
 * Rebanho: UMA listagem só (2026-08-04).
 *
 * Antes desta data a tela mostrava duas coisas lado a lado, com uma coluna
 * "Individual/Lote" para distinguir: era o reflexo na interface de haver dois
 * modelos no banco. Com o modelo único, todo registro é um lote por
 * categoria, e o brinco é só um campo a mais para quem trabalha com brinco.
 *
 * A coluna "Status" saiu junto com o campo: `quantity` já diz o que resta, e
 * o filtro que fazia sentido de verdade ("quantos bezerros eu tenho") é por
 * CATEGORIA.
 */
export default async function RebanhoPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    property_id?: string;
    category_id?: string;
    breed?: string;
  };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  // Seletor de propriedade no topo: filtro explícito na URL sempre vence;
  // sem ele, cai na propriedade ativa; sem nenhum dos dois, mostra tudo.
  const activePropertyId = await getActivePropertyId(db);
  const effectivePropertyId = searchParams.property_id ?? activePropertyId ?? undefined;

  const [batches, propertiesRaw, categories] = await Promise.all([
    db.animalBatch.findMany({
      where: {
        ...(effectivePropertyId ? { property_id: effectivePropertyId } : {}),
        ...(searchParams.category_id ? { category_id: searchParams.category_id } : {}),
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
        category: { select: { name: true } },
        vaccinations: {
          orderBy: { applied_at: "desc" },
          take: 1,
          select: { applied_at: true },
        },
      },
    }),
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    db.animalCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const properties = propertiesRaw.map((p) => ({
    id: p.id,
    name: p.name,
    area_hectares: decToNum(p.area_hectares),
    archived: p.archived_at != null,
  }));

  const breeds = Array.from(
    new Set(batches.map((b) => b.breed).filter((b): b is string => !!b)),
  ).sort();

  const totalCabecas = batches.reduce((soma, b) => soma + b.quantity, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Rebanho</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {totalCabecas.toLocaleString("pt-BR")} cabeça(s) em {batches.length} registro(s)
          </p>
        </div>
        <div className="flex gap-2">
          {writable && properties.length > 0 && categories.length > 0 && (
            <AnimalForm
              properties={properties.filter((p) => !p.archived)}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            />
          )}
        </div>
      </div>

      {properties.length === 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cadastre uma fazenda antes de adicionar animais (menu{" "}
          <Link href="/minha-fazenda" className="font-medium underline">
            Minha Fazenda
          </Link>
          ).
        </p>
      )}

      <AnimalFilters
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        breeds={breeds}
        defaultPropertyId={activePropertyId}
      />

      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Cabeças</TableHead>
              <TableHead>Brinco</TableHead>
              <TableHead>Detalhe</TableHead>
              <TableHead>Propriedade</TableHead>
              <TableHead>Peso médio</TableHead>
              <TableHead>Última vacinação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-gray-500">
                  Nenhum registro de rebanho encontrado.
                </TableCell>
              </TableRow>
            )}
            {batches.map((b) => {
              const peso = decToNum(b.average_weight);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <Link href={`/rebanho/${b.id}`} className="text-tibe-dark hover:underline">
                      {b.category?.name ?? "não informada"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {b.quantity === 0 ? (
                      <Badge variant="gray">Sem saldo</Badge>
                    ) : (
                      b.quantity.toLocaleString("pt-BR")
                    )}
                  </TableCell>
                  <TableCell>{b.ear_tag ?? "sem brinco"}</TableCell>
                  <TableCell>
                    {[b.breed, b.sex ? SEX[b.sex] : null].filter(Boolean).join(" · ") ||
                      "não informado"}
                  </TableCell>
                  <TableCell>{b.property?.name ?? "não informada"}</TableCell>
                  <TableCell>{peso != null ? `${peso} kg` : "sem valor"}</TableCell>
                  <TableCell>
                    {b.vaccinations[0]
                      ? b.vaccinations[0].applied_at.toLocaleDateString("pt-BR")
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
