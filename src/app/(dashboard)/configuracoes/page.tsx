import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import ActivateProfile from "./activate-profile";

/**
 * Configurações da conta. Permite ativar um perfil que faltava (fazenda/prestador)
 * sem refazer o onboarding (spec task 0.5). Restrito a Owner/Admin.
 */
export default async function ConfiguracoesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasMinRole(user.role, "ADMIN")) redirect("/dashboard");

  const profiles = await getActiveProfiles();

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-gray-700">Perfis ativos</h2>
        <ul className="mt-2 flex gap-2">
          {profiles.length === 0 && (
            <li className="text-sm text-gray-500">Nenhum perfil ativo.</li>
          )}
          {profiles.map((p) => (
            <li
              key={p}
              className="rounded-full bg-tibe-light px-3 py-1 text-sm text-tibe-dark"
            >
              {p === "fazenda" ? "Fazenda" : "Prestador de Serviço"}
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2">
          {!profiles.includes("fazenda") && (
            <ActivateProfile profileType="fazenda" label="Ativar perfil Fazenda" />
          )}
          {!profiles.includes("prestador") && (
            <ActivateProfile
              profileType="prestador"
              label="Ativar perfil Prestador de Serviço"
            />
          )}
        </div>
      </section>
    </div>
  );
}
