"use client";

import { useRouter } from "next/navigation";
import type { MilkDestination, MilkMovementType, MilkSiteType } from "@/generated/prisma/client";
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
import { apiPost, apiPatch } from "@/lib/client-api";
import { litros } from "@/components/leite/labels";
import {
  DESTINO_LABEL,
  MOVIMENTO_LEITE_LABEL,
  TIPO_LOCAL_LABEL,
} from "@/components/leite/storage-labels";

/**
 * Onde o leite está e de quem é (§18, §20 e §34).
 *
 * A tabela por local mostra CADA DONO numa linha e o físico do local no
 * rodapé, que é o §20 na íntegra. Somar tudo num número só esconderia
 * exatamente o que o §18 manda separar.
 */

type Site = {
  id: string;
  name: string;
  type: MilkSiteType;
  counterparty_name: string | null;
  capacity: number | null;
  liters: number;
  acima_da_capacidade: boolean;
  archived: boolean;
};

type Posicao = { site_id: string; owner_id: string | null; owner_name: string; liters: number };

type Movimento = {
  id: string;
  movement_type: MilkMovementType;
  liters: number;
  occurred_at: string;
  from_site_name: string | null;
  to_site_name: string | null;
  owner_name: string | null;
  destination: MilkDestination | null;
  canceled: boolean;
};

function dataBr(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function StoragePanel({
  sites,
  posicoes,
  movimentos,
  canWrite,
  acoes,
}: {
  sites: Site[];
  posicoes: Posicao[];
  movimentos: Movimento[];
  canWrite: boolean;
  /** Os painéis de escrita, montados pela página (que tem os dados). */
  acoes?: React.ReactNode;
}) {
  const router = useRouter();
  const aviso = useAviso();

  async function alternarArquivo(site: Site) {
    const res = await apiPatch(`/api/v1/milk/sites/${site.id}/archive`, {
      archived: !site.archived,
    });
    if (res.ok) {
      aviso.sucesso(site.archived ? "Local reativado." : "Local arquivado.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  async function cancelarMovimento(id: string) {
    const res = await apiPost(`/api/v1/milk/storage/${id}/cancel`);
    if (res.ok) {
      aviso.sucesso("Movimentação cancelada. Ela sai dos saldos e continua no histórico.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  const porLocal = new Map<string, Posicao[]>();
  for (const p of posicoes) {
    porLocal.set(p.site_id, [...(porLocal.get(p.site_id) ?? []), p]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-borda bg-superficie">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Onde o leite está
          </h2>
          {canWrite && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>

        {sites.length === 0 ? (
          <div className="p-4">
            <EmptyState titulo="Nenhum tanque ou ponto de coleta cadastrado.">
              Cadastre o tanque da fazenda para começar a acompanhar quanto leite está guardado, de
              quem ele é, e quanto já saiu.
            </EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-borda">
            {sites.map((site) => {
              const donos = porLocal.get(site.id) ?? [];
              return (
                <div key={site.id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-texto">{site.name}</span>
                      <Badge variant={site.type === "terceiro" ? "blue" : "green"}>
                        {TIPO_LOCAL_LABEL[site.type]}
                      </Badge>
                      {site.archived && <Badge variant="gray">Arquivado</Badge>}
                      {site.counterparty_name && (
                        <span className="text-xs text-texto-discreto">
                          de {site.counterparty_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-texto">
                        {litros(site.liters)}
                        {site.capacity != null && (
                          <span className="ml-1 text-xs font-normal text-texto-discreto">
                            de {litros(site.capacity)}
                          </span>
                        )}
                      </span>
                      {canWrite && (
                        <Button variant="ghost" size="sm" onClick={() => alternarArquivo(site)}>
                          {site.archived ? "Reativar" : "Arquivar"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {site.acima_da_capacidade && (
                    <p className="mt-2 rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
                      O volume passou da capacidade informada. É só um aviso: o TIBÉ não recusa
                      leite por causa dela.
                    </p>
                  )}

                  {donos.length === 0 ? (
                    <p className="mt-2 text-sm text-texto-secundario">Sem leite aqui agora.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {donos.map((d) => (
                        <li
                          key={d.owner_id ?? "proprio"}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-texto-secundario">{d.owner_name}</span>
                          <span className="tabular-nums text-texto">{litros(d.liters)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-borda bg-superficie">
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
            Movimentações do leite
          </h2>
        </div>
        {movimentos.length === 0 ? (
          <div className="p-4">
            <EmptyState titulo="Nenhuma movimentação ainda." compacto>
              Guardar no tanque, levar ao ponto de coleta, receber de terceiro e retirar aparecem
              aqui.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>O que foi</TableHead>
                <TableHead>Litros</TableHead>
                <TableHead>De onde</TableHead>
                <TableHead>Para onde</TableHead>
                <TableHead>Dono</TableHead>
                {canWrite && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{dataBr(m.occurred_at)}</TableCell>
                  <TableCell>
                    {MOVIMENTO_LEITE_LABEL[m.movement_type]}
                    {m.canceled && (
                      <Badge variant="gray" className="ml-2">
                        Cancelado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{litros(m.liters)}</TableCell>
                  <TableCell>{m.from_site_name ?? "-"}</TableCell>
                  <TableCell>
                    {m.to_site_name ?? (m.destination ? DESTINO_LABEL[m.destination] : "-")}
                  </TableCell>
                  <TableCell>{m.owner_name ?? "Próprio"}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      {!m.canceled && (
                        <ConfirmDialog
                          gatilho={
                            <Button variant="ghost" size="sm">
                              Cancelar
                            </Button>
                          }
                          titulo={`Cancelar a movimentação de ${litros(m.liters)}?`}
                          descricao="Ela sai dos saldos e continua no histórico, marcada como cancelada."
                          rotuloConfirmar="Cancelar movimentação"
                          aoConfirmar={() => cancelarMovimento(m.id)}
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
