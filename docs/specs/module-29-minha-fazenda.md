# Módulo 29: Minha Fazenda (fazenda + pastos)

Status: V1 implementada (web), 2026-08-04. WhatsApp e vínculos futuros
(tarefa/despesa/cerca por pasto) ficam para uma rodada seguinte.

## Origem

Documento funcional enviado pelo cliente (arquivo `.doc`, fora do controle
de versão): "Minha Fazenda" deve ser a área onde o produtor cadastra as
informações básicas da propriedade e a divide em pastos. É descrita como "o
ponto de partida para o restante do sistema": rebanho, pastos, compromissos,
receitas, despesas e máquinas devem, no futuro, poder se relacionar a uma
fazenda ou a um pasto específico.

O documento fixa o escopo da primeira versão (seção 12, "resumo da área"):
nome da fazenda, tamanho total, município, distrito, divisão de pastos, nome
e tamanho de cada pasto. Vínculos com outras áreas do sistema (seção 9) são
explicitamente descritos como exemplos futuros, não requisito desta versão.

## Decisões tomadas com o usuário (2026-08-04)

Registradas aqui porque a spec original não resolvia sozinha; confirmadas via
`AskUserQuestion` antes de codificar, conforme protocolo do projeto.

1. **Interpretação do pedido**: "liberado somente o que cada propriedade
   controla" é sobre **estrutura de dados** (organizar por fazenda/pasto),
   não sobre controle de acesso/permissão. Confirmado explicitamente pelo
   usuário.
2. **Escopo desta rodada**: só o V1 estrito da seção 12 (cadastro + soma).
   Vínculos futuros (tarefa→pasto, despesa→fazenda, cerca→pasto) ficam de
   fora.
3. **Conflito de nome no menu**: "Minha Fazenda" já era o nome do grupo de
   navegação que agrupava Rebanho/Máquinas/Lavoura/Prestador/
   Financeiro/Alertas (layout novo, implementado no mesmo dia). Resolvido
   renomeando esse grupo para **"Operação"** e reservando "Minha Fazenda"
   para a tela nova (cadastro de fazenda + pastos), como um link de primeiro
   nível na sidebar, logo abaixo de "Início".
