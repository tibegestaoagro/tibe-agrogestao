import { cn } from "@/lib/utils";

/**
 * Espera com a forma do que está por vir.
 *
 * Barra girando no meio da tela não diz quanto falta nem o que vem. Pior: ela
 * some e o conteúdo entra de uma vez, empurrando o layout. Num celular, esse
 * salto move o botão que o produtor estava prestes a tocar, e ele toca no
 * errado.
 *
 * Este produto é usado em 3G no interior, onde a espera é longa o bastante
 * para isso acontecer sempre, não de vez em quando.
 *
 * `role="status"` com `aria-live` educado: leitor de tela anuncia que está
 * carregando sem interromper o que a pessoa estiver ouvindo.
 */
export function Carregando({
  linhas = 3,
  className,
}: {
  linhas?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-live="polite">
      <span className="sr-only">Carregando</span>
      {Array.from({ length: linhas }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-12 animate-pulse rounded-md bg-superficie-afundada"
        />
      ))}
    </div>
  );
}
