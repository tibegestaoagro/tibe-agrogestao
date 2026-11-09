import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lerVendaAction } from "@/lib/actions/emporio-vendas";
import { buscarClientesAction } from "@/lib/actions/emporio-clientes";
import { viewsDosCaixas } from "@/lib/actions/emporio-caixa";
import { paraCaixasDaLoja } from "../../_components/caixas-da-loja";
import { formatarNumero } from "@/lib/emporio/numeracao";
import { ROTULO_DA_ORIGEM } from "@/lib/emporio/frete";
import { linhaDoEndereco } from "@/lib/emporio/pedido-para-entrega";
import { reaisBr } from "@/lib/numero-br";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { CancelarVendaForm } from "../../_components/cancelar-venda-form";
import { MudarPedidoParaEntregaForm } from "../../_components/mudar-pedido-para-entrega-form";
import { DevolverForm } from "../../_components/devolver-form";
import { TrocarForm } from "../../_components/trocar-form";
import { carregarCatalogoDeVenda } from "../../_components/catalogo-venda";
import { MOTIVO_PERDA_ROTULO, numeroBr, pctBr } from "../../_components/formato";
import { CHEQUE_SITUACAO_ROTULO, FORMA_ROTULO } from "../../_components/venda-rotulos";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const REEMBOLSO: Record<string, string> = {
  dinheiro: "Em dinheiro",
  abater_fiado: "Abatida do fiado",
  troca: "Troca de mercadoria",
};

