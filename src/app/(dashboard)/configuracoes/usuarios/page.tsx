import { requireModuleAccess } from "@/lib/permissions";

/**
 * Configurações → Usuários. Acesso: Owner e Admin (PRD 5.2). Operador e
 * Visualizador são redirecionados ao dashboard (critério de aceitação 0.6).
 */
export default async function UsuariosPage() {
  await requireModuleAccess("usuarios", "read");
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Usuários</h1>
      <p className="mt-2 text-sm text-gray-500">
        Gestão de usuários — detalhamento no Módulo 5.
      </p>
    </div>
  );
}
