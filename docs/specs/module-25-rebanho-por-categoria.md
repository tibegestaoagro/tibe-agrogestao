# Módulo 25: Rebanho por categoria e quantidade

**Status:** especificado, decisões fechadas com o usuário em 2026-08-03.
Implementação a seguir. Todas as ambiguidades foram resolvidas em entrevista,
então **não é necessário perguntar de novo** o que está decidido aqui.

---

## 1. Objetivo

A Arquitetura Funcional da Agromax (seção 6.2) pede rebanho controlado **por
grupos ou categorias, com quantidade, sem exigir identificação individual**
na primeira versão; a seção 14 lista "controle individual por brinco"
explicitamente como funcionalidade futura. O sistema hoje faz o oposto: só
existe o modelo individual (`Animal`, brinco obrigatório).

Esse desalinhamento foi registrado em `docs/cliente/01-entendimento-do-produto.md`
e ainda **não tem confirmação formal da Agromax**. Decisão do usuário
(2026-08-03): seguir com a recomendação já proposta a eles em vez de esperar
indefinidamente, porque o rumo já foi validado internamente e é reversível
em impacto (nada é removido, só passa a ter uma alternativa mais simples).

O exemplo do próprio Manifesto do cliente vira o critério de aceitação
central: o produtor diz **"comprei 20 bezerros por R$ 60.000"** numa
mensagem, e isso deve bastar.

## 2. Decisões fechadas (não reabrir sem pedir)

1. **Dois modelos, lado a lado, nenhum substitui o outro.** `Animal`
   (individual, brinco obrigatório) continua **exatamente como está**: mesmo
   schema, mesmas rotas, mesmos testes (M1, M17), mesmo dado real de
   produção (Da Mata Sementes) intocado. Um modelo novo, `AnimalBatch`, cobre
   categoria e quantidade. Motivo: retrofitar `Animal` para representar as
   duas semânticas (peso/vacina por bicho vs. por lote) na mesma tabela era o
   caminho mais elegante no papel, mas o mais arriscado na prática, e o
   usuário decidiu explicitamente por segurança em vez de elegância.
2. **Lote é o caminho padrão de cadastro de rebanho pelo WhatsApp.** Nova
   intenção `registrar_lote_animal` some com o passo extra do cadastro
   assistido individual (`cadastrar_animal`, Onda 2) para o caso comum. O
   cadastro assistido individual **continua existindo**, como caminho
   opcional (quem já usa brinco continua usando exatamente como hoje), mas
   deixa de ser o único.
3. **Categorias são customizáveis por tenant desde já**, não uma lista fixa
   do sistema. Modelo novo `AnimalCategory` (tenant-scoped), com uma tela de
   gestão simples (`/configuracoes`, seção nova). Cada tenant nasce com uma
   lista padrão pré-populada (ver seção 4) para não começar vazio; pode
   renomear, desativar ou adicionar categorias depois.
4. **Lote tem peso médio opcional, sem vacina.** `AnimalBatch.average_weight`
   é um campo simples, editável, sem virar o sistema de GMD (`AnimalWeightLog`)
   nem o de agenda/vacina do M17: esses continuam exclusivos do modelo
   individual. Bate com "perguntar o mínimo": comprar um lote não exige peso
   nenhum.
5. **Cada aquisição gera um lote novo, nunca acumula numa linha existente da
   mesma categoria.** Preserva o custo de cada compra separadamente (dá pra
   saber a margem de cada lote depois). Consequência direta: vender precisa
   decidir de qual lote tirar quando há mais de um da mesma categoria.
   **Regra, sem perguntar ao usuário:** só 1 lote da categoria → decrementa
   direto; mais de 1 → decrementa do **mais antigo primeiro** (FIFO). Se a
   quantidade pedida for maior que a soma disponível na categoria, recusa com
   mensagem clara (não vende o que não tem).
6. **Vender reduz `AnimalBatch.quantity` e gera `FinancialEntry` de receita**,
   mesmo padrão que `registrar_movimento` (individual) já usa:
   `createLinkedEntry()`, `related_module: "rebanho"`, `related_id` do lote
   vendido (se a venda consumir mais de um lote via FIFO, um `FinancialEntry`
   por lote afetado, não um lançamento só: cada lote tem seu próprio custo de
   origem, então cada baixa é uma transação financeira própria). Comprar
   segue o mesmo padrão, despesa ligada ao lote novo criado.
7. **Sem histórico de movimentação de lote nesta rodada** (equivalente a
   `AnimalMovement`, que é só do modelo individual). A quantidade atual e o
   `FinancialEntry` gerado em cada compra/venda já dão rastro suficiente para
   v1; o documento do cliente não pede auditoria de movimentação por lote.
8. **`/rebanho` vira uma tabela só**, unindo lotes e animais individuais,
   com uma coluna indicando o tipo. Clicar num lote abre um detalhe simples
   (categoria, quantidade, peso médio, custo de aquisição, data); clicar num
   animal individual abre o detalhe de sempre (peso, vacina, sem mudança).
