import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { lerFluxoProjetadoAction } from "@/lib/actions/emporio-projecao";
import { EmptyState } from "@/components/ui/empty-state";
import { RelatorioAcoes, consulta } from "../../_components/relatorio-acoes";
import { FinanceiroAbas } from "../../_components/financeiro-abas";
import { LojaFiltro } from "../../_components/loja-filtro";
import { FluxoProjetadoTabela, ProjecaoJanelas } from "../../_components/financeiro-projecao";

/** Financeiro, "Projeção": o fluxo de caixa por semana em 30, 60 ou 90 dias. Só leitura. */
export default async function FinanceiroProjecaoPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; dias?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const q = await searchParams;
  const db = await getTenantDb();
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/financeiro")) notFound();

  const lojasRes = await listarEstabelecimentosAction(db, user);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const loja = lojas.some((l) => l.id === q.loja) ? (q.loja as string) : "";
  const dias = q.dias === "60" ? 60 : q.dias === "90" ? 90 : 30;

  const fluxo = await lerFluxoProjetadoAction(db, user, { establishment_id: loja || undefined, days: dias });

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Financeiro: fluxo projetado</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O que deve entrar e sair por semana, a partir do saldo de hoje.
        </p>
      </header>

      <FinanceiroAbas atual="/emporio/financeiro/projecao" loja={loja} />
      <LojaFiltro lojas={lojas} loja={loja} caminho="/emporio/financeiro/projecao" />
      <ProjecaoJanelas dias={dias} loja={loja} />

      {fluxo.ok ? (
        <>
          <RelatorioAcoes
            csvHref={`/api/v1/emporio/finance/projection${consulta({ establishment_id: loja, days: dias, format: "csv" })}`}
            imprimirHref={`/emporio/imprimir/relatorio/projecao${consulta({ loja, dias })}`}
          />
          <FluxoProjetadoTabela fluxo={fluxo.data} />
        </>
      ) : (
        <EmptyState titulo="Não foi possível montar a projeção">{fluxo.message}</EmptyState>
      )}
    </div>
  );
}
