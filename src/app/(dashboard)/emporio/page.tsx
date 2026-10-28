import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { precisaReporAction } from "@/lib/actions/emporio-estoque";
import { listarComprasAction } from "@/lib/actions/emporio-compras";
import { listarTransferenciasAction } from "@/lib/actions/emporio-transferencias";
import { listarVendasAction } from "@/lib/actions/emporio-vendas";
import { listarFiadoAction } from "@/lib/actions/emporio-caixa";
import { hasMinRole } from "@/lib/permissions";

/** Meia-noite de hoje em Brasília (sem horário de verão desde 2019), como instante UTC. */
function inicioDoDiaEmBrasilia(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${ymd}T00:00:00-03:00`);
}

/**
 * Meu Empório: o início. Cartões, sem item novo no menu (Q59, Q71).
 *
 * `requireFeaturePage` devolve 404 quando o recurso não é visível para o
 * usuário, como se a rota não existisse.
 */
export default async function EmporioPage() {
  const user = await requireFeaturePage("emporio");
  const podeVender = hasMinRole(user.role, "OPERADOR");
  const ehAdmin = hasMinRole(user.role, "ADMIN");

  const db = await getTenantDb();
  const lojas = await listarEstabelecimentosAction(db, user);
  const estabelecimentos = lojas.ok ? lojas.data.length : 0;
  const produtos = await db.emporioProduct.count({ where: { archived_at: null } });
  const repor = await precisaReporAction(db, user);
  const aRepor = repor.ok ? repor.data.length : 0;
  const pendentes = await listarComprasAction(db, user, { status: "pendente" });
  const comprasPendentes = pendentes.ok ? pendentes.data.length : 0;
  const emTransito = await listarTransferenciasAction(db, user, { status: "em_transito" });
  const transferenciasEmTransito = emTransito.ok ? emTransito.data.length : 0;
  const hoje = await listarVendasAction(db, user, { status: "concluida", de: inicioDoDiaEmBrasilia() });
  const vendasHoje = hoje.ok ? hoje.data.length : 0;
  const fiado = await listarFiadoAction(db, user);
  const clientesNoFiado = fiado.ok ? fiado.data.length : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-texto">Meu Empório</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Suas lojas e o catálogo de produtos que elas vendem.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Cartao
          href="/emporio/estabelecimentos"
          titulo="Estabelecimentos"
          contagem={estabelecimentos}
          singular="estabelecimento"
          plural="estabelecimentos"
        />
        <Cartao
          href="/emporio/produtos"
          titulo="Produtos"
          contagem={produtos}
          singular="produto"
          plural="produtos"
        />
        <Cartao
          href="/emporio/estoque"
          titulo="Estoque"
          contagem={aRepor}
          singular="produto precisa repor"
          plural="produtos precisam repor"
        />
        <Cartao
          href="/emporio/compras"
          titulo="Compras"
          contagem={comprasPendentes}
          singular="compra a receber"
          plural="compras a receber"
        />
        <Cartao
          href="/emporio/transferencias"
          titulo="Transferências"
          contagem={transferenciasEmTransito}
          singular="transferência em trânsito"
          plural="transferências em trânsito"
        />
        {podeVender && <CartaoTexto href="/emporio/vender" titulo="Vender" texto="Abrir o balcão e registrar uma venda" />}
        <Cartao
          href="/emporio/vendas"
          titulo="Vendas"
          contagem={vendasHoje}
          singular="venda hoje"
          plural="vendas hoje"
        />
        <Cartao
          href="/emporio/fiado"
          titulo="Fiado"
          contagem={clientesNoFiado}
          singular="cliente com fiado em aberto"
          plural="clientes com fiado em aberto"
        />
        <CartaoTexto href="/emporio/caixa" titulo="Caixa" texto="Saldo das gavetas e das contas, e os movimentos" />
        {ehAdmin && (
          <CartaoTexto href="/emporio/resultado" titulo="Resultado" texto="Quanto cada loja ganhou no mês e o ponto de equilíbrio" />
        )}
        {ehAdmin && (
          <CartaoTexto href="/emporio/despesas" titulo="Despesas" texto="Contas a pagar, despesas fixas e o Vendeu, Pagou" />
        )}
      </div>
    </div>
  );
}

function CartaoTexto({ href, titulo, texto }: { href: string; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-borda bg-superficie p-5 shadow-sm hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
    >
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <p className="mt-1 text-sm text-texto-secundario">{texto}</p>
    </Link>
  );
}

function Cartao({
  href,
  titulo,
  contagem,
  singular,
  plural,
}: {
  href: string;
  titulo: string;
  contagem: number;
  singular: string;
  plural: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-borda bg-superficie p-5 shadow-sm hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
    >
      <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      <p className="mt-1 text-sm text-texto-secundario">
        {contagem} {contagem === 1 ? singular : plural}
      </p>
    </Link>
  );
}
