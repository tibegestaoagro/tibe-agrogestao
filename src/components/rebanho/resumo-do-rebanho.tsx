import type { HerdSummary } from "@/lib/herd/summary";

/**
 * Os cinco números do complemento do Rebanho.
 *
 * Eles NÃO são cinco indicadores independentes, e por isso não são cinco
 * cartões iguais: são uma identidade. Próprio = na fazenda + fora +
 * desaparecidos, e o total físico da propriedade = na fazenda + de terceiros.
 * Cartões lado a lado esconderiam justamente a relação que o documento do
 * cliente pediu para ficar visível ("para evitar que o sistema mostre um total
 * errado").
 *
 * O painel CRESCE com a complexidade da fazenda. Quem não tem boitel, nem
 * pasto de terceiro, nem animal sumido lê um número só, que é o que ele tem.
 * A decomposição aparece quando há o que decompor, e a linha de ocupação
 * física aparece quando há animal de terceiro; sem eles, ela repetiria "na
 * fazenda" com outro nome.
 *
 * A barra é conteúdo, não enfeite: é ela que mostra a proporção entre estar
 * aqui, estar fora e ter sumido, sem obrigar a comparar números.
 */

const numero = (n: number) => n.toLocaleString("pt-BR");

function Parte({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${cor}`} aria-hidden="true" />
      <span className="text-sm text-texto-secundario">{rotulo}</span>
      <span className="ml-auto tabular-nums text-sm font-medium text-texto">{numero(valor)}</span>
    </div>
  );
}

export function ResumoDoRebanho({ resumo }: { resumo: HerdSummary }) {
  const { total, na_fazenda, fora, desaparecidos, de_terceiros, total_fisico } = resumo;
  const temDecomposicao = fora > 0 || desaparecidos > 0;
  const largura = (parte: number) => (total > 0 ? `${(parte / total) * 100}%` : "0%");

  return (
    <section
      aria-label="Resumo do rebanho"
      className="rounded-lg border border-borda bg-superficie p-4"
    >
      <p className="text-sm text-texto-secundario">Rebanho próprio</p>
      <p className="mt-0.5 text-3xl font-semibold tabular-nums text-texto">
        {numero(total)}
        <span className="ml-2 text-base font-normal text-texto-discreto">
          {total === 1 ? "cabeça" : "cabeças"}
        </span>
      </p>

      {temDecomposicao && (
        <>
          <div
            className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-superficie-afundada"
            aria-hidden="true"
          >
            <div className="bg-primaria" style={{ width: largura(na_fazenda) }} />
            <div className="bg-acento" style={{ width: largura(fora) }} />
            <div className="bg-perigo" style={{ width: largura(desaparecidos) }} />
          </div>

          <div className="mt-3 space-y-1.5">
            <Parte rotulo="Na fazenda" valor={na_fazenda} cor="bg-primaria" />
            <Parte rotulo="Fora, e voltam" valor={fora} cor="bg-acento" />
            {desaparecidos > 0 && (
              <Parte rotulo="Desaparecidos" valor={desaparecidos} cor="bg-perigo" />
            )}
          </div>
        </>
      )}

      {de_terceiros > 0 && (
        <p className="mt-4 border-t border-borda pt-3 text-sm text-texto-secundario">
          Na propriedade hoje há{" "}
          <span className="tabular-nums font-medium text-texto">{numero(total_fisico)}</span>{" "}
          cabeças para tratar, contando{" "}
          <span className="tabular-nums font-medium text-texto">{numero(de_terceiros)}</span> de
          terceiros.
        </p>
      )}
    </section>
  );
}
