import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Meu Empório (Módulo 39), F0: a área existe e está liberada, e só.
 *
 * `requireFeaturePage` devolve 404 quando o recurso não é visível para o
 * usuário, como se a rota não existisse: é o que mantém a página invisível
 * para quem a Plataforma não liberou. O cadastro de estabelecimentos é F1,
 * por isso não há ação nenhuma aqui.
 */
export default async function EmporioPage() {
  await requireFeaturePage("emporio");

  const db = await getTenantDb();
  const estabelecimentos = await db.establishment.count();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-texto">Meu Empório</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Estabelecimentos cadastrados: {estabelecimentos}
        </p>
      </header>

      <EmptyState titulo="Área liberada para teste">
        O cadastro de estabelecimentos chega na próxima etapa.
      </EmptyState>
    </div>
  );
}
