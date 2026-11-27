import type { TenantPrismaClient } from "@/lib/prisma";
import { reaisBr } from "@/lib/numero-br";
import {
  resultadoDaLojaAction,
  resultadoPorLojaAction,
  produtosDoMesAction,
  vendasComMargemNegativaAction,
  TODAS_AS_LOJAS,
} from "@/lib/actions/emporio-resultado";
import { lerMes } from "@/lib/emporio/mes";
import { EmptyState } from "@/components/ui/empty-state";
import { ResultadoMes } from "./resultado-mes";
import { ResultadoLojas } from "./resultado-lojas";
import { ResultadoProdutos } from "./resultado-produtos";
import { ResultadoMargemNegativa } from "./resultado-margem-negativa";
import { rotuloDoMes } from "./meses";
import { pctBr } from "./formato";

const corDoResultado = (n: number) => (n < 0 ? "text-perigo-tinta" : n > 0 ? "text-sucesso-tinta" : "text-texto");

/**
 * A aba Resultado das Estatísticas. O resultado é por mês (`mes`, "AAAA-MM": o da data final do período).
 * - Uma loja escolhida: o mês detalhado.
 * - "Todas" para quem alcança todas as lojas: a visão somada de sempre (`all`).
 * - "Todas" para quem alcança só algumas: a soma delas e "Loja por loja", sem o detalhe do mês
 *   (a visão `all` da action é recusada para essa pessoa).
 */
export async function EstatisticasResultado({
  db,
  user,
  mes,
  loja,
  alcanceTotal,
  maisDeUmMes,
}: {
  db: TenantPrismaClient;
  user: Parameters<typeof resultadoDaLojaAction>[1];
  mes: string;
  /** Vazio: "Todas as minhas lojas". */
  loja: string;
  /** Quem alcança todas as lojas (`lojasDoAtor` nulo). */
  alcanceTotal: boolean;
  /** O período do filtro pega mais de um mês. */
  maisDeUmMes: boolean;
}) {
  const civil = lerMes(mes);
  const aviso = maisDeUmMes && civil && (
    <p role="status" className="text-sm text-texto-secundario">
      O resultado é por mês: mostrando {rotuloDoMes(civil)}.
    </p>
  );

  if (!loja && !alcanceTotal) {
    const res = await resultadoPorLojaAction(db, user, { month: mes });
    if (!res.ok) return <EmptyState titulo="Não foi possível calcular o resultado">{res.message}</EmptyState>;
    const t = res.data.total;
    return (
      <div className="space-y-6">
        {aviso}
        <section className="rounded-lg border border-borda bg-superficie p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-texto">Resultado das suas lojas</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Numero rotulo="Vendas" valor={reaisBr(t.sales)} />
            <Numero rotulo="Margem" valor={`${reaisBr(t.margin)}${t.margin_pct !== null ? ` (${pctBr(t.margin_pct)})` : ""}`} />
            <Numero rotulo="Despesas fixas" valor={reaisBr(t.fixed_expenses)} />
            <Numero rotulo="Perdas" valor={reaisBr(t.losses)} />
            <Numero rotulo="Resultado" valor={reaisBr(t.result)} classe={`font-semibold ${corDoResultado(t.result)}`} />
          </dl>
          <p className="mt-4 text-sm text-texto-secundario">
            Escolha uma loja para ver o mês detalhado (ponto de equilíbrio, acompanhamento e custo do cartão).
          </p>
        </section>
        <ResultadoLojas lojas={res.data.lojas} />
      </div>
    );
  }

  const entrada = { establishment_id: loja || TODAS_AS_LOJAS, month: mes };
  const [resultado, produtos, negativas] = await Promise.all([
    resultadoDaLojaAction(db, user, entrada),
    produtosDoMesAction(db, user, entrada),
    vendasComMargemNegativaAction(db, user, entrada),
  ]);
  const somada = !loja;

  return (
    <div className="space-y-6">
      {aviso}
      {resultado.ok ? (
        <>
          <ResultadoMes r={resultado.data} />
          {somada && resultado.data.stores && <ResultadoLojas lojas={resultado.data.stores} />}
        </>
      ) : (
        <EmptyState titulo="Não foi possível calcular o resultado">{resultado.message}</EmptyState>
      )}
      {produtos.ok && <ResultadoProdutos topSales={produtos.data.top_sales} topMargin={produtos.data.top_margin} />}
      {negativas.ok && <ResultadoMargemNegativa vendas={negativas.data} mostrarLoja={somada} />}
    </div>
  );
}

function Numero({ rotulo, valor, classe = "text-texto" }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div>
      <dt className="text-sm text-texto-secundario">{rotulo}</dt>
      <dd className={`text-lg ${classe}`}>{valor}</dd>
    </div>
  );
}
