import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { lerVendaAction } from "@/lib/actions/emporio-vendas";
import { reaisBr } from "@/lib/numero-br";
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
import { DevolverForm } from "../../_components/devolver-form";
import { TrocarForm } from "../../_components/trocar-form";
import { carregarCatalogoDeVenda } from "../../_components/catalogo-venda";
import { MOTIVO_PERDA_ROTULO, numeroBr, pctBr } from "../../_components/formato";
import { FORMA_ROTULO } from "../../_components/venda-rotulos";

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
  const podeEscrever = hasMinRole(user.role, "OPERADOR");
  const ehAdmin = hasMinRole(user.role, "ADMIN");

  const db = await getTenantDb();
  const res = await lerVendaAction(db, user, id);
  if (!res.ok) notFound();
  const venda = res.data;

  const ativa = venda.status === "concluida";
  const devolviveis = venda.items.filter((i) => i.returnable_qty > 0);
  const podeDevolver = podeEscrever && ativa && devolviveis.length > 0;
  const podeCancelar = ehAdmin && ativa && venda.returns.length === 0 && !venda.exchange_return_id;
  const catalogo = podeDevolver ? await carregarCatalogoDeVenda(db, [venda.establishment_id]) : null;
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
          <h1 className="text-2xl font-semibold text-texto">Venda de {DATA_HORA.format(new Date(venda.sold_at))}</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            {venda.establishment_name}
            {venda.contact_name ? `, cliente ${venda.contact_name}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant={ativa ? "green" : "gray"}>{ativa ? "Concluída" : "Cancelada"}</Badge>
            {ativa && venda.open_amount > 0 && <Badge variant="amber">Fiado em aberto {reaisBr(venda.open_amount)}</Badge>}
            {venda.exchange_return_id && <Badge variant="blue">Venda de uma troca</Badge>}
            {venda.items.some((i) => i.cost_provisional) && <Badge variant="amber">Custo provisório</Badge>}
          </div>
        </div>
        {(podeDevolver || podeCancelar) && (
          <div className="flex flex-wrap gap-2">
            {podeDevolver && (
              <>
                <DevolverForm vendaId={venda.id} itens={itensDevolviveis} abertoCent={Math.round(venda.open_amount * 100)} />
                {catalogo && (
                  <TrocarForm
                    vendaId={venda.id}
                    lojaId={venda.establishment_id}
                    lojaNome={venda.establishment_name}
                    itensDevolviveis={itensDevolviveis}
                    produtos={catalogo.produtos}
                    precos={catalogo.precos}
                    contatos={catalogo.contatos}
                    contatoId={venda.contact_id}
                  />
                )}
              </>
            )}
            {podeCancelar && <CancelarVendaForm vendaId={venda.id} />}
          </div>
        )}
      </header>

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
          Total: <strong>{reaisBr(venda.net_amount)}</strong>
          {venda.discount_amount > 0 && (
            <span className="text-texto-secundario">
              {" "}
              (desconto de {reaisBr(venda.discount_amount)}, {pctBr(venda.discount_pct)})
            </span>
          )}
        </p>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {venda.payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{FORMA_ROTULO[p.kind] ?? p.kind}</TableCell>
                <TableCell>{reaisBr(p.amount)}</TableCell>
                <TableCell>{p.due_date ? DATA.format(new Date(p.due_date)) : "-"}</TableCell>
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
