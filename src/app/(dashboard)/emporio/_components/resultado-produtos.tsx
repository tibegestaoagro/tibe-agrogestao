import type { ProdutoDoMesView } from "@/lib/actions/emporio-resultado";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { UNIDADE_BASE_SUFIXO, numeroBr, pctBr } from "./formato";

function Lista({ titulo, linhas }: { titulo: string; linhas: ProdutoDoMesView[] }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <h3 className="text-base font-semibold text-texto">{titulo}</h3>
      {linhas.length === 0 ? (
        <EmptyState compacto titulo="Nenhuma venda no mês">Os produtos aparecem aqui quando houver venda.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="text-right">Margem %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((p) => (
              <TableRow key={p.emporio_product_id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-right">
                  {numeroBr(p.quantity)} {UNIDADE_BASE_SUFIXO[p.base_unit] ?? p.base_unit}
                </TableCell>
                <TableCell className="text-right">{reaisBr(p.sales)}</TableCell>
                <TableCell className="text-right">{reaisBr(p.cost)}</TableCell>
                <TableCell className={`text-right ${p.margin < 0 ? "text-perigo-tinta" : ""}`}>{reaisBr(p.margin)}</TableCell>
                <TableCell className="text-right">{p.margin_pct !== null ? pctBr(p.margin_pct) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Os produtos do mês (Q104): os dez que mais vendem e os dez que mais dão margem. */
export function ResultadoProdutos({ topSales, topMargin }: { topSales: ProdutoDoMesView[]; topMargin: ProdutoDoMesView[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-texto">Produtos do mês</h2>
      <Lista titulo="Mais vendem" linhas={topSales} />
      <Lista titulo="Mais dão margem" linhas={topMargin} />
    </div>
  );
}
