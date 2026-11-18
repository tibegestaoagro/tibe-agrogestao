import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { EtiquetasEscolha } from "./_components/etiquetas-escolha";
import { itensDeEtiqueta, lojasDeEtiqueta } from "./_dados";

export const metadata = { title: "Etiquetas" };

/**
 * Etiquetas de prateleira (Q360). Só entra quem tem a chave `cadastrar_produto`
 * em alguma loja; quem não tem volta ao Empório, como o Caixa na lista de Produtos.
 */
export default async function EtiquetasPage() {
  const user = await requireFeaturePage("emporio");
  const db = await getTenantDb();
  const lojas = await lojasDeEtiqueta(db, user);
  if (lojas.length === 0) redirect("/emporio");

  const [itens, config] = await Promise.all([
    itensDeEtiqueta(db, lojas.map((l) => l.id)),
    lerConfiguracoesAction(db, user),
  ]);
  const cfg = config.ok ? config.data : null;
  const folha = cfg?.label_a4;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/emporio/produtos" className="text-sm text-texto-secundario hover:text-texto">
          Produtos
        </Link>
        <h1 className="text-2xl font-semibold text-texto">Etiquetas</h1>
        <p className="text-sm text-texto-secundario">
          Escolha a loja, o formato e as apresentações. As medidas vêm das Configurações do Empório.
        </p>
      </header>
      <EtiquetasEscolha
        lojas={lojas}
        itens={itens}
        formatoPadrao={cfg?.label_default_format ?? "a4"}
        posicoesDaFolha={folha ? folha.columns * folha.rows : 21}
      />
    </div>
  );
}
