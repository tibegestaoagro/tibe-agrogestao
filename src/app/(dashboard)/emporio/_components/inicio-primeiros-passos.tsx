import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PassoKey, PassoView } from "@/lib/actions/emporio-primeiros-passos";

const ROTULO_DO_PASSO: Record<PassoKey, string> = {
  preco: "Preço de venda",
  estoque_inicial: "Estoque inicial com custo",
  saldo_caixa: "Saldo inicial do caixa",
  taxa_cartao: "Taxa do cartão",
  despesa_fixa: "Despesa fixa",
  minimo_maximo: "Mínimo e máximo",
  conta_pix: "Conta PIX",
};

export type LojaComPendencia = {
  establishment_id: string;
  name: string;
  steps: PassoView[];
  sem_gestor: { href: string; message: string } | null;
};

/** "Primeiros passos": o que falta para o resultado da loja sair confiável. Só entra quando há loja com pendência. */
export function InicioPrimeirosPassos({ lojas }: { lojas: LojaComPendencia[] }) {
  if (lojas.length === 0) return null;
  return (
    <section className="space-y-4 rounded-lg border border-borda bg-superficie p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-texto">Primeiros passos</h2>
        <p className="mt-1 text-sm text-texto-secundario">
          O que falta para o resultado da loja sair confiável. Sem os essenciais, ele sai estimado.
        </p>
      </div>
      {lojas.map((loja) => (
        <div key={loja.establishment_id} className="space-y-3">
          <h3 className="text-sm font-semibold text-texto">{loja.name}</h3>
          <ListaDePassos titulo="Essenciais" passos={loja.steps.filter((s) => s.essential)} />
          <ListaDePassos titulo="Recomendados" passos={loja.steps.filter((s) => !s.essential)} />
          {loja.sem_gestor && (
            <div>
              <Link
                href={loja.sem_gestor.href}
                className="inline-flex min-h-11 items-center text-sm font-medium text-texto hover:underline sm:min-h-0"
              >
                {loja.sem_gestor.message}
              </Link>
              <Badge variant="amber" className="ml-2">
                Recomendado
              </Badge>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function ListaDePassos({ titulo, passos }: { titulo: string; passos: PassoView[] }) {
  if (passos.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">{titulo}</p>
      <ul className="mt-1 divide-y divide-borda">
        {passos.map((p) => (
          <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <Link
                href={p.key === "taxa_cartao" ? "/emporio/configuracoes" : p.href}
                className="inline-flex min-h-11 items-center text-sm font-medium text-texto hover:underline sm:min-h-0"
              >
                {ROTULO_DO_PASSO[p.key]}
              </Link>
              {p.detail && <p className="text-xs text-texto-discreto">{p.detail}</p>}
            </div>
            <Badge variant={p.done ? "green" : "amber"}>{p.done ? "Feito" : "Pendente"}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
