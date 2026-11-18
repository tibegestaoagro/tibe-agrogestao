import { notFound } from "next/navigation";
import { requireFeaturePage } from "@/lib/features";
import { getTenantDb } from "@/lib/tenant-context";
import { lerConfiguracoesAction } from "@/lib/actions/emporio-configuracoes";
import { itensDeEtiqueta, lojasDeEtiqueta } from "@/app/(dashboard)/emporio/produtos/etiquetas/_dados";
import {
  EtiquetasFolhaA4,
  EtiquetasRolo,
  type EtiquetaDados,
} from "@/components/emporio/impresso/etiquetas-papel";
import { BotaoImprimir } from "@/components/emporio/impresso/botao-imprimir";
import { AbrirImpressao } from "@/components/emporio/impresso/abrir-impressao";

export const metadata = { title: "Imprimir etiquetas" };

const COPIAS_MAXIMAS = 999;
/** Teto do pedido inteiro: a URL é do navegador e não pode virar milhares de páginas. */
const ETIQUETAS_MAXIMAS = 2000;

function inteiro(texto: string | undefined): number | null {
  return texto && /^\d{1,4}$/.test(texto) ? Number(texto) : null;
}

/**
 * `?loja=<id>&formato=a4|rolo&itens=<presentationId>:<copias>,...&inicio=<n>`.
 * O servidor refaz as contas: a chave `cadastrar_produto` na loja, o preço da
 * loja (apresentação sem preço é ignorada) e as medidas das configurações. O
 * diálogo de impressão abre sozinho ao carregar, porque a escolha já foi feita
 * na tela de etiquetas.
 */
export default async function ImprimirEtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; formato?: string; itens?: string; inicio?: string }>;
}) {
  const user = await requireFeaturePage("emporio");
  const { loja, formato, itens, inicio } = await searchParams;

  const db = await getTenantDb();
  const lojas = await lojasDeEtiqueta(db, user);
  if (!loja || !lojas.some((l) => l.id === loja)) notFound();

  const pedidos: { id: string; copias: number }[] = [];
  for (const parte of (itens ?? "").split(",")) {
    const [id, c] = parte.split(":");
    const copias = inteiro(c);
    if (!id || copias === null || copias < 1) continue;
    pedidos.push({ id, copias: Math.min(copias, COPIAS_MAXIMAS) });
  }

  const config = await lerConfiguracoesAction(db, user);
  if (!config.ok) notFound();
  const cfg = config.data;
  const emRolo = formato === "rolo";

  const dados = await itensDeEtiqueta(
    db,
    [loja],
    pedidos.map((p) => p.id),
  );
  const porId = new Map(dados.map((d) => [d.id, d]));
  const etiquetas: EtiquetaDados[] = [];
  for (const p of pedidos) {
    const d = porId.get(p.id);
    const preco = d?.precos[loja];
    if (!d || preco === undefined) continue;
    for (let k = 0; k < p.copias && etiquetas.length < ETIQUETAS_MAXIMAS; k++) {
      etiquetas.push({ produto: d.produto, apresentacao: d.apresentacao, barcode: d.barcode, preco });
    }
  }

  if (etiquetas.length === 0) {
    return (
      <main className="p-6 text-center">
        <p>Nenhuma etiqueta para imprimir: as apresentações escolhidas estão sem preço nesta loja.</p>
      </main>
    );
  }

  const posicoes = cfg.label_a4.columns * cfg.label_a4.rows;
  const inicioNumero = Math.min(Math.max(inteiro(inicio) ?? 1, 1), posicoes);

  return (
    <main className="p-3 print:p-0">
      <AbrirImpressao />
      <div className="flex justify-center pb-3 print:hidden">
        <BotaoImprimir rotulo="Imprimir etiquetas" />
      </div>
      {emRolo ? (
        <EtiquetasRolo etiquetas={etiquetas} medidas={cfg.label_roll} />
      ) : (
        <EtiquetasFolhaA4 etiquetas={etiquetas} medidas={cfg.label_a4} inicio={inicioNumero} />
      )}
    </main>
  );
}
