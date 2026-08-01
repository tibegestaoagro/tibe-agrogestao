import type { Metadata } from "next";

export const metadata: Metadata = { title: "Agente WhatsApp" };

const INTENTS: [string, string, string][] = [
  ["cadastrar_animal", "ear_tag, breed, sex, property (opcional)", "rebanho:write · perfil fazenda"],
  ["registrar_peso", "ear_tag, weight", "rebanho:write · perfil fazenda"],
  ["registrar_vacina", "ear_tag, vaccine_name, cost (opcional)", "rebanho:write · perfil fazenda"],
  ["registrar_movimento", "ear_tag, movement_type, value (opcional)", "rebanho:write · perfil fazenda"],
  ["cadastrar_servico_ordem", "client_name, service_name, quantity", "prestador:write · perfil prestador"],
  ["consultar_saldo", "period (opcional, default mês atual)", "financeiro:read"],
  ["consultar_animal", "ear_tag", "rebanho:read · perfil fazenda"],
  ["consultar_cliente", "client_name", "prestador:read · perfil prestador"],
  ["gerar_relatorio", "tipo (financeiro|rebanho|lavoura|prestador), period", "varia pelo tipo: só financeiro tem PDF pronto"],
  ["ambigua", "nenhum", "sem checagem: pede esclarecimento"],
];

export default function WhatsappDocsPage() {
  return (
    <article className="max-w-3xl space-y-10 text-sm leading-relaxed text-gray-700">
      <div>
        <h1 className="text-3xl font-bold text-tibe-dark">Agente WhatsApp</h1>
        <p className="mt-3 text-gray-600">
          O agente permite cadastrar e consultar dados do Tibé por mensagem de texto livre no WhatsApp. O Tibé
          nunca fala diretamente com a Meta Cloud API: o N8N é o único intermediário nos dois sentidos.
        </p>
        <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Status de infraestrutura:</strong> o código deste módulo está completo e testado, mas a infra
          externa (número Salvy, Meta Business Manager, workflow N8N em produção) ainda não foi provisionada.
          Os endpoints abaixo funcionam e podem ser chamados diretamente para teste.
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Fluxo completo</h2>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
{`1. Usuário manda mensagem no WhatsApp
2. Meta Cloud API entrega o evento ao webhook configurado no N8N
3. N8N normaliza o payload e chama:
     POST /api/internal/whatsapp/resolve-contact  { phone }
   → identifica tenant_id, user_id, role e os perfis ativos
4. N8N chama a API do LLM, enviando:
     - a mensagem do usuário
     - o contexto do tenant (perfis ativos)
     - meta.recent_history (últimas 5 interações, já devolvidas pelo passo 3)
     - a definição das 10 intenções suportadas
5. O LLM classifica a intenção e extrai os parâmetros
6. N8N chama:
     POST /api/internal/whatsapp/execute-action  { tenant_id, user_id, intent, parameters }
   → o Tibé executa a ação (ou pede um dado faltante, ou pede confirmação)
7. N8N envia reply_text de volta ao usuário via Meta Cloud API
8. Se a ação exigia confirmação, o próximo "sim"/"não" do usuário volta ao passo 4,
   e o N8N deve reenviar a MESMA intenção+parâmetros com confirmed: true/false`}
        </pre>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Identificação de contato</h2>
        <p className="mt-2">
          <code className="rounded bg-gray-100 px-1">resolve-contact</code> é o único endpoint do sistema que
          legitimamente busca através de todos os tenants: ele ainda não sabe a quem o telefone pertence. Ele
          busca primeiro um <code className="rounded bg-gray-100 px-1">WhatsAppContact</code> já vinculado; se não
          existir, busca um <code className="rounded bg-gray-100 px-1">User</code> ativo com aquele telefone
          cadastrado em algum tenant e cria o vínculo na hora (esse é o <em>first_contact</em>). Se nenhum User
          tiver aquele telefone, devolve <code className="rounded bg-gray-100 px-1">identified: false</code>: o
          número simplesmente não pertence a ninguém no sistema, e nenhuma ação de escrita pode ser executada.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Intenções suportadas</h2>
        <table className="mt-3 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-3 font-medium">Intenção</th>
              <th className="py-2 pr-3 font-medium">Parâmetros</th>
              <th className="py-2 font-medium">Permissão exigida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {INTENTS.map(([intent, params, perm]) => (
              <tr key={intent}>
                <td className="py-2 pr-3 font-mono text-tibe-dark">{intent}</td>
                <td className="py-2 pr-3 text-gray-600">{params}</td>
                <td className="py-2 text-gray-600">{perm}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3">
          Cada intenção roteia para a mesma função de <code className="rounded bg-gray-100 px-1">lib/actions/*</code> usada
          pelas rotas web equivalentes: não existe lógica de negócio duplicada para o canal WhatsApp. Se um
          parâmetro obrigatório está faltando (ex: cadastrar animal sem sexo) ou é ambíguo (ex: tenant com mais de
          uma propriedade e nenhuma especificada), o agente responde pedindo o dado faltante em vez de
          adivinhar ou falhar silenciosamente.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Confirmação para ações de alto valor</h2>
        <p className="mt-2">
          Venda/compra de animal e ordens de serviço acima de <strong>R$ 5.000</strong> exigem confirmação
          explícita antes de persistir: o agente responde <em>“Confirma a venda do animal 1234 por R$
          6.000,00? Responda ‘sim’ para confirmar”</em> e devolve{" "}
          <code className="rounded bg-gray-100 px-1">requires_confirmation: true</code> junto com os parâmetros
          originais em <code className="rounded bg-gray-100 px-1">auxiliary_data</code>. O N8N deve reenviar a
          mesma intenção com <code className="rounded bg-gray-100 px-1">confirmed: true</code> quando o usuário
          concordar.
        </p>
        <p className="mt-2">
          Como camada de segurança independente do LLM, o Tibé também interpreta “sim”/“não” a partir do texto
          bruto da mensagem (campo <code className="rounded bg-gray-100 px-1">message_text</code>), reconhecendo
          variações como “confirmo”, “isso mesmo”, “pode”, “cancela”, “errado”: mesmo que o N8N não tenha
          resolvido a confirmação sozinho.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Contexto de curto prazo</h2>
        <p className="mt-2">
          Toda mensagem recebida e toda resposta enviada são gravadas em{" "}
          <code className="rounded bg-gray-100 px-1">AgentConversationLog</code>. As últimas 5 interações de cada
          contato voltam em <code className="rounded bg-gray-100 px-1">meta.recent_history</code> na resposta de{" "}
          <code className="rounded bg-gray-100 px-1">resolve-contact</code>: é esse histórico que o N8N deve
          enviar ao LLM para manter continuidade de conversa (ex: entender “e o segundo?” depois de uma lista).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Relatórios pelo WhatsApp</h2>
        <p className="mt-2">
          <code className="rounded bg-gray-100 px-1">gerar_relatorio</code> com{" "}
          <code className="rounded bg-gray-100 px-1">tipo: &quot;financeiro&quot;</code> devolve um link assinado de PDF
          real (mesma função usada pelo botão “Exportar” do painel web). Os tipos{" "}
          <code className="rounded bg-gray-100 px-1">rebanho</code>,{" "}
          <code className="rounded bg-gray-100 px-1">lavoura</code> e{" "}
          <code className="rounded bg-gray-100 px-1">prestador</code> ainda respondem “não disponível”: não há
          gerador de PDF dedicado para eles ainda.
        </p>
      </section>
    </article>
  );
}
