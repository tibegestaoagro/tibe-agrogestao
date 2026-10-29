import Link from "next/link";
import type { CausaDaMargemNegativa, VendaComMargemNegativaView } from "@/lib/actions/emporio-resultado";
import { reaisBr } from "@/lib/numero-br";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const CAUSA: Record<CausaDaMargemNegativa, string> = {
  custo_provisorio: "Custo provisório (vendeu sem estoque)",
  preco_abaixo_do_custo: "Preço abaixo do custo",
  desconto: "Desconto",
  taxa_cartao: "Taxa do cartão",
  despesas_da_venda: "Despesas da venda",
};

const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** As vendas do mês que deram prejuízo, com a causa mais provável (Q105). */
export function ResultadoMargemNegativa({ vendas, mostrarLoja }: { vendas: VendaComMargemNegativaView[]; mostrarLoja: boolean }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-texto">Vendas com margem negativa</h2>
      {vendas.length === 0 ? (
        <p className="text-sm font-medium text-sucesso-tinta">Nenhuma venda deu prejuízo neste mês.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              {mostrarLoja && <TableHead>Loja</TableHead>}
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead>Causa</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendas.map((v) => (
              <TableRow key={v.sale_id}>
                <TableCell>{dataBr(v.sold_at)}</TableCell>
                {mostrarLoja && <TableCell>{v.establishment_name}</TableCell>}
                <TableCell className="text-right">{reaisBr(v.net_amount)}</TableCell>
                <TableCell className="text-right font-semibold text-perigo-tinta">{reaisBr(v.margin)}</TableCell>
                <TableCell>{CAUSA[v.cause]}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/emporio/vendas/${v.sale_id}`} className="text-texto-marca hover:underline">
                    Ver venda
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
