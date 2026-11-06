import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lerOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
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
import { numeroBr } from "../../_components/formato";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
// `valid_until` é uma data sem hora: lida em UTC, para não recuar um dia.
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeaturePage("emporio");
  const { id } = await params;

  const db = await getTenantDb();
  const res = await lerOrcamentoAction(db, user, id);
  if (!res.ok) notFound();
  const o = res.data;
  const podeVender = pode(await papelDoEmporio(db, user), "vendedor_da_loja", o.establishment_id);
  const faturado = o.situacao === "faturado";
  const subtotal = Math.round((o.net_amount + o.discount_amount) * 100) / 100;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio/orcamentos" className="text-sm text-texto-secundario hover:text-texto">
            Orçamentos
          </Link>
          <h1 className="text-2xl font-semibold text-texto">
            Orçamento nº {o.numero}, {DATA_HORA.format(new Date(o.created_at))}
          </h1>
          <p className="mt-1 text-sm text-texto-secundario">
            {o.loja}, cliente <span className="font-medium text-texto">{o.customer.name}</span>
            {o.customer.phone ? `, ${o.customer.phone}` : ""}
          </p>
          {o.seller_name && (
            <p className="text-sm text-texto-secundario">
              Vendedor: <span className="font-medium text-texto">{o.seller_name}</span>
              {o.created_by_name && o.created_by_name !== o.seller_name ? `. Feito por ${o.created_by_name}` : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {o.situacao === "faturado" ? (
              <Badge variant="green">Faturado{o.sale ? ` (venda nº ${o.sale.numero})` : ""}</Badge>
            ) : o.situacao === "vencido" ? (
              <Badge variant="amber">Vencido</Badge>
            ) : (
              <Badge variant="blue">Aberto</Badge>
            )}
            <span className="text-sm text-texto-secundario">Válido até {DATA.format(new Date(o.valid_until))}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/emporio/imprimir/orcamento/${o.id}?formato=a4`} target="_blank" rel="noopener noreferrer">
              Imprimir A4
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/emporio/imprimir/orcamento/${o.id}?formato=cupom`} target="_blank" rel="noopener noreferrer">
              Imprimir cupom
            </a>
          </Button>
          {!faturado && podeVender && (
            <Button asChild size="sm">
              <Link href={`/emporio/vender?orcamento=${o.id}`}>Faturar</Link>
            </Button>
          )}
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-texto">Itens</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.items.map((i, n) => (
              <TableRow key={`${i.presentation_id}-${i.preco_orcado}-${n}`}>
                <TableCell className="font-medium text-texto">
                  {i.produto}
                  <span className="block text-xs font-normal text-texto-secundario">{i.apresentacao}</span>
                </TableCell>
                <TableCell>{numeroBr(i.quantity)}</TableCell>
                <TableCell>
                  {reaisBr(i.preco_orcado)}
                  {i.preco_sugerido !== null && i.preco_orcado < i.preco_sugerido && (
                    <span className="block text-xs text-atencao-tinta">sugerido {reaisBr(i.preco_sugerido)}</span>
                  )}
                </TableCell>
                <TableCell>{reaisBr(i.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="space-y-0.5 text-sm text-texto">
          <p>
            Subtotal: <strong>{reaisBr(subtotal)}</strong>
          </p>
          {o.discount_amount > 0 && <p>Desconto: <strong>{reaisBr(o.discount_amount)}</strong></p>}
          <p>
            Total: <strong>{reaisBr(o.net_amount)}</strong>
          </p>
        </div>
        {o.notes && <p className="text-sm text-texto-secundario">Observação: {o.notes}</p>}
      </section>

      {o.vendas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-texto">Vendas deste orçamento</h2>
          <ul className="space-y-1 text-sm">
            {o.vendas.map((v) => (
              <li key={v.id} className="flex items-center gap-2">
                <Link href={`/emporio/vendas/${v.id}`} className="font-medium text-texto-marca hover:underline">
                  Venda nº {v.numero}
                </Link>
                <Badge variant={v.status === "concluida" ? "green" : "gray"}>
                  {v.status === "concluida" ? "Concluída" : "Cancelada"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
