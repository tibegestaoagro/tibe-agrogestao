import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import ActivateProfile from "./activate-profile";
import TenantForm from "@/components/configuracoes/tenant-form";

/**
 * Configurações da conta (spec 5.3): dados do tenant, atalho para
 * propriedades, e ativação de perfil adicional (já existia desde o M0).
 * Restrito a Owner/Admin.
 */
export default async function ConfiguracoesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasMinRole(user.role, "ADMIN")) redirect("/dashboard");

  const [profiles, tenant] = await Promise.all([
    getActiveProfiles(),
    prisma.tenant.findUnique({
      where: { id: user.tenant_id },
      select: { name: true, document: true, phone: true, email: true },
    }),
  ]);

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>

      <section>
        <h2 className="text-sm font-medium text-gray-700">Dados da empresa</h2>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-5">
          {tenant && <TenantForm tenant={tenant} />}
        </div>
      </section>

      <section>
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

      {profiles.includes("fazenda") && (
        <section>
          <h2 className="text-sm font-medium text-gray-700">Propriedades</h2>
          <p className="mt-2 text-sm text-gray-500">
            Cadastro e arquivamento de propriedades fica dentro do módulo Rebanho.
          </p>
          <Link
            href="/rebanho"
            className="mt-2 inline-block text-sm text-tibe-primary hover:underline"
          >
            Gerenciar propriedades →
          </Link>
        </section>
      )}

      {profiles.includes("fazenda") && (
        <section>
          <h2 className="text-sm font-medium text-gray-700">Categorias de rebanho</h2>
          <p className="mt-2 text-sm text-gray-500">
            Categorias usadas no cadastro de rebanho por lote (quantidade,
            sem brinco individual).
          </p>
          <Link
            href="/configuracoes/categorias-rebanho"
            className="mt-2 inline-block text-sm text-tibe-primary hover:underline"
          >
            Gerenciar categorias →
          </Link>
        </section>
      )}

      <section className="flex flex-wrap gap-4 border-t border-gray-200 pt-6 text-sm">
        <Link href="/configuracoes/usuarios" className="text-tibe-primary hover:underline">
          Usuários
        </Link>
        <Link href="/configuracoes/categorias-financeiras" className="text-tibe-primary hover:underline">
          Categorias financeiras
        </Link>
        <Link href="/configuracoes/alertas" className="text-tibe-primary hover:underline">
          Alertas
        </Link>
        {hasMinRole(user.role, "OWNER") && (
          <Link href="/configuracoes/assinatura" className="text-tibe-primary hover:underline">
            Assinatura
          </Link>
        )}
      </section>
    </div>
  );
}
