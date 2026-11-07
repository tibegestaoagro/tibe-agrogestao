import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarFornecedoresAction } from "@/lib/actions/emporio-fornecedores";
import { formatarDocumento } from "@/lib/contatos/cadastro";
import { formatarTelefone } from "@/lib/emporio/telefone";
import { POUCOS_DIGITOS } from "@/lib/emporio/sequencia-da-busca";
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
import { FornecedorForm } from "../_components/fornecedor-form";
import { FornecedoresFiltro } from "./_components/fornecedores-filtro";

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; arquivados?: string; pagina?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { q = "", arquivados = "", pagina = "1" } = await searchParams;
  const db = await getTenantDb();
  const mostrarArquivados = arquivados === "1";
  const podeCadastrar = pode(await papelDoEmporio(db, user), "chave:lancar_compra");
  const res = await listarFornecedoresAction(db, user, {
    q: q || undefined,
    arquivados: mostrarArquivados,
    pagina: Number(pagina) || 1,
  });
  const lista = res.ok ? res.data : { itens: [], total: 0, pagina: 1, por_pagina: 50, poucos_digitos: false };
  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.por_pagina));

  function href(p: number): string {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (mostrarArquivados) s.set("arquivados", "1");
    if (p > 1) s.set("pagina", String(p));
    const t = s.toString();
    return t ? `/emporio/fornecedores?${t}` : "/emporio/fornecedores";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Fornecedores</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            De quem o Empório compra, e as propriedades do dono que abastecem a loja.
          </p>
        </div>
        {podeCadastrar && <FornecedorForm modo="novo" />}
      </header>

      <FornecedoresFiltro q={q} arquivados={mostrarArquivados} />

      {!res.ok ? (
        <EmptyState titulo="Não foi possível carregar os fornecedores">{res.message}</EmptyState>
      ) : lista.poucos_digitos ? (
        <p className="text-sm text-texto-secundario">{POUCOS_DIGITOS}</p>
      ) : lista.itens.length === 0 ? (
        <EmptyState titulo="Nenhum fornecedor encontrado">
          {q || mostrarArquivados ? "Mude o filtro para ver outros." : "Cadastre o primeiro fornecedor."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.itens.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium text-texto">
                    <Link href={`/emporio/fornecedores/${f.id}`} className="text-texto-marca hover:underline">
                      {f.name}
                    </Link>
                  </TableCell>
                  <TableCell>{f.kind === "propriedade" ? "Propriedade" : "De fora"}</TableCell>
                  <TableCell>{f.document ? formatarDocumento(f.document) : "-"}</TableCell>
                  <TableCell>{f.phone ? formatarTelefone(f.phone) : "-"}</TableCell>
                  <TableCell>{f.archived && <Badge variant="gray">Arquivado</Badge>}</TableCell>
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
                Página {lista.pagina} de {totalPaginas} ({lista.total} fornecedores)
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
