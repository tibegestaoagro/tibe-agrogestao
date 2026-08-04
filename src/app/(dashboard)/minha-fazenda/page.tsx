import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { getActivePropertyId } from "@/lib/active-property";
import { getPastureAreaSummary } from "@/lib/actions/properties";
import { decToNum } from "@/lib/serialize";
import { Button } from "@/components/ui/button";
import FazendaForm from "@/components/minha-fazenda/fazenda-form";
import ArchiveFazendaButton from "@/components/minha-fazenda/archive-fazenda-button";
import PastureList from "@/components/minha-fazenda/pasture-list";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

/**
 * "Minha Fazenda" (Módulo 29): cadastro da fazenda + divisão em pastos, ponto
 * de partida do restante do sistema (docs/Minha Fazenda — Especificação
 * Funcional.doc). Distinta do grupo de navegação "Operação" (Rebanho,
 * Máquinas, Lavoura, Prestador, Financeiro, Alertas): esta tela é sobre a
 * ESTRUTURA da propriedade, não sobre os módulos que rodam dentro dela.
 */
export default async function MinhaFazendaPage({
  searchParams,
}: {
  searchParams: { property_id?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const [properties, cookieActiveId] = await Promise.all([
    db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } }),
    getActivePropertyId(db),
  ]);

  const selectedId = searchParams.property_id ?? cookieActiveId ?? properties[0]?.id;
  const selected = properties.find((p) => p.id === selectedId) ?? null;

  const [pastures, areaSummary] = selected
    ? await Promise.all([
        db.pasture.findMany({
          where: { property_id: selected.id, archived_at: null },
          orderBy: { name: "asc" },
        }),
        getPastureAreaSummary(db, selected.id),
      ])
    : [[], null];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Minha Fazenda</h1>
        {writable && (
          <FazendaForm
            trigger={<Button variant="outline">+ Nova fazenda</Button>}
          />
        )}
      </div>

      {properties.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {properties.map((p) => (
            <Link
              key={p.id}
              href={`/minha-fazenda?property_id=${p.id}`}
              className={`rounded-full px-3 py-1 text-sm ${
                p.id === selected?.id
                  ? "bg-tibe-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {!selected && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            Nenhuma fazenda cadastrada ainda. Cadastre sua propriedade para começar.
          </p>
          {writable && (
            <div className="mt-4">
              <FazendaForm trigger={<Button>Cadastrar fazenda</Button>} />
            </div>
          )}
        </div>
      )}

      {selected && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium text-gray-900">{selected.name}</h2>
              {writable && (
                <div className="flex gap-2">
                  <FazendaForm
                    fazenda={{
                      id: selected.id,
                      name: selected.name,
                      address: selected.address,
                      city: selected.city,
                      district: selected.district,
                      area_hectares: decToNum(selected.area_hectares),
                    }}
                    trigger={
                      <Button variant="outline" size="sm">
                        Editar
                      </Button>
                    }
                  />
                  <ArchiveFazendaButton propertyId={selected.id} />
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Tamanho total"
                value={
                  decToNum(selected.area_hectares) != null
                    ? `${decToNum(selected.area_hectares)} ha`
                    : "não informado"
                }
              />
              <Stat label="Município" value={selected.city ?? "não informado"} />
              <Stat label="Distrito" value={selected.district ?? "não informado"} />
              <Stat label="Endereço" value={selected.address ?? "não informado"} />
            </div>
          </div>

          {areaSummary && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-medium text-gray-700">Divisão de pastos</h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat
                  label="Distribuído em pastos"
                  value={`${areaSummary.distributed_area} ha`}
                />
                <Stat
                  label="Área ainda não distribuída"
                  value={areaSummary.remaining_area != null ? `${areaSummary.remaining_area} ha` : "não informado"}
                />
                <Stat
                  label="Tamanho total da fazenda"
                  value={areaSummary.total_area != null ? `${areaSummary.total_area} ha` : "não informado"}
                />
              </div>
              {areaSummary.over_allocated && (
                <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  A soma das áreas dos pastos é maior que o tamanho total informado para a
                  fazenda. Deseja revisar os valores?
                </p>
              )}
            </div>
          )}

          <PastureList
            propertyId={selected.id}
            pastures={pastures.map((p) => ({
              id: p.id,
              name: p.name,
              area_hectares: decToNum(p.area_hectares),
            }))}
            canWrite={writable}
          />
        </>
      )}
    </div>
  );
}
