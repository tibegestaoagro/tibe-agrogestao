import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { lerLojaDoTopo } from "@/lib/emporio/loja-do-topo-servidor";
import { lerResumoHojeAction } from "@/lib/actions/emporio-financeiro";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
import { FinanceiroHoje } from "../_components/financeiro-hoje";

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
  if (!veAPagina(papel, "/emporio/financeiro")) redirect("/emporio");

  const { loja } = await lerLojaDoTopo(db, user, lojaDaUrl);
  const resumo = await lerResumoHojeAction(db, user, { establishment_id: loja || undefined });

  return (
    <div className="space-y-6">
      <CabecalhoDaTela titulo="Hoje" ajuda="O dinheiro das lojas hoje: onde está, o que pagar e o que receber." />

      {resumo.ok ? (
        <FinanceiroHoje resumo={resumo.data} loja={loja} />
      ) : (
        <EmptyState titulo="Não foi possível ler o resumo">{resumo.message}</EmptyState>
      )}
    </div>
  );
}
