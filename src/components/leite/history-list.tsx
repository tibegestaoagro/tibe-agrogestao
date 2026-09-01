"use client";

import { useRouter } from "next/navigation";
import type { LactationEntryType, MilkShift } from "@/generated/prisma/client";
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
import {
  TIPO_LACTACAO_LABEL,
  TIPO_LACTACAO_SINAL,
  TURNO_LABEL,
  litros,
} from "@/components/leite/labels";

/**
 * O histórico de produção e de lactação, com o cancelamento (§37.11).
 *
 * Cancelado FICA na lista, marcado, e não some: é assim que o produtor entende
 * por que o total do mês mudou. Some da lista significaria "o sistema errou".
 *
 * Os dois históricos moram no mesmo componente porque o cancelamento é a mesma
 * ação com URL diferente, e separar duplicaria a mensagem de aviso, que é onde
 * a trava 10 do `check` já pegou repetição divergente antes.
 */

type Producao = {
  id: string;
  liters: number;
  shift: MilkShift;
  recorded_at: string;
  group_id: string | null;
  notes: string | null;
  cancelled: boolean;
};

type Lactacao = {
  id: string;
  type: LactationEntryType;
  quantity: number;
  recorded_at: string;
  group_id: string | null;
  notes: string | null;
  cancelled: boolean;
};

function dataBr(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function HistoryList({
  producoes,
  lactacoes,
  nomeDoLote,
  canWrite,
}: {
  producoes: Producao[];
  lactacoes: Lactacao[];
  nomeDoLote: Record<string, string>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();

  async function cancelar(url: string, oQue: string) {
    const res = await apiPost(url);
    if (res.ok) {
      aviso.sucesso(`${oQue} cancelado. Ele sai das somas e continua no histórico.`);
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-borda bg-superficie">
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Últimos registros de produção
          </h2>
        </div>
        {producoes.length === 0 ? (
          <div className="p-4">
            <EmptyState titulo="Nenhuma produção registrada ainda." compacto>
              Registre a produção do dia para acompanhar o total e a média por vaca.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Litros</TableHead>
                <TableHead>Lote</TableHead>
                {canWrite && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {producoes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{dataBr(p.recorded_at)}</TableCell>
                  <TableCell>
                    {TURNO_LABEL[p.shift]}
                    {p.cancelled && (
                      <Badge variant="gray" className="ml-2">
                        Cancelado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{litros(p.liters)}</TableCell>
                  <TableCell>{p.group_id ? nomeDoLote[p.group_id] ?? "-" : "-"}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      {!p.cancelled && (
                        <ConfirmDialog
                          gatilho={
                            <Button variant="ghost" size="sm">
                              Cancelar
                            </Button>
                          }
                          titulo={`Cancelar o registro de ${litros(p.liters)}?`}
                          descricao="Ele sai das somas e da média por vaca, e continua no histórico marcado como cancelado."
                          rotuloConfirmar="Cancelar registro"
                          aoConfirmar={() =>
                            cancelar(`/api/v1/milk/production/${p.id}/cancel`, "Registro")
                          }
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

      <div className="rounded-lg border border-borda bg-superficie">
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Últimos registros de lactação
          </h2>
        </div>
        {lactacoes.length === 0 ? (
          <div className="p-4">
            <EmptyState titulo="Nenhum registro de lactação ainda." compacto>
              Informe quantas vacas estão em lactação para o TIBÉ calcular a média por vaca.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>O que foi</TableHead>
                <TableHead>Vacas</TableHead>
                {canWrite && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lactacoes.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{dataBr(l.recorded_at)}</TableCell>
                  <TableCell>
                    {TIPO_LACTACAO_LABEL[l.type]}
                    {l.cancelled && (
                      <Badge variant="gray" className="ml-2">
                        Cancelado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {TIPO_LACTACAO_SINAL[l.type]}
                    {l.quantity.toLocaleString("pt-BR")}
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      {!l.cancelled && (
                        <ConfirmDialog
                          gatilho={
                            <Button variant="ghost" size="sm">
                              Cancelar
                            </Button>
                          }
                          titulo="Cancelar este registro de lactação?"
                          descricao="A contagem de vacas é recalculada sem ele, e o registro continua no histórico marcado como cancelado."
                          rotuloConfirmar="Cancelar registro"
                          aoConfirmar={() =>
                            cancelar(`/api/v1/milk/lactation/${l.id}/cancel`, "Registro")
                          }
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
    </div>
  );
}
