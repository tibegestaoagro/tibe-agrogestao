"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost, apiPatch } from "@/lib/client-api";

/**
 * Lotes leiteiros (§6): cadastro, listagem e arquivamento.
 *
 * "Nesta primeira versão, o lote servirá apenas como uma forma simples de
 * organização", e a tela reflete isso: não há cabeça, categoria nem saldo.
 * Fica no fim da página pelo mesmo motivo, discreto: é cadastro, não o assunto.
 *
 * Desarquiva além de arquivar, diferente do confinamento: "recém-paridas" volta
 * a existir todo ano, e cadastrar de novo perderia o histórico que aponta para
 * o lote antigo.
 */

type Group = {
  id: string;
  name: string;
  property_id: string;
  notes: string | null;
  archived: boolean;
};
type Property = { id: string; name: string };

const ORDEM = ["property_id", "name", "notes"] as const;
type Campo = (typeof ORDEM)[number];

export default function GroupList({
  groups,
  properties,
  canWrite,
  defaultPropertyId,
}: {
  groups: Group[];
  properties: Property[];
  canWrite: boolean;
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "lote");

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const nomeFazenda = new Map(properties.map((p) => [p.id, p.name]));

  function limpar() {
    setPropertyId(defaultPropertyId ?? "");
    setName("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!name.trim()) novos.name = "Informe o nome do lote.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/groups", {
      property_id: propertyId,
      name: name.trim(),
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    limpar();
    router.refresh();
  }

  async function alternarArquivo(grupo: Group) {
    const res = await apiPatch(`/api/v1/milk/groups/${grupo.id}/archive`, {
      archived: !grupo.archived,
    });
    if (res.ok) {
      aviso.sucesso(grupo.archived ? "Lote reativado." : "Lote arquivado.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
          Lotes leiteiros
        </h2>
        {canWrite && properties.length > 0 && (
          <FormSheet
            trigger={
              <Button variant="outline" size="sm">
                Novo lote
              </Button>
            }
            title="Cadastrar lote leiteiro"
            description="Uma forma de organizar as vacas na tela. Não muda o rebanho nem conta cabeça."
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) limpar();
            }}
            onSubmit={submit}
            submitLabel="Cadastrar lote"
            submitPendingLabel="Cadastrando..."
            pending={loading}
            error={err.global}
            focarCampoId={err.focarCampoId}
            tentativa={err.tentativa}
          >
            <Field label="Fazenda" required id="lote-property_id" error={err.erros.property_id}>
              {({ id, ...aria }) => (
                <Select
                  value={propertyId}
                  onValueChange={(v) => {
                    setPropertyId(v);
                    err.limparCampo("property_id");
                  }}
                >
                  <SelectTrigger id={id} {...aria}>
                    <SelectValue placeholder="Escolha a fazenda" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              label="Nome"
              required
              id="lote-name"
              error={err.erros.name}
              hint="Exemplo: Recém-paridas, Vacas de maior produção."
            >
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  {...aria}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    err.limparCampo("name");
                  }}
                />
              )}
            </Field>

            <Field label="Observação" id="lote-notes" error={err.erros.notes} hint="Opcional.">
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  {...aria}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    err.limparCampo("notes");
                  }}
                />
              )}
            </Field>
          </FormSheet>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="p-4">
          <EmptyState titulo="Nenhum lote leiteiro cadastrado." compacto>
            O lote é opcional: serve para separar as vacas de maior produção das recém-paridas
            no histórico.
          </EmptyState>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Fazenda</TableHead>
              <TableHead>Observação</TableHead>
              {canWrite && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">
                  {g.name}
                  {g.archived && (
                    <Badge variant="gray" className="ml-2">
                      Arquivado
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{nomeFazenda.get(g.property_id) ?? "fazenda removida"}</TableCell>
                <TableCell>{g.notes ?? "-"}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => alternarArquivo(g)}>
                      {g.archived ? "Reativar" : "Arquivar"}
                    </Button>
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
