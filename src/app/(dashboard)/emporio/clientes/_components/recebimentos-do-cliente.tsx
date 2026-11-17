"use client";

import { useState } from "react";
import type { RecebimentoView } from "@/lib/actions/emporio-financeiro";
import { apiGet } from "@/lib/client-api";
import { dataBr } from "@/lib/emporio/datas";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VendaLink } from "../../_components/amarras";
import { CHEQUE_SITUACAO_ROTULO } from "../../_components/venda-rotulos";

const FORMA: Record<RecebimentoView["kind"], string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao: "Cartão",
  fiado: "Fiado",
  cheque: "Cheque",
  boleto: "Boleto",
  devolucao: "Devolução em dinheiro",
};

type Pagina = { items: RecebimentoView[]; next_before: string | null };

/**
 * Os recebimentos do cliente, do mais recente ao mais antigo (Q347). A página server traz os 20
 * primeiros; "Ver mais" pede a seguinte à rota (`before` é o `next_before` da anterior).
 */
export function RecebimentosDoCliente({
  customerId,
  iniciais,
  proximo,
}: {
  customerId: string;
  iniciais: RecebimentoView[];
  proximo: string | null;
}) {
  const [itens, setItens] = useState<RecebimentoView[]>(iniciais);
  const [antes, setAntes] = useState<string | null>(proximo);
  const [carregando, setCarregando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  async function verMais() {
    if (!antes) return;
    setCarregando(true);
    const res = await apiGet<Pagina>(
      `/api/v1/emporio/customers/${encodeURIComponent(customerId)}/receipts?before=${encodeURIComponent(antes)}`,
    );
    setCarregando(false);
    if (!res.ok) {
      setRecusa(res.message);
      return;
    }
    setRecusa(null);
    setItens((atual) => [...atual, ...res.data.items]);
    setAntes(res.data.next_before);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-texto">Recebimentos</h2>
      {itens.length === 0 ? (
        <EmptyState titulo="Nenhum recebimento ainda">O que este cliente já pagou aparece aqui.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
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
                <TableCell>{r.sale_id ? <VendaLink id={r.sale_id} numero={r.sale_number} /> : "-"}</TableCell>
                <TableCell>
                  {FORMA[r.kind]}
                  {r.kind === "cheque" && r.check_status && (
                    <Badge variant={r.check_status === "compensado" ? "green" : "amber"} className="ml-2">
                      {CHEQUE_SITUACAO_ROTULO[r.check_status] ?? r.check_status}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{r.establishment_name ?? "-"}</TableCell>
                <TableCell>{reaisBr(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {recusa && (
        <p role="alert" className="text-sm text-perigo-tinta">
          {recusa}
        </p>
      )}
      {antes && (
        <Button type="button" variant="outline" onClick={verMais} disabled={carregando}>
          {carregando ? "Carregando..." : "Ver mais"}
        </Button>
      )}
    </section>
  );
}
