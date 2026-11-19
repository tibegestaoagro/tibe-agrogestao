import type { ReactNode } from "react";
import type { AntecipacaoView } from "@/lib/actions/emporio-antecipacao";
import type { AReceberView } from "@/lib/actions/emporio-financeiro";
import type { FiadoClienteView } from "@/lib/actions/emporio-caixa";
import { pode, type PapelContexto } from "@/lib/emporio/papel";
import { chequeIncompleto } from "@/lib/emporio/cheque";
import Link from "next/link";
import { reaisBr } from "@/lib/numero-br";
import { dataBr } from "@/lib/emporio/datas";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { NomeDoCliente, VendaLink } from "./amarras";
import { noRecorte } from "./recorte";
import { BoletosLista } from "./boletos-lista";
import { CartoesAReceber } from "./cartoes-a-receber";
import { ChequeAcoes } from "./cheque-acoes";
import { ReceberFiadoForm } from "./receber-fiado-form";
import type { CaixaDaLoja } from "./caixas-da-loja";
import { CHEQUE_SITUACAO_ROTULO } from "./venda-rotulos";

const DATA_UTC = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

/** As três seções de "A receber": fiado por cliente, cheques em carteira e cartões por data. */
export function FinanceiroReceber({
  dados,
  papel,
  lojas,
  caixas,
  contasDoBanco,
  usuarioId,
  antecipacoes,
  paginacaoAntecipacoes = null,
  ver = null,
  soACompletar = false,
  hoje,
  padraoId = null,
  loja = "",
}: {
  /** A loja do filtro da tela (vazia: todas). */
  loja?: string;
  /** Frente A: o cartão ativo da faixa (`?ver=`), sem o "recebido", que troca a tela por outra lista. */
  ver?: "vencido" | "hoje" | "a_vencer" | null;
  /** `?cheques=a_completar` (o "Ver os cheques" do Hoje): só a seção dos cheques, só os que faltam dados. Vence o `ver`. */
  soACompletar?: boolean;
  /** Hoje em Brasília (AAAA-MM-DD), a régua do recorte. */
  hoje: string;
  /** O cliente padrão, que não vira link. */
  padraoId?: string | null;
  antecipacoes: AntecipacaoView[];
  /** A barra de páginas das antecipações (montada na página server, que conhece a URL). */
  paginacaoAntecipacoes?: ReactNode;
  dados: AReceberView;
  papel: PapelContexto;
  /** As lojas que o recebimento pode escolher (uma só quando a tela está filtrada). */
  lojas: { id: string; name: string }[];
  caixas: CaixaDaLoja[];
  contasDoBanco: { id: string; name: string }[];
  usuarioId: string;
}) {
  // Quem não passa em `vendedor_da_loja` (o Financeiro) recebe só por PIX, na conta.
  const soPix = !pode(papel, "vendedor_da_loja");
  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.name]));
  // O valor do cliente naquele recorte (o aberto dos lançamentos com a data do cartão ativo).
  const doRecorte = (c: FiadoClienteView): number =>
    ver === "vencido" ? c.overdue_amount : ver === "hoje" ? c.due_today_amount : ver === "a_vencer" ? c.upcoming_amount : c.owed;
  // Com recorte, a data da linha é o vencimento mais antigo DENTRO do recorte (lançamento sem data fica com a geral).
  const vencimentoDaLinha = (c: FiadoClienteView): string | null => {
    if (!ver) return c.oldest_due_date;
    const datas = c.entries
      .filter((e) => e.open > 0 && e.due_date !== null && noRecorte(ver, hoje, e.due_date))
      .map((e) => (e.due_date as string).slice(0, 10))
      .sort();
    return datas[0] ?? c.oldest_due_date;
  };
  const fiado = ver ? dados.fiado.filter((c) => doRecorte(c) > 0) : dados.fiado;
  const cheques = soACompletar
    ? dados.checks.filter(chequeIncompleto)
    : ver
      ? dados.checks.filter((c) => c.good_for !== null && noRecorte(ver, hoje, c.good_for))
      : dados.checks;
  // O endereço de volta: o mesmo, sem o filtro dos cheques e com a loja.
  const enderecoDeTudo = loja ? `/emporio/financeiro/receber?loja=${encodeURIComponent(loja)}` : "/emporio/financeiro/receber";
  // Vencido do cartão é a parcela atrasada; Hoje inclui o que já caiu e espera conferência.
  const cartoes = ver
    ? dados.cards.filter((p) =>
        ver === "vencido"
          ? p.status === "atrasada"
          : ver === "hoje"
            ? noRecorte("hoje", hoje, p.effective_on) || p.status === "a_conferir"
            : noRecorte(ver, hoje, p.effective_on),
      )
    : dados.cards;
  const trazAnteriores = ver === "hoje" && cartoes.some((p) => p.status === "a_conferir" && p.effective_on.slice(0, 10) < hoje);
  const totalFiado = fiado.reduce((s, c) => s + Math.round(doRecorte(c) * 100), 0) / 100;
  // Antecipar é de quem gere a loja da parcela ou cuida do dinheiro (o servidor confere de novo).
  const lojasQueAntecipam = [...new Set(dados.cards.map((c) => c.establishment_id))].filter(
    (id) => pode(papel, "dinheiro") || pode(papel, "gestor_da_loja", id),
  );

  return (
    <div className="space-y-8">
      {!soACompletar && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-texto">Fiado por cliente</h2>
          {soPix && (
            <p className="text-sm text-texto-secundario">
              O recebimento aqui é por PIX, na conta da loja. O dinheiro em espécie é recebido no caixa da loja.
            </p>
          )}
          {fiado.length === 0 ? (
            <EmptyState titulo={ver ? "Nenhum fiado neste recorte" : "Ninguém deve nada no momento"}>
              {ver
                ? "Nenhum cliente tem fiado com essa data. Use Ver tudo para voltar."
                : "As vendas no fiado aparecem aqui, por cliente, até serem recebidas."}
            </EmptyState>
          ) : (
            <>
              <p className="text-sm text-texto">
                {ver ? "Total neste recorte" : "Total em aberto"}: <strong>{reaisBr(totalFiado)}</strong> em {fiado.length}{" "}
                {fiado.length === 1 ? "cliente" : "clientes"}.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Deve</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fiado.map((c) => (
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
                      <TableCell>
                        {(() => {
                          const d = vencimentoDaLinha(c);
                          return d ? DATA_UTC.format(new Date(d.length === 10 ? `${d}T00:00:00Z` : d)) : "-";
                        })()}
                      </TableCell>
                      <TableCell>
                        <ReceberFiadoForm
                          contatoId={c.customer_id}
                          contatoNome={c.customer_name}
                          devidoCent={Math.round(c.owed * 100)}
                          lojas={lojas}
                          caixas={soPix ? [] : caixas}
                          usuarioId={usuarioId}
                          soPix={soPix}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Cheques em carteira</h2>
        {soACompletar && (
          <p className="text-sm text-texto-secundario">
            Mostrando só os cheques a completar.{" "}
            <Link href={enderecoDeTudo} className="font-medium text-texto-marca hover:underline">
              Ver tudo o que receber
            </Link>
          </p>
        )}
        {cheques.length === 0 ? (
          <EmptyState
            titulo={soACompletar ? "Nenhum cheque a completar" : ver ? "Nenhum cheque neste recorte" : "Nenhum cheque na carteira"}
          >
            {soACompletar
              ? "Todos os cheques da carteira já têm número, banco e data."
              : ver
                ? "Nenhum cheque tem bom para essa data. Use Ver tudo para voltar."
                : "Os cheques recebidos e ainda não compensados aparecem aqui, por data."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cheque</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Bom para</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cheques.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-texto">
                    nº {c.number ?? "-"}
                    <span className="block text-xs font-normal text-texto-secundario">
                      {c.bank ?? "-"}, {nomeDaLoja.get(c.establishment_id) ?? "Loja"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <NomeDoCliente id={c.customer_id} nome={c.customer_name} padraoId={padraoId} />
                    <span className="block text-xs text-texto-secundario">Em nome de {c.holder_name}</span>
                    <VendaLink id={c.sale_id} numero={c.sale_number} className="block text-xs" />
                  </TableCell>
                  <TableCell>{c.good_for ? dataBr(c.good_for) : "-"}</TableCell>
                  <TableCell>{reaisBr(c.amount)}</TableCell>
                  <TableCell className="space-y-1">
                    <Badge variant={c.status === "depositado" ? "blue" : "amber"}>
                      {CHEQUE_SITUACAO_ROTULO[c.status] ?? c.status}
                    </Badge>
                    {c.incomplete && (
                      <Badge variant="red" className="ml-1">
                        A completar
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ChequeAcoes
                      chequeId={c.id}
                      cheque={c}
                      situacao={c.status}
                      contas={contasDoBanco}
                      podeCompletar={pode(papel, "dinheiro") || pode(papel, "gestor_da_loja", c.establishment_id)}
                      podeDepositar={pode(papel, "chave:depositar_cheque", c.establishment_id) || pode(papel, "dinheiro")}
                      ehAdmin={pode(papel, "gestor_da_loja", c.establishment_id) || pode(papel, "dinheiro")}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {!soACompletar && (
        <>
          <BoletosLista
            iniciais={dados.boletos}
            loja={lojas.length === 1 ? lojas[0].id : ""}
            contas={contasDoBanco}
            ehDinheiro={pode(papel, "dinheiro")}
            lojasDoGestor={lojas.filter((l) => pode(papel, "gestor_da_loja", l.id)).map((l) => l.id)}
            recorte={ver ? { ver, hoje } : null}
            padraoId={padraoId}
          />

          <CartoesAReceber
            cards={cartoes}
            antecipacoes={antecipacoes}
            paginacao={paginacaoAntecipacoes}
            lojasQueAntecipam={lojasQueAntecipam}
            padraoId={padraoId}
            semAtrasadoNoFiltro={ver === "vencido"}
            podeConferir={pode(papel, "dinheiro")}
            loja={loja}
            nota={trazAnteriores ? "Vence hoje mostra também as parcelas de dias anteriores que ainda esperam conferência." : null}
          />
        </>
      )}
    </div>
  );
}
