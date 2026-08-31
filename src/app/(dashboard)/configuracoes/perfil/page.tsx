import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import EditNameForm from "./edit-name-form";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  VISUALIZADOR: "Visualizador",
};

/**
 * Configurações → Perfil (briefing de layout, menu do topo). Sem gate de
 * papel, mesmo motivo de "Minha senha": todo usuário precisa alcançar isso.
 */
export default async function PerfilPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Nome do tenant não vem da sessão (Tenant não é tenant-scoped; lookup por id).
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenant_id },
    select: { name: true },
  });

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-texto">Perfil</h1>
        <p className="text-sm text-texto-discreto">Seus dados nesta conta.</p>
      </div>

      <div className="space-y-4 rounded-lg border border-borda bg-superficie p-5">
        <EditNameForm initialName={user.name ?? ""} />

        <div>
          <p className="text-sm font-medium text-texto-secundario">Email</p>
          <p className="mt-1 text-sm text-texto-secundario">{user.email}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-texto-secundario">Papel</p>
          <p className="mt-1 text-sm text-texto-secundario">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-texto-secundario">Fazenda</p>
          <p className="mt-1 text-sm text-texto-secundario">{tenant?.name ?? "-"}</p>
        </div>
      </div>
    </div>
  );
}
