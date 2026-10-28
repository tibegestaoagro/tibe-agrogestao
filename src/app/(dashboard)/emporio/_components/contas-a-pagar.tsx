"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { reaisBr } from "@/lib/numero-br";
import { CorrigirContaForm } from "./corrigir-conta-form";
import { PagarContasForm, type OrigemDoDinheiro } from "./pagar-contas-form";

export type ContaDaLista = {
  entry_id: string;
  origin: "vendeu_pagou" | "despesa_fixa";
  name: string;
  establishment_name: string | null;
  open_amount: number;
  due_date: string | null;
  can_correct: boolean;
};

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Contas a pagar do Empório, com seleção para pagar várias de uma vez. */
export function ContasAPagar({
  contas,
  origens,
  hoje,
}: {
  contas: ContaDaLista[];
  origens: OrigemDoDinheiro[];
  hoje: string;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  // Conta que saiu da lista (foi paga, depois do refresh) deixa de contar.
  const selecionadas = contas.filter((c) => marcadas.has(c.entry_id));
  const todasMarcadas = contas.length > 0 && selecionadas.length === contas.length;

  function alternar(id: string, marcar: boolean) {
    setMarcadas((a) => {
      const n = new Set(a);
      if (marcar) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={todasMarcadas}
            onChange={(e) => setMarcadas(e.target.checked ? new Set(contas.map((c) => c.entry_id)) : new Set())}
            className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
          />
          Marcar todas
        </label>
        <PagarContasForm
          contas={selecionadas}
          origens={origens}
          hoje={hoje}
          aoPagar={() => setMarcadas(new Set())}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Marcar</span>
            </TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contas.map((c) => {
            const vencida = c.due_date !== null && c.due_date.slice(0, 10) < hoje;
            return (
              <TableRow key={c.entry_id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Marcar ${c.name}`}
                    checked={marcadas.has(c.entry_id)}
                    onChange={(e) => alternar(c.entry_id, e.target.checked)}
                    className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
                  />
                </TableCell>
                <TableCell className="font-medium text-texto">
                  {c.name}
                  <span className="block text-xs font-normal text-texto-secundario">
                    {c.origin === "vendeu_pagou" ? "Vendeu, Pagou" : "Despesa fixa"}
                    {c.establishment_name ? `, ${c.establishment_name}` : ""}
                  </span>
                </TableCell>
                <TableCell>
                  {c.due_date ? dataBr(c.due_date) : "-"}
                  {vencida && (
                    <Badge variant="red" className="ml-2">
                      Vencida
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{reaisBr(c.open_amount)}</TableCell>
                <TableCell>
                  {c.can_correct && <CorrigirContaForm entryId={c.entry_id} nome={c.name} valor={c.open_amount} />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
