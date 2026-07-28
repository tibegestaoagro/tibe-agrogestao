# Spec: Módulo 1, Rebanho e Lavoura

**Depende de:** Módulo 0 concluído
**Visível apenas para:** tenants com `TenantProfile` fazenda ativo
**Agente responsável:** agente de domínio agropecuário
**Fase do contrato:** Fase 1 (Semanas 1 e 2)

---

## Objetivo

Criar os módulos de gestão de rebanho bovino e de lavoura, permitindo cadastro, acompanhamento e histórico completo de animais e talhões, servindo de base para os módulos financeiro e de agente WhatsApp que consultam e alimentam esses dados.

---

## Tasks: Rebanho

### 1.1 Modelo de dados de propriedade

- Confirmar modelo `Property` no schema Prisma (definido no Módulo 0): id, tenant_id, name, address, area_hectares
- Criar CRUD completo de propriedades: criar, listar, editar, arquivar (não deletar, para preservar histórico de animais vinculados)

### 1.2 Cadastro de animais

- Confirmar modelos `Animal`, `AnimalWeightLog`, `Vaccine`, `AnimalVaccination`, `AnimalMovement` no schema Prisma
- Criar endpoint `POST /api/v1/animals` para cadastro
- Campos obrigatórios: brinco (ear_tag), raça, sexo, propriedade
- Campos opcionais: data de nascimento, peso inicial
- Validar unicidade de `ear_tag` por tenant (não por propriedade, já que o produtor pode confundir)

### 1.3 Controle de peso

- Criar endpoint `POST /api/v1/animals/:id/weight-logs` para registrar nova pesagem
- Criar endpoint `GET /api/v1/animals/:id/weight-logs` retornando histórico ordenado por data
- Calcular automaticamente ganho de peso médio diário (GMD) entre as duas últimas pesagens
- Atualizar `current_weight` no registro do animal a cada novo log

### 1.4 Vacinação

- Criar catálogo básico de vacinas comuns na seed (`Vaccine`): aftosa, brucelose, raiva, clostridiose, com `default_interval_days` preenchido
- Criar endpoint `POST /api/v1/animals/:id/vaccinations` para registrar aplicação
- Calcular `next_due_at` automaticamente: `applied_at + default_interval_days` da vacina (ou intervalo customizado se informado)
- Criar endpoint `GET /api/v1/vaccinations/upcoming` retornando vacinações vencendo nos próximos 15 dias, usado pelo Módulo 4 (Alertas)

### 1.5 Movimentação de animais

- Criar endpoint `POST /api/v1/animals/:id/movements` para registrar compra, venda, transferência entre propriedades ou morte
- Ao registrar venda ou morte, atualizar `status` do animal para `sold` ou `deceased`
- Ao registrar transferência, atualizar `property_id` do animal para a propriedade de destino
- Toda movimentação com `value` preenchido gera automaticamente um `FinancialEntry` correspondente (receita em caso de venda, despesa em caso de compra), vinculado via `related_module: rebanho` e `related_id`

### 1.6 Custo por cabeça

- Criar endpoint `GET /api/v1/animals/:id/cost-summary` somando todos os `FinancialEntry` vinculados ao animal (vacinas com custo registrado, insumos, manejo)
- Retornar custo total e custo médio mensal desde a entrada do animal na propriedade

### 1.7 Interface do módulo Rebanho

- Criar página `app/(dashboard)/rebanho/page.tsx` com listagem de animais em tabela
- Colunas: brinco, raça, sexo, propriedade, peso atual, status, última vacinação
- Filtros: propriedade, status, raça
- Busca por brinco
- Criar página `app/(dashboard)/rebanho/[id]/page.tsx` com detalhe do animal: dados cadastrais, histórico de peso (gráfico Recharts), histórico de vacinação, histórico de movimentação, resumo de custo
- Formulário de cadastro e edição em painel lateral (sheet)

---

## Tasks: Lavoura

### 1.8 Cadastro de talhões

- Confirmar modelos `Plot`, `CropCycle`, `PlotInput` no schema Prisma
- Criar endpoint `POST /api/v1/plots` para cadastro de talhão vinculado a uma propriedade
- Campos: nome, área em hectares, propriedade

