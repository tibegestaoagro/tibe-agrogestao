import type { Metadata } from "next";
import { EndpointCard, type Endpoint } from "@/components/public/endpoint-card";

export const metadata: Metadata = { title: "API" };

type Group = { title: string; note?: string; endpoints: Endpoint[] };

const GROUPS: Group[] = [
  {
    title: "Autenticação e conta",
    note: "Login não é uma rota /api/v1 própria: usa o fluxo padrão do NextAuth (signIn(\"credentials\", {...}) no client, contra /api/auth/callback/credentials). A sessão resultante carrega tenant_id e role.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/signup",
        auth: "Público (cria a sessão implicitamente, o login em seguida é feito pelo client)",
        description: "Cadastro self-service: cria um Tenant em status trial (14 dias) e o User owner correspondente. Usado pelo botão \"Começar teste grátis\" do site público.",
        request: `{
  "company_name": "Fazenda Boa Vista",
  "document": "12345678000199",
  "phone": "22999990000",
  "plan": "fazenda",
  "owner_name": "Maria Silva",
  "owner_email": "maria@fazendaboavista.com.br",
  "password": "senha-forte-123"
}`,
        response: `201
{ "data": { "tenant_id": "cl...", "email": "maria@fazendaboavista.com.br" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/v1/tenant/profiles",
        auth: "Sessão · OWNER/ADMIN",
        description: "Ativa (ou reativa) um perfil de negócio do tenant. Idempotente. Ativar 'fazenda' provisiona o catálogo padrão de vacinas.",
        request: `{ "profile_type": "fazenda" }`,
        response: `201
{ "data": { "id": "cl...", "profile_type": "fazenda", "active": true, "created_at": "2026-07-10T12:00:00.000Z" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/tenant",
        auth: "Sessão · usuarios:write",
        description: "Edita dados cadastrais do tenant (nome, documento, telefone, email).",
        request: `{ "name": "Fazenda Boa Vista LTDA", "document": "12345678000199", "phone": "22999990000", "email": "contato@fazendaboavista.com.br" }`,
        response: `200
{ "data": { "id": "cl...", "name": "...", "document": "...", "phone": "...", "email": "..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Usuários",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/users",
        auth: "Sessão · usuarios:read",
        description: "Lista os usuários do tenant. `meta.seats` traz o uso de assentos do plano (usuários ativos contra o limite).",
        response: `200
{ "data": [{ "id": "cl...", "name": "...", "email": "...", "phone": "...", "role": "OPERADOR", "active": true, "created_at": "..." }], "meta": { "total": 1, "seats": { "used": 1, "limit": 2, "has_room": true } } }`,
      },
      {
        method: "POST",
        path: "/api/v1/users",
        auth: "Sessão · usuarios:write",
        description: "Convida um novo usuário: cria o User com senha temporária (exibida uma única vez na resposta: não há envio de email neste ambiente). Só Owner pode convidar outro Owner. Respeita o limite de assentos do plano (campo 1, fazenda 2, grupo 5): devolve `SEAT_LIMIT_REACHED` (422) quando o limite de usuários ativos já foi atingido.",
        request: `{ "name": "João Souza", "email": "joao@fazendaboavista.com.br", "phone": "22988887777", "role": "OPERADOR" }`,
        response: `201
{ "data": { "id": "cl...", "temp_password": "Xy9k2Qmz" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/users/:id/role",
        auth: "Sessão · usuarios:write",
        description: "Altera o papel de um usuário. Não é possível alterar o próprio papel, nem promover a Owner sem ser Owner.",
        request: `{ "role": "ADMIN" }`,
        response: `200
{ "data": { "id": "cl...", "role": "ADMIN" }, "meta": {} }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/users/:id/active",
        auth: "Sessão · usuarios:write",
        description: "Ativa ou desativa um usuário (nunca deleta: preserva histórico de ações). Não é possível desativar a própria conta. Desativar sempre é permitido e libera um assento; reativar consome um assento e devolve `SEAT_LIMIT_REACHED` (422) se o plano já estiver no limite.",
        request: `{ "active": false }`,
        response: `200
{ "data": { "id": "cl...", "active": false }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Rebanho: Propriedades",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/properties",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista propriedades. ?include_archived=true inclui as arquivadas (excluídas por padrão).",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sede", "address": "...", "area_hectares": 120.5, "archived_at": null }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/properties",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra propriedade.",
        request: `{ "name": "Sede", "address": "Rodovia BR-101, km 42", "area_hectares": 120.5 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Sede", "area_hectares": 120.5, "archived_at": null } }`,
      },
      {
        method: "GET",
        path: "/api/v1/properties/:id",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Detalhe da propriedade.",
        response: `200
{ "data": { "id": "cl...", "name": "Sede", "address": "...", "area_hectares": 120.5 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/properties/:id",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Edita propriedade.",
        request: `{ "name": "Sede Nova" }`,
        response: `200
{ "data": { "id": "cl...", "name": "Sede Nova" } }`,
      },
      {
        method: "POST",
        path: "/api/v1/properties/:id/archive",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Arquiva a propriedade (não deleta, preserva histórico de animais/talhões). Idempotente.",
        response: `200
{ "data": { "id": "cl...", "archived_at": "2026-07-10T12:00:00.000Z" } }`,
      },
    ],
  },
  {
    title: "Rebanho: Animais",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/animals",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Lista animais. Filtros: property_id, status, breed, q (busca por brinco).",
        response: `200
{ "data": [{ "id": "cl...", "ear_tag": "1234", "breed": "Nelore", "sex": "male", "status": "active", "current_weight": 380.5, "property_name": "Sede", "last_vaccination_at": "2026-05-01T00:00:00.000Z" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cadastra animal. ear_tag é único por tenant (não por propriedade).",
        request: `{ "ear_tag": "1234", "breed": "Nelore", "sex": "male", "property_id": "cl...", "birth_date": "2025-01-10T00:00:00.000Z", "initial_weight": 35 }`,
        response: `201
{ "data": { "id": "cl...", "ear_tag": "1234", "status": "active", "current_weight": 35 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Detalhe do animal.",
        response: `200
{ "data": { "id": "cl...", "ear_tag": "1234", "breed": "Nelore", "property_name": "Sede", "current_weight": 380.5 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/animals/:id",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Edita dados cadastrais. Valida nova propriedade e unicidade de brinco, se alterados.",
        request: `{ "breed": "Nelore PO" }`,
        response: `200
{ "data": { "id": "cl...", "breed": "Nelore PO" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/weight-logs",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico de pesagens, ordenado por data, com GMD (ganho médio diário) calculado.",
        response: `200
{ "data": [{ "id": "cl...", "weight": 380.5, "measured_at": "..." }], "meta": { "gmd": 0.62, "current_weight": 380.5 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals/:id/weight-logs",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra pesagem. Atualiza current_weight do animal e recalcula o GMD.",
        request: `{ "weight": 380.5, "measured_at": "2026-07-01T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "weight": 380.5 }, "meta": { "current_weight": 380.5, "gmd": 0.62 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/vaccinations",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico de vacinação do animal.",
        response: `200
{ "data": [{ "id": "cl...", "vaccine_name": "Aftosa", "applied_at": "...", "next_due_at": "..." }], "meta": { "count": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals/:id/vaccinations",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra aplicação. next_due_at = applied_at + intervalo (da vacina ou customizado). cost, se informado, gera FinancialEntry de despesa.",
        request: `{ "vaccine_id": "cl...", "applied_at": "2026-07-01T00:00:00.000Z", "cost": 12.5 }`,
        response: `201
{ "data": { "id": "cl...", "applied_at": "...", "next_due_at": "..." } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/movements",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Histórico de movimentações do animal.",
        response: `200
{ "data": [{ "id": "cl...", "movement_type": "sale", "value": 4500, "occurred_at": "..." }], "meta": { "count": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/animals/:id/movements",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Registra compra, venda, transferência ou morte. Venda/morte atualizam status; transferência atualiza property_id; value gera FinancialEntry (receita na venda, despesa na compra).",
        request: `{ "movement_type": "sale", "value": 4500, "occurred_at": "2026-07-05T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "movement_type": "sale", "value": 4500 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/animals/:id/cost-summary",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Soma as despesas (FinancialEntry) vinculadas ao animal e calcula o custo médio mensal desde a entrada na propriedade (data de compra, ou cadastro se não houver).",
        response: `200
{ "data": { "animal_id": "cl...", "total_cost": 245.0, "monthly_avg_cost": 40.83, "since": "...", "months": 6.0 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/vaccines",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Catálogo de vacinas do tenant.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Aftosa", "default_interval_days": 180 }], "meta": { "total": 4 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/vaccines",
        auth: "Sessão · rebanho:write · perfil fazenda",
        description: "Cria vacina personalizada no catálogo do tenant.",
        request: `{ "name": "Raiva bovina", "default_interval_days": 365 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Raiva bovina", "default_interval_days": 365 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/vaccinations/upcoming",
        auth: "Sessão · rebanho:read · perfil fazenda",
        description: "Vacinações vencendo nos próximos 15 dias. Alimenta o card do dashboard e o job de alertas.",
        response: `200
{ "data": [{ "animal_id": "cl...", "ear_tag": "1234", "vaccine_name": "Aftosa", "next_due_at": "...", "days_remaining": 6 }] }`,
      },
    ],
  },
  {
    title: "Lavoura: Talhões e ciclos",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/plots",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Lista talhões, com o ciclo ativo (se houver) embutido.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Talhão 1", "area_hectares": 40, "property_name": "Sede", "active_cycle": { "id": "cl...", "crop_name": "Soja", "status": "growing" } }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/plots",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Cadastra talhão. Rejeita propriedade arquivada.",
        request: `{ "name": "Talhão 1", "area_hectares": 40, "property_id": "cl..." }`,
        response: `201
{ "data": { "id": "cl...", "name": "Talhão 1", "area_hectares": 40 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/plots/:id",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Detalhe do talhão: ciclo ativo e histórico completo de ciclos.",
        response: `200
{ "data": { "id": "cl...", "name": "Talhão 1", "active_cycle": { "id": "cl...", "status": "growing" }, "cycles": [ { "id": "cl...", "status": "growing" } ] } }`,
      },
      {
        method: "GET",
        path: "/api/v1/plots/:id/cycles",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Lista os ciclos do talhão.",
        response: `200
{ "data": [{ "id": "cl...", "crop_name": "Soja", "status": "growing" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/plots/:id/cycles",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Inicia novo ciclo. Rejeita se o talhão já tem um ciclo planted/growing ativo.",
        request: `{ "crop_name": "Soja", "planted_at": "2026-09-01T00:00:00.000Z", "expected_harvest_at": "2027-01-15T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "crop_name": "Soja", "status": "planted" } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/cycles/:id/harvest",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Registra colheita. Muda status para harvested.",
        request: `{ "harvested_at": "2027-01-20T00:00:00.000Z", "yield_amount": 2400, "yield_unit": "saca" }`,
        response: `200
{ "data": { "id": "cl...", "status": "harvested", "yield_amount": 2400, "yield_unit": "saca" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/cycles/:id/summary",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Custo total de insumos, custo por hectare, e produtividade por hectare (se já colhido).",
        response: `200
{ "data": { "total_input_cost": 3200, "area_hectares": 40, "cost_per_hectare": 80, "yield_amount": 2400, "productivity_per_hectare": 60 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/cycles/:id/inputs",
        auth: "Sessão · lavoura:read · perfil fazenda",
        description: "Lista insumos aplicados no ciclo.",
        response: `200
{ "data": [{ "id": "cl...", "input_type": "fertilizer", "name": "NPK 04-14-08", "cost": 1800 }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/cycles/:id/inputs",
        auth: "Sessão · lavoura:write · perfil fazenda",
        description: "Registra insumo aplicado. cost, se informado, gera FinancialEntry de despesa.",
        request: `{ "input_type": "fertilizer", "name": "NPK 04-14-08", "quantity": 800, "unit": "kg", "cost": 1800 }`,
        response: `201
{ "data": { "id": "cl...", "name": "NPK 04-14-08", "cost": 1800 } }`,
      },
    ],
  },
  {
    title: "Prestador de Serviço",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/service-clients",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Lista clientes. ?q= busca por nome ou telefone.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Sítio Esperança", "phone": "22988884444" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-clients",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Cadastra cliente do prestador.",
        request: `{ "name": "Sítio Esperança", "document": "12345678900", "phone": "22988884444", "email": null, "notes": null }`,
        response: `201
{ "data": { "id": "cl...", "name": "Sítio Esperança" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/service-clients/:id/summary",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Total faturado (ordens invoiced), total pendente (completed não faturadas) e histórico. Usado também pelo agente WhatsApp (\"quanto o cliente X me deve\").",
        response: `200
{ "data": { "client_id": "cl...", "client_name": "Sítio Esperança", "total_invoiced": 1200, "total_pending": 300, "orders_count": 4, "last_order_at": "..." } }`,
      },
      {
        method: "GET",
        path: "/api/v1/services",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Catálogo de serviços do tenant.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Diária de trator", "pricing_type": "day", "unit_price": 450 }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/services",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Cadastra tipo de serviço.",
        request: `{ "name": "Diária de trator", "pricing_type": "day", "unit_price": 450 }`,
        response: `201
{ "data": { "id": "cl...", "name": "Diária de trator", "unit_price": 450 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/services/:id",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Edita valor/nome/tipo. Não afeta ordens já registradas (o valor é gravado na ordem no momento da criação).",
        request: `{ "unit_price": 480 }`,
        response: `200
{ "data": { "id": "cl...", "unit_price": 480 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/service-orders",
        auth: "Sessão · prestador:read · perfil prestador",
        description: "Lista ordens. Filtros: status, service_client_id.",
        response: `200
{ "data": [{ "id": "cl...", "client_name": "Sítio Esperança", "service_name": "Diária de trator", "total_value": 450, "status": "completed" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/service-orders",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Registra ordem. total_value = quantity × unit_price do serviço. Status inicial: scheduled (data futura) ou completed (hoje/passado).",
        request: `{ "service_client_id": "cl...", "service_id": "cl...", "quantity": 1, "performed_at": "2026-07-08T00:00:00.000Z" }`,
        response: `201
{ "data": { "id": "cl...", "total_value": 450, "status": "completed" } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/service-orders/:id/status",
        auth: "Sessão · prestador:write · perfil prestador",
        description: "Transição sequencial estrita scheduled → completed → invoiced. Ao chegar em invoiced, gera FinancialEntry de receita (pending, due_date = performed_at).",
        request: `{ "status": "invoiced" }`,
        response: `200
{ "data": { "id": "cl...", "status": "invoiced" } }`,
      },
    ],
  },
  {
    title: "Financeiro",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/financial-entries",
        auth: "Sessão · financeiro:read",
        description: "Lista lançamentos. Filtros: start, end (sobre due_date), entry_type, category, related_module, status.",
        response: `200
{ "data": [{ "id": "cl...", "entry_type": "expense", "category": "Insumo (fertilizer) - NPK", "amount": 1800, "status": "pending" }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/v1/financial-entries",
        auth: "Sessão · financeiro:write",
        description: "Lançamento manual (related_module sempre \"geral\": lançamentos de outros módulos são criados automaticamente pelas próprias ações daquele módulo).",
        request: `{ "entry_type": "expense", "category": "Combustível", "amount": 350, "due_date": "2026-07-15T00:00:00.000Z", "notes": null }`,
        response: `201
{ "data": { "id": "cl...", "entry_type": "expense", "amount": 350, "status": "pending" } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-entries/:id",
        auth: "Sessão · financeiro:write",
        description: "Edita lançamento manual.",
        request: `{ "amount": 380 }`,
        response: `200
{ "data": { "id": "cl...", "amount": 380 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/financial-entries/:id/pay",
        auth: "Sessão · financeiro:write",
        description: "Marca como pago, registrando paid_at (default: agora).",
        request: `{ "paid_at": "2026-07-10T00:00:00.000Z" }`,
        response: `200
{ "data": { "id": "cl...", "status": "paid", "paid_at": "..." } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/cash-flow",
        auth: "Sessão · financeiro:read",
        description: "Saldo por período (regime de caixa), agrupado por dia ou mês. Query: start, end, group_by=day|month, related_module.",
        response: `200
{ "data": [{ "period": "2026-06", "income": 8000, "expense": 5200, "balance": 2800 }], "meta": { "group_by": "month" } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/dre",
        auth: "Sessão · financeiro:read",
        description: "Receita e despesa agrupadas por módulo, com resultado por módulo e total geral. Query: start, end.",
        response: `200
{ "data": { "period": { "start": "2026-06-01", "end": "2026-06-30" }, "by_module": [{ "module": "rebanho", "total_income": 4500, "total_expense": 245, "result": 4255 }], "total_result": 4255 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/upcoming",
        auth: "Sessão · financeiro:read",
        description: "Lançamentos pending com due_date nos próximos 7 dias.",
        response: `200
{ "data": [{ "id": "cl...", "entry_type": "expense", "category": "Combustível", "amount": 350, "due_date": "...", "related_module": "geral" }] }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/report/link",
        auth: "Sessão · financeiro:read",
        description: "Gera um link assinado (HMAC, válido por 1h) para o PDF do relatório financeiro do período. Usado pelo botão \"Exportar relatório\".",
        response: `200
{ "data": { "report_url": "https://.../api/v1/financial/report?token=...", "expires_in_seconds": 3600 } }`,
      },
      {
        method: "GET",
        path: "/api/v1/financial/report",
        auth: "Público: autorização pelo token assinado, não por sessão (o link pode ser aberto fora do navegador logado, ex: WhatsApp)",
        description: "Gera o PDF sob demanda a partir do token e transmite direto na resposta (Content-Type: application/pdf). Não há armazenamento: o arquivo não fica salvo em nenhum lugar.",
        response: `200: corpo binário (application/pdf), Content-Disposition: attachment
401 se o token for inválido ou tiver expirado`,
      },
    ],
  },
  {
    title: "Alertas",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/alerts",
        auth: "Sessão · alertas:read",
        description: "Lista alertas. Filtros: type, status.",
        response: `200
{ "data": [{ "id": "cl...", "alert_type": "vaccine_due", "message": "🐄 Atenção: a vacina de aftosa do animal 1234 vence em 3 dias", "status": "pending" }], "meta": { "total": 1 } }`,
      },
      {
        method: "PATCH",
        path: "/api/v1/alerts/:id/dismiss",
        auth: "Sessão · alertas:write",
        description: "Marca um alerta como resolvido manualmente.",
        response: `200
{ "data": { "id": "cl...", "status": "dismissed" } }`,
      },
    ],
  },
  {
    title: "Cobrança (Asaas)",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/billing/subscription",
        auth: "Sessão · assinatura:read (acessível mesmo com a conta bloqueada)",
        description: "Plano e status atuais: de Subscription se existir, senão inferido do Tenant (trial).",
        response: `200
{ "data": { "plan": "fazenda", "status": "active", "next_due_date": "2026-08-10T00:00:00.000Z", "trial_ends_at": null } }`,
      },
      {
        method: "POST",
        path: "/api/v1/billing/subscribe",
        auth: "Sessão · assinatura:write, só OWNER (acessível mesmo com a conta bloqueada: é como o tenant regulariza)",
        description: "Cria ou troca a assinatura no Asaas. PIX e boleto retornam os dados para pagamento direto no painel; cartão de crédito retorna uma URL de redirecionamento para o checkout hospedado do Asaas (dados de cartão nunca tocam o backend do Tibé).",
        request: `{ "plan": "fazenda", "billing_type": "PIX" }`,
        response: `201 (PIX)
{ "data": { "method": "pix", "subscriptionId": "sub_...", "payload": "00020126...", "encodedImage": "data:image/png;base64,...", "expirationDate": "..." } }

201 (cartão)
{ "data": { "method": "redirect", "subscriptionId": "sub_...", "redirectUrl": "https://sandbox.asaas.com/checkoutSession/..." } }`,
      },
      {
        method: "POST",
        path: "/api/webhooks/asaas",
        auth: "Header asaas-access-token (comparado contra ASAAS_WEBHOOK_TOKEN, cadastrado no painel do Asaas)",
        description: "Recebe eventos de pagamento. PAYMENT_CONFIRMED → Subscription ativa + next_due_date atualizado. PAYMENT_OVERDUE → status overdue. PAYMENT_DELETED → status canceled. Outros eventos são reconhecidos (200) sem processamento.",
        request: `{ "event": "PAYMENT_CONFIRMED", "payment": { "subscription": "sub_...", "customer": "cus_...", "value": 197.00, "status": "CONFIRMED" } }`,
        response: `200
{ "data": { "received": true, "processed": true } }`,
      },
    ],
  },
  {
    title: "Agente WhatsApp (rotas internas)",
    note: "Chamadas pelo N8N, não pelo navegador: autenticadas por header x-internal-secret (INTERNAL_API_SECRET), não por sessão de usuário.",
    endpoints: [
      {
        method: "POST",
        path: "/api/internal/whatsapp/resolve-contact",
        auth: "Header x-internal-secret",
        description: "Identifica tenant e usuário a partir do telefone de origem. Único endpoint que legitimamente faz lookup cross-tenant (ainda não se sabe o tenant). Cria o WhatsAppContact no primeiro contato.",
        request: `{ "phone": "5522999990000" }`,
        response: `200 (identificado)
{ "data": { "identified": true, "tenant_id": "cl...", "user_id": "cl...", "user_name": "Maria", "role": "OWNER", "active_profiles": ["fazenda"] }, "meta": { "first_contact": false, "suggested_reply": null, "recent_history": [] } }

200 (não identificado)
{ "data": { "identified": false } }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/execute-action",
        auth: "Header x-internal-secret",
        description: "Executa a intenção já classificada pelo LLM, roteando para as mesmas lib/actions/* usadas pelo painel web. Loga a interação em AgentConversationLog.",
        request: `{ "tenant_id": "cl...", "user_id": "cl...", "intent": "registrar_peso", "parameters": { "ear_tag": "1234", "weight": 382 }, "message_text": "o boi 1234 pesou 382" }`,
        response: `200
{ "data": { "reply_text": "Peso de 382 kg registrado para o animal 1234. GMD: 0.65 kg/dia.", "requires_confirmation": false, "auxiliary_data": {}, "report_url": null } }`,
      },
      {
        method: "POST",
        path: "/api/internal/whatsapp/send-message",
        auth: "Header x-internal-secret",
        description:
          "Envia uma mensagem WhatsApp pelo provider ativo (Evolution ou Meta Cloud API, configurado no painel da plataforma). O N8N usa esta rota em vez de falar com o provider diretamente.",
        request: `{ "to": "+5511999990000", "text": "Peso registrado com sucesso." }`,
        response: `200
{ "data": { "provider": "evolution", "message_id": "BAE5..." }, "meta": {} }`,
      },
    ],
  },
  {
    title: "Jobs internos",
    endpoints: [
      {
        method: "GET",
        path: "/api/internal/jobs/generate-alerts",
        auth: "Header Authorization: Bearer (CRON_SECRET, injetado automaticamente pela Vercel Cron: ver vercel.json)",
        description: "Roda 1x/dia (09:00 UTC = 06:00 América/São Paulo). Gera alertas de vacina, colheita, conta a vencer, saldo negativo e trial acabando; dispara envio via WhatsApp. Idempotente por dia (lock no Redis) e por evento (não duplica Alert).",
        response: `200
{ "data": { "vaccine_due": 2, "harvest_near": 0, "bill_due": 1, "low_balance": 0, "trial_ending": 1, "sent": 3 }, "meta": { "date": "2026-07-10" } }`,
      },
    ],
  },
  {
    title: "Painel da Plataforma (Módulo 6)",
    note: "Namespace /api/platform/*, fora de /api/v1: autenticado por uma sessão de PlatformUser (cookie tibe-platform-session), nunca por sessão de tenant. \"equipe\" lê tenants; só master_admin vê KPIs financeiros e executa ações administrativas.",
    endpoints: [
      {
        method: "GET",
        path: "/api/platform/tenants",
        auth: "Sessão de PlatformUser (equipe ou master_admin)",
        description: "Lista todos os tenants do sistema, com status calculado (trial se não há Subscription, senão o status da Subscription), plano, perfis ativos. Filtros: status, plan, q (nome/documento), page, limit.",
        response: `200
{ "data": [{ "id": "cl...", "name": "Fazenda Boa Vista", "plan": "fazenda", "status": "active", "active_profiles": ["fazenda"], "created_at": "...", "subscription_status": "active", "next_due_date": "..." }], "meta": { "total": 1, "page": 1, "limit": 20 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/tenants/:id",
        auth: "Sessão de PlatformUser",
        description: "Detalhe completo: dados cadastrais, origem (UTM), histórico de transições de assinatura (SubscriptionStatusLog) e resumo de uso (animais/talhões/ordens conforme perfis ativos). Lookup cross-tenant explícito: a exceção que dá nome ao módulo.",
        response: `200
{ "data": { "id": "cl...", "name": "...", "status": "active", "subscription": { "status": "active", "history": [{ "from_status": "overdue", "to_status": "active", "changed_by_platform_user_id": null, "created_at": "..." }] }, "usage": { "animals": 40, "plots": 3, "service_orders": 0 } } }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/tenants/:id/status",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Força manualmente o status da assinatura (ex: reativar um tenant suspenso por erro). Exige uma Subscription existente (404 se o tenant nunca assinou). Grava em SubscriptionStatusLog com o PlatformUser responsável e o motivo: é o próprio log de auditoria.",
        request: `{ "status": "active", "reason": "reativado manualmente, erro no processamento do Asaas" }`,
        response: `200
{ "data": { "id": "cl...", "status": "active" } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/mrr",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "MRR atual (soma de PLAN_PRICES das assinaturas active) e breakdown por plano.",
        response: `200
{ "data": { "total_mrr": 691, "by_plan": { "campo": 97, "fazenda": 197, "grupo": 397 }, "active_subscriptions_count": 3 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/mrr-trend",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Evolução de MRR nos últimos N meses (?months=6, padrão), reconstruída a partir de SubscriptionStatusLog: não é aproximação, é o status real de cada assinatura em cada checkpoint mensal.",
        response: `200
{ "data": [{ "period": "2026-02", "mrr": 394 }, { "period": "2026-03", "mrr": 591 }] }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/churn",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Churn de clientes e de MRR no período (?period=30d|90d|12m). customer_churn = cancelados no período / ativos no início do período; mrr_churn = MRR perdido / MRR no início do período.",
        response: `200
{ "data": { "period": "30d", "customer_churn_pct": 5.5, "mrr_churn_pct": 4.2, "canceled_count": 1 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/ltv",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "LTV simplificado: ticket médio mensal / churn mensal (30d). Devolve ltv: null (não Infinity) quando não há churn observado ainda: divisão por zero evitada.",
        response: `200
{ "data": { "ltv": 1763.6, "avg_ticket_mensal": 230.3, "churn_mensal_pct": 13.06 } }`,
      },
      {
        method: "GET",
        path: "/api/platform/kpis/funnel",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Funil de conversão trial → pago no período (?period=30d|90d|12m), com breakdown por lead_source_utm_source (null agrupa em \"sem origem\"/acesso direto) e tempo médio de conversão em dias.",
        response: `200
{ "data": { "period": "30d", "trials_created": 12, "converted_to_paid": 4, "conversion_rate_pct": 33.33, "avg_days_to_convert": 3.5, "by_source": [{ "utm_source": "instagram", "trials_created": 5, "converted": 2, "conversion_rate_pct": 40 }, { "utm_source": null, "trials_created": 7, "converted": 2, "conversion_rate_pct": 28.57 }] } }`,
      },
      {
        method: "GET",
        path: "/api/platform/team",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Lista a equipe da plataforma (PlatformUser).",
        response: `200
{ "data": [{ "id": "cl...", "name": "...", "email": "...", "role": "EQUIPE", "active": true }], "meta": { "total": 1 } }`,
      },
      {
        method: "POST",
        path: "/api/platform/team",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Convida novo membro: senha temporária exibida uma única vez na resposta (sem infra de email no projeto, mesmo padrão do convite de usuário de tenant).",
        request: `{ "name": "Novo Membro", "email": "membro@pleno.dev.br", "role": "EQUIPE" }`,
        response: `201
{ "data": { "id": "cl...", "temp_password": "Xy9k2Qmz" } }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/team/:id/role",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Altera o papel de um membro. Não é possível alterar o próprio papel.",
        request: `{ "role": "MASTER_ADMIN" }`,
        response: `200
{ "data": { "id": "cl...", "role": "MASTER_ADMIN" } }`,
      },
      {
        method: "PATCH",
        path: "/api/platform/team/:id/active",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Ativa ou desativa um membro. Não é possível desativar a própria conta.",
        request: `{ "active": false }`,
        response: `200
{ "data": { "id": "cl...", "active": false } }`,
      },
      {
        method: "GET",
        path: "/api/platform/whatsapp-config",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Lista as configs de provider (credenciais sempre mascaradas: últimos 4 caracteres).",
        response: `200
{ "data": [ { "provider": "evolution", "active": true, "credentials_masked": { "api_key": "•••• 9876" }, "updated_at": "2026-07-11T12:00:00.000Z" } ], "meta": {} }`,
      },
      {
        method: "PUT",
        path: "/api/platform/whatsapp-config",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Cria/atualiza as credenciais de um provider (criptografadas em repouso). Não altera qual está ativo.",
        request: `{ "provider": "evolution", "credentials": { "base_url": "https://evo.up.railway.app", "api_key": "...", "instance": "tibe" } }`,
        response: `200
{ "data": { "provider": "evolution" }, "meta": {} }`,
      },
      {
        method: "POST",
        path: "/api/platform/whatsapp-config/{provider}/activate",
        auth: "Sessão de PlatformUser · só master_admin",
        description: "Ativa o provider (e desativa o outro, transacional). 404 se ainda não configurado.",
        response: `200
{ "data": { "provider": "meta_cloud_api" }, "meta": {} }`,
      },
    ],
  },
];

export default function ApiDocsPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold text-tibe-dark">API</h1>
      <p className="mt-3 max-w-2xl text-gray-600">
        Todos os endpoints usam o mesmo contrato de resposta:{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">{"{ data, meta }"}</code> em sucesso,{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">{'{ error: { code, message } }'}</code> em erro. Rotas
        sob <code className="rounded bg-gray-100 px-1 text-xs">/api/v1/*</code> exigem sessão de tenant (cookie do
        NextAuth) salvo indicação em contrário; a permissão por módulo segue a matriz descrita em{" "}
        <a href="/docs/arquitetura" className="text-tibe-primary hover:underline">Arquitetura</a>. Rotas sob{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">/api/platform/*</code> exigem uma sessão de{" "}
        <code className="rounded bg-gray-100 px-1 text-xs">PlatformUser</code>: uma instância NextAuth
        completamente separada (cookie próprio), nunca a mesma sessão de tenant.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <a
            key={g.title}
            href={`#group-${g.title}`}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-tibe-primary hover:text-tibe-dark"
          >
            {g.title}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-12">
        {GROUPS.map((group) => (
          <section key={group.title} id={`group-${group.title}`} className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-tibe-dark">{group.title}</h2>
            {group.note && <p className="mt-1 text-sm text-gray-500">{group.note}</p>}
            <div className="mt-4 space-y-4">
              {group.endpoints.map((e) => (
                <EndpointCard key={e.method + e.path} endpoint={e} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
