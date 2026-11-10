import type { ExtratoView, PosicaoView } from "@/lib/actions/emporio-financeiro";
import { reaisBr } from "@/lib/numero-br";
import { dataBr } from "@/lib/emporio/datas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import { CarimboBotao } from "./carimbo-botao";

/** O instante do carimbo como "dd/mm" no dia de Brasília (o ISO vem em UTC). */
function diaMesEmBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(
    new Date(iso),
  );
}

const ROTULO_DO_LUGAR = { gaveta: "Gaveta", gerencia: "Com a gerência", conta: "Conta" } as const;

/** Escolher o período do extrato: um formulário de GET, que a página server relê. */
export function ExtratoPeriodo({
  loja,
  lugar,
  de,
  ate,
  mostrarFiltroCarimbo = false,
  soSemCarimbo = false,
}: {
  loja: string;
  lugar: string;
  de: string;
  ate: string;
  mostrarFiltroCarimbo?: boolean;
  soSemCarimbo?: boolean;
}) {
  return (
    <form method="get" className="grid gap-3 sm:max-w-xl sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {loja && <input type="hidden" name="loja" value={loja} />}
      <input type="hidden" name="lugar" value={lugar} />
      <label className="space-y-1 text-sm font-medium text-texto">
        De
        <Input type="date" name="de" defaultValue={de} required />
      </label>
      <label className="space-y-1 text-sm font-medium text-texto">
        Até
        <Input type="date" name="ate" defaultValue={ate} required />
      </label>
      <Button type="submit" variant="outline">
        Ver extrato
      </Button>
      {mostrarFiltroCarimbo && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-texto sm:col-span-3 sm:min-h-0">
          <input type="checkbox" name="carimbo" value="sem" defaultChecked={soSemCarimbo} className="size-4" />
          Só sem carimbo
        </label>
      )}
    </form>
  );
}

/** A tabela das posições de caixa; cada lugar (gaveta, gerência e conta) leva ao seu extrato. */
export function PosicoesTabela({
  posicoes,
  total,
  lugarAtual,
  enderecoDoExtrato,
}: {
  posicoes: PosicaoView[];
  total: number;
  lugarAtual: string;
  enderecoDoExtrato: (kind: PosicaoView["kind"], id: string) => string;
}) {
  if (posicoes.length === 0) {
    return <EmptyState titulo="Nenhum lugar com dinheiro ainda">Gavetas, gerências e contas bancárias aparecem aqui.</EmptyState>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lugar</TableHead>
          <TableHead>Saldo</TableHead>
          <TableHead>Extrato</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posicoes.map((p) => {
          const aberto = lugarAtual === `${p.kind}:${p.id}`;
          return (
            <TableRow key={`${p.kind}-${p.id}`}>
              <TableCell className="font-medium text-texto">
                {p.name}
                <span className="block text-xs font-normal text-texto-secundario">{ROTULO_DO_LUGAR[p.kind]}</span>
              </TableCell>
              <TableCell>{reaisBr(p.balance)}</TableCell>
              <TableCell>
                <Button asChild variant={aberto ? "default" : "outline"} size="sm">
                  <a href={enderecoDoExtrato(p.kind, p.id)}>{aberto ? "Aberto abaixo" : "Ver extrato"}</a>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow>
          <TableCell className="font-semibold text-texto">Total</TableCell>
          <TableCell className="font-semibold text-texto">{reaisBr(total)}</TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** O extrato de um lugar: movimentos (e, na conta, parcelas de cartão) como linhas iguais, com saldo de abertura e de fechamento. */
export function ExtratoDoLugar({
  extrato,
  hoje,
  podeCarimbar = false,
}: {
  extrato: ExtratoView;
  hoje: string;
  podeCarimbar?: boolean;
}) {
  const ehConta = extrato.place.kind === "conta";
  const comCarimbo = ehConta && podeCarimbar;
  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-secundario">
        {ROTULO_DO_LUGAR[extrato.place.kind]}: <strong className="text-texto">{extrato.place.name}</strong>
        {extrato.account?.bank && <> (banco {extrato.account.bank})</>}
      </p>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p className="text-texto-secundario">
          Saldo de abertura: <strong className="text-texto">{reaisBr(extrato.opening_balance)}</strong>
        </p>
        <p className="text-texto-secundario">
          Saldo de fechamento: <strong className="text-texto">{reaisBr(extrato.closing_balance)}</strong>
        </p>
      </div>
      {ehConta && (
        <p className="text-sm text-texto-secundario">
          Sem carimbo no período:{" "}
          <strong className="text-texto">
            {reaisBr(extrato.unreconciled_total)} em {extrato.unreconciled_count}{" "}
            {extrato.unreconciled_count === 1 ? "linha" : "linhas"}
          </strong>
        </p>
      )}
      {extrato.lines.length === 0 ? (
        <EmptyState titulo="Nada neste período">Sem movimentos nem parcelas de cartão entre as datas escolhidas.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>O quê</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Valor</TableHead>
              {comCarimbo && <TableHead>Carimbo</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {extrato.lines.map((l) => {
              const entrada = l.direction === "entrada";
              return (
                <TableRow key={`${l.kind}-${l.id}`}>
                  <TableCell>{dataBr(l.occurred_on)}</TableCell>
                  <TableCell className="text-sm">
                    {l.description}
                    {l.kind === "cartao" && l.occurred_on > hoje && (
                      <Badge variant="gray" className="ml-2">
                        A cair
                      </Badge>
                    )}
                    {(l.customer_name || l.sale_number) && (
                      <div className="text-xs text-texto-secundario">
                        {[l.customer_name, l.sale_number ? `venda nº ${String(l.sale_number).padStart(6, "0")}` : null]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{l.establishment_name ?? "-"}</TableCell>
                  <TableCell className={entrada ? "text-sucesso-tinta" : "text-perigo-tinta"}>
                    {entrada ? "+" : "-"} {reaisBr(l.amount)}
                  </TableCell>
                  {comCarimbo && (
                    <TableCell>
                      <CarimboBotao
                        kind={l.kind}
                        id={l.id}
                        carimbadoEm={l.reconciled_at ? diaMesEmBrasilia(l.reconciled_at) : null}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
