import { existsSync } from "node:fs";
import path from "node:path";
import { animacaoPorId } from "../_conteudo/animacoes";

const PASTA = path.join(process.cwd(), "public", "manual", "emporio");
const URL_BASE = "/manual/emporio";

function existe(arquivo: string): boolean {
  return existsSync(path.join(PASTA, arquivo));
}

/**
 * Uma animação do manual: o GIF de uma tarefa e, embaixo, a legenda com os
 * passos numerados. Irmã da `Figura`. Sem o GIF, mostra o mesmo quadro discreto
 * da figura, para a página não quebrar nem ficar com um buraco.
 *
 * Quem pede menos movimento no aparelho (`prefers-reduced-motion`) recebe o
 * último quadro parado (`<id>.png`), quando ele existe.
 */
export function Animacao({ id }: { id: string }) {
  const a = animacaoPorId(id);
  const temGif = existe(`${a.id}.gif`);
  const temQuadro = existe(`${a.id}.png`);

  return (
    <figure className="my-6 overflow-hidden rounded-lg border border-borda bg-superficie print:break-inside-avoid">
      {temGif ? (
        <div className="border-b border-borda bg-superficie-afundada">
          <picture>
            {temQuadro && (
              <source media="(prefers-reduced-motion: reduce)" srcSet={`${URL_BASE}/${a.id}.png`} />
            )}
            {/* <img> de propósito: o next/image não anima GIF de forma confiável. */}
            <img src={`${URL_BASE}/${a.id}.gif`} alt={a.alt} loading="lazy" className="mx-auto h-auto w-full" />
          </picture>
        </div>
      ) : (
        <div
          role="img"
          aria-label={a.alt}
          className="flex min-h-32 flex-col items-center justify-center gap-1 border-b border-dashed border-borda-forte px-4 py-8 text-center"
        >
          <span className="text-sm font-medium text-texto-secundario">Animação em preparação</span>
          <span className="text-xs text-texto-discreto">Tela: {a.pagina}</span>
        </div>
      )}
      <figcaption className="space-y-3 p-4">
        <p className="text-sm font-medium text-texto">{a.legenda}</p>
        <ol className="space-y-2">
          {a.passos.map((p) => (
            <li key={p.numero} className="flex gap-3 text-sm text-texto-secundario">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primaria text-xs font-semibold text-sobre-primaria"
              >
                {p.numero}
              </span>
              <span>{p.texto}</span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
