import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerResumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { FinanceiroAbas } from "../_components/financeiro-abas";
import { FinanceiroHoje } from "../_components/financeiro-hoje";
import { LojaFiltro } from "../_components/loja-filtro";

/** Financeiro do Meu Empório, tela "Hoje": a casa do papel Financeiro. */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "" } = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";
  const resumo = await lerResumoHojeAction(db, user, { establishment_id: loja || undefined });

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro</h1>
        <p className="mt-1 text-sm text-texto-secundario">O dinheiro das lojas hoje: onde está, o que pagar e o que receber.</p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro" />

      {resumo.ok ? (
        <FinanceiroHoje resumo={resumo.data} loja={loja} />
      ) : (
        <EmptyState titulo="Não foi possível ler o resumo">{resumo.message}</EmptyState>
      )}
    </div>
  );
}
