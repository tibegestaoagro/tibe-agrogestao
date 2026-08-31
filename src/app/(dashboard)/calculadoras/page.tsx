import Link from "next/link";
import { CALCULADORAS } from "@/lib/calculadoras/catalog";

/**
 * Hub da Calculadora Pecuaria (Onda 3, agente C2): 12 ferramentas de calculo
 * simples pedidas pelo cliente (Arquitetura Funcional, area 2). Cada uma e
 * um formulario com poucos campos que devolve um resultado na hora, sem
 * gravar nada no banco. Ver `src/lib/calculadoras/**` para a fonte e o
 * nivel de confianca de cada formula. Lista em `catalog.ts` (fase 2 do
 * briefing de layout, docs/design/briefing-novo-layout.md): tambem usada
 * na grade embutida no dashboard, sem duplicar.
 */

export default function CalculadorasPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-texto">Calculadoras</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Ferramentas de calculo rapido para o dia a dia da fazenda. Nenhum calculo aqui e salvo:
          preencha os campos e veja o resultado na hora.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULADORAS.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="rounded-lg border border-borda bg-superficie p-4 transition hover:border-tibe-primary hover:shadow-sm"
          >
            <p className="font-medium text-texto">{f.title}</p>
            <p className="mt-1 text-sm text-texto-secundario">{f.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