### 1.9 Ciclo de plantio e colheita

- Criar endpoint `POST /api/v1/plots/:id/cycles` para iniciar novo ciclo de cultura
- Campos: nome da cultura, data de plantio, data prevista de colheita
- Criar endpoint `PATCH /api/v1/cycles/:id/harvest` para registrar colheita realizada
- Campos: data efetiva, quantidade colhida, unidade (sacas, toneladas, kg)
- Ao registrar colheita, atualizar `status` do ciclo para `harvested`
- Um talhão só pode ter um ciclo `planted` ou `growing` ativo por vez

### 1.10 Insumos por talhão

- Criar endpoint `POST /api/v1/cycles/:id/inputs` para registrar aplicação de insumo
- Tipos: fertilizante, defensivo, semente
- Campos: nome, quantidade, unidade, custo
- Todo insumo com custo registrado gera `FinancialEntry` correspondente, vinculado via `related_module: lavoura`

### 1.11 Custo por hectare e produtividade

- Criar endpoint `GET /api/v1/cycles/:id/summary` retornando: custo total de insumos, custo por hectare (custo total / área do talhão), produtividade (quantidade colhida / área), quando o ciclo está colhido

### 1.12 Interface do módulo Lavoura

- Criar página `app/(dashboard)/lavoura/page.tsx` com listagem de talhões
- Colunas: nome, propriedade, área, cultura atual, status do ciclo, data prevista de colheita
- Criar página `app/(dashboard)/lavoura/[id]/page.tsx` com detalhe do talhão: ciclo atual, histórico de ciclos anteriores, insumos aplicados, resumo de custo e produtividade
- Formulário de novo ciclo e registro de colheita em painel lateral

---

## Contratos de API

### POST /api/v1/animals
```json
Request:
{
  "ear_tag": "string",
  "breed": "string",
  "sex": "male | female",
  "property_id": "string",
  "birth_date": "ISO8601 | null",
  "initial_weight": "number | null"
}

Response 201:
{
  "data": {
    "id": "string",
    "ear_tag": "string",
    "breed": "string",
    "sex": "male | female",
    "status": "active",
    "current_weight": "number | null",
    "created_at": "ISO8601"
  }
}
```

### GET /api/v1/vaccinations/upcoming
```json
Response 200:
{
  "data": [
    {
      "animal_id": "string",
      "ear_tag": "string",
      "vaccine_name": "string",
      "last_applied_at": "ISO8601",
      "next_due_at": "ISO8601",
      "days_remaining": 0
    }
  ]
}
```

### POST /api/v1/cycles/:id/harvest
```json
Request:
{
  "harvested_at": "ISO8601",
  "yield_amount": "number",
  "yield_unit": "saca | tonelada | kg"
}

Response 200:
{
  "data": {
    "id": "string",
    "status": "harvested",
    "yield_amount": "number",
    "yield_unit": "string",
    "harvested_at": "ISO8601"
  }
}
```

### GET /api/v1/cycles/:id/summary
```json
Response 200:
{
  "data": {
    "total_input_cost": 0,
    "area_hectares": 0,
    "cost_per_hectare": 0,
    "yield_amount": "number | null",
    "yield_unit": "string | null",
    "productivity_per_hectare": "number | null"
  }
}
```

---

## Critérios de aceitação

- Cadastro de animal com brinco duplicado no mesmo tenant é rejeitado com mensagem clara
- Registro de pesagem atualiza `current_weight` e calcula GMD corretamente
- Registro de vacinação calcula `next_due_at` automaticamente
- Endpoint de vacinações próximas retorna apenas as que vencem em até 15 dias
- Venda de animal com valor preenchido cria `FinancialEntry` de receita automaticamente
- Talhão não permite dois ciclos `planted`/`growing` simultâneos
- Registro de colheita calcula produtividade por hectare corretamente
- Tela de detalhe do animal exibe gráfico de evolução de peso
- Todos os endpoints respeitam o isolamento de tenant validado no Módulo 0
