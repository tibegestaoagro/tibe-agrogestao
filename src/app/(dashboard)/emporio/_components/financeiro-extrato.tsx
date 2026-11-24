import type { ExtratoView, PosicaoView } from "@/lib/actions/emporio-financeiro";
import { reaisBr } from "@/lib/numero-br";
import { dataBr } from "@/lib/emporio/datas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import { AjudaDaTela } from "./ajuda-da-tela";
import { CarimboBotao } from "./carimbo-botao";
import { CorrigirDataBotao } from "./corrigir-data-botao";
import { NomeDoCliente, VendaLink } from "./amarras";
import { PeriodoFiltro, enderecoComPeriodo } from "./periodo-filtro";

/** O instante do carimbo como "dd/mm" no dia de Brasília (o ISO vem em UTC). */
function diaMesEmBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(
    new Date(iso),
  );
}

const ROTULO_DO_LUGAR = { gaveta: "Gaveta", gerencia: "Com a gerência", conta: "Conta" } as const;

/** Escolher o período do extrato (`PeriodoFiltro`, na URL) e, na conta, o filtro "só a conferir". */
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
  const caminho = "/emporio/financeiro/caixa";
  const base = { loja, lugar, carimbo: soSemCarimbo ? "sem" : undefined };
  return (
    <div className="space-y-3">
      <PeriodoFiltro caminho={caminho} de={de} ate={ate} extras={base} />
      {mostrarFiltroCarimbo && (
        <Button asChild variant={soSemCarimbo ? "default" : "outline"} size="sm">
          <a
            href={enderecoComPeriodo(caminho, { ...base, carimbo: soSemCarimbo ? undefined : "sem" }, de, ate)}
            aria-current={soSemCarimbo ? "true" : undefined}
          >
            Só a conferir
          </a>
        </Button>
      )}
    </div>
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
  padraoId = null,
}: {
  extrato: ExtratoView;
  hoje: string;
  podeCarimbar?: boolean;
  /** O cliente padrão, que não vira link. */
  padraoId?: string | null;
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
          A conferir no período:{" "}
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
              {comCarimbo && (
                <TableHead>
                  <span className="inline-flex items-center gap-2">
                    Conferência
                    <AjudaDaTela manual="/manual/emporio/financeiro-das-lojas#conferir-com-o-banco" rotulo="Sobre a conferência com o banco">
                      Compare cada linha com o extrato do banco e clique em Conferir com o banco. O que não bate é PIX que não caiu ou valor lançado com erro.
                    </AjudaDaTela>
                  </span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {extrato.lines.map((l) => {
              const entrada = l.direction === "entrada";
              return (
                <TableRow key={`${l.kind}-${l.id}`}>
                  <TableCell>{dataBr(l.occurred_on)}</TableCell>
                  <TableCell className={l.origin === "ajuste_cartao" ? "pl-6 text-sm text-texto-secundario" : "text-sm"}>
                    {l.description}
                    {l.kind === "cartao" && l.occurred_on > hoje && (
                      <Badge variant="gray" className="ml-2">
                        A cair
                      </Badge>
                    )}
                    {(l.customer_name || l.sale_number) && (
                      <div className="text-xs text-texto-secundario">
                        {l.customer_name && <NomeDoCliente id={l.customer_id} nome={l.customer_name} padraoId={padraoId} />}
                        {l.customer_name && l.sale_number ? ", " : ""}
                        {l.sale_number ? <VendaLink id={l.sale_id} numero={l.sale_number} minusculo /> : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{l.establishment_name ?? "-"}</TableCell>
                  <TableCell className={entrada ? "text-sucesso-tinta" : "text-perigo-tinta"}>
                    {entrada ? "+" : "-"} {reaisBr(l.amount)}
                    {l.kind === "cartao" && l.confirmed_net != null && (
                      <span className="block text-xs font-normal text-texto-secundario">
                        conferido {reaisBr(l.confirmed_net)}
                      </span>
                    )}
                  </TableCell>
                  {comCarimbo && (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <CarimboBotao
                          kind={l.kind}
                          id={l.id}
                          carimbadoEm={l.reconciled_at ? diaMesEmBrasilia(l.reconciled_at) : null}
                        />
                        {l.kind === "movimento" && l.origin === "venda" && !l.reconciled_at && (
                          <CorrigirDataBotao id={l.id} diaAtual={l.occurred_on} />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {ehConta && extrato.scheduled.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-texto">Agendados</h3>
          <p className="text-sm text-texto-secundario">
            Baixas com data depois de hoje. Ficam fora do saldo e entram sozinhas quando o dia chega.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>O quê</TableHead>
                <TableHead>Valor</TableHead>
                {comCarimbo && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {extrato.scheduled.map((l) => {
                const entrada = l.direction === "entrada";
                return (
                  <TableRow key={`agendado-${l.id}`}>
                    <TableCell>{dataBr(l.occurred_on)}</TableCell>
                    <TableCell className="text-sm">
                      {l.description}
                      {l.establishment_name && (
                        <span className="block text-xs text-texto-secundario">{l.establishment_name}</span>
                      )}
                    </TableCell>
                    <TableCell className={entrada ? "text-sucesso-tinta" : "text-perigo-tinta"}>
                      {entrada ? "+" : "-"} {reaisBr(l.amount)}
                    </TableCell>
                    {comCarimbo && (
                      <TableCell>
                        {l.kind === "movimento" && l.origin === "venda" && !l.reconciled_at && (
                          <CorrigirDataBotao id={l.id} diaAtual={l.occurred_on} />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
