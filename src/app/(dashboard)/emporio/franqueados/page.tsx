import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarFranqueadosAction } from "@/lib/actions/emporio-franqueados";
import { formatarTelefone } from "@/lib/emporio/telefone";
import { reaisBr } from "@/lib/numero-br";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { FranqueadoForm } from "./_components/franqueado-form";
import { FranqueadosFiltro } from "./_components/franqueados-filtro";

export default async function FranqueadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; arquivados?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { q = "", arquivados = "" } = await searchParams;
  const db = await getTenantDb();
  const mostrarArquivados = arquivados === "1";
  const podeCadastrar = pode(await papelDoEmporio(db, user), "chave:lancar_compra");
  const res = await listarFranqueadosAction(db, user, { q: q || undefined, arquivados: mostrarArquivados });
  const lista = res.ok ? res.data : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Franqueados</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Quem vende com a loja e recebe um crédito a cada venda. O saldo é o que a loja ainda deve pagar a ele.
          </p>
        </div>
        {podeCadastrar && <FranqueadoForm modo="novo" />}
      </header>

      <FranqueadosFiltro q={q} arquivados={mostrarArquivados} />

      {!res.ok ? (
        <EmptyState titulo="Não foi possível carregar os franqueados">{res.message}</EmptyState>
      ) : lista.length === 0 ? (
        <EmptyState titulo="Nenhum franqueado encontrado">
          {q || mostrarArquivados ? "Mude o filtro para ver outros." : "Cadastre o primeiro franqueado."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Crédito a pagar</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium text-texto">
                  <Link href={`/emporio/franqueados/${f.id}`} className="text-texto-marca hover:underline">
                    {f.name}
                  </Link>
                </TableCell>
                <TableCell>{formatarTelefone(f.phone)}</TableCell>
                <TableCell className={f.balance < 0 ? "text-perigo-tinta" : undefined}>{reaisBr(f.balance)}</TableCell>
                <TableCell>{f.archived_at && <Badge variant="gray">Arquivado</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
