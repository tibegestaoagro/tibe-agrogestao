import Link from "next/link";
import { CALCULADORAS, GRUPOS } from "@/lib/calculadoras/catalog";

/**
 * Hub da Calculadora Pecuaria: 22 ferramentas de calculo simples. Cada uma e
 * um formulario com poucos campos que devolve um resultado na hora, sem
 * gravar nada no banco. Ver `src/lib/calculadoras/**` para a fonte e o
 * nivel de confianca de cada formula. Lista em `catalog.ts`: tambem usada
 * na grade embutida no dashboard, sem duplicar.
 *
 * §47 do documento do cliente: a tela pergunta "o que voce quer calcular?" e
 * agrupa por necessidade. Com 22 ferramentas, a lista corrida que servia para
 * 12 vira parede.
 */

export default function CalculadorasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-texto">O que você quer calcular?</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Ferramentas de cálculo rápido para o dia a dia da fazenda. Nenhum cálculo aqui é salvo:
          preencha os campos e veja o resultado na hora.
        </p>
      </div>

      {GRUPOS.map((grupo) => {
        const doGrupo = CALCULADORAS.filter((f) => f.grupo === grupo);
        if (doGrupo.length === 0) return null;

        return (
          <section key={grupo} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
              {grupo}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {doGrupo.map((f) => (
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
          </section>
        );
      })}
    </div>
  );
}
