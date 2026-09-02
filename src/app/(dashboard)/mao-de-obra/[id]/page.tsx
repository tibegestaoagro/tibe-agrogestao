import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { PayFrequency, WorkerEntryKind } from "@/generated/prisma/client";
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
import { getWorkerDetail } from "@/lib/actions/workers";
import WorkerForm from "@/components/mao-de-obra/worker-form";
import PaymentForm from "@/components/mao-de-obra/payment-form";
import WorkerStatusButton from "@/components/mao-de-obra/worker-status-button";
import {
  WORKER_ENTRY_KIND_LABELS,
  PAY_FREQUENCY_FRASE,
  moeda,
  dataCurta,
} from "@/components/mao-de-obra/labels";

/**
 * A ficha do trabalhador e o histórico dele (§37).
 *
 * O histórico separa os tipos por `kind`, não por categoria: o §9 pede o
 * adiantamento mostrado à parte, e `category` é texto que o produtor renomeia
 * no painel financeiro.
 */

export default async function TrabalhadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");
  if (!canAccess(user.role, "mao_de_obra")) redirect("/dashboard");

  const writable = canWrite(user.role, "mao_de_obra");
  const db = await getTenantDb();

  const { id } = await params;
  const res = await getWorkerDetail(db, id);
  if (!res.ok) notFound();
  const w = res.data;

  const properties = await db.property.findMany({
    where: { archived_at: null },
    orderBy: { name: "asc" },
  });

  const pagos = w.entries.filter((e) => e.status === "paid");
  const totalPago = pagos.reduce((soma, e) => soma + e.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mao-de-obra" className="text-sm text-texto-secundario underline">
          Voltar para Mão de Obra
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-texto">{w.name}</h1>
            {w.status === "inativo" && <Badge variant="amber">Inativo</Badge>}
          </div>
          <p className="mt-1 text-sm text-texto-secundario">
            {w.role}
            {w.pay_amount !== null && w.pay_frequency ? (
              <>
                {" · "}
                {moeda(w.pay_amount)} {PAY_FREQUENCY_FRASE[w.pay_frequency as PayFrequency]}
              </>
            ) : (
              " · Pago por diária"
            )}
          </p>
        </div>
        {writable && (
          <div className="flex flex-wrap items-start gap-2">
            {w.status === "ativo" && (
              <PaymentForm
                workerId={w.id}
                workerName={w.name}
                previsao={w.proximo_pagamento}
              />
            )}
            <WorkerForm
              properties={properties}
              trabalhador={{
                id: w.id,
                name: w.name,
                role: w.role,
                type: w.type,
                pay_frequency: w.pay_frequency,
                pay_amount: w.pay_amount,
                pay_day: w.pay_day,
                property_id: w.property_id,
                phone: w.phone,
                notes: w.notes,
              }}
            />
            <WorkerStatusButton workerId={w.id} status={w.status} />
          </div>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">
            Próximo pagamento
          </p>
          {w.proximo_pagamento ? (
            <>
              <p className="mt-1 text-xl font-semibold text-texto">
                {moeda(w.proximo_pagamento.amount)}
              </p>
              <p className="text-sm text-texto-secundario">
                em {dataCurta(w.proximo_pagamento.due_date)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-texto-discreto">
              {w.status === "inativo"
                ? "Inativo não gera previsão."
                : "Sem previsão. Diarista é pago por serviço."}
            </p>
          )}
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Já pago</p>
          <p className="mt-1 text-xl font-semibold text-texto">{moeda(totalPago)}</p>
          <p className="text-sm text-texto-secundario">
            {pagos.length} {pagos.length === 1 ? "lançamento" : "lançamentos"}
          </p>
        </div>
        <div className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
          <p className="text-xs uppercase tracking-wide text-texto-discreto">Contato</p>
          <p className="mt-1 text-sm text-texto">
            {w.phone ?? <span className="text-texto-discreto">Sem telefone</span>}
          </p>
          {w.notes && <p className="mt-1 text-sm text-texto-secundario">{w.notes}</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-texto">Histórico</h2>
        {w.entries.length === 0 ? (
          <EmptyState titulo="Nenhum lançamento ainda" compacto>
            Pagamentos, adiantamentos e benefícios aparecem aqui, e vão para o Financeiro sem
            você precisar lançar de novo.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {w.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.kind ? (
                      <Badge variant={e.kind === "adiantamento" ? "blue" : "gray"}>
                        {WORKER_ENTRY_KIND_LABELS[e.kind as WorkerEntryKind] ?? e.kind}
                      </Badge>
                    ) : (
                      <span className="text-texto-discreto">-</span>
                    )}
                  </TableCell>
                  <TableCell>{e.category ?? <span className="text-texto-discreto">-</span>}</TableCell>
                  <TableCell>{moeda(e.amount)}</TableCell>
                  <TableCell>
                    {e.paid_at
                      ? dataCurta(e.paid_at)
                      : e.due_date
                        ? `vence ${dataCurta(e.due_date)}`
                        : "-"}
                  </TableCell>
                  <TableCell>
                    {e.status === "paid" ? (
                      <Badge variant="green">Pago</Badge>
                    ) : (
                      <Badge variant="amber">Previsto</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-texto-discreto">
          O Tibé registra o que foi pago, sem calcular férias, 13º, FGTS, INSS nem rescisão.
          Isso continua com o seu contador.
        </p>
      </section>
    </div>
  );
}
