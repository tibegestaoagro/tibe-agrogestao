import type { CurvaAbc, RelatorioDeVendas } from "@/lib/actions/emporio-relatorios";
import type { ResultadoPorLojaView } from "@/lib/actions/emporio-resultado";
import { reaisBr } from "@/lib/numero-br";
import { ESTILO } from "./relatorio-financeiro-a4";

/**
 * Relatórios das Estatísticas (Vendas e Resultado) em folha A4, no mesmo estilo da folha do dinheiro.
 */

const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const pct = (n: number | null) => (n === null ? "sem base" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`);

export type DadosDaEstatistica =
  | { tipo: "curva-abc"; r: CurvaAbc }
  | { tipo: "vendedores"; r: RelatorioDeVendas["por_vendedor"] }
  | { tipo: "parados"; r: RelatorioDeVendas["parados"] }
  | { tipo: "resultado"; r: ResultadoPorLojaView };

export const TITULO_DA_ESTATISTICA = {
  "curva-abc": "Curva ABC de produtos",
  vendedores: "Vendas por vendedor",
  parados: "Produtos parados",
  resultado: "Resultado do mês por loja",
} as const;

function Corpo({ d }: { d: DadosDaEstatistica }) {
  if (d.tipo === "curva-abc") {
    const { r } = d;
    const lucro = r.measure === "profit";
    const medida = <p>{lucro ? "Medida: lucro bruto (venda menos custo)." : "Medida: faturamento."}</p>;
    if (r.itens.length === 0)
      return (
        <>
          {medida}
          <p className="vazio">Nenhuma venda no período.</p>
        </>
      );
    const temEstimado = lucro && r.itens.some((i) => i.cost_estimated);
    return (
      <>
      {medida}
      {temEstimado && <p>* custo estimado ou provisório em alguma venda do período.</p>}
      <table>
        <thead>
          <tr>
            <th>Classe</th>
            <th>Nome</th>
            <th className="num">Valor</th>
            <th className="num">%</th>
            <th className="num">% acumulado</th>
          </tr>
        </thead>
        <tbody>
          {r.itens.map((i) => (
            <tr key={i.id}>
              <td>{i.classe}</td>
              <td>
                {i.name}
                {lucro && i.cost_estimated ? " *" : ""}
              </td>
              <td className="num">{reaisBr(i.amount)}</td>
              <td className="num">{pct(i.share_pct)}</td>
              <td className="num">{pct(i.cumulative_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </>
    );
  }
  if (d.tipo === "vendedores") {
    if (d.r.length === 0) return <p className="vazio">Nenhuma venda no período.</p>;
    return (
      <table>
        <thead>
          <tr>
            <th>Vendedor</th>
            <th className="num">Vendas</th>
            <th className="num">Total</th>
            <th className="num">Ticket médio</th>
          </tr>
        </thead>
        <tbody>
          {d.r.map((v) => (
            <tr key={v.seller_user_id ?? v.name}>
              <td>{v.name}</td>
              <td className="num">{v.sales_count}</td>
              <td className="num">{reaisBr(v.total)}</td>
              <td className="num">{v.average_ticket === null ? "-" : reaisBr(v.average_ticket)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (d.tipo === "parados") {
    if (d.r.length === 0) return <p className="vazio">Nenhum produto parado no período.</p>;
    return (
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Loja</th>
          </tr>
        </thead>
        <tbody>
          {d.r.map((p) => (
            <tr key={`${p.emporio_product_id}:${p.establishment_id}`}>
              <td>{p.name}</td>
              <td>{p.establishment_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const { r } = d;
  if (r.lojas.length === 0) return <p className="vazio">Nenhuma loja com resultado no mês.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Loja</th>
          <th className="num">Vendas</th>
          <th className="num">Margem</th>
          <th className="num">Despesas fixas</th>
          <th className="num">Perdas</th>
          <th className="num">Resultado</th>
        </tr>
      </thead>
      <tbody>
        {r.lojas.map((l) => (
          <tr key={l.establishment_id}>
            <td>{l.name}</td>
            <td className="num">{reaisBr(l.sales)}</td>
            <td className="num">{reaisBr(l.margin)}</td>
            <td className="num">{reaisBr(l.fixed_expenses)}</td>
            <td className="num">{reaisBr(l.losses)}</td>
            <td className={l.result < 0 ? "num neg" : "num"}>{reaisBr(l.result)}</td>
          </tr>
        ))}
        <tr className="forte">
          <td>Total</td>
          <td className="num">{reaisBr(r.total.sales)}</td>
          <td className="num">{reaisBr(r.total.margin)}</td>
          <td className="num">{reaisBr(r.total.fixed_expenses)}</td>
          <td className="num">{reaisBr(r.total.losses)}</td>
          <td className="num">{reaisBr(r.total.result)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function RelatorioEstatisticasA4({
  d,
  loja,
  periodo,
  emitidoEm,
}: {
  d: DadosDaEstatistica;
  /** O nome da loja, ou "Todas as minhas lojas". */
  loja: string;
  /** O período (DD/MM/AAAA a DD/MM/AAAA) ou o mês, já em texto. */
  periodo: string;
  /** Data de emissão, "AAAA-MM-DD". */
  emitidoEm: string;
}) {
  return (
    <article className="a4">
      <style>{ESTILO}</style>
      <header className="topo">
        <div>
          <h1>{TITULO_DA_ESTATISTICA[d.tipo]}</h1>
          <div>{loja}</div>
          <div>{periodo}</div>
        </div>
        <div className="doc">
          <div>Emitido em</div>
          <b>{dmy(emitidoEm)}</b>
        </div>
      </header>
      <Corpo d={d} />
    </article>
  );
}
