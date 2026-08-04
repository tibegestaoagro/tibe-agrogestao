# Rebanho por categoria: modelo único de lote

Data: 2026-08-04
Status: desenho aprovado pelo usuário, sem implementação ainda.

## Por que existe

Este é o desalinhamento mais antigo em aberto do projeto. A Agromax pediu
rebanho **por categoria** (bezerro, novilha, boi gordo, com quantidade); o
que foi construído no Módulo 1 foi rebanho **por brinco**, uma linha por
cabeça. O Módulo 25 tentou fechar a lacuna adicionando `AnimalBatch` ao lado
de `Animal`, mas isso resolveu pela metade: o produtor passou a ter **dois
jeitos diferentes de cadastrar boi**, com telas, regras e intenções de
WhatsApp separadas.

Decisão do usuário em 2026-08-04, encerrando a ambiguidade: *"será por
categoria, foi como foi pedido, o brinco fica como algo opcional, para
somente quem trabalha com brinco"*.

## O dado que torna isto barato agora

Contado em produção (Neon) antes de desenhar:

| Tabela | Linhas em produção |
|---|---|
| `Animal` | 2 |
| `AnimalBatch` | 0 |
| `AnimalWeightLog` | 0 |
| `AnimalVaccination` | 0 |
| `AnimalMovement` | 0 |

Praticamente não há dado real. Isso muda a decisão de arquitetura: o custo
que normalmente inviabiliza consolidar dois modelos (mover histórico e
repontar chaves estrangeiras) aqui é zero. **É a única janela em que essa
troca sai de graça**, e ela fecha assim que os primeiros clientes reais
começarem a cadastrar rebanho.

## Decisões

### D1. Um modelo só, chamado `AnimalBatch`

Tudo vira lote por categoria. `Animal` deixa de existir como modelo separado.
Quem trabalha com brinco cadastra um lote de 1 cabeça e preenche o brinco.

Descartado: evoluir `Animal` (adicionando categoria e quantidade) e descartar
`AnimalBatch`. Seria ainda mais barato, porque as tabelas de histórico já
apontam para `Animal` e não precisariam ser tocadas, mas deixaria para sempre
um modelo chamado `Animal` com `quantity: 20`, que lê errado. Com 0 linhas de
histórico em produção, o argumento de custo que justificaria conviver com o
nome errado não existe.

Campos do modelo unificado:

```
AnimalBatch
  id, tenant_id, property_id, category_id
  quantity           Int        quantas cabeças
  ear_tag            String?    OPCIONAL: só quem trabalha com brinco
  breed              String?
  sex                AnimalSex?
  birth_date         DateTime?
  average_weight     Decimal?
  acquisition_cost   Decimal?
  acquired_at        DateTime
  created_at, updated_at
```

`ear_tag` continua único por tenant **quando preenchido** (índice único
parcial, `WHERE ear_tag IS NOT NULL`): dois lotes sem brinco não conflitam
entre si, mas o mesmo brinco não pode ser cadastrado duas vezes.

⚠️ **Índice parcial é uma armadilha conhecida deste projeto** (já documentada
no `CLAUDE.md` por causa de `WhatsAppProviderConfig_one_active`): o Prisma não
consegue representá-lo no `schema.prisma`, então **todo `migrate diff` futuro
vai sugerir um `DROP INDEX` dele como se fosse drift**. Quem implementar
precisa escrever esse índice à mão no SQL da migração e, dali em diante,
remover a linha de `DROP` de todo diff gerado. Ignorar isso derruba a garantia
de brinco único sem nenhum aviso.

Note também que `sex` deixa de ser obrigatório (hoje é `AnimalSex` sem `?`):
um lote de 20 cabeças pode ser misto, e forçar um sexo único mentiria sobre o
dado.

### D2. Histórico para todo mundo, não só para quem usa brinco

`AnimalWeightLog`, `AnimalVaccination` e `AnimalMovement` passam a apontar
para o lote: `animal_id` vira `batch_id`.

