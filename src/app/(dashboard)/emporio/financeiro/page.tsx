import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { exigir } from "@/lib/emporio/papel";

/** Financeiro do Meu Empório: a casa do papel Financeiro. Em construção nesta entrega. */
export default async function FinanceiroPage() {
  const user = await requireFeaturePage("emporio");
  const db = await getTenantDb();
  if (await exigir(db, user, "dinheiro")) notFound();

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro</h1>
        <p className="mt-1 text-sm text-texto-secundario">Em construção nesta entrega.</p>
      </header>
    </div>
  );
}
