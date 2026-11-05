import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { relatorioDeVendasAction } from "@/lib/actions/emporio-relatorios";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { EmptyState } from "@/components/ui/empty-state";
import { RelatoriosFiltro } from "../_components/relatorios-filtro";
import { RelatoriosBlocos } from "../_components/relatorios-blocos";

/**
 * Relatórios do Empório (entrega 3): vendas por vendedor, por produto, produtos
 * parados e vendas por loja num período. Do Gestor da loja para cima.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; loja?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { de: deDaUrl = "", ate: ateDaUrl = "", loja: lojaDaUrl = "" } = await searchParams;

  const db = await getTenantDb();
  if (!pode(await papelDoEmporio(db, user), "gestor_da_loja")) redirect("/emporio");
  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];

  // Padrão: do dia 1 do mês corrente até hoje, no dia de Brasília.
  const hoje = hojeEmBrasilia().toISOString().slice(0, 10);
  const padraoDe = `${hoje.slice(0, 7)}-01`;
  const informado = deDaUrl !== "" || ateDaUrl !== "";
  const loja = lojas.length > 1 && lojas.some((l) => l.id === lojaDaUrl) ? lojaDaUrl : "";
  const pedir = (from: string, to: string) =>
    relatorioDeVendasAction(db, user, { from, to, ...(loja ? { establishment_id: loja } : {}) });

  let de = deDaUrl || padraoDe;
  let ate = ateDaUrl || hoje;
  let aviso: string | null = null;
  let res = lojas.length > 0 ? await pedir(de, ate) : null;
  // Período inválido na URL: mostra o padrão com um aviso, nunca quebra.
  if (res && !res.ok && res.status === 422 && informado) {
    aviso = `${res.message} Mostrando o mês atual.`;
    de = padraoDe;
    ate = hoje;
    res = await pedir(de, ate);
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Relatórios</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Quem vendeu, o que vendeu e o que ficou parado, num período à sua escolha.
        </p>
      </header>

      {lojas.length === 0 ? (
        <EmptyState titulo="Nenhuma loja disponível">Cadastre uma loja em Estabelecimentos para ver os relatórios.</EmptyState>
      ) : (
        <>
          <RelatoriosFiltro de={de} ate={ate} loja={loja} lojas={lojas} />
          {aviso && (
            <p role="status" className="text-sm text-texto-secundario">
              {aviso}
            </p>
          )}
          {res && res.ok ? (
            <RelatoriosBlocos r={res.data} />
          ) : (
            <EmptyState titulo="Não foi possível montar o relatório">{res ? res.message : "Escolha uma loja."}</EmptyState>
          )}
        </>
      )}
    </div>
  );
}