Pesagem de um lote de 20 é a média daquele lote naquela data; de um lote de 1,
é o peso daquele animal. O GMD (ganho médio diário) passa a existir para quem
trabalha por categoria, que depois desta mudança é a maioria. Hoje o lote tem
só um campo `average_weight` sem histórico, o que impediria responder "esse
lote está ganhando peso?", que é a pergunta central da pecuária de corte.

### D3. `status` sai do modelo

`Animal.status` (`active` / `sold` / `deceased`) é removido. No modelo
unificado ele é redundante: `quantity` já diz o que resta (zero significa que
acabou), e a distinção entre vendido e morto já vive em
`AnimalMovement.movement_type`.

Consequência visível: o filtro de status na tela de Rebanho vira **filtro por
categoria**, que é a pergunta que o produtor de fato faz ("quantos bezerros eu
tenho?").

### D4. Migração

Os 2 animais de produção viram lotes de 1 cabeça, preservando brinco, raça,
sexo, nascimento e peso. Precisam de uma `category_id`: como não há como
adivinhar a categoria de um animal existente, entram numa categoria
"Não classificado", criada por tenant na própria migração, para o produtor
reclassificar depois. Nenhum dado é perdido.

## Escopo

Entra:

- Schema: modelo unificado, índice único parcial de `ear_tag`, `batch_id` nas
  3 tabelas de histórico, remoção de `Animal` e de `AnimalStatus`.
- Migração dos 2 animais e da categoria "Não classificado".
- Actions: consolidar `animals.ts`, `animal-batches.ts`, `animal-weights.ts`,
  `animal-vaccinations.ts` e `animal-movements.ts` no modelo único.
- Rotas: `/api/v1/animals*` e `/api/v1/animal-batches*` viram um conjunto só.
- Tela de Rebanho: uma listagem, sem a coluna "Individual/Lote".
- Intenções do WhatsApp: `cadastrar_animal` e `registrar_lote_animal`
  convergem; `registrar_peso`, `registrar_vacina` e `registrar_movimento`
  passam a aceitar lote.
- `packages/contracts`: contrato de rebanho, que hoje não existe.
- `/docs/api`: os dois grupos de rebanho viram um.
- Teste novo provando que o histórico sobrevive à migração.

Não entra:

- Rebanho no app mobile (fica para depois, conforme o roadmap do app).
- Qualquer mudança em Lavoura, Máquinas ou Prestador.

## Riscos

1. **É a mudança de schema mais invasiva desde o Módulo 0.** Toca 4 tabelas,
   ~10 rotas, 5 arquivos de action, 3 intenções do WhatsApp e a tela mais
   usada do painel. O volume de dado é desprezível, mas a superfície de
   código não é.
2. **A janela fecha.** Depois que clientes reais cadastrarem rebanho, esta
   mesma migração passa a exigir mover histórico de verdade.
3. **`ear_tag` deixa de ser obrigatório**, então todo código que assume brinco
   presente (mensagens do agente, telas, o resumo do WhatsApp) precisa tratar
   ausência. É o tipo de detalhe que passa em teste e quebra em produção com
   "undefined" na tela.

## Critérios de aceite

- Cadastrar 20 bezerros sem brinco funciona; cadastrar 1 boi com brinco
  funciona; os dois aparecem na mesma listagem.
- O mesmo brinco não pode ser cadastrado duas vezes no mesmo tenant; dois
  lotes sem brinco convivem sem conflito.
- Pesar um lote duas vezes em datas diferentes gera histórico e calcula GMD.
- Vender 5 de um lote de 20 deixa 15 e gera o lançamento de receita.
- Os 2 animais de produção continuam visíveis após a migração, com brinco,
  raça e peso preservados, na categoria "Não classificado".
- `test:isolation` continua verde (o modelo unificado é tenant-scoped).
- Toda a suíte verde, `tsc` e `eslint` limpos, e `test:docs-api` refletindo o
  conjunto novo de rotas.
- Validado no navegador com sessão real antes de subir.

## Ordem de execução sugerida

1. Schema e migração, com o teste de preservação do histórico.
2. Actions consolidadas.
3. Rotas e `/docs/api`.
4. Tela de Rebanho.
5. Intenções do WhatsApp.
6. `packages/contracts`.

Cada passo commitado separado: se algo quebrar em produção, o ponto de
reversão é pequeno.
