import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { figuraPorId } from "../_conteudo/figuras";

const PASTA = path.join(process.cwd(), "public", "manual", "emporio");
const URL_BASE = "/manual/emporio";

function existe(arquivo: string): boolean {
  return existsSync(path.join(PASTA, arquivo));
}

/**
 * Uma figura do manual: o print com marcas numeradas e, embaixo, a legenda
 * numerada. Enquanto a imagem não foi gerada, mostra um quadro discreto com a
 * mesma legenda, para a página não quebrar nem ficar com um buraco.
 *
 * Duas imagens: a de computador e a de celular (`-celular`), trocadas por
 * largura de tela. Se só uma existir, ela serve às duas telas.
 */
export function Figura({ id }: { id: string }) {
  const f = figuraPorId(id);
  const temComputador = existe(`${f.id}.png`);
  const temCelular = existe(`${f.id}-celular.png`);
  const srcComputador = temComputador ? `${URL_BASE}/${f.id}.png` : temCelular ? `${URL_BASE}/${f.id}-celular.png` : null;
  const srcCelular = temCelular ? `${URL_BASE}/${f.id}-celular.png` : srcComputador;

  return (
    <figure className="my-6 overflow-hidden rounded-lg border border-borda bg-superficie print:break-inside-avoid">
      {srcComputador && srcCelular ? (
        <div className="border-b border-borda bg-superficie-afundada">
          <Image
            src={srcCelular}
            alt={f.alt}
            width={780}
            height={1400}
            unoptimized
            className="mx-auto h-auto w-full max-w-sm sm:hidden"
          />
          <Image
            src={srcComputador}
            alt={f.alt}
            width={1280}
            height={800}
            unoptimized
            className="hidden h-auto w-full sm:block"
          />
        </div>
      ) : (
        <div
          role="img"
          aria-label={f.alt}
          className="flex min-h-32 flex-col items-center justify-center gap-1 border-b border-dashed border-borda-forte px-4 py-8 text-center"
        >
          <span className="text-sm font-medium text-texto-secundario">Imagem em preparação</span>
          <span className="text-xs text-texto-discreto">Tela: {f.pagina}</span>
        </div>
      )}
      <figcaption className="space-y-3 p-4">
        <p className="text-sm font-medium text-texto">{f.legenda}</p>
        <ol className="space-y-2">
          {f.marcas.map((m) => (
            <li key={m.numero} className="flex gap-3 text-sm text-texto-secundario">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primaria text-xs font-semibold text-sobre-primaria"
              >
                {m.numero}
              </span>
              <span>{m.texto}</span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
