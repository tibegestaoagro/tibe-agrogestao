import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ServiceDirection, ServicePricing } from "@/generated/prisma/client";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite, canAccess } from "@/lib/permissions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getServiceJobDetail } from "@/lib/actions/service-jobs";
import ServicePaymentForm from "@/components/servicos/service-payment-form";
import ServiceCancelButton from "@/components/servicos/service-cancel-button";
import {
  PRICING_LABELS,
  PRICING_UNIDADE,
  SERVICE_DIRECTION_LABELS,
  moeda,
  dataCurta,
  quantidadeBr,
} from "@/components/servicos/labels";

/**
 * A ficha do serviço, com os quatro números que o §22 pede: valor total, valor
 * já pago, valor restante e próximo vencimento.
 *
 * ⚠️ Os três primeiros vêm de fontes diferentes de propósito: o total é
 * derivado do que foi lançado, e o pago e o restante são somas de
 * `FinancialEntry`. Eles PODEM divergir se o produtor editar um lançamento em
 * `/financeiro`, e a tela mostra os três lado a lado para a divergência
 * aparecer, em vez de escondê-la atrás de um número só.
 */

export default async function ServicoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");
  if (!canAccess(user.role, "servicos")) redirect("/dashboard");

  const writable = canWrite(user.role, "servicos");
  const db = await getTenantDb();

  const { id } = await params;
  const res = await getServiceJobDetail(db, id);
  if (!res.ok) notFound();
  const j = res.data;

  const proximoVencimento = j.entries
    .filter((e) => e.status !== "paid" && e.due_date)
    .map((e) => e.due_date as string)
    .sort()[0];

  const soma = j.pago + j.restante;
  const diverge = Math.abs(soma - j.total) > 0.005;

  /**
   * Só o vocabulário muda. `pago` e `restante` são a MESMA soma nas duas
   * direções (a view expõe `recebido` e `a_receber` como apelidos deles): o que
   * muda é de quem é o dinheiro.
   */
  const prestado = j.direction === "prestado";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/servicos" className="text-sm text-texto-secundario underline">
          Voltar para Serviços
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-texto">{j.description}</h1>
            <Badge variant={prestado ? "green" : "gray"}>
              {SERVICE_DIRECTION_LABELS[j.direction as ServiceDirection]}
            </Badge>
            {j.canceled_at && <Badge variant="amber">Cancelado</Badge>}
          </div>
          <p className="mt-1 text-sm text-texto-secundario">
            {dataCurta(j.occurred_at)} · {PRICING_LABELS[j.pricing as ServicePricing]}
            {j.contact_name ? ` · ${j.contact_name}` : ""}
            {j.worker_name ? ` · ${j.worker_name}` : ""}
            {!j.contact_name && !j.worker_name && j.worker_count > 1
              ? ` · ${j.worker_count} pessoas`
              : ""}
          </p>
          {prestado && (
            <p className="mt-1 text-sm text-texto-secundario">
              {[
                j.machine_name,
                j.implement,
                j.client_location,
                j.operator_name ?? j.operator_note,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {writable && !j.canceled_at && (
          <div className="flex flex-wrap items-start gap-2">
            {j.restante > 0 && (
              <ServicePaymentForm
                serviceJobId={j.id}
                descricao={j.description}
                restante={j.restante}
                prestado={prestado}
              />
            )}
            <ServiceCancelButton serviceJobId={j.id} pago={j.pago} restante={j.restante} />
          </div>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Valor total</p>
          <p className="mt-1 text-xl font-semibold text-texto">{moeda(j.total)}</p>
          {j.pricing !== "fechado" && (
            <p className="text-sm text-texto-secundario">
              {quantidadeBr(j.quantidade)} {PRICING_UNIDADE[j.pricing as ServicePricing]}
              {j.unit_price !== null ? ` a ${moeda(j.unit_price)}` : ""}
              {j.worker_count > 1 ? ` · ${j.worker_count} pessoas` : ""}
            </p>
          )}
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">
            {prestado ? "Já recebido" : "Já pago"}
          </p>
          <p className="mt-1 text-xl font-semibold text-texto">{moeda(j.pago)}</p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">
            {prestado ? "A receber" : "Restante"}
          </p>
          <p className="mt-1 text-xl font-semibold text-texto">{moeda(j.restante)}</p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">
            Próximo vencimento
          </p>
          <p className="mt-1 text-sm text-texto">
            {proximoVencimento ? (
              dataCurta(proximoVencimento)
            ) : (
              <span className="text-texto-discreto">
                {j.restante === 0 ? (prestado ? "Nada a receber" : "Nada a pagar") : "Sem data"}
              </span>
            )}
          </p>
        </div>
      </section>

      {diverge && (
        <p className="rounded-[var(--curva)] border border-atencao-tinta/30 bg-atencao-suave p-3 text-sm text-atencao-tinta">
          O combinado ({moeda(j.total)}) e o que está no Financeiro ({moeda(soma)}) não batem.
          Isso acontece quando um lançamento é editado direto em Financeiro, e ali é onde o
          dinheiro de verdade fica. Confira lá se não foi engano.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-texto">Lançamentos</h2>
        {j.entries.length === 0 ? (
          <EmptyState titulo="Nenhum lançamento" compacto>
            Este serviço não gerou {prestado ? "receita" : "despesa"}. Acontece quando o valor
            ficou em zero.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {j.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{moeda(e.amount)}</TableCell>
                  <TableCell>
                    {e.status === "paid" ? (
                      <Badge variant="green">{prestado ? "Recebido" : "Pago"}</Badge>
                    ) : (
                      <Badge variant="amber">{prestado ? "A receber" : "A pagar"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.paid_at
                      ? dataCurta(e.paid_at)
                      : e.due_date
                        ? `vence ${dataCurta(e.due_date)}`
                        : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {j.pricing !== "fechado" && j.logs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-texto">Quantidade lançada</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {j.logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{dataCurta(l.occurred_at)}</TableCell>
                  <TableCell>
                    {quantidadeBr(l.quantity)}{" "}
                    {PRICING_UNIDADE[j.pricing as ServicePricing]}
                    {l.canceled_at && (
                      <span className="text-texto-discreto"> (cancelada)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.notes ?? <span className="text-texto-discreto">-</span>}
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
