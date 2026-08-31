import type { Metadata } from "next";
import Link from "next/link";
import PublicNav from "@/components/public/public-nav";
import PublicFooter from "@/components/public/public-footer";
import { PLAN_PRICES } from "@/lib/asaas";
import { TRIAL_DAYS } from "@/lib/billing-access";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description:
    "Tire suas dúvidas sobre o Tibé: teste grátis, planos, pagamento, WhatsApp e segurança dos dados.",
};

const FAQS = [
  {
    q: "O que é o Tibé?",
    a: "Uma plataforma de gestão agropecuária que reúne rebanho, lavoura, prestação de serviço e financeiro em um só lugar, com um agente de inteligência artificial no WhatsApp para cadastrar e consultar informações sem precisar abrir o painel.",
  },
  {
    q: `Como funciona o teste grátis de ${TRIAL_DAYS} dias?`,
    a: `Ao criar sua conta você tem acesso completo ao Tibé por ${TRIAL_DAYS} dias, sem precisar cadastrar cartão. Se preferir contratar antes do fim do teste, é só escolher um plano em qualquer momento pelo painel.`,
  },
  {
    q: "Quais são os planos e valores?",
    a: `Campo (R$ ${PLAN_PRICES.campo}/mês), Fazenda (R$ ${PLAN_PRICES.fazenda}/mês) e Grupo (R$ ${PLAN_PRICES.grupo}/mês). Todos podem ser contratados direto pelo painel, sem negociação por telefone ou email.`,
  },
  {
    q: "Quais formas de pagamento são aceitas?",
    a: "PIX e boleto são gerados e pagos direto no painel do Tibé. Para cartão de crédito, você é redirecionado a um checkout seguro do Asaas: assim seus dados de cartão nunca passam pelos nossos servidores.",
  },
  {
    q: "O que acontece se eu atrasar um pagamento?",
    a: "Até 5 dias de atraso o acesso continua completo. Entre 5 e 15 dias o painel fica em modo leitura (você consulta, mas não cadastra ou edita). Após 15 dias o acesso é bloqueado até a regularização: a página de assinatura continua disponível para pagar a qualquer momento.",
  },
  {
    q: "Meus dados ficam isolados dos de outros clientes?",
    a: "Sim. O Tibé é multi-tenant com isolamento por linha desde o schema do banco: cada consulta é automaticamente restrita aos dados da sua empresa, sem exceção.",
  },
  {
    q: "Preciso instalar algum aplicativo?",
    a: "Não. O painel roda no navegador e o agente de IA conversa por WhatsApp, o aplicativo que você já usa.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, o cancelamento é feito direto em Configurações → Assinatura, sem multa ou período de fidelidade.",
  },
] as const;

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-superficie">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-tibe-dark">Perguntas frequentes</h1>
        <p className="mt-2 text-texto-secundario">
          Não achou o que procurava? Fale com a gente em{" "}
          <a href="mailto:contato@tibe.com.br" className="text-primaria-tinta hover:underline">
            contato@tibe.com.br
          </a>
          .
        </p>

        <div className="mt-8 divide-y divide-gray-200 rounded-lg border border-borda">
          {FAQS.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="cursor-pointer list-none font-medium text-texto marker:content-none">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-primaria-tinta group-open:rotate-45 transition-transform">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm text-texto-secundario">{item.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-10 text-center">
          <Link
            href="/criar-conta"
            className="inline-block rounded-md bg-primaria px-6 py-3 font-medium text-sobre-primaria transition hover:bg-primaria-hover"
          >
            Começar teste grátis
          </Link>
        </p>
      </div>
      <PublicFooter />
    </main>
  );
}
