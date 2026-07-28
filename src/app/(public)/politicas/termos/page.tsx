import type { Metadata } from "next";
import PublicNav from "@/components/public/public-nav";
import PublicFooter from "@/components/public/public-footer";
import { PLAN_PRICES } from "@/lib/asaas";
import { TRIAL_DAYS } from "@/lib/billing-access";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Condições de uso da plataforma Tibé: cadastro, planos, cobrança e cancelamento.",
};

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-white">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-tibe-dark">Termos de Uso</h1>
        <p className="mt-2 text-sm text-gray-500">Última atualização: 10 de julho de 2026.</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Sobre o Tibé</h2>
            <p className="mt-2">
              O Tibé é uma plataforma de gestão agropecuária operada por Pleno Digital, oferecida
              como serviço (SaaS) mediante assinatura. Ao criar uma conta, você concorda com estes
              termos e com nossa{" "}
              <a href="/politicas/privacidade" className="text-tibe-primary hover:underline">
                Política de Privacidade
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Cadastro e conta</h2>
            <p className="mt-2">
              Você deve fornecer informações verdadeiras no cadastro e manter sua senha em
              sigilo. A conta é de responsabilidade da empresa cadastrada (CNPJ ou CPF); o usuário
              com papel Owner pode convidar, alterar e desativar outros usuários da mesma conta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Teste grátis</h2>
            <p className="mt-2">
              Novas contas têm acesso completo por {TRIAL_DAYS} dias corridos a partir da criação,
              sem necessidade de cadastrar forma de pagamento. Ao final do período, se nenhum
              plano tiver sido contratado, o acesso segue as mesmas regras de inadimplência
              descritas na cláusula 5.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Planos e cobrança</h2>
            <p className="mt-2">
              Os planos disponíveis são Campo (R$ {PLAN_PRICES.campo}/mês), Fazenda (R${" "}
              {PLAN_PRICES.fazenda}/mês) e Grupo (R$ {PLAN_PRICES.grupo}/mês), cobrados
              mensalmente por assinatura recorrente processada por nosso parceiro Asaas. Você pode
              pagar por PIX, boleto (gerados direto no painel) ou cartão de crédito (via checkout
              seguro do Asaas). Alterações de plano entram em vigor no ciclo seguinte à
              confirmação.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Atraso e suspensão de acesso</h2>
            <p className="mt-2">Em caso de pagamento em atraso, o acesso segue estes estágios:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Até 5 dias de atraso:</strong> acesso completo, sem restrição.</li>
              <li><strong>De 5 a 15 dias:</strong> modo leitura: consulta liberada, cadastro e edição bloqueados.</li>
              <li><strong>Acima de 15 dias:</strong> acesso bloqueado, exceto à página de assinatura para regularização do pagamento.</li>
            </ul>
            <p className="mt-2">O acesso completo é restabelecido automaticamente após a confirmação do pagamento.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Cancelamento</h2>
            <p className="mt-2">
              Você pode cancelar a assinatura a qualquer momento em Configurações → Assinatura,
              sem multa. O cancelamento interrompe cobranças futuras; dados já registrados
              permanecem sujeitos à nossa Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Agente de IA no WhatsApp</h2>
            <p className="mt-2">
              O agente executa ações no sistema (como cadastrar um animal ou registrar uma venda)
              a partir de mensagens enviadas por números de telefone autorizados na sua conta. Você
              é responsável por controlar quais números têm acesso e por revisar as ações
              executadas dessa forma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Uso aceitável</h2>
            <p className="mt-2">
              É proibido usar o Tibé para fins ilícitos, tentar acessar dados de outras contas,
              sobrecarregar deliberadamente a infraestrutura ou fazer engenharia reversa da
              plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Disponibilidade</h2>
            <p className="mt-2">
              Empregamos esforços razoáveis para manter o serviço disponível, mas não garantimos
              operação ininterrupta. Manutenções, falhas de provedores externos (hospedagem,
              WhatsApp, pagamentos) podem causar indisponibilidade temporária.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">10. Propriedade intelectual</h2>
            <p className="mt-2">
              O software, a marca Tibé e seus elementos visuais pertencem à Pleno Digital. Os
              dados que você cadastra pertencem a você; usamos apenas para prestar o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">11. Limitação de responsabilidade</h2>
            <p className="mt-2">
              O Tibé é uma ferramenta de apoio à gestão. Decisões operacionais, financeiras ou
              sanitárias tomadas com base nos dados do sistema são de responsabilidade do usuário.
              Não nos responsabilizamos por perdas indiretas decorrentes de indisponibilidade ou
              uso indevido da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">12. Alterações e legislação aplicável</h2>
            <p className="mt-2">
              Podemos atualizar estes termos, comunicando alterações relevantes pelo painel ou
              email. Estes termos são regidos pela legislação brasileira.
            </p>
          </section>
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
