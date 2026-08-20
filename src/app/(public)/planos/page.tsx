import Link from "next/link";
import type { Metadata } from "next";
import PublicNav from "@/components/public/public-nav";
import PublicFooter from "@/components/public/public-footer";
import { PLAN_PRICES, PLAN_SEATS } from "@/lib/asaas";

export const metadata: Metadata = {
  title: "Planos",
  description:
    "Planos Tibé: Campo, Fazenda e Grupo. Escolha o plano ideal para sua operação e comece com 14 dias grátis.",
};

/**
 * Preços e nomes seguem PLAN_PRICES (spec 5.5, "conforme proposta comercial")
 *: mesma fonte usada para criar a assinatura real no Asaas, para nunca
 * divergir do que o cliente efetivamente paga.
 */
/** Assentos viram texto de vitrine a partir de PLAN_SEATS, nunca de número solto. */
function seatFeature(plan: keyof typeof PLAN_SEATS): string {
  const n = PLAN_SEATS[plan];
  return n === 1 ? "1 usuário" : `Até ${n} usuários`;
}

const PLANS = [
  {
    key: "campo",
    name: "Campo",
    price: PLAN_PRICES.campo,
    tagline: "Para o produtor iniciando o controle digital",
    features: [
      seatFeature("campo"),
      "1 propriedade",
      "Rebanho ou lavoura",
      "Financeiro básico",
    ],
    highlight: false,
  },
  {
    key: "fazenda",
    name: "Fazenda",
    price: PLAN_PRICES.fazenda,
    tagline: "Gestão completa de rebanho e lavoura",
    features: [
      seatFeature("fazenda"),
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
    price: PLAN_PRICES.grupo,
    tagline: "Fazenda + prestação de serviço + agente no WhatsApp",
    features: [
      seatFeature("grupo"),
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
    <main className="min-h-screen bg-tibe-light">
      <PublicNav />
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-tibe-dark">Planos</h1>
        <p className="mt-2 text-gray-600">
          Escolha o plano ideal para sua operação. 14 dias grátis, sem cartão.
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
                R$ {plan.price}
                <span className="text-sm font-normal text-gray-500">/mês</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-700">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-primaria-tinta">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/criar-conta?plan=${plan.key}`}
                className={`mt-6 rounded-md px-4 py-2 text-center font-medium transition ${
                  plan.highlight
                    ? "bg-primaria text-sobre-primaria hover:bg-primaria-hover"
                    : "border border-tibe-primary text-primaria-tinta hover:bg-tibe-light"
                }`}
              >
                Contratar
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Já tem conta?{" "}
          <Link href="/login" className="text-primaria-tinta hover:underline">
            Entrar
          </Link>
        </p>
      </div>
      <PublicFooter />
    </main>
  );
}
