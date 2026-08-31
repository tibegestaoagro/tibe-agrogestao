import { redirect } from "next/navigation";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { listCategoriesAction } from "@/lib/actions/animal-categories";
import CategoryManager from "./category-manager";

/**
 * Configurações → Categorias de rebanho (Módulo 25, spec §2.3). Restrito ao
 * perfil Fazenda (mesma exigência de módulo/perfil do resto do Rebanho).
 */
export default async function CategoriasRebanhoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");
  if (!canWrite(user.role, "rebanho")) redirect("/configuracoes");

  const db = await getTenantDb();
  const categories = await listCategoriesAction(db);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-texto">Categorias de rebanho</h1>
        <p className="mt-1 text-sm text-texto-discreto">
          Categorias usadas no cadastro de rebanho por lote (quantidade), no
          painel e pelo WhatsApp. Renomear ou desativar não afeta lotes já
          registrados.
        </p>
      </div>
      <CategoryManager
        categories={categories.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
      />
    </div>
  );
}
