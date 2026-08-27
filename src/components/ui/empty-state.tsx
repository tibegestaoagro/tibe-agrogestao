import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio.
 *
 * Existe porque "Nenhum animal registrado ainda." em cinza claro não diz o que
 * fazer em seguida, e é exatamente isso que o produtor vê ao abrir a tela pela
 * primeira vez. Um vazio bom responde duas perguntas: o que aparece aqui, e o
 * que fazer para que apareça.
 *
 * Duas densidades, porque os dois casos existem na mesma tela:
 *
 * - **bloco** (padrão): a região principal da página está vazia. Ganha caixa
 *   tracejada, porque precisa ocupar o espaço que o conteúdo ocuparia, senão a
 *   página parece quebrada.
 * - **compacto**: uma sublista dentro de um cartão está vazia. Sem caixa: um
 *   tracejado dentro de um cartão grita mais que o próprio cartão, e o vazio
 *   passa a chamar mais atenção que o dado ao lado.
 */
export function EmptyState({
  titulo,
  children,
  acao,
  compacto,
  className,
}: {
  titulo: string;
  /** Uma frase curta dizendo o que aparece aqui quando houver dado. */
  children?: React.ReactNode;
  acao?: React.ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  if (compacto) {
    return (
      <div className={cn("py-2 text-sm", className)}>
        <p className="text-texto-secundario">{titulo}</p>
        {children && <p className="mt-0.5 text-xs text-texto-discreto">{children}</p>}
        {acao && <div className="mt-2">{acao}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-borda-forte bg-superficie-afundada px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-medium text-texto">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-texto-secundario">{children}</p>}
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
