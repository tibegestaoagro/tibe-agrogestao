import type { PagamentoView } from "@/lib/actions/emporio-despesas";
import { dataBr } from "@/lib/emporio/datas";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NomeDoFornecedor } from "./amarras";

const ORIGEM_ROTULO: Record<PagamentoView["origin"], string> = {
  vendeu_pagou: "Vendeu, Pagou",
  despesa_fixa: "Despesa fixa",
  compra: "Compra",
  frete: "Frete de entrega",
  avulsa: "Avulsa",
};

/** "Pago no período" do A pagar: do mais recente ao mais antigo, como o servidor devolve. */
export function PagosLista({ itens, periodo }: { itens: PagamentoView[]; periodo: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Pago no período</h2>
      <p className="text-sm text-texto-secundario">{periodo}</p>
      {itens.length === 0 ? (
        <EmptyState titulo="Nada pago neste período">As contas pagas entre as datas escolhidas aparecem aqui.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Saiu de</TableHead>
              <TableHead>Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{dataBr(p.paid_on)}</TableCell>
                <TableCell className="font-medium text-texto">{p.name}</TableCell>
                <TableCell>
                  <NomeDoFornecedor id={p.supplier_id} nome={p.supplier_name} />
                </TableCell>
                <TableCell>
                  {ORIGEM_ROTULO[p.origin]}
                  {p.establishment_name ? `, ${p.establishment_name}` : ""}
                </TableCell>
                <TableCell>{p.source_label}</TableCell>
                <TableCell>{reaisBr(p.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
