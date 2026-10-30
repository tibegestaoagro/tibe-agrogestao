import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarVendasAction } from "@/lib/actions/emporio-vendas";
import { reaisBr } from "@/lib/numero-br";
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
import { VendasFiltro } from "../_components/vendas-filtro";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; situacao?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja = "", situacao = "" } = await searchParams;
  const filtroSituacao = situacao === "concluida" || situacao === "cancelada" ? situacao : undefined;

  const db = await getTenantDb();
  const podeVender = pode(await papelDoEmporio(db, user), "vendedor_da_loja");
  const [lojasRes, vendasRes] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarVendasAction(db, user, { establishment_id: loja || undefined, status: filtroSituacao }),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const vendas = vendasRes.ok ? vendasRes.data : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Vendas</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            As vendas do balcão, com cancelamento, devolução e troca.
          </p>
        </div>
        {podeVender && (
          <Button asChild>
            <Link href="/emporio/vender">Vender</Link>
          </Button>
        )}
      </header>

      <VendasFiltro lojas={lojas} loja={loja} situacao={filtroSituacao ?? ""} />

      {vendas.length === 0 ? (
        <EmptyState titulo="Nenhuma venda encontrada">
          {filtroSituacao || loja ? "Mude o filtro para ver outras." : "As vendas feitas no balcão aparecem aqui."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>
                <span className="sr-only">Abrir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendas.map((v) => {
              const provisorio = v.items.some((i) => i.cost_provisional);
              return (
                <TableRow key={v.id}>
                  <TableCell>{DATA_HORA.format(new Date(v.sold_at))}</TableCell>
                  <TableCell className="font-medium text-texto">{v.establishment_name}</TableCell>
                  <TableCell>{v.contact_name ?? "-"}</TableCell>
                  <TableCell>{reaisBr(v.net_amount)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={v.status === "concluida" ? "green" : "gray"}>
                        {v.status === "concluida" ? "Concluída" : "Cancelada"}
                      </Badge>
                      {v.status === "concluida" && v.open_amount > 0 && (
                        <Badge variant="amber">Fiado em aberto {reaisBr(v.open_amount)}</Badge>
                      )}
                      {v.returns.length > 0 && <Badge variant="blue">Com devolução</Badge>}
                      {provisorio && <Badge variant="amber">Custo provisório</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/emporio/vendas/${v.id}`}>Ver</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
