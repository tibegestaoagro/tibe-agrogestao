import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type {
  ServiceCostKind,
  ServiceDirection,
  ServicePricing,
} from "@/generated/prisma/client";
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
import ServiceLogForm from "@/components/servicos/service-log-form";
import ServiceCostForm from "@/components/servicos/service-cost-form";
import ServiceStatusButtons from "@/components/servicos/service-status-buttons";
import {
  PRICING_LABELS,
  PRICING_UNIDADE,
  SERVICE_DIRECTION_LABELS,
  SERVICE_COST_KIND_LABELS,
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

  /**
   * ⚠️ `select`, e não a linha inteira: `Product` tem campos `Decimal`, e o
   * React 19 recusa passar um Decimal de Server para Client Component. O erro
   * só aparece no console do navegador, com `tsc`/`lint`/testes verdes.
   */
  const produtos = await db.product.findMany({
    where: { archived_at: null },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });

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
                j.hour_meter_start !== null && j.hour_meter_end !== null
                  ? `horímetro ${quantidadeBr(j.hour_meter_start)} → ${quantidadeBr(j.hour_meter_end)} (${quantidadeBr(j.hour_meter_end - j.hour_meter_start)} horas)`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {writable && !j.canceled_at && (
          <div className="flex flex-wrap items-start gap-2">
            <ServiceStatusButtons serviceJobId={j.id} status={j.status} />
            {j.pricing !== "fechado" && (
              <ServiceLogForm
                serviceJobId={j.id}
                unidade={PRICING_UNIDADE[j.pricing as ServicePricing]}
              />
            )}
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-texto">Resultado do serviço (§25)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
            <p className="text-xs uppercase tracking-wide text-texto-discreto">
              {prestado ? "Receita" : "Total combinado"}
            </p>
            <p className="mt-1 text-xl font-semibold text-texto">{moeda(j.total)}</p>
          </div>
          <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
            <p className="text-xs uppercase tracking-wide text-texto-discreto">Custo registrado</p>
            <p className="mt-1 text-xl font-semibold text-texto">{moeda(j.custo_total)}</p>
          </div>
          <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
            <p className="text-xs uppercase tracking-wide text-texto-discreto">Resultado</p>
            <p
              className={`mt-1 text-xl font-semibold ${
                j.resultado >= 0 ? "text-sucesso-tinta" : "text-perigo-tinta"
              }`}
            >
              {moeda(j.resultado)}
            </p>
          </div>
        </div>
        <p className="text-xs text-texto-discreto">
          Cálculo gerencial, não contábil (§25): {prestado ? "receita menos custo" : "o total combinado com o terceiro somado ao custo registrado"}.
        </p>
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-texto">Custos</h2>
          {writable && !j.canceled_at && (
            <ServiceCostForm serviceJobId={j.id} produtos={produtos} />
          )}
        </div>
        {j.costs.length === 0 ? (
          <EmptyState titulo="Nenhum custo registrado" compacto>
            Combustível, mão de obra, pedágio: registre aqui para ver o resultado do §25.
          </EmptyState>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Natureza</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {j.costs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{SERVICE_COST_KIND_LABELS[c.kind]}</TableCell>
                    <TableCell>
                      {c.description}
                      {c.canceled_at && (
                        <span className="text-texto-discreto"> (cancelado)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.amount !== null ? (
                        moeda(c.amount)
                      ) : (
                        <span className="text-texto-discreto">Sem valor</span>
                      )}
                    </TableCell>
                    <TableCell>{dataCurta(c.occurred_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.gerou_lancamento && <Badge variant="blue">Gerou lançamento</Badge>}
                        {c.baixou_estoque && <Badge variant="gray">Baixou estoque</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {Object.keys(j.custo_por_natureza).length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-secundario">
                {Object.entries(j.custo_por_natureza).map(([kind, valor]) => (
                  <span key={kind}>
                    {SERVICE_COST_KIND_LABELS[kind as ServiceCostKind]}: {moeda(valor as number)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
