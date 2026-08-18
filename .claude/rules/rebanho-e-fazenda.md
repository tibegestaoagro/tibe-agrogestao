---
paths:
  - "src/lib/herd/**"
  - "src/lib/actions/herd*.ts"
  - "src/lib/actions/animals.ts"
  - "src/lib/actions/properties.ts"
  - "src/app/(dashboard)/rebanho/**"
  - "src/app/(dashboard)/minha-fazenda/**"
  - "src/app/api/v1/pastures/**"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     O saldo do rebanho como soma de movimentacoes, as 12 categorias como constante, e o escopo deliberado de Minha Fazenda. -->

## Rebanho como livro-razão (Módulo 30, EM ANDAMENTO desde 2026-08-05)

Branch `rebanho-livro-razao`. Spec:
[docs/specs/module-30-rebanho-livro-razao.md](docs/specs/module-30-rebanho-livro-razao.md).
Origem: 2 documentos do cliente em `docs/Modulo Rebanho/` (versionados).

**A regra central: o saldo do rebanho NUNCA é gravado.** A quantidade de cada
posição é a soma das movimentações em `HerdMovement`. Se você se pegar
escrevendo um campo de quantidade em algum lugar, pare: é sinal de que a
regra está voltando para o modelo antigo.

- **Posição** = `categoria x fazenda x pasto x situação x dono` (enums
  `HerdSituation` e `HerdOwner`). Uma movimentação tira `quantity` cabeças de
  uma posição (campos `from_*`) e põe na outra (`to_*`). Entrada não tem
  origem, saída não tem destino, transferência tem as duas pontas. **Mudança
  de categoria não é caso especial**: é um movimento com categorias
  diferentes nas duas pontas.
- **As 12 categorias são constante de código** (`src/lib/herd/categories.ts`),
  não linha de banco editável, pelo mesmo motivo de `PLAN_PRICES`. Cada uma
  carrega sexo, faixa em meses e flag de reprodutiva: sem isso, "total de
  machos", traduzir "novilha" e o envelhecimento não são calculáveis.
  `resolveCategoryTerm()` devolve **`ambiguous` em vez de chutar** quando o
  termo serve a mais de uma faixa: é o que impede o assistente de lançar
  animais na idade errada.
- **`AnimalCategory` (tabela) segue existindo** só para o modelo antigo
  enquanto a migração dos consumidores não termina. Os nomes populares que
  ela guardava viraram a tabela de apelidos em `categories.ts`.
- **`canceled_at` não apaga**: cancelar para de contar no saldo e mantém a
  linha identificada no histórico, como o §10.8 exige.
- **Fase 1** (em andamento): as 9 movimentações básicas. **Fase 2**: leilão,
  pasto de terceiros, boitel, confinamento, desaparecimento e animais de
  terceiros. Dividir é seguro porque os eixos de dono e situação já nascem na
  fase 1.
- Testes: `npm run test:m32` (categorias, função pura, sem banco).

---

## Minha Fazenda (Módulo 29, 2026-08-04)

Área nova pedida pelo cliente (documento funcional enviado pelo cliente,
arquivo `.doc` binário em `docs/`, versionado no git para preservar a
origem):
cadastro da fazenda em si (nome, tamanho total, município, distrito) e sua
divisão em pastos (nome + tamanho cada). Objetivo do cliente: "o ponto de
partida para o restante do sistema" (rebanho, pastos, compromissos, receitas,
despesas e máquinas relacionados a uma fazenda cadastrada). V1 implementada é
estritamente o escopo da seção 12 do documento (cadastro + soma), sem os
vínculos futuros que o próprio documento lista como exemplo (tarefa→pasto,
despesa→fazenda, cerca→pasto): decisão do usuário, não avançar nisso ainda.

- **`Property` ganhou `city`/`district`** (município/distrito do documento,
  nomeados em inglês por consistência com o resto do schema, que não tem
  nenhum precedente de campo em português). Nullable no banco (propriedades
  existentes não têm valor); obrigatório só na validação Zod de criação
  (`POST /api/v1/properties`), pra não quebrar dado real já existente nem exigir
  backfill. `area_hectares` também passou a ser exigido e `> 0` só na
  criação (o documento pede isso), mantendo nullable no schema pelo mesmo
  motivo. Único ponto do código que cria `Property` é essa rota (confirmado
  antes de apertar a validação): nenhum script de teste ou fluxo de signup é
  afetado.
- **Model novo `Pasture`** (tenant-scoped, em `TENANT_SCOPED_MODELS`):
  `property_id`, `name`, `area_hectares` (obrigatório, `> 0`), `archived_at`
  (desativar, nunca deletar: mesmo padrão de `Property`). Nome do model em
  inglês por consistência (`Property`, `Plot`, `Machine`...); o termo de
  produto/UI continua "pasto", em português, como o documento pede
  explicitamente. **Não confundir com `Plot`/"Talhão"** (domínio de
  Lavoura/`CropCycle`): mesma forma superficial ("área dentro de uma
  propriedade"), domínios diferentes, sem relação entre os dois models.
- **Aviso de soma dos pastos > tamanho da fazenda é só aviso, nunca bloqueia
  salvar** (decisão do usuário, confirma a leitura literal do documento: "O
  sistema não deverá realizar alterações automaticamente"). Calculado em
  `getPastureAreaSummary()` (`src/lib/actions/properties.ts`), devolvido como
  `meta.area_summary` (aditivo) nas rotas de pasto e recalculado a cada
  render da página (Server Component, sem cache).
- **Reestruturação de navegação**: antes deste módulo, "Minha Fazenda" era o
  nome do GRUPO que agrupava Rebanho/Máquinas/Lavoura/Prestador/
  Financeiro/Alertas na sidebar (Fase 1 do layout, 2026-08-04, mesmo dia).
  O documento do cliente usa "Minha Fazenda" pra outra coisa (cadastro da
  propriedade em si), então o grupo foi renomeado pra **"Operação"** e
  "Minha Fazenda" virou um link de primeiro nível (`/minha-fazenda`, ícone
  reaproveitado do grupo antigo), logo abaixo de "Início": decisão do
  usuário, não uma dedução minha.
- **Página `/minha-fazenda`** (`src/app/(dashboard)/minha-fazenda/page.tsx`):
  Server Component, filtra por `?property_id=` (fallback pro cookie do
  seletor do topo, fallback pra primeira propriedade da lista). Substituiu o
  antigo botão "Propriedades" (Sheet dentro de Rebanho,
  `src/components/rebanho/property-manager.tsx`, **removido**: cadastro de
  fazenda agora só acontece aqui, não em dois lugares com validação
  diferente). Rebanho/Máquinas/Lavoura tiveram a mensagem de "cadastre uma
  propriedade" atualizada pra apontar pra cá.
- **Guard de permissão reusa `"rebanho"`** (mesmo módulo de `Property` já
  usava): o PRD não define um `ModuleKey` próprio para "Minha Fazenda", e
  criar um novo desviaria da matriz de acesso §5.2 sem necessidade real
  (Property/Pasture sempre foram parte do mesmo bloco de permissão que
  Rebanho).
- **Fora desta rodada, deliberadamente**: cadastro de fazenda/pasto pelo
  WhatsApp (seção 10 do documento, intenção nova + fluxo de confirmação +
  sincronizar o classificador do n8n) e qualquer vínculo de outro model a
  `Pasture` (Task, FinancialEntry, etc.): decisão do usuário, rodada
  seguinte, depois de validar o modelo de dados com uso real.

---
