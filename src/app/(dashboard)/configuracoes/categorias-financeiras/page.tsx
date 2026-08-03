import { redirect } from "next/navigation";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
import { listFinancialCategoriesAction } from "@/lib/actions/financial-categories";
import CategoryManager from "./category-manager";

/**
 * Configurações → Categorias financeiras (Módulo 28). Separadas por tipo
 * (receita/despesa): `FinancialEntry.category` continua texto livre, esta
 * lista é só a fonte da sugestão no painel.
 */
export default async function CategoriasFinanceirasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canWrite(user.role, "financeiro")) redirect("/configuracoes");

  const db = await getTenantDb();
  const categories = await listFinancialCategoriesAction(db);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Categorias financeiras</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sugestões usadas ao lançar receitas e despesas. Renomear ou
          desativar não afeta lançamento já registrado.
        </p>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Despesas</h2>
        <CategoryManager
          entryType="expense"
          categories={categories
            .filter((c) => c.entry_type === "expense")
            .map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Receitas</h2>
        <CategoryManager
          entryType="income"
          categories={categories
            .filter((c) => c.entry_type === "income")
            .map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        />
      </div>
    </div>
  );
}
