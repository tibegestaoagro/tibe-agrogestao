# Spec: Módulo 3, Agente WhatsApp

**Depende de:** Módulos 0, 1 e 2 concluídos
**Agente responsável:** agente de integração Meta e N8N
**Fase do contrato:** Fase 2 (Semanas 3 e 4)

---

## Objetivo

Criar o agente de inteligência artificial integrado ao WhatsApp Business Cloud API, capaz de identificar o tenant e o usuário pelo número de telefone, interpretar mensagens em linguagem natural, e executar ações de cadastro e consulta nos módulos de rebanho, lavoura, prestador de serviço e financeiro.

---

## Pré-requisitos externos

Antes de iniciar o desenvolvimento, os seguintes itens devem estar configurados:

1. Número virtual Salvy ativo e configurado para API Oficial
2. Conta Meta Business Manager criada para a Da Mata Sementes
3. Número Salvy vinculado ao WhatsApp Business Cloud API dentro do Meta Business Manager
4. N8N rodando em produção no Railway
5. Verificação de empresa concluída no Meta Business Manager (CNPJ)

---

## Tasks

### 3.1 Configuração do webhook Meta

- Criar endpoint `GET /api/webhooks/whatsapp` para verificação do webhook pela Meta (challenge)
- Criar endpoint `POST /api/webhooks/whatsapp` para receber eventos, protegido por validação de assinatura
- Registrar webhook no Meta App Dashboard apontando para a URL do N8N (não diretamente para o Tibé, conforme arquitetura do PRD seção 7)
- Configurar N8N para receber o webhook bruto da Meta, normalizar, e fazer o POST autenticado para o endpoint do Tibé

### 3.2 Identificação de tenant e usuário

- Criar endpoint interno `POST /api/internal/whatsapp/resolve-contact`
- Recebe número de telefone de origem
- Busca `WhatsAppContact` correspondente; se não existe, busca `User` com esse telefone cadastrado e cria o vínculo
- Se número não corresponde a nenhum `User` de nenhum tenant, retorna indicação de "contato não identificado"
- Resposta inclui `tenant_id`, `user_id`, `role`, e quais `TenantProfile` estão ativos (fazenda, prestador, ou ambos)

### 3.3 Workflow N8N principal

- Criar workflow no N8N com:
  - Trigger: Webhook recebendo evento normalizado da Meta
  - Node de chamada a `POST /api/internal/whatsapp/resolve-contact`
  - Node de chamada à API de LLM, enviando: mensagem do usuário, contexto do tenant (perfis ativos), histórico recente de `AgentConversationLog` (últimas 5 interações), e definição das ações disponíveis
  - Node de roteamento condicional baseado na intenção retornada pelo LLM
  - Node HTTP Request chamando o endpoint correspondente do Tibé
  - Node de formatação da resposta final
  - Node HTTP Request enviando resposta via Meta Cloud API
  - Node de tratamento de erro com mensagem de fallback amigável em caso de falha em qualquer etapa

### 3.4 Definição de intenções suportadas no MVP

O LLM deve classificar a mensagem em uma das intenções abaixo e extrair os parâmetros necessários:

```
cadastrar_animal       → ear_tag, breed, sex, property (se omitido, usa a única propriedade do tenant ou pergunta)
registrar_peso         → ear_tag, weight
registrar_vacina       → ear_tag, vaccine_name
registrar_movimento    → ear_tag, movement_type, value (opcional)
cadastrar_servico_ordem → client_name, service_name, quantity
consultar_saldo        → period (opcional, default mês atual)
consultar_animal       → ear_tag
consultar_cliente      → client_name
gerar_relatorio        → tipo (financeiro|rebanho|lavoura|prestador), period
ambigua                → não foi possível classificar com confiança; pedir esclarecimento
```

### 3.5 Endpoint de execução de ação

