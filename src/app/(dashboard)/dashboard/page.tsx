import { getActiveProfiles, getTenantDb } from "@/lib/tenant-context";

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-tibe-dark">{value}</p>
    </div>
  );
}

export default async function DashboardHome() {
  const profiles = await getActiveProfiles();
  const db = await getTenantDb();

  const hasFazenda = profiles.includes("fazenda");
  const hasPrestador = profiles.includes("prestador");

  // Indicadores básicos por perfil (todas as queries são escopadas ao tenant).
  const [properties, animals, plots, clients, orders, entries] = await Promise.all([
    db.property.count(),
    hasFazenda ? db.animal.count() : Promise.resolve(0),
    hasFazenda ? db.plot.count() : Promise.resolve(0),
    hasPrestador ? db.serviceClient.count() : Promise.resolve(0),
    hasPrestador ? db.serviceOrder.count() : Promise.resolve(0),
    db.financialEntry.count(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Início</h1>
      <p className="mt-1 text-sm text-gray-500">
        Perfis ativos: {profiles.map((p) => (p === "fazenda" ? "Fazenda" : "Prestador")).join(" + ")}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Propriedades" value={properties} />
        {hasFazenda && <Card label="Animais" value={animals} />}
        {hasFazenda && <Card label="Talhões" value={plots} />}
        {hasPrestador && <Card label="Clientes de serviço" value={clients} />}
        {hasPrestador && <Card label="Ordens de serviço" value={orders} />}
        <Card label="Lançamentos financeiros" value={entries} />
      </div>
    </div>
  );
}
