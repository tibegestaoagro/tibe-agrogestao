import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { hasMinRole } from "@/lib/permissions";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { listarComprasAction } from "@/lib/actions/emporio-compras";
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
import { CompraForm } from "../_components/compra-form";
import { ReceberCompraBotao, CancelarCompraForm } from "../_components/compra-acoes";
import { ComprasFiltro } from "../_components/compras-filtro";
import { UNIDADE_BASE_SUFIXO, numeroBr } from "../_components/formato";

const FORMA: Record<string, string> = {
  a_vista: "À vista",
  a_prazo: "A prazo",
  parcelada: "Parcelada",
};

const SITUACAO: Record<string, { rotulo: string; variante: "amber" | "green" | "gray" }> = {
  pendente: { rotulo: "Pendente", variante: "amber" },
  recebida: { rotulo: "Recebida", variante: "green" },
  cancelada: { rotulo: "Cancelada", variante: "gray" },
};

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; situacao?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja = "", situacao = "" } = await searchParams;
  const podeEscrever = hasMinRole(user.role, "OPERADOR");
  const ehAdmin = hasMinRole(user.role, "ADMIN");

  const db = await getTenantDb();
  const filtroSituacao =
    situacao === "pendente" || situacao === "recebida" || situacao === "cancelada" ? situacao : undefined;

  const [lojasRes, comprasRes, contatos, produtos] = await Promise.all([
    listarEstabelecimentosAction(db, user),
    listarComprasAction(db, user, { establishment_id: loja || undefined, status: filtroSituacao }),
    podeEscrever
      ? db.contact.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    podeEscrever
      ? db.emporioProduct.findMany({
          where: { archived_at: null },
          select: {
            id: true,
            base_unit: true,
            product: { select: { name: true } },
            presentations: {
              where: { archived_at: null },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const lojas = lojasRes.ok ? lojasRes.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const compras = comprasRes.ok ? comprasRes.data : [];

  const produtosForm = produtos
    .map((p) => ({
      id: p.id,
      name: p.product.name,
      base_unit: p.base_unit,
      apresentacoes: p.presentations,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/emporio" className="text-sm text-texto-secundario hover:text-texto">
            Meu Empório
          </Link>
          <h1 className="text-2xl font-semibold text-texto">Compras</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            O que as lojas compraram dos fornecedores. A conta a pagar nasce junto.
          </p>
        </div>
        {podeEscrever && lojas.length > 0 && (
          <CompraForm
            lojas={lojas}
            fornecedores={contatos}
            produtos={produtosForm}
          />
        )}
      </header>

      <ComprasFiltro lojas={lojas} loja={loja} situacao={filtroSituacao ?? ""} />

      {lojas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma loja cadastrada"
          acao={
            <Link href="/emporio/estabelecimentos" className="text-sm font-medium text-texto-marca hover:underline">
              Ir para Estabelecimentos
            </Link>
          }
        >
          Cadastre uma loja para registrar compras.
        </EmptyState>
      ) : compras.length === 0 ? (
        <EmptyState titulo="Nenhuma compra encontrada">
          {filtroSituacao || loja ? "Mude o filtro para ver outras." : "Registre a primeira compra de uma loja."}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Situação</TableHead>
              {podeEscrever && <TableHead>Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {compras.map((c) => {
              const s = SITUACAO[c.status];
              return (
                <TableRow key={c.id}>
                  <TableCell>{DATA.format(new Date(c.purchased_at))}</TableCell>
                  <TableCell className="font-medium text-texto">{c.establishment_name}</TableCell>
                  <TableCell>{c.contact_name ?? "-"}</TableCell>
                  <TableCell className="max-w-xs text-sm">
                    {c.items
                      .map((i) => {
                        const sufixo = UNIDADE_BASE_SUFIXO[i.base_unit] ?? i.base_unit;
                        return i.presentation_name
                          ? `${numeroBr(i.quantity)} × ${i.presentation_name} de ${i.product_name}`
                          : `${numeroBr(i.quantity)} ${sufixo} de ${i.product_name}`;
                      })
                      .join("; ")}
                  </TableCell>
                  <TableCell>
                    {reaisBr(c.total)}
                    {c.freight > 0 && (
                      <span className="block text-xs text-texto-secundario">com frete de {reaisBr(c.freight)}</span>
                    )}
                  </TableCell>
                  <TableCell>{FORMA[c.payment_kind] ?? c.payment_kind}</TableCell>
                  <TableCell>
                    <Badge variant={s.variante}>{s.rotulo}</Badge>
                    {c.canceled_reason && (
                      <span className="block text-xs text-texto-secundario">{c.canceled_reason}</span>
                    )}
                  </TableCell>
                  {podeEscrever && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {c.status === "pendente" && <ReceberCompraBotao compraId={c.id} />}
                        {ehAdmin && c.status !== "cancelada" && <CancelarCompraForm compraId={c.id} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
