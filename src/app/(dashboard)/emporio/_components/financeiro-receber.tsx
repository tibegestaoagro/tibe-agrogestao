import type { ReactNode } from "react";
import type { AntecipacaoView } from "@/lib/actions/emporio-antecipacao";
import type { AReceberView } from "@/lib/actions/emporio-financeiro";
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
import { noRecorte, valorDoFiadoNoRecorte } from "./recorte";
import { BoletosLista } from "./boletos-lista";
import { CartoesAReceber } from "./cartoes-a-receber";
import { ChequeAcoes } from "./cheque-acoes";
import { FiadoPorCliente } from "./fiado-por-cliente";
import type { CaixaDaLoja } from "./caixas-da-loja";
import { CHEQUE_SITUACAO_ROTULO } from "./venda-rotulos";

type VerRecorte = "vencido" | "hoje" | "a_vencer" | null;
/** As abas do A receber que esta tela lista (a dos Vencidos é a Cobrança, feita por outro componente). */
export type AbaDaLista = "fiado" | "cheques" | "boletos" | "cartoes";

/**
 * O que cada aba lista naquele recorte. A página soma isto para o título da aba e a tela mostra
 * a mesma lista: os dois saem daqui, para o total sempre bater com as linhas.
 */
export function recortarReceber(dados: AReceberView, ver: VerRecorte, hoje: string, soACompletar: boolean) {
  const fiado = ver ? dados.fiado.filter((c) => valorDoFiadoNoRecorte(c, ver) > 0) : dados.fiado;
  const cheques = soACompletar
    ? dados.checks.filter(chequeIncompleto)
    : ver
      ? dados.checks.filter((c) => c.good_for !== null && noRecorte(ver, hoje, c.good_for))
      : dados.checks;
  const boletos = ver ? dados.boletos.filter((b) => noRecorte(ver, hoje, b.due_on)) : dados.boletos;
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
  return { fiado, cheques, boletos, cartoes };
}

/** As quatro listas do "A receber", uma por aba: fiado por cliente, cheques em carteira, boletos e cartões por data. */
export function FinanceiroReceber({
  aba,
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
  /** A aba aberta: só a lista dela é montada. */
  aba: AbaDaLista;
  /** A loja do filtro da tela (vazia: todas). */
  loja?: string;
  /** Frente A: o cartão ativo da faixa (`?ver=`), sem o "recebido", que troca a tela por outra lista. */
  ver?: VerRecorte;
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
  const { fiado, cheques, cartoes } = recortarReceber(dados, ver, hoje, soACompletar);
  // O endereço de volta: a mesma aba Cheques, sem o filtro dos cheques e com a loja.
  const enderecoDeTudo = loja
    ? `/emporio/financeiro/receber?aba=cheques&loja=${encodeURIComponent(loja)}`
    : "/emporio/financeiro/receber?aba=cheques";
  const trazAnteriores = ver === "hoje" && cartoes.some((p) => p.status === "a_conferir" && p.effective_on.slice(0, 10) < hoje);
  // Antecipar é de quem gere a loja da parcela ou cuida do dinheiro (o servidor confere de novo).
  const lojasQueAntecipam = [...new Set(dados.cards.map((c) => c.establishment_id))].filter(
    (id) => pode(papel, "dinheiro") || pode(papel, "gestor_da_loja", id),
  );

  return (
    <div className="space-y-8">
      {aba === "fiado" && (
        <FiadoPorCliente
          clientes={fiado}
          ver={ver}
          hoje={hoje}
          padraoId={padraoId}
          lojas={lojas}
          caixas={caixas}
          usuarioId={usuarioId}
          soPix={soPix}
          podeReceber
          podeMudarData={pode(papel, "dinheiro")}
        />
      )}

      {aba === "cheques" && (
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
                      podeMudarData={pode(papel, "dinheiro")}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      )}

      {aba === "boletos" && (
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
        </>
      )}

      {aba === "cartoes" && (
        <>
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
