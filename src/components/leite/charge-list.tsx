"use client";

import { useRouter } from "next/navigation";
import type { MilkChargeType } from "@/generated/prisma/client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { COBRANCA_LEITE_LABEL } from "@/components/leite/storage-labels";

/**
 * As cobranças do §22, com o cancelamento que leva o lançamento junto.
 *
 * A descrição do diálogo diz que o dinheiro sai do Financeiro, porque cancelar
 * uma cobrança sem dizer isso deixaria o produtor achando que só a linha desta
 * tela sumiu. Foi a versão inversa desse silêncio que o confinamento pagou em
 * 31/08, com a conta sobrevivendo ao cancelamento.
 */

type Cobranca = {
  id: string;
  owner_name: string;
  type: MilkChargeType;
  amount: number;
  occurred_at: string;
  period_label: string | null;
  canceled: boolean;
};

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ChargeList({
  cobrancas,
  canWrite,
  acao,
}: {
  cobrancas: Cobranca[];
  canWrite: boolean;
  acao?: React.ReactNode;
}) {
  const router = useRouter();
  const aviso = useAviso();

  async function cancelar(id: string) {
    const res = await apiPost(`/api/v1/milk/charges/${id}/cancel`);
    if (res.ok) {
      aviso.sucesso("Cobrança cancelada, e a receita saiu do Financeiro junto.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  const total = cobrancas.filter((c) => !c.canceled).reduce((s, c) => s + c.amount, 0);

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
          Cobrança pelo ponto de coleta
        </h2>
        <div className="flex items-center gap-3">
          {cobrancas.length > 0 && (
            <span className="text-xs text-texto-discreto">{reais(total)} no total</span>
          )}
          {canWrite && acao}
        </div>
      </div>

      {cobrancas.length === 0 ? (
        <div className="p-4">
          <EmptyState titulo="Nenhuma cobrança registrada." compacto>
            Se você cobra para guardar o leite de outros produtores, registre aqui e a receita entra
            no Financeiro.
          </EmptyState>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>De quem</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Valor</TableHead>
              {canWrite && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cobrancas.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{new Date(c.occurred_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="font-medium">
                  {c.owner_name}
                  {c.canceled && (
                    <Badge variant="gray" className="ml-2">
                      Cancelada
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{COBRANCA_LEITE_LABEL[c.type]}</TableCell>
                <TableCell>{c.period_label ?? "-"}</TableCell>
                <TableCell className="tabular-nums">{reais(c.amount)}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    {!c.canceled && (
                      <ConfirmDialog
                        gatilho={
                          <Button variant="ghost" size="sm">
                            Cancelar
                          </Button>
                        }
                        titulo={`Cancelar a cobrança de ${reais(c.amount)}?`}
                        descricao="A receita sai do Financeiro junto, marcada como cancelada. O histórico dos dois lados continua."
                        rotuloConfirmar="Cancelar cobrança"
                        aoConfirmar={() => cancelar(c.id)}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
