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
      <h1 className="text-xl font-semibold text-texto">Configurações</h1>

      <section>
        <h2 className="text-sm font-medium text-texto-secundario">Dados da empresa</h2>
        <div className="mt-3 rounded-lg border border-borda bg-superficie p-5">
          {tenant && <TenantForm tenant={tenant} />}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-texto-secundario">Perfis ativos</h2>
        <ul className="mt-2 flex gap-2">
          {profiles.length === 0 && (
            <li className="text-sm text-texto-discreto">Nenhum perfil ativo.</li>
          )}
          {profiles.map((p) => (
            <li
              key={p}
              /**
               * ⚠️ Era `bg-tibe-light`, que virou INVISÍVEL: o alias
               * depreciado aponta para `--superficie-afundada`, que é
               * exatamente o fundo do painel. A pílula ficava da cor da
               * página e só sobrava o texto solto. Achado na varredura ao
               * vivo de 2026-08-31; o par abaixo é conferido pelo gate de
               * contraste como "texto sobre verde suave".
               */
              className="rounded-full bg-primaria-suave px-3 py-1 text-sm text-primaria-tinta"
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
          <h2 className="text-sm font-medium text-texto-secundario">Propriedades</h2>
          <p className="mt-2 text-sm text-texto-discreto">
            Cadastro e arquivamento de propriedades fica dentro do módulo Rebanho.
          </p>
          <Link
            href="/rebanho"
            className="mt-2 inline-flex min-h-11 items-center text-sm text-primaria-tinta hover:underline sm:min-h-0"
          >
            Gerenciar propriedades →
          </Link>
        </section>
      )}

      {profiles.includes("fazenda") && (
        <section>
          <h2 className="text-sm font-medium text-texto-secundario">Categorias de rebanho</h2>
          <p className="mt-2 text-sm text-texto-discreto">
            Categorias usadas no cadastro de rebanho por lote (quantidade,
            sem brinco individual).
          </p>
          <Link
            href="/configuracoes/categorias-rebanho"
            className="mt-2 inline-flex min-h-11 items-center text-sm text-primaria-tinta hover:underline sm:min-h-0"
          >
            Gerenciar categorias →
          </Link>
        </section>
      )}

      <section className="flex flex-wrap gap-4 border-t border-borda pt-6 text-sm">
        <Link href="/configuracoes/usuarios" className="inline-flex min-h-11 items-center text-primaria-tinta hover:underline sm:min-h-0">
          Usuários
        </Link>
        <Link href="/configuracoes/categorias-financeiras" className="inline-flex min-h-11 items-center text-primaria-tinta hover:underline sm:min-h-0">
          Categorias financeiras
        </Link>
        <Link href="/configuracoes/alertas" className="inline-flex min-h-11 items-center text-primaria-tinta hover:underline sm:min-h-0">
          Alertas
        </Link>
        {hasMinRole(user.role, "OWNER") && (
          <Link href="/configuracoes/assinatura" className="inline-flex min-h-11 items-center text-primaria-tinta hover:underline sm:min-h-0">
            Assinatura
          </Link>
        )}
      </section>
    </div>
  );
}
