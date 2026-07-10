import Link from "next/link";

/**
 * Página de planos: preços e limites são ilustrativos por enquanto (cobrança
 * real via Asaas entra no Módulo 5). O botão "Contratar" já cria uma conta de
 * verdade (Tenant + Owner, status=trial) via /criar-conta — construído para
 * destravar testes do painel antes do restante do produto estar pronto.
 */

const PLANS = [
  {
    key: "campo",
    name: "Campo",
    price: "R$ 149",
    tagline: "Para o produtor iniciando o controle digital",
    features: ["1 propriedade", "Rebanho ou lavoura", "Financeiro básico"],
    highlight: false,
  },
  {
    key: "fazenda",
    name: "Fazenda",
    price: "R$ 299",
    tagline: "Gestão completa de rebanho e lavoura",
    features: [
      "Propriedades ilimitadas",
      "Rebanho e lavoura completos",
      "Financeiro e alertas",
      "Relatórios",
    ],
    highlight: true,
  },
  {
    key: "grupo",
    name: "Grupo",
    price: "R$ 549",
    tagline: "Fazenda + prestação de serviço + agente no WhatsApp",
    features: [
      "Tudo do plano Fazenda",
      "Módulo de prestador de serviço",
      "Agente de IA no WhatsApp",
      "Suporte prioritário",
    ],
    highlight: false,
  },
] as const;

export default function PlanosPage() {
  return (
    <main className="min-h-screen bg-tibe-light px-4 py-16">
      <div className="mx-auto max-w-5xl text-center">
        <h1 className="text-3xl font-bold text-tibe-dark">Planos</h1>
        <p className="mt-2 text-gray-600">
          Escolha o plano ideal para sua operação. Valores ilustrativos.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`flex flex-col rounded-xl border bg-white p-6 text-left shadow-sm ${
                plan.highlight ? "border-tibe-primary ring-1 ring-tibe-primary" : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <span className="mb-2 w-fit rounded-full bg-tibe-light px-3 py-1 text-xs font-medium text-tibe-dark">
                  Mais popular
                </span>
              )}
              <h2 className="text-xl font-semibold text-gray-900">{plan.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>
              <p className="mt-4 text-3xl font-bold text-tibe-dark">
                {plan.price}
                <span className="text-sm font-normal text-gray-500">/mês</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-700">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-tibe-primary">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/criar-conta?plan=${plan.key}`}
                className={`mt-6 rounded-md px-4 py-2 text-center font-medium transition ${
                  plan.highlight
                    ? "bg-tibe-primary text-white hover:bg-tibe-dark"
                    : "border border-tibe-primary text-tibe-primary hover:bg-tibe-light"
                }`}
              >
                Contratar
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Já tem conta?{" "}
          <Link href="/login" className="text-tibe-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