4. **Aviso de soma dos pastos**: apenas avisa, nunca bloqueia salvar (o
   documento sugere isso: "O sistema não deverá realizar alterações
   automaticamente", e a mensagem sugerida é uma pergunta, não um erro).
5. **WhatsApp**: fica para uma rodada seguinte, depois do modelo de dados e
   da tela web validados. O documento descreve um fluxo de cadastro guiado
   por WhatsApp (seção 10) como parte dos critérios de aceite, mas é escopo
   suficientemente grande (intenção nova, fluxo de confirmação, sincronizar
   o classificador do n8n) para não entrar na mesma rodada do modelo de
   dados.

## Modelo de dados

- **`Property`** ganhou `city` (município) e `district` (distrito).
  Nomeados em inglês por consistência com o resto do schema (`name`,
  `address`, `area_hectares` já eram todos em inglês; não havia nenhum
  precedente de campo em português no `schema.prisma`). Nullable no banco
  (propriedades já existentes não têm valor, sem backfill); obrigatório
  (`city`) e validado (`area_hectares > 0`) só na validação Zod da criação
  (`POST /api/v1/properties`), não no schema.
- **`Pasture`** (model novo, tenant-scoped): `property_id`, `name`,
  `area_hectares` (obrigatório, `> 0`), `archived_at` (desativar, nunca
  deletar, mesmo padrão de `Property`). Nome do model em inglês pela mesma
  razão de consistência; o termo de produto/UI é "pasto", em português, como
  o documento pede.
- **Não confundir `Pasture` com `Plot`/"Talhão"**: `Plot` é do domínio de
  Lavoura (`CropCycle`), pré-existente. Mesma forma superficial ("área
  dentro de uma propriedade"), domínios de produto diferentes, sem relação
  entre os dois models.
- Migração: `prisma/migrations/20260804120413_minha_fazenda_pasture/`.

## API

- `POST /api/v1/properties`: `city` agora obrigatório, `area_hectares`
  agora obrigatório e `> 0` (antes era opcional/`>= 0`). Único ponto do
  código que cria `Property` (confirmado antes de apertar a validação):
  nenhum script `test:mX` ou fluxo de signup é afetado, pois todos criam
  `Property` direto via Prisma, não por esta rota.
- `PATCH /api/v1/properties/:id`: aceita `city`/`district` (ambos
  opcionais, como os demais campos de edição).
- `GET/POST /api/v1/pastures`, `PATCH /api/v1/pastures/:id`,
  `POST /api/v1/pastures/:id/archive`: seguem o mesmo padrão de
  `/api/v1/plots` (property_id no body, guard reusa `"rebanho"`). Toda
  resposta inclui `meta.area_summary` (aditivo):
  `{ total_area, distributed_area, remaining_area, over_allocated }`,
  calculado por `getPastureAreaSummary()` em `src/lib/actions/properties.ts`.

## UI

- `/minha-fazenda` (`src/app/(dashboard)/minha-fazenda/page.tsx`): Server
  Component. Fazenda selecionada via `?property_id=` → cookie do seletor do
  topo → primeira propriedade da lista. Mostra detalhes da fazenda (editar
  via `FazendaForm`, arquivar via `ArchiveFazendaButton`), resumo de área
  (`Stat`s + aviso quando `over_allocated`) e lista de pastos
  (`PastureList`, com `PastureForm` para criar/editar).
- Antigo botão "Propriedades" (Sheet dentro de Rebanho,
  `src/components/rebanho/property-manager.tsx`) **removido**: cadastro de
  fazenda passa a acontecer só em `/minha-fazenda`, evitando dois formulários
  com validação diferente para a mesma entidade. Rebanho/Máquinas/Lavoura
  tiveram a mensagem de estado vazio ("cadastre uma propriedade...")
  atualizada para apontar para `/minha-fazenda`.
- Sidebar: grupo antes chamado "Minha Fazenda" (Rebanho/Máquinas/Lavoura/
  Prestador/Financeiro/Alertas) renomeado para **"Operação"**; "Minha
  Fazenda" agora é link de primeiro nível para a nova tela.

## Permissão

Reusa o guard `"rebanho"` (mesmo módulo que já protegia `Property`): o PRD
não define um `ModuleKey` próprio para "Minha Fazenda" e criar um novo
desviaria da matriz de acesso do PRD (§5.2) sem necessidade real.

## Fora desta rodada (deliberado)

- Cadastro de fazenda/pasto por WhatsApp (seção 10 do documento).
- Vínculo de `Task`, `FinancialEntry` ou qualquer outro model a `Pasture`
  (seção 9 do documento, exemplos futuros).
- Qualquer mudança em `Plot`/Lavoura.

## Validação

- `tsc --noEmit` e `eslint` limpos nos arquivos tocados (erros pré-existentes
  em `scripts/m23-token-auth.test.ts`, não relacionados, confirmados
  intocados por este módulo).
- Testado ao vivo em navegador real (`next dev` local, Postgres Docker,
  login `owner@damata.com.br`): cadastro de fazenda, edição
  (município/distrito), cadastro de pasto acima da área total (aviso exibido
  sem bloquear), desativação de pasto (soma volta ao normal), troca entre
  as duas fazendas do tenant seed, e regressão de Rebanho (sem o botão
  "Propriedades" removido, sem erro).
- Sem teste automatizado novo (`test:m29`) nesta rodada: escopo é
  puramente CRUD sobre um model novo, sem regra de negócio complexa o
  suficiente para justificar um script dedicado agora; reavaliar quando o
  WhatsApp ou os vínculos futuros entrarem.
