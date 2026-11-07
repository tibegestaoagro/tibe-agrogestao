import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { listarClientesAction } from "@/lib/actions/emporio-clientes";
import { formatarDocumento } from "@/lib/contatos/cadastro";
import { formatarTelefone } from "@/lib/emporio/telefone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ClienteForm } from "../_components/cliente-form";
import { ClientesFiltro } from "./_components/clientes-filtro";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; arquivados?: string; pagina?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { q = "", arquivados = "", pagina = "1" } = await searchParams;
  const db = await getTenantDb();
  const mostrarArquivados = arquivados === "1";
  const res = await listarClientesAction(db, user, {
    q: q || undefined,
    arquivados: mostrarArquivados,
    pagina: Number(pagina) || 1,
  });
  const lista = res.ok ? res.data : { itens: [], total: 0, pagina: 1, por_pagina: 50 };
  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.por_pagina));

  function href(p: number): string {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (mostrarArquivados) s.set("arquivados", "1");
    if (p > 1) s.set("pagina", String(p));
    const t = s.toString();
    return t ? `/emporio/clientes?${t}` : "/emporio/clientes";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Clientes</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Quem compra no Empório. Abra o cliente para ver o histórico de compras.
          </p>
        </div>
        <ClienteForm modo="novo" />
      </header>

      <ClientesFiltro q={q} arquivados={mostrarArquivados} />

      {!res.ok ? (
        <EmptyState titulo="Não foi possível carregar os clientes">{res.message}</EmptyState>
      ) : lista.itens.length === 0 ? (
        <EmptyState titulo="Nenhum cliente encontrado">
          {q || mostrarArquivados ? "Mude o filtro para ver outros." : "Cadastre o primeiro cliente."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.itens.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-texto">
                    <Link href={`/emporio/clientes/${c.id}`} className="text-texto-marca hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone ? formatarTelefone(c.phone) : "-"}</TableCell>
                  <TableCell>{c.document ? formatarDocumento(c.document) : "sem CPF/CNPJ"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.fixed && <Badge variant="blue">Cliente padrão</Badge>}
                      {c.incomplete && <Badge variant="amber">Cadastro incompleto</Badge>}
                      {c.archived && <Badge variant="gray">Arquivado</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPaginas > 1 && (
            <nav className="flex items-center justify-between gap-3 text-sm text-texto-secundario" aria-label="Páginas">
              {lista.pagina > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={href(lista.pagina - 1)}>Anterior</Link>
                </Button>
              ) : (
                <span />
              )}
              <span>
                Página {lista.pagina} de {totalPaginas} ({lista.total} clientes)
              </span>
              {lista.pagina < totalPaginas ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={href(lista.pagina + 1)}>Próxima</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
