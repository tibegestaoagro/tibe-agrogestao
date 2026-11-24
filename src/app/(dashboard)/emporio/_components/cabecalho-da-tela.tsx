import Link from "next/link";
import { AjudaDaTela } from "./ajuda-da-tela";

/**
 * O cabeçalho de toda tela do Empório: caminho clicável (quando há), o único
 * <h1>, o (i) com a apresentação, as ações à direita e, abaixo, o aviso que
 * precisa ficar visível (`children`).
 */
export function CabecalhoDaTela({
  titulo,
  caminho,
  ajuda,
  manual,
  acoes,
  children,
}: {
  titulo: string;
  caminho?: { rotulo: string; href: string }[];
  ajuda?: React.ReactNode;
  manual?: string;
  acoes?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {caminho && caminho.length > 0 && (
          <nav aria-label="Caminho" className="mb-1 text-sm text-texto-secundario">
            {caminho.map((passo) => (
              <span key={passo.href}>
                <Link href={passo.href} className="font-medium text-primaria-tinta hover:underline">
                  {passo.rotulo}
                </Link>
                <span aria-hidden="true"> › </span>
              </span>
            ))}
          </nav>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="break-words text-2xl font-semibold text-texto">{titulo}</h1>
          {ajuda && <AjudaDaTela manual={manual}>{ajuda}</AjudaDaTela>}
        </div>
        {children && <div className="mt-1 text-sm text-texto-secundario">{children}</div>}
      </div>
      {acoes}
    </header>
  );
}
