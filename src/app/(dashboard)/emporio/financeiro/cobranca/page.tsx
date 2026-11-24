import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { FAIXAS_DE_COBRANCA, listarCobrancaAction, type FaixaDeCobranca } from "@/lib/actions/emporio-credito";
import { EmptyState } from "@/components/ui/empty-state";
import { CabecalhoDaTela } from "../../_components/cabecalho-da-tela";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { FaixaFiltro, FinanceiroCobranca } from "../../_components/financeiro-cobranca";
import { LojaFiltro } from "../../_components/loja-filtro";

/** Financeiro, "Cobrança": quem tem fiado vencido, do mais atrasado ao menos, com o WhatsApp pronto. */
export default async function FinanceiroCobrancaPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; faixa?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja: lojaDaUrl = "", faixa: faixaDaUrl = "" } = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) redirect("/emporio");

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";
  const faixa = (FAIXAS_DE_COBRANCA as readonly string[]).includes(faixaDaUrl) ? (faixaDaUrl as FaixaDeCobranca) : "";

  const dadosRes = await listarCobrancaAction(db, user, {
    establishment_id: loja || undefined,
    faixa: faixa || undefined,
  });

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="Cobrança"
        caminho={[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]}
        ajuda="Quem tem fiado vencido, do mais atrasado ao menos."
      />

      <FinanceiroAbas atual="/emporio/financeiro/cobranca" loja={loja} />
      <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/cobranca" />
        <FaixaFiltro faixa={faixa} loja={loja} />
      </div>

      {dadosRes.ok ? (
        <FinanceiroCobranca dados={dadosRes.data} loja={loja} />
      ) : (
        <EmptyState titulo="Não foi possível ler a cobrança">{dadosRes.message}</EmptyState>
      )}
    </div>
  );
}
