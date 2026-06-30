import { requireModuleAccess } from "@/lib/permissions";

export default async function FinanceiroPage() {
  await requireModuleAccess("financeiro", "read");
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Financeiro</h1>
      <p className="mt-2 text-sm text-gray-500">Módulo 4 — em construção.</p>
    </div>
  );
}
