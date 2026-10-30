import Link from "next/link";
import { BASE_DO_EMPORIO, vizinhasDe } from "../_conteudo/indice";

export function AnteriorEProximo({ slug }: { slug: string }) {
  const { anterior, proxima } = vizinhasDe(slug);
  return (
    <nav aria-label="Navegar entre as partes" className="mt-10 flex flex-wrap justify-between gap-3 border-t border-borda pt-4 print:hidden">
      {anterior ? (
        <Link href={`${BASE_DO_EMPORIO}/${anterior.slug}`} className="rounded-lg border border-borda bg-superficie px-4 py-3 text-sm hover:border-borda-forte">
          <span className="block text-xs text-texto-discreto">Anterior</span>
          <span className="font-medium text-texto">{anterior.titulo}</span>
        </Link>
      ) : (
        <span />
      )}
      {proxima && (
        <Link href={`${BASE_DO_EMPORIO}/${proxima.slug}`} className="rounded-lg border border-borda bg-superficie px-4 py-3 text-right text-sm hover:border-borda-forte">
          <span className="block text-xs text-texto-discreto">Próximo</span>
          <span className="font-medium text-texto">{proxima.titulo}</span>
        </Link>
      )}
    </nav>
  );
}
