"use client";

import { useState } from "react";
import Link from "next/link";
import type { FiadoClienteView } from "@/lib/actions/emporio-caixa";
import { clienteBateComABusca } from "@/lib/emporio/dinheiro-telas";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { NomeDoCliente } from "./amarras";
import { noRecorte, valorDoFiadoNoRecorte } from "./recorte";
import { ReceberFiadoForm } from "./receber-fiado-form";
import type { CaixaDaLoja } from "./caixas-da-loja";

const DATA_UTC = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const DATA_BR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * O fiado por cliente, com busca, das duas portas (a página Fiado e a aba Fiado do A receber).
 * Quem chama decide a permissão de receber e o "só PIX"; a busca filtra enquanto se digita.
 */
export function FiadoPorCliente({
  clientes,
  ver,
  hoje,
  padraoId,
  lojas,
  caixas,
  usuarioId,
  soPix,
  podeReceber,
  podeMudarData,
}: {
  clientes: FiadoClienteView[];
  /** O recorte do cartão do A receber (`?ver=`); a página Fiado não tem. */
  ver: "vencido" | "hoje" | "a_vencer" | null;
  /** Hoje em Brasília (AAAA-MM-DD), a régua do recorte. */
  hoje: string;
  /** O cliente padrão, que não vira link. */
  padraoId: string | null;
  lojas: { id: string; name: string }[];
  caixas: CaixaDaLoja[];
  usuarioId: string;
  /** Quem não passa em `vendedor_da_loja` (o Financeiro) recebe só por PIX, na conta. */
  soPix: boolean;
  podeReceber: boolean;
  podeMudarData: boolean;
}) {
  const [busca, setBusca] = useState("");

  // Com recorte, a data da linha é o vencimento mais antigo DENTRO do recorte (lançamento sem data fica com a geral).
  const vencimentoDaLinha = (c: FiadoClienteView): string | null => {
    if (!ver) return c.oldest_due_date;
    const datas = c.entries
      .filter((e) => e.open > 0 && e.due_date !== null && noRecorte(ver, hoje, e.due_date))
      .map((e) => (e.due_date as string).slice(0, 10))
      .sort();
    return datas[0] ?? c.oldest_due_date;
  };

  const doRecorte = ver ? clientes.filter((c) => valorDoFiadoNoRecorte(c, ver) > 0) : clientes;
  const fiado = doRecorte.filter((c) => clienteBateComABusca(c, busca));
  const total = fiado.reduce((s, c) => s + Math.round(valorDoFiadoNoRecorte(c, ver) * 100), 0) / 100;

  if (doRecorte.length === 0) {
    return (
      <EmptyState titulo={ver ? "Nenhum fiado neste recorte" : "Ninguém deve nada no momento"}>
        {ver
          ? "Nenhum cliente tem fiado com essa data. Use Ver tudo para voltar."
          : "As vendas no fiado aparecem aqui, por cliente, até serem recebidas."}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {soPix && (
        <p className="text-sm text-texto-secundario">
          O recebimento aqui é por PIX, na conta da loja. O dinheiro em espécie é recebido no caixa da loja.
        </p>
      )}
      <div className="max-w-sm space-y-1">
        <Label htmlFor="busca-fiado">Buscar cliente</Label>
        <Input
          id="busca-fiado"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-describedby="busca-fiado-ajuda"
          autoComplete="off"
        />
        <p id="busca-fiado-ajuda" className="text-xs text-texto-secundario">
          Nome, CPF ou telefone
        </p>
      </div>

      {fiado.length === 0 ? (
        <EmptyState compacto titulo="Nenhum cliente com essa busca." />
      ) : (
        <>
          <p className="text-sm text-texto">
            {ver ? "Total neste recorte" : "Total em aberto"}: <strong>{reaisBr(total)}</strong> em {fiado.length}{" "}
            {fiado.length === 1 ? "cliente" : "clientes"}.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Deve</TableHead>
                <TableHead>Venda mais antiga</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Vendas</TableHead>
                {podeReceber && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiado.map((c) => {
                const d = vencimentoDaLinha(c);
                return (
                  <TableRow key={c.customer_id}>
                    <TableCell className="font-medium text-texto">
                      <NomeDoCliente id={c.customer_id} nome={c.customer_name} padraoId={padraoId} />
                      {c.phone && <span className="block text-xs font-normal text-texto-secundario">{c.phone}</span>}
                    </TableCell>
                    <TableCell>
                      {reaisBr(c.owed)}
                      {c.overdue_amount > 0 && (
                        <Badge variant="red" className="ml-2">
                          Vencido {reaisBr(c.overdue_amount)}
                        </Badge>
                      )}
                      {ver === "hoje" && (
                        <Badge variant="amber" className="ml-2">
                          Vence hoje {reaisBr(c.due_today_amount)}
                        </Badge>
                      )}
                      {ver === "a_vencer" && (
                        <Badge variant="blue" className="ml-2">
                          A vencer {reaisBr(c.upcoming_amount)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{c.oldest_sale_at ? DATA_BR.format(new Date(c.oldest_sale_at)) : "-"}</TableCell>
                    <TableCell>{d ? DATA_UTC.format(new Date(d.length === 10 ? `${d}T00:00:00Z` : d)) : "-"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-wrap gap-x-3">
                        {c.entries.map((e) =>
                          e.sale_id ? (
                            <Link
                              key={e.entry_id}
                              href={`/emporio/vendas/${e.sale_id}`}
                              className="font-medium text-texto-marca hover:underline"
                            >
                              {reaisBr(e.open)}
                            </Link>
                          ) : (
                            <span key={e.entry_id}>{reaisBr(e.open)}</span>
                          ),
                        )}
                      </div>
                    </TableCell>
                    {podeReceber && (
                      <TableCell>
                        <ReceberFiadoForm
                          contatoId={c.customer_id}
                          contatoNome={c.customer_name}
                          devidoCent={Math.round(c.owed * 100)}
                          lojas={lojas}
                          caixas={soPix ? [] : caixas}
                          usuarioId={usuarioId}
                          soPix={soPix}
                          podeMudarData={podeMudarData}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
