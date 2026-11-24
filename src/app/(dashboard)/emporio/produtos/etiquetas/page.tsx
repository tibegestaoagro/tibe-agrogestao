import { redirect } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { CabecalhoDaTela } from "../../_components/cabecalho-da-tela";
import { EtiquetasEscolha } from "./_components/etiquetas-escolha";
import { barrasDosFormatos, itensDeEtiqueta, lojasDeEtiqueta } from "./_dados";

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
  const barras = cfg ? barrasDosFormatos(cfg.label_a4, cfg.label_roll) : null;

  return (
    <div className="space-y-6">
      <CabecalhoDaTela
        titulo="Etiquetas"
        caminho={[{ rotulo: "Produtos", href: "/emporio/produtos" }]}
        ajuda="Escolha a loja, o formato e as apresentações. As medidas vêm das Configurações do Empório."
      />
      <EtiquetasEscolha
        lojas={lojas}
        itens={itens}
        formatoPadrao={cfg?.label_default_format ?? "a4"}
        posicoesDaFolha={folha ? folha.columns * folha.rows : 21}
        semBarras={barras?.semBarras ?? { a4: false, rolo: false }}
        alturaMinima={barras?.alturaMinima ?? { a4: null, rolo: null }}
      />
    </div>
  );
}
