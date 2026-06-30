# Spec: Módulo 5, Painel Web, Cobrança e Site

**Depende de:** Módulos 0, 1, 2 e 4 concluídos
**Agente responsável:** agente de frontend, billing e conteúdo
**Fase do contrato:** Fase 4 (Semanas 7 e 8), com página comercial e documentação iniciadas na Fase 3

---

## Objetivo

Finalizar o painel web com dashboard consolidado, implementar a cobrança recorrente via Asaas, publicar a página comercial pública do Tibé, e entregar a documentação técnica para desenvolvedores externos.

---

## Tasks — Painel Web

### 5.1 Dashboard consolidado

- Criar página `app/(dashboard)/page.tsx` como home do dashboard
- Cards de indicadores adaptados ao(s) perfil(is) ativo(s) do tenant:
  - Perfil fazenda ativo: total de animais, total de talhões ativos, próxima vacina vencendo
  - Perfil prestador ativo: total de clientes, ordens pendentes de faturamento
  - Sempre presente: saldo do mês, alertas pendentes
- Gráfico de evolução financeira dos últimos 6 meses (Recharts)

### 5.2 Gestão de usuários

- Criar página `app/(dashboard)/configuracoes/usuarios/page.tsx`, acessível para Owner e Admin
- Listagem de usuários do tenant com nome, email, telefone, role, status
- Formulário de convite de novo usuário (cria `User` com senha temporária ou link de definição de senha)
- Edição de role de usuário existente
- Desativação de usuário (não deleta, preserva histórico de ações)

### 5.3 Configurações de tenant

- Criar página `app/(dashboard)/configuracoes/page.tsx`
- Edição de dados do tenant: nome, documento, telefone, email
- Gestão de propriedades (atalho para o CRUD já existente no Módulo 1)
- Ativação de profile adicional (fazenda ou prestador) se ainda não ativo

---

## Tasks — Cobrança (Asaas)

### 5.4 Cliente Asaas

- Criar `lib/asaas.ts` com métodos:
  - `createCustomer(tenant)` cria cliente no Asaas a partir dos dados do tenant
  - `createSubscription(customerId, plan)` cria assinatura recorrente
  - `getSubscription(subscriptionId)` consulta status
  - `cancelSubscription(subscriptionId)` cancela

### 5.5 Fluxo de criação de assinatura

- No onboarding do tenant (ou em fluxo de upgrade de plano), chamar `createCustomer` seguido de `createSubscription`
- Persistir `Subscription` no banco com `asaas_customer_id`, `asaas_subscription_id`, `plan`, `status`
- Planos disponíveis: `campo` (R$ 97), `fazenda` (R$ 197), `grupo` (R$ 397), conforme definido na proposta comercial

### 5.6 Webhook de pagamento

- Criar endpoint `POST /api/webhooks/asaas` protegido por validação de token do Asaas
- Processar eventos:
  - `PAYMENT_CONFIRMED`: atualizar `Subscription.status` para `active`, atualizar `next_due_date`
  - `PAYMENT_OVERDUE`: atualizar `Subscription.status` para `overdue`
  - `PAYMENT_DELETED` ou cancelamento: atualizar `Subscription.status` para `canceled`

### 5.7 Bloqueio por inadimplência

- Criar middleware que verifica `Subscription.status` em rotas protegidas do dashboard
- Se `status: overdue` há mais de 5 dias, bloquear acesso de escrita (leitura permanece liberada) e exibir banner de regularização
- Se `status: canceled`, bloquear acesso total exceto página de reativação

### 5.8 Período de teste gratuito

- Tenant criado sem assinatura ativa entra automaticamente em `trial`, com `trial_ends_at` 14 dias a partir da criação
- Job diário (mesmo worker do Módulo 4) verifica tenants em trial vencendo em 2 dias e dispara alerta via WhatsApp sugerindo assinatura
- Trial vencido sem assinatura: mesmo comportamento de bloqueio do item 5.7

