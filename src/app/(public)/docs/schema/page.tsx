import type { Metadata } from "next";
import { SchemaTable, type TableDoc } from "@/components/public/schema-table";

export const metadata: Metadata = { title: "Schema do banco" };

type Group = { title: string; tables: TableDoc[] };

const GROUPS: Group[] = [
  {
    title: "Núcleo multi-tenant",
    tables: [
      {
        name: "Tenant",
        desc: "Uma empresa cliente. Raiz de todo o isolamento — toda tabela abaixo carrega tenant_id apontando para cá (direta ou indiretamente).",
        fields: [
          ["id, name, document (CNPJ/CPF, único), phone, email", "dados cadastrais"],
          ["plan", "campo | fazenda | grupo"],
          ["status", "trial | active | suspended | canceled"],
          ["trial_ends_at", "fim do período de teste grátis (14 dias a partir do cadastro)"],
          ["lead_source_utm_source/medium/campaign", "origem do lead, se veio de campanha"],
        ],
      },
      {
        name: "PlatformUser",
        desc: "Equipe da Pleno Digital. NÃO carrega tenant_id — vive inteiramente fora do isolamento multi-tenant, por desenho (Módulo 6, ainda não implementado).",
        fields: [
          ["id, name, email (único), password_hash", "credenciais"],
          ["role", "MASTER_ADMIN | EQUIPE"],
          ["active", "desativação sem exclusão"],
        ],
      },
      {
        name: "TenantProfile",
        desc: "Quais 'perfis' de negócio um tenant tem ativos. Um tenant pode ter fazenda e prestador simultaneamente — não são exclusivos.",
        fields: [
          ["tenant_id, profile_type", "fazenda | prestador"],
          ["active", "perfil pode ser desativado sem perder histórico"],
        ],
      },
      {
        name: "User",
        desc: "Uma pessoa com acesso ao painel de um tenant. Email é globalmente único no sistema (não só por tenant) — o login recebe apenas email+senha, sem seletor de empresa.",
        fields: [
          ["tenant_id, name, email (único), password_hash", "credenciais"],
          ["role", "OWNER | ADMIN | OPERADOR | VISUALIZADOR"],
          ["phone", "usado para vincular o WhatsAppContact"],
          ["active", "desativação preserva histórico de ações"],
        ],
      },
      {
        name: "Property",
        desc: "Uma propriedade rural ('fazenda') do tenant. Um tenant pode ter várias.",
        fields: [
          ["tenant_id, name, address, area_hectares", "dados cadastrais"],
          ["archived_at", "arquivamento — nunca deletada, para preservar histórico de animais/talhões vinculados"],
        ],
      },
    ],
  },
  {
    title: "Módulo Rebanho",
    tables: [
      {
        name: "Animal",
        desc: "Um animal individual, identificado por brinco (ear_tag), único por tenant (não por propriedade).",
        fields: [
          ["tenant_id, property_id, ear_tag, breed, sex, birth_date", "dados cadastrais"],
          ["status", "active | sold | deceased"],
          ["current_weight", "atualizado a cada novo AnimalWeightLog"],
        ],
      },
      {
        name: "AnimalWeightLog",
        desc: "Histórico de pesagens de um animal. Usado para calcular o GMD (ganho médio diário) entre as duas últimas pesagens.",
        fields: [["tenant_id, animal_id, weight, measured_at", "uma pesagem"]],
      },
      {
        name: "Vaccine",
        desc: "Catálogo de vacinas do tenant. Populado com aftosa, brucelose, raiva e clostridiose ao ativar o perfil fazenda.",
        fields: [["tenant_id, name, default_interval_days", "intervalo padrão até a próxima dose"]],
      },
      {
        name: "AnimalVaccination",
        desc: "Uma aplicação de vacina em um animal. next_due_at é calculado automaticamente (applied_at + intervalo).",
        fields: [
          ["tenant_id, animal_id, vaccine_id, applied_at, next_due_at", "aplicação e próximo vencimento"],
          ["cost", "opcional — se preenchido, gera uma FinancialEntry de despesa"],
        ],
      },
      {
        name: "AnimalMovement",
        desc: "Compra, venda, transferência entre propriedades ou morte de um animal.",
        fields: [
          ["tenant_id, animal_id, movement_type", "purchase | sale | transfer | death"],
          ["from_property_id, to_property_id", "usados em transferência"],
          ["value", "opcional — venda gera receita, compra gera despesa em FinancialEntry"],
        ],
      },
    ],
  },
  {
    title: "Módulo Lavoura",
    tables: [
      {
        name: "Plot",
        desc: "Um talhão dentro de uma propriedade.",
        fields: [["tenant_id, property_id, name, area_hectares, current_crop", "dados cadastrais"]],
      },
      {
        name: "CropCycle",
        desc: "Um ciclo de plantio→colheita em um talhão. Regra: um talhão só pode ter um ciclo planted/growing ativo por vez.",
        fields: [
          ["tenant_id, plot_id, crop_name, planted_at, expected_harvest_at", "início do ciclo"],
          ["status", "planted | growing | harvested"],
          ["harvested_at, yield_amount, yield_unit", "preenchidos ao registrar a colheita"],
        ],
      },
      {
        name: "PlotInput",
        desc: "Um insumo aplicado durante um ciclo (fertilizante, defensivo, semente).",
        fields: [
          ["tenant_id, cycle_id, input_type", "fertilizer | pesticide | seed"],
          ["name, quantity, unit, cost, applied_at", "detalhes da aplicação — cost gera FinancialEntry"],
        ],
      },
    ],
  },
  {
    title: "Módulo Prestador de Serviço",
    tables: [
      {
        name: "ServiceClient",
        desc: "Um cliente do prestador de serviço (não confundir com o tenant — este é o cliente DO tenant).",
        fields: [["tenant_id, name, document, phone, email, notes", "dados cadastrais"]],
      },
      {
        name: "Service",
        desc: "Um tipo de serviço no catálogo do tenant, com precificação.",
        fields: [
          ["tenant_id, name, pricing_type", "hour | day | fixed"],
          ["unit_price", "editar não afeta ordens já criadas"],
        ],
      },
      {
        name: "ServiceOrder",
        desc: "Um serviço prestado a um cliente. total_value = quantity × unit_price do serviço no momento da criação.",
        fields: [
          ["tenant_id, service_client_id, service_id, quantity, total_value", "o que foi prestado e o valor"],
          ["status", "scheduled → completed → invoiced (sequencial, sem pular etapa)"],
          ["performed_at", "invoiced gera uma FinancialEntry de receita pendente"],
        ],
      },
    ],
  },
  {
    title: "Financeiro (compartilhado)",
    tables: [
      {
        name: "FinancialEntry",
        desc: "Um lançamento financeiro — manual ou gerado automaticamente por outro módulo (venda de animal, insumo com custo, ordem faturada).",
        fields: [
          ["tenant_id, entry_type", "income | expense"],
          ["category, amount, due_date, paid_at, notes", "detalhes do lançamento"],
          ["related_module, related_id", "rebanho | lavoura | servico | geral — origem do lançamento"],
          ["status", "pending | paid | overdue"],
        ],
      },
    ],
  },
  {
    title: "Agente WhatsApp",
    tables: [
      {
        name: "WhatsAppContact",
        desc: "Vínculo entre um número de telefone e um User de um tenant. Criado automaticamente no primeiro contato reconhecido.",
        fields: [["tenant_id, phone, user_id, last_interaction_at", "único por (tenant_id, phone)"]],
      },
      {
        name: "AgentConversationLog",
        desc: "Toda mensagem recebida ou enviada pelo agente. As últimas 5 de cada contato viram contexto de curto prazo enviado ao LLM.",
        fields: [
          ["tenant_id, whatsapp_contact_id, direction", "in | out"],
          ["message_type, content, intent_detected, action_taken", "conteúdo e o que foi entendido/feito"],
        ],
      },
    ],
  },
  {
    title: "Alertas",
    tables: [
      {
        name: "Alert",
        desc: "Um alerta automático gerado pelo job diário. Idempotente por (related_module + related_id + alert_type) — não duplica para o mesmo evento.",
        fields: [
          ["tenant_id, alert_type", "vaccine_due | harvest_near | bill_due | low_balance | trial_ending"],
          ["related_module, related_id, message", "origem e texto pronto para envio"],
          ["status", "pending | sent | dismissed"],
          ["scheduled_for, sent_at", "controle de envio via WhatsApp"],
        ],
      },
    ],
  },
  {
    title: "Cobrança (Asaas)",
    tables: [
      {
        name: "Subscription",
        desc: "A assinatura recorrente de um tenant no Asaas. Um tenant tem no máximo uma (unique tenant_id).",
        fields: [
          ["tenant_id (único), plan", "campo | fazenda | grupo"],
          ["asaas_customer_id, asaas_subscription_id", "IDs no Asaas"],
          ["status", "active | overdue | canceled"],
          ["next_due_date", "atualizado pelo webhook a cada pagamento confirmado"],
        ],
      },
    ],
  },
];

export default function SchemaPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold text-tibe-dark">Schema do banco</h1>
      <p className="mt-3 text-gray-600">
        PostgreSQL via Prisma. Modelos em PascalCase, campos em snake_case (para espelhar
        os contratos de API). Todo modelo de negócio carrega <code className="rounded bg-gray-100 px-1">tenant_id</code> e
        passa pelo middleware de isolamento — exceto os modelos-filho que herdam o tenant via relação com o pai
        (ex: <code className="rounded bg-gray-100 px-1">AnimalWeightLog</code> por <code className="rounded bg-gray-100 px-1">animal_id</code>) e{" "}
        <code className="rounded bg-gray-100 px-1">PlatformUser</code>.
      </p>

      <div className="mt-10 space-y-10">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-lg font-semibold text-tibe-dark">{group.title}</h2>
            <div className="mt-4 space-y-6">
              {group.tables.map((t) => (
                <SchemaTable key={t.name} table={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
