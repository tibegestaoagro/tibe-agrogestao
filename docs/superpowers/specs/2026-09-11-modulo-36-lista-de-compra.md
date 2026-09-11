# Módulo 36: Minha Lista de Compra

Módulo novo, o único das quatro áreas que ganha número próprio (decisão 24). O
mapa das quatro e as 34 decisões estão em
[2026-09-10-sequencia-das-quatro-areas.md](2026-09-10-sequencia-das-quatro-areas.md).

Documento do cliente: `docs/modulo-lista-de-compras/`. As seções citadas com §
são dele.

**O que este módulo é, na frase do próprio documento:** "o Tibé deve substituir
aquele papelzinho onde o fazendeiro anota durante a semana tudo o que não pode
esquecer de comprar quando for à cidade".

⚠️ **O princípio que governa o módulo inteiro (§3):** adicionar um item à lista
**não é uma compra**. Não mexe em estoque, não cria despesa, não cria conta a
pagar. É uma necessidade anotada. O dinheiro só entra quando o produtor
confirmar que comprou, e aí quem registra é Negociações.

---

## O que existe hoje, medido

| pedido do documento | hoje |
|---|---|
| §4, item de lista | **não existe** nenhum model para isso |
| §6, categorias | existe `ProductCategory`, com **15** nomes (`CATEGORIAS_INICIAIS`, `src/lib/stock/units.ts`), que **não são** os 14 do §6 |
| §12, registrar a compra | existe inteiro: `registrarNegociacaoDeProduto` (`type: compra_produto`) já cria despesa, parcela, entrada de estoque e vínculo com a fazenda, numa transação só |
| §13, sugestão por estoque baixo | o alerta `low_stock` já existe e já roda no cron diário (`gerarAlertasDeEstoqueMinimo`); falta a AÇÃO de mandar para a lista |
| §17, WhatsApp | a infraestrutura existe (intenções, roteador, store de pendência), mas **o classificador do n8n está congelado** e não emite intenção nova |
| §9, fazenda | `Property` e o seletor de propriedade ativa existem e são reusados |
| §5, unidade | `src/lib/stock/units.ts` já tem o vocabulário de unidade do estoque |

⚠️ **`registrarNegociacaoDeProduto` exige `product_id`** em cada item
(`ItemProdutoInput = { product_id, quantity }`). Um item de lista que seja só
descrição livre ("comprar arame") **não tem** produto, e portanto não pode ser
registrado como compra sem antes virar um `Product`. Isso não é defeito: é a
fronteira entre "anotei numa folha" e "isto entra no meu estoque". A spec
resolve no T06.

---

## O desenho

### `ShoppingItem`, e nenhuma entidade "lista"

```
model ShoppingItem {
  id          String   @id @default(cuid())
  tenant_id   String

  /// §4: a única informação obrigatória. "Comprar arame" é um item válido.
  description String

  /// Decisão 11, item híbrido: quando o produtor escolhe um produto do
  /// catálogo, a compra do §12 reaproveita tudo e a sugestão do §13 tem como
  /// apontar. Quando não escolhe, sobra a descrição, e está certo assim.
  product_id  String?

  quantity    Decimal? @db.Decimal(14, 3)
  unit        String?
  property_id String?
  category_id String?
  purpose     ShoppingPurpose?
  priority    ShoppingPriority  @default(normal)

  /// §16: onde o produtor pretende comprar. Texto livre, não um cadastro de
  /// fornecedor: o §21 tira "gestão de fornecedores" da primeira versão.
  place       String?
  notes       String?

  status      ShoppingItemStatus @default(pendente)

  /// §12: a negociação que nasceu deste item, quando o produtor registrou a
  /// compra em vez de apenas concluir.
  negotiation_id String?

  created_by_user_id String?
  /// §19.8: quando saiu da lista, por compra ou por remoção.
  resolved_at DateTime?
  created_at  DateTime @default(now())
}

enum ShoppingItemStatus { pendente  comprado  removido }   // §18
enum ShoppingPriority   { normal  urgente }                 // §7
enum ShoppingPurpose    { rebanho  pasto  confinamento  leite  maquina  cerca  fazenda_geral  outro }  // §8
```

**Não existe entidade "lista"** (decisão 15). "A lista" é a consulta dos
pendentes, e o agrupamento que o §16 pede é o campo `place`. Uma tabela de
listas traria a pergunta que o documento nunca faz: quantas listas o produtor
tem, e o que acontece quando ele fecha uma.

**Item concluído não é apagado** (§18, §19.6): ele muda de `status` e sai dos
pendentes. O histórico é a consulta dos não pendentes.

⚠️ **`ShoppingPurpose` é enum próprio, e não categoria** (decisão 32).
Categoria é o que o produto **é**; finalidade é **para onde ele vai**. O mesmo
sal mineral pode ir para o rebanho ou para o confinamento.

⚠️ **Este enum é compartilhado com a Calculadora** (Módulo 37, decisão 32):
mesmo conceito, mesmo vocabulário. Dois enums idênticos divergem no dia em que
alguém acrescentar um valor num só.

