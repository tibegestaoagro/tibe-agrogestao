# Spec: Módulo 2, Prestador de Serviço

**Depende de:** Módulo 0 concluído
**Visível apenas para:** tenants com `TenantProfile` prestador ativo
**Agente responsável:** agente de domínio agropecuário
**Fase do contrato:** Fase 1 (Semanas 1 e 2)

---

## Objetivo

Criar o módulo de gestão para prestadores de serviço do agronegócio, mais enxuto que o módulo de fazenda, cobrindo cadastro de clientes, catálogo de serviços com precificação flexível, e registro de ordens de serviço que alimentam o financeiro.

---

## Tasks

### 2.1 Modelo de dados

- Confirmar modelos `ServiceClient`, `Service`, `ServiceOrder` no schema Prisma

### 2.2 Cadastro de clientes do prestador

- Criar endpoint `POST /api/v1/service-clients` para cadastro
- Campos: nome, documento (CPF/CNPJ, opcional), telefone, email, observações
- Criar endpoint `GET /api/v1/service-clients` com busca por nome ou telefone

### 2.3 Catálogo de serviços

- Criar endpoint `POST /api/v1/services` para cadastro de tipo de serviço oferecido
- Campos: nome, tipo de precificação (`hour | day | fixed`), valor unitário
- Criar endpoint `GET /api/v1/services` listando catálogo do tenant
- Criar endpoint `PATCH /api/v1/services/:id` para editar valor (não afeta ordens já registradas, apenas futuras)

### 2.4 Ordens de serviço

- Criar endpoint `POST /api/v1/service-orders` para registrar serviço prestado
- Campos: cliente, serviço, quantidade (horas, dias, ou 1 se fixo), descrição opcional, data de execução
- Calcular `total_value` automaticamente: `quantity * service.unit_price`
- Status inicial: `scheduled` se data de execução é futura, `completed` se já passou ou é hoje
- Criar endpoint `PATCH /api/v1/service-orders/:id/status` para transição manual: `scheduled → completed → invoiced`
- Ao mudar status para `invoiced`, criar `FinancialEntry` de receita vinculado via `related_module: servico`

### 2.5 Relatório financeiro por cliente

- Criar endpoint `GET /api/v1/service-clients/:id/summary` retornando: total faturado (ordens `invoiced`), total pendente (ordens `completed` não faturadas), histórico de ordens
- Usado tanto pelo painel web quanto pelo agente WhatsApp para responder "quanto o cliente X me deve"

### 2.6 Interface do módulo Prestador

- Criar página `app/(dashboard)/prestador/page.tsx` com abas: Clientes, Serviços, Ordens
- Aba Clientes: tabela com nome, telefone, total faturado, total pendente
- Aba Serviços: tabela do catálogo com nome, tipo de precificação, valor
- Aba Ordens: tabela com cliente, serviço, data, valor, status, com filtro por status e por cliente
- Criar página `app/(dashboard)/prestador/clientes/[id]/page.tsx` com detalhe do cliente: dados cadastrais, resumo financeiro, histórico de ordens
- Formulários de cadastro em painel lateral para os três tipos de entidade

---

## Contratos de API

### POST /api/v1/services
```json
Request:
{
  "name": "string",
  "pricing_type": "hour | day | fixed",
  "unit_price": "number"
}

Response 201:
{
  "data": {
    "id": "string",
    "name": "string",
    "pricing_type": "hour | day | fixed",
    "unit_price": "number",
    "created_at": "ISO8601"
  }
}
```

### POST /api/v1/service-orders
```json
Request:
{
  "service_client_id": "string",
  "service_id": "string",
  "quantity": "number",
  "description": "string | null",
  "performed_at": "ISO8601"
}

Response 201:
{
  "data": {
    "id": "string",
    "total_value": "number",
    "status": "scheduled | completed",
    "performed_at": "ISO8601"
  }
}
```

### GET /api/v1/service-clients/:id/summary
```json
Response 200:
{
  "data": {
    "client_id": "string",
    "client_name": "string",
    "total_invoiced": 0,
    "total_pending": 0,
    "orders_count": 0,
    "last_order_at": "ISO8601 | null"
  }
}
```

---

## Critérios de aceitação

- Cadastro de serviço com precificação por hora calcula corretamente `total_value` quando uma ordem informa quantidade de horas
- Mudança de status para `invoiced` cria `FinancialEntry` de receita automaticamente
- Endpoint de resumo do cliente retorna corretamente valores faturados e pendentes
- Edição de valor de um serviço não altera o `total_value` de ordens já registradas
- Tela do módulo prestador só aparece para tenants com `TenantProfile` prestador ativo
- Todos os endpoints respeitam o isolamento de tenant validado no Módulo 0
