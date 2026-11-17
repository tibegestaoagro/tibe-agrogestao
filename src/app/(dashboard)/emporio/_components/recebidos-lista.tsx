import type { RecebimentoView } from "@/lib/actions/emporio-financeiro";
import { dataBr } from "@/lib/emporio/datas";
import { reaisBr } from "@/lib/numero-br";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NomeDoCliente, VendaLink } from "./amarras";

export const FORMA_DO_RECEBIMENTO: Record<RecebimentoView["kind"], string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  fiado: "Fiado",
  cheque: "Cheque",
  boleto: "Boleto",
  devolucao: "Devolução em dinheiro",
};

/** "Recebido no período" do A receber: do mais recente ao mais antigo, como o servidor devolve. */
export function RecebidosLista({
  itens,
  padraoId,
  periodo,
}: {
  itens: RecebimentoView[];
  padraoId: string | null;
  periodo: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Recebido no período</h2>
      <p className="text-sm text-texto-secundario">{periodo}</p>
      {itens.length === 0 ? (
        <EmptyState titulo="Nada recebido neste período">
          Fiado recebido, cheques compensados, boletos pagos e parcelas de cartão que caíram aparecem aqui.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Venda</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((r) => (
              <TableRow key={`${r.kind}-${r.id}`}>
                <TableCell>{dataBr(r.occurred_on)}</TableCell>
                <TableCell>
                  <NomeDoCliente id={r.customer_id} nome={r.customer_name} padraoId={padraoId} />
                </TableCell>
                <TableCell>{r.sale_id ? <VendaLink id={r.sale_id} numero={r.sale_number} /> : "-"}</TableCell>
                <TableCell>{FORMA_DO_RECEBIMENTO[r.kind]}</TableCell>
                <TableCell>{r.establishment_name ?? "-"}</TableCell>
                <TableCell>{reaisBr(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
