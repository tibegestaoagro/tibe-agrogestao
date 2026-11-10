import type { ReactNode } from "react";
import type { RelatorioDeVendas, VendasPorOrigem } from "@/lib/actions/emporio-relatorios";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { UNIDADE_BASE_SUFIXO, numeroBr, pctBr } from "./formato";

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <h2 className="text-base font-semibold text-texto">{titulo}</h2>
      {children}
    </section>
  );
}

const ticket = (v: number | null) => (v === null ? "-" : reaisBr(v));
const classeTotal = (v: number) => `text-right ${v < 0 ? "text-perigo-tinta" : ""}`;

const ROTULO_ORIGEM = { balcao: "Balcão", ecommerce: "E-commerce" } as const;

function TabelaPorOrigem({ origens }: { origens: VendasPorOrigem }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Origem</TableHead>
          <TableHead className="text-right">Vendas</TableHead>
          <TableHead className="text-right">Faturamento</TableHead>
          <TableHead className="text-right">Frete</TableHead>
          <TableHead className="text-right">% do faturamento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {origens.map((o) => (
          <TableRow key={o.origin}>
            <TableCell className="font-medium">{ROTULO_ORIGEM[o.origin]}</TableCell>
            <TableCell className="text-right">{o.count}</TableCell>
            <TableCell className={classeTotal(o.net)}>{reaisBr(o.net)}</TableCell>
            <TableCell className="text-right">{reaisBr(o.freight)}</TableCell>
            <TableCell className="text-right">{pctBr(o.share_pct)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Os blocos do relatório de vendas, cada um com o vazio próprio. */
export function RelatoriosBlocos({ r }: { r: RelatorioDeVendas }) {
  const varias = r.lojas.length > 1;
  return (
    <div className="space-y-4">
      <Bloco titulo="Por origem">
        <p className="text-sm text-texto-secundario">Balcão e e-commerce, já sem o que foi devolvido.</p>
        <TabelaPorOrigem origens={r.by_origin} />
        {varias && r.por_loja.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-texto">Em cada loja</h3>
            {r.por_loja.map((l) => (
              <div key={l.establishment_id} className="space-y-1">
                <p className="text-sm font-medium text-texto">{l.name}</p>
                <TabelaPorOrigem origens={l.by_origin} />
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco titulo="Vendas por vendedor">
        {r.por_vendedor.length === 0 ? (
          <EmptyState compacto titulo="Nenhuma venda no período">
            Os vendedores aparecem aqui quando houver venda.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.por_vendedor.map((v) => (
                <TableRow key={v.seller_user_id ?? "sem-vendedor"}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="text-right">{v.sales_count}</TableCell>
                  <TableCell className={classeTotal(v.total)}>{reaisBr(v.total)}</TableCell>
                  <TableCell className="text-right">{ticket(v.average_ticket)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Bloco>

      <Bloco titulo="Vendas por produto">
        {r.por_produto.length === 0 ? (
          <EmptyState compacto titulo="Nenhum produto vendido no período">
            Os produtos aparecem aqui quando houver venda.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.por_produto.map((p) => (
                <TableRow key={p.emporio_product_id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">
                    {numeroBr(p.quantity)} {UNIDADE_BASE_SUFIXO[p.base_unit] ?? p.base_unit}
                  </TableCell>
                  <TableCell className={classeTotal(p.total)}>{reaisBr(p.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Bloco>

      <Bloco titulo="Produtos parados">
        <p className="text-sm text-texto-secundario">Têm preço na loja e não venderam nada no período.</p>
        {r.parados.length === 0 ? (
          <EmptyState compacto titulo="Nenhum produto parado">
            Tudo o que tem preço vendeu pelo menos uma vez no período.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                {varias && <TableHead>Loja</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.parados.map((p) => (
                <TableRow key={`${p.emporio_product_id}:${p.establishment_id}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  {varias && <TableCell>{p.establishment_name}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Bloco>

      <Bloco titulo="Vendas por loja">
        {r.por_loja.length === 0 ? (
          <EmptyState compacto titulo="Nenhuma loja no período">As lojas aparecem aqui quando houver venda.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.por_loja.map((l) => (
                <TableRow key={l.establishment_id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-right">{l.sales_count}</TableCell>
                  <TableCell className={classeTotal(l.total)}>{reaisBr(l.total)}</TableCell>
                  <TableCell className="text-right">{ticket(l.average_ticket)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Bloco>
    </div>
  );
}
