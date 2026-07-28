import type { Metadata } from "next";
import PublicNav from "@/components/public/public-nav";
import PublicFooter from "@/components/public/public-footer";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Tibé coleta, usa e protege os dados pessoais de seus usuários, conforme a LGPD.",
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-white">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-tibe-dark">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-gray-500">Última atualização: 10 de julho de 2026.</p>

        <div className="prose-tibe mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">1. Controlador dos dados</h2>
            <p className="mt-2">
              O Tibé é operado por <strong>Pleno Digital</strong> [razão social e CNPJ a
              confirmar], responsável pelo tratamento dos dados pessoais descritos nesta
              política, nos termos da Lei nº 13.709/2018 (LGPD). Dúvidas ou solicitações sobre
              seus dados podem ser enviadas para{" "}
              <a href="mailto:contato@tibe.com.br" className="text-tibe-primary hover:underline">
                contato@tibe.com.br
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">2. Dados que coletamos</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Cadastrais:</strong> nome da empresa, CNPJ/CPF, endereço, telefone e
                email, informados no cadastro da conta.
              </li>
              <li>
                <strong>De usuários:</strong> nome, email, telefone e senha (armazenada com hash,
                nunca em texto puro) de cada pessoa com acesso ao painel.
              </li>
              <li>
                <strong>Operacionais:</strong> os registros que você cadastra no sistema
                (animais, talhões, clientes, ordens de serviço, lançamentos financeiros).
              </li>
              <li>
                <strong>De comunicação:</strong> mensagens trocadas com o agente de IA via
                WhatsApp, usadas para executar as ações solicitadas (ex.: cadastrar um animal).
              </li>
              <li>
                <strong>Financeiros:</strong> dados de cobrança processados por nosso parceiro de
                pagamentos (Asaas). Dados de cartão de crédito não passam pelos servidores do
                Tibé: são inseridos diretamente no checkout do Asaas.
              </li>
              <li>
                <strong>De uso:</strong> logs técnicos de acesso (IP, data/hora, ações
                relevantes), usados para segurança e suporte.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">3. Para que usamos seus dados</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Prestar o serviço contratado (execução do contrato).</li>
              <li>Processar cobranças e identificar inadimplência.</li>
              <li>Enviar alertas e notificações operacionais (ex.: vacina próxima do vencimento, saldo baixo, cobrança pendente).</li>
              <li>Dar suporte e responder solicitações.</li>
              <li>Cumprir obrigações legais e regulatórias, quando aplicável.</li>
              <li>Melhorar a segurança e o funcionamento da plataforma (legítimo interesse).</li>
            </ul>
            <p className="mt-2">
              Não vendemos dados pessoais a terceiros, nem os usamos para publicidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">4. Isolamento entre clientes</h2>
            <p className="mt-2">
              O Tibé é multi-tenant: os dados de cada empresa cliente ficam logicamente isolados
              dos dados de outras empresas clientes desde a camada de banco de dados. Um usuário
              de uma empresa nunca acessa dados de outra por meio do sistema.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">5. Com quem compartilhamos dados</h2>
            <p className="mt-2">Usamos os seguintes operadores para viabilizar o serviço:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Neon</strong>: hospedagem do banco de dados (região São Paulo).</li>
              <li><strong>Vercel</strong>: hospedagem da aplicação web.</li>
              <li><strong>Asaas</strong>: processamento de pagamentos (PIX, boleto e cartão).</li>
              <li><strong>Meta (WhatsApp Business Platform)</strong>: envio e recebimento de mensagens do agente de IA.</li>
              <li><strong>Redis Cloud</strong>: fila de processamento interno.</li>
            </ul>
            <p className="mt-2">
              Cada operador trata os dados apenas na medida necessária para prestar seu serviço
              específico, sob suas próprias políticas de segurança.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">6. Retenção e exclusão</h2>
            <p className="mt-2">
              Mantemos os dados enquanto sua conta estiver ativa e pelo prazo adicional necessário
              para cumprir obrigações legais (ex.: fiscais) após o cancelamento. Você pode
              solicitar a exclusão da sua conta e dos dados associados a qualquer momento pelo
              contato acima, respeitadas as retenções legalmente exigidas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">7. Seus direitos (LGPD, art. 18)</h2>
            <p className="mt-2">Você pode solicitar, a qualquer momento:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Confirmação da existência de tratamento e acesso aos dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
              <li>Portabilidade dos dados a outro fornecedor;</li>
              <li>Eliminação dos dados tratados com base no seu consentimento;</li>
              <li>Informação sobre os agentes com quem seus dados foram compartilhados;</li>
              <li>Revogação do consentimento, quando aplicável.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">8. Segurança</h2>
            <p className="mt-2">
              Senhas são armazenadas com hash (bcrypt), conexões usam HTTPS/TLS, e o acesso ao
              painel exige autenticação. Nenhum sistema é 100% livre de risco, mas adotamos
              práticas de mercado para proteger os dados sob nossa responsabilidade.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">9. Alterações desta política</h2>
            <p className="mt-2">
              Podemos atualizar esta política para refletir mudanças no serviço ou na legislação.
              Alterações relevantes serão comunicadas pelo painel ou por email.
            </p>
          </section>
        </div>
      </div>
      <PublicFooter />
    </main>
  );
}