- Criar endpoint `POST /api/internal/whatsapp/execute-action`
- Recebe: `tenant_id`, `user_id`, `intent`, `parameters`
- Roteia internamente para os endpoints já existentes dos Módulos 1 e 2 (reutiliza a lógica de negócio, não duplica)
- Retorna resposta estruturada com texto pronto para envio e, opcionalmente, dados auxiliares (ex: lista de animais quando a busca por brinco retorna mais de um resultado)
- Para `gerar_relatorio`, dispara a geração de PDF (Módulo 4) e retorna link de download armazenado no Cloudflare R2

### 3.6 Tratamento de ambiguidade e confirmação

- Quando o LLM classifica a intenção como `ambigua`, ou quando faltam parâmetros obrigatórios (ex: cadastrar animal sem informar a propriedade quando o tenant tem mais de uma), o agente responde pedindo o dado faltante, sem executar a ação
- Para ações de movimentação financeira relevante (venda de animal, ordem de serviço com valor alto, default acima de R$ 5.000), o agente deve confirmar com o usuário antes de persistir: "Confirma a venda do animal X por R$ Y?"
- Confirmação aceita variações simples: "sim", "confirmo", "isso mesmo"; negação aceita "não", "cancela", "errado"

### 3.7 Registro de log de conversação

- Toda mensagem recebida e toda resposta enviada são persistidas em `AgentConversationLog`
- Campos: direção, tipo de mensagem, conteúdo, intenção detectada, ação tomada
- Esse log serve de contexto de curto prazo (últimas 5 interações) enviado ao LLM nas chamadas seguintes da mesma conversa

### 3.8 Mensagem de boas-vindas e onboarding via WhatsApp

- Quando um número não identificado envia mensagem, responder com mensagem padrão explicando que o número não está cadastrado, e instrução para contatar o administrador do tenant
- Quando um `User` recém-cadastrado envia a primeira mensagem, responder com saudação personalizada citando seu nome e os módulos disponíveis para seu tenant

---

## Contratos de API

### POST /api/internal/whatsapp/resolve-contact
```json
Header: x-internal-secret: string

Request:
{
  "phone": "5522999999999"
}

Response 200 (contato identificado):
{
  "data": {
    "identified": true,
    "tenant_id": "string",
    "user_id": "string",
    "user_name": "string",
    "role": "OWNER | ADMIN | OPERADOR | VISUALIZADOR",
    "active_profiles": ["fazenda", "prestador"]
  }
}

Response 200 (contato não identificado):
{
  "data": {
    "identified": false
  }
}
```

### POST /api/internal/whatsapp/execute-action
```json
Header: x-internal-secret: string

Request:
{
  "tenant_id": "string",
  "user_id": "string",
  "intent": "cadastrar_animal | registrar_peso | registrar_vacina | registrar_movimento | cadastrar_servico_ordem | consultar_saldo | consultar_animal | consultar_cliente | gerar_relatorio | ambigua",
  "parameters": {}
}

Response 200:
{
  "data": {
    "reply_text": "string",
    "requires_confirmation": false,
    "auxiliary_data": {},
    "report_url": "string | null"
  }
}
```

---

## Critérios de aceitação

- Mensagem de número cadastrado é corretamente vinculada ao tenant e usuário em menos de 2 segundos
- Cadastro de animal por mensagem de texto livre ("cadastra o boi 1234, nelore, macho") cria o registro corretamente
- Consulta de saldo retorna o valor correto considerando lançamentos do mês atual
- Ação com valor acima de R$ 5.000 exige confirmação antes de persistir
- Resposta de confirmação variada ("sim", "confirmo") é corretamente interpretada como aceite
- Número não cadastrado recebe mensagem de orientação sem conseguir executar nenhuma ação de escrita
- Geração de relatório retorna link funcional de PDF no Cloudflare R2
- Falha em qualquer etapa do workflow N8N retorna mensagem de erro amigável ao usuário, sem expor detalhes técnicos
- Log de conversação registra corretamente direção, conteúdo e intenção de cada interação
- Todas as ações executadas respeitam o isolamento de tenant e a role do usuário (ex: visualizador não consegue cadastrar nada via WhatsApp)