### 5.9 Interface de billing

- Criar página `app/(dashboard)/configuracoes/assinatura/page.tsx`, acessível apenas para Owner
- Exibir plano atual, status, próxima cobrança
- Botão de upgrade/downgrade de plano
- Histórico de cobranças (consultado via Asaas API)

---

## Tasks — Página Comercial (Site)

### 5.10 Estrutura do site público

- Criar grupo de rotas `app/(public)/` fora do dashboard, sem autenticação
- Página inicial (`/`): hero, apresentação do produto, módulos, como funciona, CTA de teste gratuito
- Página de planos (`/planos`): tabela comparativa dos 3 planos com CTA de cadastro
- Página de FAQ (`/faq`)
- Páginas de política de privacidade e termos de uso (`/politicas/privacidade`, `/politicas/termos`), conforme exigência LGPD do contrato

### 5.11 Fluxo de cadastro de trial

- Botão de CTA leva a formulário simples: nome, email, telefone, nome da empresa
- Ao submeter, cria `Tenant` em status `trial` e `User` owner correspondente
- Envia mensagem de boas-vindas via WhatsApp (reutiliza lógica do Módulo 3) com link de acesso ao painel

### 5.12 SEO técnico básico

- Meta tags por página (title, description)
- Open Graph para compartilhamento em redes sociais
- Sitemap.xml gerado automaticamente

---

## Tasks — Documentação Técnica

### 5.13 Documentação para desenvolvedores

- Criar documentação cobrindo: arquitetura geral do sistema, schema do banco de dados com descrição de cada tabela, todos os endpoints de `/api/v1/` com exemplo de request/response, fluxo do agente WhatsApp, guia de setup de ambiente local, guia de deploy, glossário de termos do domínio agropecuário
- Hospedar em plataforma de documentação (Mintlify ou Notion, conforme decisão tomada com o cliente)
- Linkar a documentação a partir do rodapé da página comercial

### 5.14 README e guia de contribuição

- Criar `README.md` completo no repositório: visão geral, stack, como rodar localmente, estrutura de pastas
- Criar `CONTRIBUTING.md` com convenções de código, padrão de commits, processo de PR

---

## Contratos de API

### POST /api/webhooks/asaas
```json
Header: asaas-access-token: string

Request (exemplo PAYMENT_CONFIRMED):
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "subscription": "string",
    "customer": "string",
    "value": 97.00,
    "status": "CONFIRMED"
  }
}

Response: 200 OK
```

### POST /api/v1/tenant/onboard-trial
```json
Request:
{
  "tenant_name": "string",
  "owner_name": "string",
  "owner_email": "string",
  "owner_phone": "string"
}

Response 201:
{
  "data": {
    "tenant_id": "string",
    "trial_ends_at": "ISO8601"
  }
}
```

### GET /api/v1/billing/subscription
```json
Response 200:
{
  "data": {
    "plan": "campo | fazenda | grupo",
    "status": "trial | active | overdue | canceled",
    "next_due_date": "ISO8601 | null",
    "trial_ends_at": "ISO8601 | null"
  }
}
```

---

## Critérios de aceitação

- Dashboard exibe cards corretos conforme o(s) perfil(is) ativo(s) do tenant
- Webhook do Asaas atualiza corretamente o status da assinatura em até 1 minuto após o evento
- Tenant com pagamento em atraso há mais de 5 dias perde acesso de escrita, mantendo leitura
- Trial expirado sem assinatura ativa bloqueia o acesso conforme regra de inadimplência
- Cadastro de trial pela página comercial cria tenant, usuário e envia mensagem de boas-vindas via WhatsApp
- Página comercial carrega corretamente em mobile e desktop
- Documentação técnica está acessível publicamente e cobre todos os endpoints implementados
- Deploy final em produção responde no domínio configurado com SSL válido
- Todos os endpoints respeitam o isolamento de tenant validado no Módulo 0
