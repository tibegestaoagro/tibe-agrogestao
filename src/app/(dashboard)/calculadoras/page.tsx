import Link from "next/link";

/**
 * Hub da Calculadora Pecuaria (Onda 3, agente C2): 12 ferramentas de calculo
 * simples pedidas pelo cliente (Arquitetura Funcional, area 2). Cada uma e
 * um formulario com poucos campos que devolve um resultado na hora, sem
 * gravar nada no banco. Ver `src/lib/calculadoras/**` para a fonte e o
 * nivel de confianca de cada formula.
 */

const FERRAMENTAS: { href: string; title: string; description: string }[] = [
  { href: "/calculadoras/cerca", title: "Cerca", description: "Mouroes e arame necessarios para uma cerca." },
  {
    href: "/calculadoras/pastagem",
    title: "Pastagem",
    description: "Capacidade de suporte da pastagem e area necessaria para o rebanho.",
  },
  {
    href: "/calculadoras/lotacao",
    title: "Lotacao",
    description: "Taxa de lotacao atual (UA/ha) do rebanho numa area.",
  },
  {
    href: "/calculadoras/sal-mineral",
    title: "Sal mineral",
    description: "Consumo estimado de sal mineral por animal e por periodo.",
  },
  {
    href: "/calculadoras/racao",
    title: "Racao / volumoso",
    description: "Necessidade diaria de materia seca e de alimento in natura.",
  },
  { href: "/calculadoras/agua", title: "Agua", description: "Consumo estimado de agua do rebanho." },
  {
    href: "/calculadoras/cocho",
    title: "Cocho (sal mineral)",
    description: "Comprimento de cocho necessario para o rebanho.",
  },
  {
    href: "/calculadoras/adubacao",
    title: "Adubacao",
    description: "Converte uma dose recomendada de nutriente em quantidade de adubo a comprar.",
  },
  {
    href: "/calculadoras/calagem",
    title: "Calagem",
    description: "Necessidade de calcario pelo metodo da saturacao por bases.",
  },
  {
    href: "/calculadoras/mao-de-obra",
    title: "Mao de obra",
    description: "Quantos funcionarios sao necessarios, a partir da capacidade da sua operacao.",
  },
  {
    href: "/calculadoras/maquinas-combustivel",
    title: "Maquinas e combustivel",
    description: "Total de combustivel e custo, a partir do consumo da sua maquina.",
  },
  {
    href: "/calculadoras/compra-venda-gado",
    title: "Compra e venda de gado (simulacao)",
    description: "Simulacao de arrobas e margem: nao integra com o rebanho real.",
  },
];

export default function CalculadorasPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Calculadoras</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ferramentas de calculo rapido para o dia a dia da fazenda. Nenhum calculo aqui e salvo:
          preencha os campos e veja o resultado na hora.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FERRAMENTAS.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="rounded-lg border border-gray-200 bg-white p-4 transition hover:border-tibe-primary hover:shadow-sm"
          >
            <p className="font-medium text-gray-900">{f.title}</p>
            <p className="mt-1 text-sm text-gray-600">{f.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
