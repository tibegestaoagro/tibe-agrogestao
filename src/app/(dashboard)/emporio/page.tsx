import Link from "next/link";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { listarEstabelecimentosAction } from "@/lib/actions/emporio-catalogo";
import { precisaReporAction } from "@/lib/actions/emporio-estoque";
import { listarComprasAction } from "@/lib/actions/emporio-compras";
import { listarTransferenciasAction } from "@/lib/actions/emporio-transferencias";

/**
 * Meu Empório: o início. Cinco cartões, sem item novo no menu (Q59, Q71).
 *
 * `requireFeaturePage` devolve 404 quando o recurso não é visível para o
 * usuário, como se a rota não existisse.
 */
export default async function EmporioPage() {
  const user = await requireFeaturePage("emporio");

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
      </div>
    </div>
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
