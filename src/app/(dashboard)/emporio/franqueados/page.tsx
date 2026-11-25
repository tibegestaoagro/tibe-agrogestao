import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { veAPagina } from "@/lib/emporio/paginas";
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
import { CabecalhoDaTela } from "../_components/cabecalho-da-tela";
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
  const papel = await papelDoEmporio(db, user);
  if (!veAPagina(papel, "/emporio/franqueados")) redirect("/emporio");
  const podeCadastrar = pode(papel, "chave:lancar_compra");
  const res = await listarFranqueadosAction(db, user, { q: q || undefined, arquivados: mostrarArquivados });
  const lista = res.ok ? res.data : [];

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="Franqueados"
        ajuda="Quem vende com a loja e recebe um crédito a cada venda. O saldo é o que a loja ainda deve pagar a ele."
        acoes={podeCadastrar && <FranqueadoForm modo="novo" />}
      />

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
