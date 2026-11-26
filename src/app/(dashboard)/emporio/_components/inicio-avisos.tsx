import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { reaisBr } from "@/lib/numero-br";
import type { AvisoDoInicio } from "@/lib/emporio/inicio";

const ETIQUETA: Record<AvisoDoInicio["coluna"], string> = { gestor: "Gestor", dinheiro: "Financeiro" };

/** "Precisa de você": um item por aviso. Sem aviso, o bloco inteiro some (nada de título vazio). */
export function InicioAvisos({ avisos }: { avisos: AvisoDoInicio[] }) {
  if (avisos.length === 0) return null;
  return (
    <section aria-labelledby="inicio-precisa" className="space-y-2">
      <h2 id="inicio-precisa" className="text-lg font-semibold text-texto">
        Precisa de você
      </h2>
      <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie shadow-sm">
        {avisos.map((a) => (
          <li key={`${a.chave}:${a.href}:${a.texto}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Badge variant="gray" className="shrink-0">
                {ETIQUETA[a.coluna]}
              </Badge>
              <span className="min-w-0 break-words text-sm text-texto">
                {a.texto}
                {a.coluna === "dinheiro" && a.valor !== null && a.valor > 0 && (
                  <>
                    , <span className="whitespace-nowrap font-semibold">{reaisBr(a.valor)}</span>
                  </>
                )}
              </span>
            </div>
            <Link
              href={a.href}
              className="inline-flex min-h-11 items-center text-sm font-medium text-texto-marca hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria sm:min-h-0"
            >
              {a.acao}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
