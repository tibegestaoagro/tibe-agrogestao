# Módulo 26: Máquinas e equipamentos

**Status:** especificado, decisões fechadas com o usuário em 2026-08-04.
Implementação a seguir. Todas as ambiguidades foram resolvidas em entrevista,
então **não é necessário perguntar de novo** o que está decidido aqui.

---

## 1. Objetivo

Uma das quatro áreas da primeira versão do documento do cliente ("Organizar
minha fazenda": fazenda, rebanho, financeiro, compromissos, **máquinas e
equipamentos**) e ainda não existe no sistema. Cadastro de máquina/equipamento
e o histórico de manutenções, com geração automática de despesa e alerta de
manutenção próxima.

## 2. Decisões fechadas (não reabrir sem pedir)

1. **Próxima manutenção é uma data que o usuário informa, não calculada por
   intervalo.** Mesmo padrão já usado por vacina no M17
   (`AnimalVaccination.next_due_at`): sem regra de recorrência por dias ou por
   horímetro nesta rodada.
2. **Só painel web nesta rodada, sem intenção nova no agente WhatsApp**
   (mesmo tratamento que a Calculadora Pecuária recebeu na Onda 3). O
   documento do cliente não trouxe um exemplo de frase pra isso, diferente do
   rebanho.
3. **Manutenção próxima gera `Alert`**, tipo novo `maintenance_due`, mesmo
   seam de notificação que já existe (push/WhatsApp/email, M4 + Onda 2), sem
   nada construído do zero.
4. **`next_maintenance_at` fica denormalizado na própria `Machine`**
   (atualizado a cada manutenção registrada), não derivado buscando "a última
   manutenção de cada máquina": mesmo padrão de `Animal.current_weight` +
   `AnimalWeightLog` (o pai guarda o valor atual, o filho guarda o histórico).
5. **Registrar manutenção com custo gera `FinancialEntry` de despesa na
   hora** (`createLinkedEntry`, mesmo padrão de toda ação que já gera
   lançamento automático). Sem sistema de previsão/conciliação como o do M17
   pra vacina: o documento do cliente não pediu isso aqui, e adicionar sem
   necessidade é escopo por conta própria.
6. **Módulo de permissão próprio** (`ModuleKey "maquinas"`), mesma matriz de
   `rebanho`/`lavoura`: OWNER/ADMIN/OPERADOR escrevem, VISUALIZADOR só lê.
   Máquinas é tão operacional quanto rebanho/lavoura, não administrativo
   como `usuarios`/`assinatura`.
7. **`RelatedModule` ganha o valor `"maquinas"`** (era `rebanho | lavoura |
   servico | geral`), pra despesa de manutenção não cair em `"geral"` sem
   necessidade.
8. **Janela do alerta: 15 dias** (mesma janela de `vaccine_due`, já que
   providenciar peça/mecânico também pode levar tempo). Idempotência pelo
   mesmo mecanismo de `ensureAlert` (não duplica o mesmo tipo+módulo+entidade).
9. **Tela inicial reformulada (8 indicadores do documento do cliente, entre
   eles "manutenções próximas") fica FORA desta rodada.** Depende de Máquinas
   E Meu Dia existirem primeiro (fila já combinada com o usuário); construir
   agora seria em cima de uma área que ainda não existe.
10. **Sem exclusão de máquina, só status.** Mesmo motivo de usuário/animal
    nunca serem deletados: preserva histórico de manutenção e despesa ligada.

## 3. Modelo de dados

