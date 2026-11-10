import Link from "next/link";
import type { AntecipacaoView } from "@/lib/actions/emporio-antecipacao";
import type { AReceberView } from "@/lib/actions/emporio-financeiro";
import { pode, type PapelContexto } from "@/lib/emporio/papel";
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
}: {
  antecipacoes: AntecipacaoView[];
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
  const totalFiado = dados.fiado.reduce((s, c) => s + Math.round(c.owed * 100), 0) / 100;
  // Antecipar é de quem gere a loja da parcela ou cuida do dinheiro (o servidor confere de novo).
  const lojasQueAntecipam = [...new Set(dados.cards.map((c) => c.establishment_id))].filter(
    (id) => pode(papel, "dinheiro") || pode(papel, "gestor_da_loja", id),
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Fiado por cliente</h2>
        {soPix && (
          <p className="text-sm text-texto-secundario">
            O recebimento aqui é por PIX, na conta da loja. O dinheiro em espécie é recebido no caixa da loja.
          </p>
        )}
        {dados.fiado.length === 0 ? (
          <EmptyState titulo="Ninguém deve nada no momento">
            As vendas no fiado aparecem aqui, por cliente, até serem recebidas.
          </EmptyState>
        ) : (
          <>
            <p className="text-sm text-texto">
              Total em aberto: <strong>{reaisBr(totalFiado)}</strong> em {dados.fiado.length}{" "}
              {dados.fiado.length === 1 ? "cliente" : "clientes"}.
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
                {dados.fiado.map((c) => (
                  <TableRow key={c.customer_id}>
                    <TableCell className="font-medium text-texto">
                      {c.customer_name}
                      {c.phone && <span className="block text-xs font-normal text-texto-secundario">{c.phone}</span>}
                    </TableCell>
                    <TableCell>
                      {reaisBr(c.owed)}
                      {c.overdue_amount > 0 && (
                        <Badge variant="red" className="ml-2">
                          Vencido {reaisBr(c.overdue_amount)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{c.oldest_due_date ? DATA_UTC.format(new Date(c.oldest_due_date)) : "-"}</TableCell>
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-texto">Cheques em carteira</h2>
        {dados.checks.length === 0 ? (
          <EmptyState titulo="Nenhum cheque na carteira">
            Os cheques recebidos e ainda não compensados aparecem aqui, por data.
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
              {dados.checks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-texto">
                    nº {c.number}
                    <span className="block text-xs font-normal text-texto-secundario">
                      {c.bank}, {nomeDaLoja.get(c.establishment_id) ?? "Loja"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.customer_name}
                    <span className="block text-xs text-texto-secundario">Em nome de {c.holder_name}</span>
                    <Link href={`/emporio/vendas/${c.sale_id}`} className="block text-xs font-medium text-texto-marca hover:underline">
                      Ver a venda
                    </Link>
                  </TableCell>
                  <TableCell>{dataBr(c.good_for)}</TableCell>
                  <TableCell>{reaisBr(c.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "depositado" ? "blue" : "amber"}>
                      {CHEQUE_SITUACAO_ROTULO[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ChequeAcoes
                      chequeId={c.id}
                      numero={c.number}
                      situacao={c.status}
                      contas={contasDoBanco}
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

      <BoletosLista
        iniciais={dados.boletos}
        loja={lojas.length === 1 ? lojas[0].id : ""}
        contas={contasDoBanco}
        ehDinheiro={pode(papel, "dinheiro")}
        lojasDoGestor={lojas.filter((l) => pode(papel, "gestor_da_loja", l.id)).map((l) => l.id)}
      />

      <CartoesAReceber cards={dados.cards} antecipacoes={antecipacoes} lojasQueAntecipam={lojasQueAntecipam} />
    </div>
  );
}