export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;

  const db = await getTenantDb();
  const res = await lerVendaAction(db, user, id);
  if (!res.ok) notFound();
  const venda = res.data;
  // F6b: devolver e trocar são por chave; cancelar a venda é do Gestor da loja (ou da conta).
  const papel = await papelDoEmporio(db, user);
  const podeEscrever = pode(papel, "chave:devolver_trocar", venda.establishment_id);
  const ehAdmin = pode(papel, "gestor_da_loja", venda.establishment_id);

  const ativa = venda.status === "concluida";
  const devolviveis = venda.items.filter((i) => i.returnable_qty > 0);
  const podeDevolver = podeEscrever && ativa && devolviveis.length > 0;
  const podeCancelar = ehAdmin && ativa && venda.returns.length === 0 && !venda.exchange_return_id;
  // D5: quem fatura muda o pedido para entrega, menos na venda cancelada e na trocada (muda-se na venda da troca).
  const trocada = venda.returns.some((r) => r.exchange_sale_id);
  const podeMudarPedido = pode(papel, "fatura_na_loja", venda.establishment_id) && ativa && !trocada;
  // Os caixas da loja da venda e o usuário (do servidor) para o campo "Caixa" dos painéis.
  const caixas = paraCaixasDaLoja(await viewsDosCaixas(db, [venda.establishment_id]));
  // Cancelar só mexe na gaveta se houve dinheiro, ou fiado já recebido (pode ter sido em dinheiro).
  const fiadoTotal = venda.payments.filter((p) => p.kind === "fiado").reduce((s, p) => s + Math.round(p.amount * 100), 0);
  const cancelaMexeNaGaveta =
    venda.payments.some((p) => p.kind === "dinheiro") ||
    (fiadoTotal > 0 && Math.round(venda.open_amount * 100) < fiadoTotal);
  const catalogo = podeDevolver ? await carregarCatalogoDeVenda(db, [venda.establishment_id]) : null;
  // A troca abre com o cliente da venda de origem, se ainda ativo (a busca por id o devolve completo).
  const buscado =
    catalogo && venda.customer_id ? await buscarClientesAction(db, user, { id: venda.customer_id }) : null;
  const clienteDaTroca = buscado?.ok ? (buscado.data.itens[0] ?? null) : null;
  const nomeDoItem = new Map(venda.items.map((i) => [i.id, `${i.product_name} (${i.presentation_name})`]));

  const itensDevolviveis = devolviveis.map((i) => ({
    id: i.id,
    product_name: i.product_name,
    presentation_name: i.presentation_name,
    unit_price: i.unit_price,
    returnable_qty: i.returnable_qty,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio/vendas" className="text-sm text-texto-secundario hover:text-texto">
            Vendas
          </Link>
          <h1 className="text-2xl font-semibold text-texto">
            Venda nº {formatarNumero(venda.number)}, {DATA_HORA.format(new Date(venda.sold_at))}
          </h1>
          <p className="mt-1 text-sm text-texto-secundario">
            {venda.establishment_name}
            {venda.customer_name ? `, cliente ${venda.customer_name}` : ""}
          </p>
          {venda.quote && (
            <p className="text-sm text-texto-secundario">
              Orçamento nº{" "}
              <Link href={`/emporio/orcamentos/${venda.quote.id}`} className="font-medium text-texto-marca hover:underline">
                {venda.quote.numero}
              </Link>
            </p>
          )}
          {venda.seller_name && (
            <p className="text-sm text-texto-secundario">
              Vendedor: <span className="font-medium text-texto">{venda.seller_name}</span>
              {venda.sold_by_user_id && venda.sold_by_user_id !== venda.seller_user_id && venda.sold_by_name
                ? `. Registrada por ${venda.sold_by_name}`
                : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant={ativa ? "green" : "gray"}>{ativa ? "Concluída" : "Cancelada"}</Badge>
            {ativa && venda.open_amount > 0 && <Badge variant="amber">Fiado em aberto {reaisBr(venda.open_amount)}</Badge>}
            {venda.exchange_return_id && <Badge variant="blue">Venda de uma troca</Badge>}
            {venda.origin === "ecommerce" && <Badge variant="blue">{ROTULO_DA_ORIGEM.ecommerce}</Badge>}
            {venda.items.some((i) => i.cost_provisional) && <Badge variant="amber">Custo provisório</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/emporio/imprimir/venda/${venda.id}?formato=a4`} target="_blank" rel="noopener noreferrer">
              Imprimir A4
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/emporio/imprimir/venda/${venda.id}?formato=cupom`} target="_blank" rel="noopener noreferrer">
              Imprimir cupom
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/emporio/imprimir/romaneio/${venda.id}?formato=a4`} target="_blank" rel="noopener noreferrer">
              Romaneio A4
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/emporio/imprimir/romaneio/${venda.id}?formato=cupom`} target="_blank" rel="noopener noreferrer">
              Romaneio cupom
            </a>
          </Button>
          {podeDevolver && (
            <>
              <DevolverForm vendaId={venda.id} itens={itensDevolviveis} abertoCent={Math.round(venda.open_amount * 100)}
                lojaId={venda.establishment_id}
                caixas={caixas}
                usuarioId={user.id}
              />
              {catalogo && (
                <TrocarForm
                  vendaId={venda.id}
                  lojaId={venda.establishment_id}
                  lojaNome={venda.establishment_name}
                  itensDevolviveis={itensDevolviveis}
                  produtos={catalogo.produtos}
                  precos={catalogo.precos}
                  consumidorFinal={catalogo.consumidorFinal}
                  clienteInicial={clienteDaTroca}
                  caixas={caixas}
                  usuarioId={user.id}
                />
              )}
            </>
          )}
          {podeCancelar && <CancelarVendaForm
              vendaId={venda.id}
              lojaId={venda.establishment_id}
              devolveDinheiro={cancelaMexeNaGaveta}
              caixas={caixas}
              usuarioId={user.id}
            />}
        </div>
      </header>

      {venda.replaced_by && (
        <p className="rounded-lg bg-atencao-suave px-4 py-3 text-sm text-atencao-tinta">
          Substituída pela venda nº{" "}
          <Link href={`/emporio/vendas/${venda.replaced_by.id}`} className="font-medium underline">
            {formatarNumero(venda.replaced_by.number)}
          </Link>
          .
        </p>
      )}
      {venda.replaces && (
        <p className="rounded-lg bg-superficie-afundada px-4 py-3 text-sm text-texto-secundario">
          Substitui a venda nº{" "}
          <Link href={`/emporio/vendas/${venda.replaces.id}`} className="font-medium text-texto-marca hover:underline">
            {formatarNumero(venda.replaces.number)}
          </Link>
          .
        </p>
      )}

      {!ativa && (
        <p className="rounded-lg bg-superficie-afundada px-4 py-3 text-sm text-texto-secundario">
          Cancelada
          {venda.canceled_at ? ` em ${DATA_HORA.format(new Date(venda.canceled_at))}` : ""}
          {venda.canceled_reason ? `: ${venda.canceled_reason}` : "."}
        </p>
      )}
      {ativa && !podeCancelar && ehAdmin && (
        <p className="text-sm text-texto-secundario">
          {venda.exchange_return_id
            ? "Venda de uma troca: para desfazer, devolva os itens dela."
            : "Venda com devolução: não dá para cancelar a venda inteira."}
        </p>
      )}

      <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-borda bg-superficie p-4">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-semibold text-texto">
            {venda.for_delivery ? "Pedido para entrega" : "Retirada no balcão"}
          </h2>
          {venda.for_delivery && (
            <p className="break-words text-sm text-texto-secundario">
              {linhaDoEndereco(venda.delivery_address) ?? "Sem endereço."}
            </p>
          )}
        </div>
        {podeMudarPedido && (
          <MudarPedidoParaEntregaForm
            vendaId={venda.id}
            cliente={{ id: venda.customer_id, name: venda.customer_name }}
            pedido={{
              for_delivery: venda.for_delivery,
              delivery_address_kind: venda.delivery_address_kind,
              delivery_address: venda.delivery_address,
            }}
          />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-texto">Itens</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Devolvido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {venda.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium text-texto">
                  {i.product_name}
                  <span className="block text-xs font-normal text-texto-secundario">{i.presentation_name}</span>
                  {i.cost_provisional && <Badge variant="amber">Custo provisório</Badge>}
                </TableCell>
                <TableCell>{numeroBr(i.quantity)}</TableCell>
                <TableCell>
                  {reaisBr(i.unit_price)}
                  {i.suggested_price !== null && i.unit_price < i.suggested_price && (
                    <span className="block text-xs text-atencao-tinta">sugerido {reaisBr(i.suggested_price)}</span>
                  )}
                </TableCell>
                <TableCell>{reaisBr(i.total)}</TableCell>
                <TableCell>{i.returned_qty > 0 ? numeroBr(i.returned_qty) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-texto">
          {venda.freight_amount > 0 ? "Itens: " : "Total: "}
          <strong>{reaisBr(venda.net_amount)}</strong>
          {venda.discount_amount > 0 && (
            <span className="text-texto-secundario">
              {" "}
              (desconto de {reaisBr(venda.discount_amount)}, {pctBr(venda.discount_pct)})
            </span>
          )}
        </p>
        {venda.freight_amount > 0 && (
          <>
            <p className="text-sm text-texto">
              Frete: <strong>{reaisBr(venda.freight_amount)}</strong>
            </p>
            <p className="text-sm text-texto">
              Total com frete: <strong>{reaisBr(venda.total_amount)}</strong>
            </p>
          </>
        )}
        {venda.notes && <p className="text-sm text-texto-secundario">Observação: {venda.notes}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-texto">Pagamentos</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Forma</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {venda.payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {FORMA_ROTULO[p.kind] ?? p.kind}
                  {p.installments && p.installments > 1 && (
                    <span className="block text-xs text-texto-secundario">em {p.installments}x</span>
                  )}
                </TableCell>
                <TableCell>{reaisBr(p.amount)}</TableCell>
                <TableCell>{p.due_date ? DATA.format(new Date(p.due_date)) : "-"}</TableCell>
                <TableCell className="text-sm">
                  {p.fee_pct !== null && p.fee_amount !== null && (
                    <>
                      Taxa {pctBr(p.fee_pct)} ({reaisBr(p.fee_amount)})
                      <span className="block text-xs text-texto-secundario">
                        líquido {reaisBr(Math.round((p.amount - p.fee_amount) * 100) / 100)}
                        {p.installments && p.installments > 1 ? ` em ${p.installments} parcelas` : ""}
                      </span>
                    </>
                  )}
                  {p.check && (
                    <>
                      Cheque nº {p.check.number}, {p.check.bank}
                      <span className="block text-xs text-texto-secundario">
                        bom para {DATA.format(new Date(p.check.good_for))}
                      </span>
                      <Badge variant={p.check.status === "compensado" ? "green" : p.check.status.startsWith("devolvido") ? "red" : "amber"}>
                        {CHEQUE_SITUACAO_ROTULO[p.check.status] ?? p.check.status}
                      </Badge>
                    </>
                  )}
                  {p.fee_pct === null && !p.check && "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {ativa && venda.open_amount > 0 && (
          <p className="text-sm text-texto">
            O cliente ainda deve <strong>{reaisBr(venda.open_amount)}</strong>.{" "}
            <Link href="/emporio/fiado" className="font-medium text-texto-marca hover:underline">
              Ir para o Fiado
            </Link>
          </p>
        )}
      </section>

      {venda.returns.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-texto">Devoluções</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Forma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {venda.returns.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{DATA_HORA.format(new Date(d.returned_at))}</TableCell>
                  <TableCell className="max-w-xs text-sm">
                    {d.items
                      .map((i) => {
                        const perda = i.loss_reason ? ` (avariado: ${(MOTIVO_PERDA_ROTULO[i.loss_reason] ?? i.loss_reason).toLowerCase()})` : "";
                        return `${numeroBr(i.quantity)} × ${nomeDoItem.get(i.sale_item_id) ?? "item"}${perda}`;
                      })
                      .join("; ")}
                    {d.reason && <span className="block text-xs text-texto-secundario">{d.reason}</span>}
                  </TableCell>
                  <TableCell>{reaisBr(d.amount)}</TableCell>
                  <TableCell>
                    {REEMBOLSO[d.refund_kind] ?? d.refund_kind}
                    {d.exchange_sale_id && (
                      <Link
                        href={`/emporio/vendas/${d.exchange_sale_id}`}
                        className="block text-xs font-medium text-texto-marca hover:underline"
                      >
                        Ver a venda nova
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
