"use client";

import { useRouter } from "next/navigation";
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
import SiteForm from "@/components/confinamento/site-form";
import { TIPO_SITE_LABEL } from "@/components/confinamento/labels";

type Site = {
  id: string;
  name: string;
  type: "proprio" | "boitel";
  property_id: string | null;
  counterparty_name: string | null;
  city: string | null;
  capacity: number | null;
};
type Property = { id: string; name: string };

export default function SiteList({
  sites,
  properties,
  lotesAtivosPorSite,
  canWrite,
}: {
  sites: Site[];
  properties: Property[];
  lotesAtivosPorSite: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const nomeFazenda = new Map(properties.map((p) => [p.id, p.name]));

  async function archive(id: string) {
    const res = await apiPost(`/api/v1/confinement/sites/${id}/archive`);
    if (res.ok) {
      aviso.sucesso("Confinamento arquivado.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <div className="flex items-center justify-between border-b border-borda px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
          Confinamentos cadastrados
        </h2>
        {canWrite && <SiteForm properties={properties} />}
      </div>

      {sites.length === 0 ? (
        <div className="p-4">
          <EmptyState titulo="Nenhum confinamento cadastrado ainda.">
            Cadastre um local próprio ou um Boitel para começar a registrar entradas.
          </EmptyState>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Capacidade</TableHead>
              <TableHead>Lotes ativos</TableHead>
              {canWrite && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge variant={s.type === "boitel" ? "blue" : "green"}>
                    {TIPO_SITE_LABEL[s.type] ?? s.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  {s.type === "proprio"
                    ? nomeFazenda.get(s.property_id ?? "") ?? "fazenda removida"
                    : s.counterparty_name ?? "não informado"}
                </TableCell>
                <TableCell>{s.city ?? "-"}</TableCell>
                <TableCell className="tabular-nums">
                  {s.capacity != null ? s.capacity.toLocaleString("pt-BR") : "sem limite informado"}
                </TableCell>
                <TableCell className="tabular-nums">{lotesAtivosPorSite[s.id] ?? 0}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <ConfirmDialog
                      gatilho={
                        <Button variant="ghost" size="sm">
                          Arquivar
                        </Button>
                      }
                      titulo={`Arquivar o confinamento ${s.name}?`}
                      descricao="Ele sai da lista de destinos para novas entradas. Os lotes que já estão lá continuam normalmente."
                      rotuloConfirmar="Arquivar confinamento"
                      aoConfirmar={() => archive(s.id)}
                    />
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
