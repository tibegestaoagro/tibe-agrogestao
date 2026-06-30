import { requireModuleAccess } from "@/lib/permissions";

export default async function PrestadorPage() {
  await requireModuleAccess("prestador", "read");
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Prestador de Serviço</h1>
      <p className="mt-2 text-sm text-gray-500">Módulo 2 — em construção.</p>
    </div>
  );
}