9. **Sem migração de dado existente.** Nada em `Animal` muda de tabela nem de
   forma. Lote é puramente aditivo: existe a partir de agora, para quem
   registrar dali pra frente.

## 3. Modelo de dados

```prisma
model AnimalCategory {
  id         String   @id @default(cuid())
  tenant_id  String
  name       String
  active     Boolean  @default(true)
  created_at DateTime @default(now())

  tenant  Tenant        @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  batches AnimalBatch[]

  @@unique([tenant_id, name])
  @@index([tenant_id])
}

model AnimalBatch {
  id                String    @id @default(cuid())
  tenant_id         String
  property_id       String
  category_id       String
  quantity          Int
  average_weight    Decimal?  @db.Decimal(10, 3)
  acquisition_cost  Decimal?  @db.Decimal(14, 2)
  acquired_at       DateTime  @default(now())
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt

  tenant   Tenant         @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  property Property       @relation(fields: [property_id], references: [id], onDelete: Restrict)
  category AnimalCategory @relation(fields: [category_id], references: [id], onDelete: Restrict)

  @@index([tenant_id])
  @@index([property_id])
  @@index([category_id])
}
```

Ambos entram em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`). `quantity = 0`
não apaga o lote (mantém o histórico de que existiu e foi totalmente
vendido); a listagem de `/rebanho` e o WhatsApp ignoram lotes zerados nas
buscas de "categoria disponível para vender".

**Categorias padrão semeadas na criação do tenant** (mesmo padrão de vacinas
padrão do M0): Bezerro, Bezerra, Garrote, Novilha, Vaca, Boi, Touro.

## 4. Fluxo WhatsApp: `registrar_lote_animal`

- **Gatilho:** mensagem com quantidade + categoria reconhecível, com ou sem
  valor ("comprei 20 bezerros por R$ 60.000", "chegaram 8 garrotes"). Sem
  valor, o lote é criado sem `acquisition_cost` e sem lançamento financeiro
  (nem todo lote vem de compra: pode ser nascimento na propriedade).
- **Categoria não reconhecida:** o agente pergunta para qual das categorias
  existentes do tenant a mensagem se refere, sem criar categoria nova
  sozinho (evita poluição por erro de transcrição de áudio).
- **Confirmação:** segue a regra geral do produto (resumo antes de gravar),
  mesmo padrão de `cadastrar_animal` e `registrar_lancamento_financeiro`.
- **Venda:** mensagem tipo "vendi 5 bezerros por R$ 8.000" aciona a mesma
  intenção em modo venda (quantidade negativa em relação ao estoque
  disponível), aplicando a regra de FIFO da seção 2.5 sem perguntar qual
  lote, a menos que a quantidade pedida exceda o total disponível na
  categoria (aí recusa, não pergunta "de qual lote", porque a resposta já é
  "não há suficiente").
- **Perfil/permissão:** mesma regra de `cadastrar_animal` hoje
  (`module: "rebanho"`, `profile: "fazenda"`).

## 5. Fora de escopo desta rodada

- Migrar ou converter `Animal` existentes em `AnimalBatch`, ou vice-versa.
- Peso individual, GMD, vacina ou agenda para lote (continua exclusivo do
  modelo individual).
- Histórico de movimentação por lote (equivalente a `AnimalMovement`).
- Reatribuir manualmente de qual lote uma venda específica tira (FIFO é fixo
  nesta rodada, sem escolha do usuário).
- Mesclar dois lotes da mesma categoria manualmente.
- App mobile (B2) e o pacote de contratos (`packages/contracts`): ambos
  ficam desatualizados em relação a `AnimalBatch` até uma rodada futura que
  decida incluir rebanho neles (nenhum dos dois cobre rebanho hoje, de
  propósito, justamente por causa desta mudança de modelo ainda pendente
  quando foram construídos).

## 6. Critérios de aceitação

1. `npm run test:m1` e `npm run test:m17` continuam passando sem alteração
   (prova de que o modelo individual não foi tocado).
2. Um novo `npm run test:m25` cobre: criação de categoria padrão no
   onboarding do tenant; CRUD de categoria customizada; criação de lote via
   action (com e sem custo de aquisição); venda de lote único; venda com
   FIFO entre 2+ lotes da mesma categoria; recusa de venda acima do
   disponível; isolamento multi-tenant de `AnimalCategory` e `AnimalBatch`.
3. `POST /api/internal/whatsapp/execute-action` com a intenção
   `registrar_lote_animal` cria o lote e, quando há valor, o `FinancialEntry`
   correspondente, ponta a ponta.
4. `/rebanho` no painel mostra lotes e animais individuais na mesma tabela,
   com o tipo visível, e o detalhe de cada um abre a tela certa.
5. Zero travessão (U+2014) em qualquer arquivo novo ou alterado.
