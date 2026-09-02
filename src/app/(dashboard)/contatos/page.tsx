import Link from "next/link";
import { redirect } from "next/navigation";
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
import { listContacts, CONTACT_TYPES } from "@/lib/actions/contacts";
import ContactForm from "@/components/contatos/contact-form";
import { CONTACT_TYPE_LABELS } from "@/components/contatos/contact-labels";

/**
 * Contatos: quem a fazenda compra, vende ou contrata (§4 e §5 do Módulo 31).
 *
 * Existe desde a fase 0 dos Módulos 33 e 34, e fecha a linha "tela de contatos"
 * da `docs/agents/dividas.md`. Até aqui o `Contact` só nascia de dois lugares,
 * nenhum dos quais era uma tela: o formulário de negociação (pelo nome
 * digitado) e a conversa do WhatsApp (`findOrCreateContact`, pelo nome dito).
 * O resultado é que a lista de contatos de um tenant antigo tem duplicata de
 * grafia ("João" e "Joao" viram dois, porque a busca ignora caixa e não
 * acento), e ninguém tinha como arrumar.
 *
 * A busca e o filtro são server-side, por querystring, porque a listagem já é
 * server component: um filtro de cliente exigiria trazer a lista inteira, e
 * quem tem 400 contatos é justamente quem precisa do filtro.
 */

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profiles = await getActiveProfiles();
  if (!profiles.includes("fazenda")) redirect("/dashboard");

  const writable = canWrite(user.role, "rebanho");
  const db = await getTenantDb();

  const { q, type } = await searchParams;
  const tipoValido =
    type && (CONTACT_TYPES as readonly string[]).includes(type) ? (type as ContactType) : null;

  const contatos = await listContacts(db, { busca: q?.trim() || null, type: tipoValido });

  const filtrando = Boolean(q?.trim()) || tipoValido !== null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Contatos</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Quem você compra, vende ou contrata. Só o nome é obrigatório.
          </p>
        </div>
        {writable && <ContactForm />}
      </header>

      <form className="flex flex-wrap items-end gap-3" action="/contatos">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-texto">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ""}
            placeholder="Parte do nome"
            className="h-10 w-full rounded-[var(--curva)] border border-borda-campo bg-superficie px-3 text-sm text-texto placeholder:text-texto-discreto"
          />
        </div>
        <div className="min-w-48">
          <label htmlFor="type" className="mb-1 block text-sm font-medium text-texto">
            Tipo
          </label>
          <select
            id="type"
            name="type"
            defaultValue={tipoValido ?? ""}
            className="h-10 w-full rounded-[var(--curva)] border border-borda-campo bg-superficie px-3 text-sm text-texto"
          >
            <option value="">Todos</option>
            {Object.entries(CONTACT_TYPE_LABELS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-[var(--curva)] border border-borda-forte bg-superficie px-4 text-sm font-medium text-texto"
        >
          Filtrar
        </button>
        {filtrando && (
          <Link
            href="/contatos"
            className="h-10 self-end px-2 text-sm text-texto-secundario underline"
          >
            Limpar
          </Link>
        )}
      </form>

      {contatos.length === 0 ? (
        <EmptyState
          titulo={filtrando ? "Nenhum contato com esse filtro" : "Nenhum contato ainda"}
        >
          {filtrando
            ? "Tente outra parte do nome, ou limpe o filtro."
            : "Contatos nascem sozinhos quando você registra um negócio ou fala com o assistente no WhatsApp. Você também pode cadastrar um agora."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Município</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contatos.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/contatos/${c.id}`} className="font-medium text-texto underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {c.type ? (
                    // `gray` e não `default`: a variante padrão do Badge ainda
                    // pinta com os aliases depreciados `tibe-light`/`tibe-dark`,
                    // que são a armadilha da `dividas.md` §2.5.
                    <Badge variant="gray">
                      {CONTACT_TYPE_LABELS[c.type as ContactType] ?? c.type}
                    </Badge>
                  ) : (
                    <span className="text-texto-discreto">Sem tipo</span>
                  )}
                </TableCell>
                <TableCell>
                  {c.phone ?? <span className="text-texto-discreto">-</span>}
                </TableCell>
                <TableCell>{c.city ?? <span className="text-texto-discreto">-</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