### As categorias: acrescentar, como no Financeiro

**Decisão do usuário em 11/09.** A Lista reusa `ProductCategory`, e as
categorias do §6 que ainda não existem são **acrescentadas** ao provisionamento,
sem apagar nem renomear nada. É exatamente o que a T06 da fase 35.1 fez com as
26 categorias financeiras, e pela mesma razão: de fora não há como distinguir
uma padrão antiga de uma que o produtor renomeou.

Hoje (§9.1 do Estoque, 15): Sal mineral, Ração, Suplementos, Sementes,
Medicamentos, Vacinas, Adubos, Calcário, Combustível, Lubrificantes, Materiais
para cerca, Ferramentas, Peças, Produtos veterinários, Outros.

Do §6 da Lista, as que faltam: **Alimentação animal, Sal e suplementos,
Medicamentos e vacinas, Adubos e corretivos, Combustíveis, Máquinas e peças,
Produtos para leite, Produtos para confinamento, Material de construção, Uso
doméstico da fazenda**.

⚠️ **Consequência aceita de olhos abertos:** a lista vai a 25 nomes, com pares
parecidos ("Ração" e "Alimentação animal", "Peças" e "Máquinas e peças"). A
alternativa era um segundo vocabulário de categoria no sistema, que a decisão
32 existe para evitar.

⚠️ **O provisionamento hoje roda ao abrir o Estoque, e só para quem pode
escrever.** A Lista precisa do mesmo cuidado: um VISUALIZADOR não pode gravar
15 linhas só de abrir a tela, e tenant em `read_only` por atraso de pagamento
também não.

---

## As decisões que já estão tomadas

Do grill de 10/09:

- **Sem entidade "lista"** (decisão 15).
- **Item híbrido**, produto opcional mais descrição livre (decisão 11).
- **Só a descrição é obrigatória** (decisão 32).
- **Categoria reusa `ProductCategory`; finalidade é enum próprio** (decisão 32).
- **Registrar compra reusa Negociações, sem exceção** (decisão 12). Um caminho
  próprio criaria uma segunda porta para mexer em estoque e financeiro, que é
  como nasce o lançamento duplicado que o §49 do Financeiro proíbe.
- **Estoque baixo reusa o alerta `low_stock`** (decisão 27), que ganha a ação
  "adicionar à lista". Uma segunda varredura significaria dois lugares
  decidindo o que é estoque baixo. ⚠️ Registrado aqui, como a decisão pediu: o
  alerta compara o **total do tenant**, não o saldo por fazenda.

Do usuário, em 11/09:

- **As categorias do §6 que faltam são acrescentadas** às de produto.
- **Os handlers do WhatsApp são construídos agora, e o n8n fica para depois**,
  como foi feito com as missões 3 e 4 das Negociações. Ficam roteados e
  testados, esperando a rodada em que o classificador for descongelado.
- **Entram na primeira versão** o aviso de duplicata (§19.7), o repetir item
  comprado (§14) e os vários itens numa frase (§17).

---

## Tarefas

### T01: schema e migração

`ShoppingItem` e os três enums. Model novo entra em `TENANT_SCOPED_MODELS`
(invariante 1), e `npm run test:isolation` reprova se esquecer.

`product_id`, `property_id` e `category_id` com `SetNull`: arquivar um produto
ou uma fazenda não pode travar a lista. `negotiation_id` idem.

⚠️ Migração escrita à mão com `migrate diff`, nunca `migrate dev`. Aplicar
primeiro no Docker local.

### T02: as actions

`src/lib/actions/shopping-items.ts`, com o CRUD que o §20 pede:

| action | o que faz |
|---|---|
| `criarItemAction` | descrição obrigatória, todo o resto opcional |
| `listarItensAction` | filtros por status, fazenda, prioridade e `place` |
| `atualizarItemAction` | §5: a quantidade pode chegar depois |
| `concluirItemAction` | §11 opção 1, "apenas concluir": sai da lista, sem gerar nada |
| `removerItemAction` | §18: `removido`, não apagado |
| `repetirItemAction` | §14: cria um item novo a partir de um já comprado |

⚠️ **Nada aqui toca estoque ou financeiro** (§19.1 e §19.2). Se uma destas
funções importar `createLinkedEntry` ou `recordStockMovement`, o desenho saiu do
trilho.

### T03: o aviso de duplicata (§19.7)

`criarItemAction` devolve os pendentes parecidos em vez de recusar: quem decide
é o produtor, e "adicionar mais" é resposta legítima. A comparação é por
`product_id` quando existe, e por descrição normalizada (minúscula, sem acento)
quando não existe.

⚠️ **Reuse `normalizarTermo` de `whatsapp-handlers/shared.ts`**, criado na fase
35.1. Não escreva a sexta cópia.

### T04: as rotas

`/api/v1/shopping-items` (GET, POST), `/api/v1/shopping-items/[id]` (PATCH,
DELETE) e `/api/v1/shopping-items/[id]/purchase` (POST, o §12). Wrappers finos,
`apiErroDeZod` na recusa, `field` em toda recusa que pertence a um campo.

