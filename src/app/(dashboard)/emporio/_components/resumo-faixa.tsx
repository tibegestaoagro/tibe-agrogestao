import Link from "next/link";
import { reaisBr } from "@/lib/numero-br";
import { cn } from "@/lib/utils";
import { enderecoComPeriodo } from "./periodo-filtro";

export type CartaoDaFaixa = {
  /** O valor de `?ver=`. */
  chave: string;
  rotulo: string;
  total: number;
  count: number;
  /** Frase curta sob a contagem (o "% do previsto" do Recebido e do Pago, a contagem das sem vencimento). */
  nota?: string;
  /** Vencido e Vencida pedem atenção quando há valor. */
  alerta?: boolean;
};

/**
 * A faixa de cartões de resumo do A receber e do A pagar (Q345). Cada cartão é um link que filtra a
 * tela por `?ver=`; o ativo fica destacado e "Ver tudo" tira o filtro. `params` é o que a tela já
 * carrega na URL (loja, de, ate) e que o clique preserva.
 */
export function ResumoFaixa({
  cartoes,
  ativo,
  caminho,
  params = {},
}: {
  cartoes: CartaoDaFaixa[];
  ativo: string | null;
  caminho: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <section aria-label="Resumo" className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => {
          const selecionado = ativo === c.chave;
          return (
            <Link
              key={c.chave}
              href={enderecoComPeriodo(caminho, { ...params, ver: c.chave }, params.de ?? "", params.ate ?? "")}
              aria-current={selecionado ? "true" : undefined}
              className={cn(
                "block rounded-lg border p-3 transition-colors hover:bg-superficie-afundada",
                selecionado ? "border-primaria-tinta bg-superficie ring-2 ring-primaria-tinta" : "border-borda bg-superficie",
              )}
            >
              <span className="block text-sm font-medium text-texto-secundario">{c.rotulo}</span>
              <span className={cn("block text-xl font-semibold", c.alerta && c.total > 0 ? "text-perigo-tinta" : "text-texto")}>
                {reaisBr(c.total)}
              </span>
              <span className="block text-xs text-texto-secundario">
                {c.count} {c.count === 1 ? "item" : "itens"}
                {c.nota ? `, ${c.nota}` : ""}
              </span>
            </Link>
          );
        })}
      </div>
      {ativo && (
        <Link
          href={enderecoComPeriodo(caminho, { ...params, ver: undefined }, params.de ?? "", params.ate ?? "")}
          className="inline-flex min-h-11 items-center text-sm font-medium text-texto-marca hover:underline sm:min-h-0"
        >
          Ver tudo
        </Link>
      )}
    </section>
  );
}
