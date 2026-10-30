import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarFiadoAction } from "@/lib/actions/emporio-caixa";
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
import { ReceberFiadoForm } from "../_components/receber-fiado-form";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const DATA_UTC = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export default async function FiadoPage() {
  const user = await requireFeaturePage("emporio");

  const db = await getTenantDb();
  // F6b: receber fiado é do Vendedor da loja para cima.
  const podeEscrever = pode(await papelDoEmporio(db, user), "vendedor_da_loja");
  const [lojasRes, fiadoRes] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarFiadoAction(db, user),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const clientes = fiadoRes.ok ? fiadoRes.data : [];

  // "A venda mais antiga" é a data da venda, não o vencimento.
  const vendaIds = clientes.flatMap((c) => c.entries.map((e) => e.sale_id).filter((x): x is string => !!x));
  const vendas = vendaIds.length
    ? await db.emporioSale.findMany({ where: { id: { in: vendaIds } }, select: { id: true, sold_at: true } })
    : [];
  const vendidoEm = new Map(vendas.map((v) => [v.id, v.sold_at]));
  const maisAntiga = (c: (typeof clientes)[number]): Date | null => {
    const datas = c.entries.flatMap((e) => {
      const d = e.sale_id ? vendidoEm.get(e.sale_id) : undefined;
      return d ? [d] : [];
    });
    return datas.length ? datas.reduce((a, b) => (a < b ? a : b)) : null;
  };

  const totalDevido = clientes.reduce((s, c) => s + Math.round(c.owed * 100), 0) / 100;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
          Meu Empório
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Fiado</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          O que cada cliente ainda deve. O recebimento abate das vendas mais antigas primeiro.
        </p>
      </header>

      {clientes.length === 0 ? (
        <EmptyState titulo="Ninguém deve nada no momento">
          As vendas no fiado aparecem aqui, por cliente, até serem recebidas.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-texto">
            Total em aberto: <strong>{reaisBr(totalDevido)}</strong> em {clientes.length}{" "}
            {clientes.length === 1 ? "cliente" : "clientes"}.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Deve</TableHead>
                <TableHead>Venda mais antiga</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Vendas</TableHead>
                {podeEscrever && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => {
                const antiga = maisAntiga(c);
                return (
                  <TableRow key={c.contact_id}>
                    <TableCell className="font-medium text-texto">
                      {c.contact_name}
                      {c.phone && <span className="block text-xs font-normal text-texto-secundario">{c.phone}</span>}
                    </TableCell>
                    <TableCell>
                      {reaisBr(c.owed)}
                      {c.overdue_amount > 0 && (
                        <Badge variant="red" className="ml-2">
                          Vencido {reaisBr(c.overdue_amount)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{antiga ? DATA.format(antiga) : "-"}</TableCell>
                    <TableCell>{c.oldest_due_date ? DATA_UTC.format(new Date(c.oldest_due_date)) : "-"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-wrap gap-x-3">
                        {c.entries.map((e) =>
                          e.sale_id ? (
                            <Link
                              key={e.entry_id}
                              href={`/emporio/vendas/${e.sale_id}`}
                              className="font-medium text-texto-marca hover:underline"
                            >
                              {reaisBr(e.open)}
                            </Link>
                          ) : (
                            <span key={e.entry_id}>{reaisBr(e.open)}</span>
                          ),
                        )}
                      </div>
                    </TableCell>
                    {podeEscrever && (
                      <TableCell>
                        <ReceberFiadoForm
                          contatoId={c.contact_id}
                          contatoNome={c.contact_name}
                          devidoCent={Math.round(c.owed * 100)}
                          lojas={lojas}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
