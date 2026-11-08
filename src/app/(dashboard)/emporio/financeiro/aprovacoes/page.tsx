import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarPedidosDePagamentoAction } from "@/lib/actions/emporio-aprovacoes";
import { EmptyState } from "@/components/ui/empty-state";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { FinanceiroAprovacoes } from "../../_components/financeiro-aprovacoes";
import { cn } from "@/lib/utils";

const FILTROS = [
  { valor: "pendente", rotulo: "Esperando" },
  { valor: "decididos", rotulo: "Decididos" },
] as const;

/** Financeiro, "Aprovações": os pagamentos acima do teto que esperam o Dono ou o Gerente geral. */
export default async function FinanceiroAprovacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { status: statusDaUrl = "" } = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const status = statusDaUrl === "decididos" ? "decididos" : "pendente";
  const res = await listarPedidosDePagamentoAction(db, user, status === "pendente" ? { status: "pendente" } : {});
  const pedidos = res.ok ? (status === "pendente" ? res.data : res.data.filter((p) => p.status !== "pendente")) : [];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: aprovações</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Pagamentos acima do teto da conta. Aprovar paga naquele momento; recusar exige um motivo.
        </p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/aprovacoes" loja="" />
      <nav aria-label="Filtrar pedidos" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={`/emporio/financeiro/aprovacoes?status=${f.valor}`}
            aria-current={f.valor === status ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria sm:min-h-9",
              f.valor === status
                ? "border-primaria bg-primaria text-sobre-primaria"
                : "border-borda bg-superficie text-texto hover:border-borda-forte",
            )}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>

      {res.ok ? (
        <FinanceiroAprovacoes pedidos={pedidos} podeDecidir={pode(papel, "conta")} decididos={status === "decididos"} />
      ) : (
        <EmptyState titulo="Não foi possível ler os pedidos">{res.message}</EmptyState>
      )}
    </div>
  );
}
