import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CAPITULOS_DO_MANUAL } from "./_conteudo/indice";

export const metadata = { title: "Manual" };

export default function ManualPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-texto">Manual do Tibé</h1>
        <p className="mt-1 text-texto-secundario">
          Aprenda o sistema passo a passo, com as palavras do dia a dia. Escolha um capítulo.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CAPITULOS_DO_MANUAL.map((c) => {
          const miolo = (
            <>
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-texto-discreto" aria-hidden="true" />
                <span className="font-medium text-texto">{c.titulo}</span>
                {!c.href && <Badge variant="gray">Em breve</Badge>}
              </span>
              <span className="mt-1 block text-sm text-texto-secundario">{c.resumo}</span>
            </>
          );
          return (
            <li key={c.slug}>
              {c.href ? (
                <Link href={c.href} className="block h-full rounded-lg border border-borda bg-superficie p-4 hover:border-borda-forte">
                  {miolo}
                </Link>
              ) : (
                <div className="h-full rounded-lg border border-dashed border-borda-forte p-4" aria-disabled="true">
                  {miolo}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