Módulo de permissão: `estoque` para leitura e escrita, pelo mesmo motivo que a
categoria vem de lá.

### T05: as categorias que faltam

Acrescentar as dez do §6 a `CATEGORIAS_INICIAIS`, e fazer o provisionamento
acrescentar o que falta em vez de só semear quando a lista está vazia. **É a
mesma correção da T06 do Financeiro**, e o mesmo caso que discrimina serve:
tenant que já tinha as 15 recebe as dez novas sem perder nenhuma, e listar duas
vezes não duplica.

### T06: registrar a compra (§12)

A ponte para Negociações. O que a spec precisa resolver, e o documento não:

1. **Item sem `product_id` não pode virar compra direto**, porque
   `registrarNegociacaoDeProduto` exige produto. O caminho: a tela e o handler
   pedem o produto (escolher um existente ou criar na hora, com a descrição do
   item como nome sugerido), e só então registram.
2. **O que já se sabe não se pergunta de novo** (§12): produto, quantidade,
   unidade e fazenda saem do item; falta o valor, e a forma de pagamento.
3. **Concluir o item é parte da mesma transação.** Se a negociação entrar e o
   item ficar pendente, o produtor compra duas vezes.
4. `negotiation_id` guardado no item, para o histórico saber de onde veio.

### T07: o alerta de estoque baixo ganha a ação (§13)

O alerta `low_stock` já nasce com o produto e o saldo. Falta o botão "adicionar
à lista" na tela de alertas, que cria o `ShoppingItem` com `product_id`,
`unit` e a categoria do produto já preenchidos.

⚠️ **Nunca adicionar sozinho** (§13, explícito). O alerta sugere; quem decide é
o produtor.

### T08: a tela

`/lista-de-compra`. O §20 pede simplicidade extrema: a lista dos pendentes com
produto, quantidade, unidade e prioridade, e os quatro atalhos (adicionar,
marcar como comprado, remover, registrar compra). Urgente primeiro.

Agrupamento por `place` quando houver (§16), histórico fora do caminho
principal (§18), e o painel de escrita nasce no kit (`FormSheet` + `Field` +
`useErrosDeFormulario`), com o `id` do `Field` sendo o nome do campo na API.

### T09: os handlers do WhatsApp (§17)

Cinco gestos: adicionar, adicionar sem quantidade, consultar, remover e
"comprei". O último cai no fluxo do T06.

⚠️ **Vários itens numa frase** ("2 rolos de arame, 5 litros de óleo e uma
correia") vira **três itens separados**. O classificador manda o que mandar, e
o handler precisa aceitar tanto uma lista de itens quanto um item só.

⚠️ **O classificador do n8n NÃO emite estas intenções**, e isso fica registrado
no código como já está para `registrar_remessa_evento` e `registrar_permuta`.
Handlers roteados e testados agora; o n8n numa rodada própria.

⚠️ **Recusa cancela, ponto.** O classificador não remonta os parâmetros
literalmente, e comparar campos de uma volta com os da anterior lê toda recusa
como correção. Foi assim que "não, deixa pra lá" gravou uma compra de R$ 1.200
no estoque.

### T10: a suíte

Número livre (`m63`), **escrita da spec, sem ler a implementação**. O que
precisa provar: item nasce só com descrição; quantidade chega depois; duplicata
avisa e não recusa; concluir não cria lançamento nem movimento de estoque
(é a prova do §19.1 e §19.2, e é a mais importante desta suíte); registrar
compra cria a negociação E conclui o item, ou nenhum dos dois; item sem produto
não vira compra sozinho; repetir cria item novo sem tocar no antigo; e
isolamento entre tenants.

### T11: validação ao vivo

Navegador, com `scripts/_sessao-local.ts` e cenário próprio. Suíte verde não é
validação (invariante 8).

---

## Critérios de aceite (§22)

O documento lista quinze. Todos viram caso de teste ou passo do roteiro de
tela:

adicionar item; adicionar sem quantidade; informar a quantidade depois;
adicionar vários numa mensagem; consultar a lista; marcar urgente; relacionar à
fazenda; relacionar a uma finalidade; remover; marcar como comprado; encaminhar
a compra para Negociações; aproveitar os dados já informados; receber sugestão
por estoque baixo; consultar pelo WhatsApp; manter histórico básico.

⚠️ Três deles dependem do classificador descongelado para valerem de ponta a
ponta (adicionar vários numa mensagem, consultar pelo WhatsApp, e o "comprei" na
conversa). Ficam provados por suíte contra os handlers, e a prova contra o
agente real fica devendo, registrada.

---

## Fora desta versão (§21)

Solicitação formal de compra, aprovação por gerente, cotação, pedido e ordem de
compra, comparação de preços, integração com lojas, marketplace, compra
automática, limite de orçamento e gestão de fornecedores. O documento é
explícito, e o módulo perde o sentido se virar um processo de compras.