```prisma
enum MachineStatus {
  active
  maintenance
  sold
  inactive
}

model Machine {
  id                 String        @id @default(cuid())
  tenant_id          String
  property_id        String
  name               String
  type               String
  brand              String?
  model              String?
  year               Int?
  acquired_at        DateTime?
  acquisition_cost   Decimal?      @db.Decimal(14, 2)
  hour_meter         Decimal?      @db.Decimal(10, 1)
  status             MachineStatus @default(active)
  next_maintenance_at DateTime?
  created_at         DateTime      @default(now())
  updated_at         DateTime      @updatedAt

  tenant       Tenant               @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  property     Property             @relation(fields: [property_id], references: [id], onDelete: Restrict)
  maintenances MachineMaintenance[]

  @@index([tenant_id])
  @@index([property_id])
}

// tenant_id incluído para o middleware de isolamento (mesmo padrão de
// AnimalWeightLog): filho de Machine, não tem where próprio de negócio.
model MachineMaintenance {
  id           String   @id @default(cuid())
  tenant_id    String
  machine_id   String
  performed_at DateTime
  description  String
  cost         Decimal? @db.Decimal(14, 2)
  next_due_at  DateTime?
  created_at   DateTime @default(now())

  machine Machine @relation(fields: [machine_id], references: [id], onDelete: Cascade)

  @@index([tenant_id])
  @@index([machine_id])
}
```

`Machine` e `MachineMaintenance` entram em `TENANT_SCOPED_MODELS`.
`RelatedModule` ganha `maquinas`. `AlertType` ganha `maintenance_due`.
`ModuleKey` ganha `maquinas` (matriz igual a `rebanho`/`lavoura`).

## 4. Regras de negócio

- **Criar máquina**: `name`/`type` obrigatórios, resto opcional. Se
  `acquisition_cost` vier preenchido, gera `FinancialEntry` de despesa
  (`related_module: "maquinas"`, `related_id: machine.id`), mesmo padrão de
  lote de rebanho com custo de aquisição.
- **Registrar manutenção**: `performed_at`/`description` obrigatórios. Se
  `cost` vier preenchido, gera `FinancialEntry` de despesa ligada à
  manutenção (`related_id: maintenance.id`, não ao `machine.id`: cada
  manutenção é seu próprio lançamento, várias manutenções na mesma máquina
  não devem colidir). Se `next_due_at` vier preenchido, atualiza
  `Machine.next_maintenance_at` (substitui o valor anterior; só a manutenção
  mais recente importa para o alerta).
- **Geração de alerta** (`generateAlertsForTenant`, mesma função que já
  existe): 5ª verificação, junto das 4 que já existem. Máquinas com
  `next_maintenance_at` entre agora e +15 dias, com `status != "sold"`, geram
  `maintenance_due`.
- **Sem exclusão**: mudar `status` para `inactive`/`sold` é o único jeito de
  "remover" uma máquina da operação ativa.

## 5. Fora de escopo desta rodada

- Intenção no agente WhatsApp (cadastro ou consulta).
- Cálculo automático de próxima manutenção por intervalo (dias ou horímetro).
- Tela inicial reformulada / indicador de manutenções próximas no dashboard.
- Histórico de troca de propriedade da máquina (se um dia for pedido, mesmo
  tratamento de `AnimalMovement` pode ser usado como referência).
- App mobile e `packages/contracts`: nenhum dos dois cobre rebanho ainda
  (decisão da Onda 3); máquinas segue a mesma decisão por consistência, sem
  necessidade de reabrir.

## 6. Critérios de aceitação

1. `npm run test:m1`, `test:m4`, `test:m17`, `test:m25` continuam passando
   sem alteração (prova de que nada dos módulos existentes foi tocado).
2. Novo `npm run test:m27` cobrindo: CRUD de máquina, despesa gerada na
   criação com custo, registro de manutenção (com e sem custo), atualização
   de `next_maintenance_at`, geração do alerta `maintenance_due` dentro da
   janela de 15 dias, idempotência do alerta (não duplica), isolamento
   multi-tenant de `Machine`/`MachineMaintenance`, e permissão por role
   (`VISUALIZADOR` só lê).
3. Painel web: página de listagem de máquinas + detalhe com histórico de
   manutenções, seguindo o mesmo padrão visual de `/rebanho`.
4. Zero travessão (U+2014) em qualquer arquivo novo ou alterado.
