import Link from "next/link";
import type { Metadata } from "next";
import PublicNav from "@/components/public/public-nav";
import PublicFooter from "@/components/public/public-footer";

export const metadata: Metadata = {
  description:
    "Rebanho, lavoura, prestação de serviço e financeiro em um só lugar. Cadastre e consulte pelo WhatsApp. Teste grátis por 14 dias.",
  openGraph: {
    description:
      "Rebanho, lavoura, prestação de serviço e financeiro em um só lugar, com agente de IA no WhatsApp.",
    type: "website",
  },
};

const MODULES = [
  {
    title: "Rebanho",
    desc: "Cadastro de animais, controle de peso, vacinação e movimentação: tudo com histórico completo.",
  },
  {
    title: "Lavoura",
    desc: "Talhões, ciclos de plantio e colheita, insumos, custo por hectare e produtividade.",
  },
  {
    title: "Prestador de Serviço",
    desc: "Clientes, catálogo de serviços e ordens com faturamento automático.",
  },
  {
    title: "Financeiro",
    desc: "Lançamentos, DRE por módulo, fluxo de caixa e relatórios em PDF.",
  },
  {
    title: "Agente no WhatsApp",
    desc: "Cadastre um animal, registre uma venda ou consulte o saldo mandando uma mensagem.",
  },
];

const STEPS = [
  { n: "1", title: "Crie sua conta", desc: "Escolha um plano e cadastre sua empresa em menos de 2 minutos." },
  { n: "2", title: "Configure seu perfil", desc: "Fazenda, prestador de serviço, ou os dois: você decide." },
  { n: "3", title: "Use pelo painel ou pelo WhatsApp", desc: "Cadastre e consulte do jeito que for mais rápido para você." },
];

export default function HomePage() {
  return (
    <main className="bg-white">
      <PublicNav />

      {/* Hero */}
      <section className="bg-tibe-light">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-4xl font-bold text-tibe-dark sm:text-5xl">
            Sua fazenda, sua lavoura e seus clientes: organizados em um só lugar
          </h1>
          <p className="mt-4 text-lg text-gray-700">
            Rebanho, lavoura, prestação de serviço e financeiro. Cadastre e consulte
            pelo painel ou direto pelo WhatsApp.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/criar-conta"
              className="rounded-md bg-primaria px-6 py-3 font-medium text-sobre-primaria transition hover:bg-primaria-hover"
            >
              Começar teste grátis de 14 dias
            </Link>
            <Link
              href="/planos"
              className="rounded-md border border-tibe-primary px-6 py-3 font-medium text-primaria-tinta transition hover:bg-white"
            >
              Ver planos
            </Link>
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold text-tibe-dark">
          Tudo que sua operação precisa
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900">{m.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold text-tibe-dark">Como funciona</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primaria text-lg font-bold text-sobre-primaria">
                  {s.n}
                </span>
                <h3 className="mt-3 font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold text-tibe-dark">Pronto para organizar sua operação?</h2>
        <Link
          href="/criar-conta"
          className="mt-6 inline-block rounded-md bg-primaria px-6 py-3 font-medium text-sobre-primaria transition hover:bg-primaria-hover"
        >
          Começar teste grátis
        </Link>
      </section>

      <PublicFooter />
    </main>
  );
}
