import type { ExtratoView, PosicaoView } from "@/lib/actions/emporio-financeiro";
import { reaisBr } from "@/lib/numero-br";
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

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Escolher o período do extrato: um formulário de GET, que a página server relê. */
export function ExtratoPeriodo({
  loja,
  conta,
  de,
  ate,
}: {
  loja: string;
  conta: string;
  de: string;
  ate: string;
}) {
  return (
    <form method="get" className="grid gap-3 sm:max-w-xl sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {loja && <input type="hidden" name="loja" value={loja} />}
      <input type="hidden" name="conta" value={conta} />
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
    </form>
  );
}

/** A tabela das posições de caixa; cada conta bancária leva ao seu extrato. */
export function PosicoesTabela({
  posicoes,
  total,
  contaAtual,
  enderecoDoExtrato,
}: {
  posicoes: PosicaoView[];
  total: number;
  contaAtual: string;
  enderecoDoExtrato: (contaId: string) => string;
}) {
  if (posicoes.length === 0) {
    return <EmptyState titulo="Nenhum lugar com dinheiro ainda">Gavetas, gerências e contas bancárias aparecem aqui.</EmptyState>;
  }
  const ROTULO = { gaveta: "Gaveta", gerencia: "Com a gerência", conta: "Conta" } as const;
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
        {posicoes.map((p) => (
          <TableRow key={`${p.kind}-${p.id}`}>
            <TableCell className="font-medium text-texto">
              {p.name}
              <span className="block text-xs font-normal text-texto-secundario">{ROTULO[p.kind]}</span>
            </TableCell>
            <TableCell>{reaisBr(p.balance)}</TableCell>
            <TableCell>
              {p.kind === "conta" ? (
                <Button asChild variant={contaAtual === p.id ? "default" : "outline"} size="sm">
                  <a href={enderecoDoExtrato(p.id)}>{contaAtual === p.id ? "Aberto abaixo" : "Ver extrato"}</a>
                </Button>
              ) : (
                <span className="text-sm text-texto-secundario">-</span>
              )}
            </TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-semibold text-texto">Total</TableCell>
          <TableCell className="font-semibold text-texto">{reaisBr(total)}</TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** O extrato de uma conta: movimentos e parcelas de cartão como linhas iguais, com saldo de abertura e de fechamento. */
export function ExtratoDaConta({ extrato, hoje }: { extrato: ExtratoView; hoje: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p className="text-texto-secundario">
          Saldo de abertura: <strong className="text-texto">{reaisBr(extrato.opening_balance)}</strong>
        </p>
        <p className="text-texto-secundario">
          Saldo de fechamento: <strong className="text-texto">{reaisBr(extrato.closing_balance)}</strong>
        </p>
      </div>
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
                  </TableCell>
                  <TableCell>{l.establishment_name ?? "-"}</TableCell>
                  <TableCell className={entrada ? "text-sucesso-tinta" : "text-perigo-tinta"}>
                    {entrada ? "+" : "-"} {reaisBr(l.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
