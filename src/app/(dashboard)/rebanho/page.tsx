import { requireModuleAccess } from "@/lib/permissions";

export default async function RebanhoPage() {
  await requireModuleAccess("rebanho", "read");
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Rebanho</h1>
      <p className="mt-2 text-sm text-gray-500">Módulo 1 — em construção.</p>
    </div>
  );
}
