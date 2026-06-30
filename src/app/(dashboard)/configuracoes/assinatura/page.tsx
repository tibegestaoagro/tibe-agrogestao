import { requireModuleAccess } from "@/lib/permissions";

/**
 * Configurações → Assinatura / Billing. Acesso exclusivo do Owner (PRD 5.2).
 * Demais roles são redirecionadas ao dashboard.
 */
export default async function AssinaturaPage() {
  await requireModuleAccess("assinatura", "read");
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Assinatura</h1>
      <p className="mt-2 text-sm text-gray-500">
        Gestão da assinatura — detalhamento no Módulo 5.
      </p>
    </div>
  );
}
