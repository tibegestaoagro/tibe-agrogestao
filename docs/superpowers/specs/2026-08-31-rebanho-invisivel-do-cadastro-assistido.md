# O rebanho invisível do cadastro assistido

**Data:** 31 de agosto de 2026
**Frente:** estreia do time Servidor, fase 3 do plano de agentes
**Origem:** [dividas.md](../../agents/dividas.md), defeito ativo do rebanho
**Suíte:** `m51`

---

## 1. O problema

Quem cadastra animal pelo **assistente do WhatsApp** não o vê no rebanho. O
lote é criado, o produtor recebe confirmação, e o saldo continua o mesmo. Sem
erro, sem aviso.

## 2. O terreno, e o que o registro dizia errado

⚠️ **O `dividas.md` e o handoff afirmam que `POST /api/v1/animals` também está
quebrada. Não está, desde 2026-08-20.** A rota chama `createBatchAction`, que
grava o `HerdMovement` quando a categoria traduz e deixa **resíduo visível** no
diagnóstico quando não traduz. Há um comentário de 19 linhas no próprio arquivo
documentando essa correção. O registro está desatualizado, e esta spec o
corrige.

O defeito real é só o do assistente, em `commitAnimals()`
(`src/lib/actions/whatsapp-flow-bridge.ts`):

| linha | o que faz | consequência |
|---|---|---|
| 168 | `db.animalBatch.create()` **direto** | nenhum `HerdMovement`, e nem o resíduo visível |
| 156 | categoria fixa `"Não classificado"` | não traduz para as 12 do livro-razão |
| 179 | `catch { failed++ }` | engole o motivo da falha |
| 151 | `props[0]?.id` | primeira propriedade ativa, sem perguntar |

**Por que a categoria é fixa:** o cadastro assistido pergunta brinco, raça e
sexo, e nunca categoria. Foi decisão de 2026-08-04, quando cada animal
identificado passou a ser um lote de 1 cabeça.

## 3. As decisões, e por quê

| # | Decisão | Motivo |
|---|---|---|
| 1 | `commitAnimals` passa a chamar **`createBatchAction`** | Invariante 6: regra de negócio vive na action. Hoje a ponte duplica um `create` e por isso não herdou a correção de 20/08. Chamar a action faz a ponte herdar todas as futuras, de graça |
| 2 | O fluxo assistido ganha uma **pergunta de categoria** | Sem ela o animal continua invisível, porque "Não classificado" não traduz. Adivinhar a categoria a partir de raça ou sexo está **proibido** pela regra do módulo: lançar animal na faixa de idade errada é pior que não lançar |
| 3 | A pergunta nasce em **`agent-flows.ts`**, dentro do Tibé | A máquina de estados do cadastro assistido é do Tibé, não do n8n. Isso permite entregar sem tocar no classificador, que está congelado por decisão do usuário |
| 4 | O `catch` passa a **registrar o motivo** | Falha silenciosa em cadastro é como o produtor perde gado sem saber. O motivo vai para o log estruturado, e a contagem de falha continua indo para a resposta |
| 5 | `props[0]` **fica como está**, por ora | Escolher propriedade é outra pergunta e outra decisão de produto. Fica registrado em "fora desta missão", adiado e não descartado |

## 4. O contrato

**A pergunta nova**, no fluxo de cadastro de animal:

- Ela vem **depois** de brinco, raça e sexo, e antes do commit.
- Ela oferece as **12 categorias do livro-razão** (a constante de código, em
  `src/lib/herd/categories.ts`), não a tabela `AnimalCategory` de nomes livres.
- A resposta é resolvida por `resolveCategoryTerm`. **Se não resolver, o fluxo
  repergunta**, e não chuta.

**A chamada a `createBatchAction`** usa a assinatura que já existe. O que a
ponte precisa passar, por item: `property_id`, `category_id`, `quantity: 1`,
`ear_tag`, `breed`, `sex`, e a data de aquisição.

⚠️ **Nenhum agente inventa nome de campo.** Se a assinatura de
`createBatchAction` não comportar algo que a ponte precisa, isso é achado:
**pare e relate**, não estenda a action por conta própria.

## 5. Entrega e provas

Ordem: **action (se precisar mudar), depois a ponte, depois o fluxo.** Não há
tela nesta missão.

- Suíte `m51`, escrita **da spec**, sem ler a implementação. Ela prova:
  1. Cadastro assistido completo cria `AnimalBatch` **e** `HerdMovement`.
  2. O saldo (`getPositions`) enxerga o animal depois do cadastro.
  3. Categoria que não traduz faz o fluxo **reperguntar**, e não grava.
  4. Falha em item registra o motivo, e não some.
- `npm run check`, `npx tsc --noEmit`, `npm run lint` limpos.
- `npm run test:isolation` verde (o caminho toca `HerdMovement`).

⚠️ **A prova que mais importa é o `npm run wa`**, que conversa com o agente de
produção e lê a resposta por programa. Suíte verde não prova o caminho do
WhatsApp: cinco rodadas de juiz com a suíte inteira verde não pegaram a compra
recusada sendo gravada no estoque.

## 6. Fora desta missão

Adiado, não descartado:

- **Escolher a propriedade** quando houver mais de uma ativa (decisão 5).
- **Ensinar a intenção ao classificador do n8n.** Não é preciso: a pergunta
  nova é do fluxo, e o fluxo é do Tibé. O classificador continua congelado.
- **Migrar os lotes já criados invisíveis.** Quantos existem, e se compensa
  corrigi-los retroativamente, é levantamento próprio.
- **A tabela `AnimalCategory` de nomes livres**, que convive com as 12
  categorias constantes. A ponte entre as duas é o `resolveCategoryTerm`, e
  unificá-las é frente própria.
