import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ContactType } from "@/generated/prisma/client";
import { getSessionUser, getActiveProfiles, getTenantDb } from "@/lib/tenant-context";
import { canWrite } from "@/lib/permissions";
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
import { getContactDetail } from "@/lib/actions/contacts";
import ContactForm from "@/components/contatos/contact-form";
import ContactArchiveButton from "@/components/contatos/contact-archive-button";
import {
  CONTACT_TYPE_LABELS,
  NEGOTIATION_TYPE_LABELS,
} from "@/components/contatos/contact-labels";

/**
 * O contato e o histórico dele.
 *
 * O histórico é só de Negociações porque é o único vínculo que existe hoje. As
 * fases 33.2 e 34 acrescentam os serviços contratados e prestados, e é aqui que
 * eles entram: o §37 do Módulo 33 pede "serviços realizados, valores,
 * pagamentos, fazendas atendidas" na ficha do prestador.
 */

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default async function ContatoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const { id } = await params;
  const res = await getContactDetail(db, id);
  if (!res.ok) notFound();

  const contato = res.data;
  const total = contato.negotiations.reduce((soma, n) => soma + (n.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contatos" className="text-sm text-texto-secundario underline">
          Voltar para Contatos
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-texto">{contato.name}</h1>
            {contato.archived && <Badge variant="amber">Arquivado</Badge>}
          </div>
          <p className="mt-1 text-sm text-texto-secundario">
            {contato.type
              ? (CONTACT_TYPE_LABELS[contato.type as ContactType] ?? contato.type)
              : "Sem tipo definido"}
          </p>
        </div>
        {writable && (
          <div className="flex flex-wrap items-start gap-2">
            <ContactForm
              contato={{
                id: contato.id,
                name: contato.name,
                type: contato.type,
                phone: contato.phone,
                city: contato.city,
                notes: contato.notes,
              }}
            />
            <ContactArchiveButton contactId={contato.id} arquivado={contato.archived} />
          </div>
        )}
      </header>

      <section className="rounded-[var(--curva)] border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold text-texto">Cadastro</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-texto-discreto">Telefone</dt>
            <dd className="mt-1 text-sm text-texto">
              {contato.phone ?? <span className="text-texto-discreto">Não informado</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-texto-discreto">Município</dt>
            <dd className="mt-1 text-sm text-texto">
              {contato.city ?? <span className="text-texto-discreto">Não informado</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-texto-discreto">Observações</dt>
            <dd className="mt-1 text-sm text-texto">
              {contato.notes ?? <span className="text-texto-discreto">Nenhuma</span>}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-texto">Negócios</h2>
          {contato.negotiations.length > 0 && (
            <p className="text-sm text-texto-secundario">
              {contato.negotiations.length}{" "}
              {contato.negotiations.length === 1 ? "negócio" : "negócios"}, somando{" "}
              <span className="font-medium text-texto">{moeda(total)}</span>
            </p>
          )}
        </div>

        {contato.negotiations.length === 0 ? (
          <EmptyState titulo="Nenhum negócio com este contato" compacto>
            Quando você registrar uma compra, venda ou permuta com esta pessoa, ela aparece aqui.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contato.negotiations.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{dataCurta(n.occurred_at)}</TableCell>
                  <TableCell>{NEGOTIATION_TYPE_LABELS[n.type] ?? n.type}</TableCell>
                  <TableCell>
                    {n.amount === null ? (
                      <span className="text-texto-discreto">Sem valor</span>
                    ) : (
                      moeda(n.amount)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-texto-discreto">
          Negócios cancelados não aparecem aqui: eles continuam no histórico da própria
          negociação, onde o cancelamento é legível.
        </p>
      </section>
    </div>
  );
}
