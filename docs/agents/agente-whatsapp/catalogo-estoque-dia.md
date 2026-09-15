# Catálogo de intenções: estoque, lista de compra, calculadora, Meu Dia, financeiro e utilitárias

Leitura feita em 2026-09-14 sobre `main` (HEAD `b31d9f1`). Tudo aqui foi conferido no
código do handler, não no nome da intenção. Onde a documentação (spec, guia do n8n,
docx do cliente) diverge do código, o código é o que vale e a divergência está marcada
com **DIVERGÊNCIA**.

Escopo: as 22 intenções pedidas, mais `cadastrar_servico_ordem` e `consultar_cliente`
(perfil Prestador), que são as únicas de `whatsapp-intents.ts` que sobram fora de
rebanho, confinamento, evento, permuta, leite, mão de obra e serviços com máquina.

Legenda de estado no n8n (fonte: comentários de `src/lib/whatsapp-intents.ts` e
`docs/n8n-whatsapp-workflow.md` §4 e §4.3):

- **NO AR**: está no prompt do classificador hoje.
- **CONGELADA**: handler roteado e testado, mas o classificador NÃO emite.

| intenção | estado | arquivo |
|---|---|---|
| `registrar_negocio_produto` | NO AR | `whatsapp-handlers/estoque.ts` |
| `registrar_uso_estoque` | NO AR | `whatsapp-handlers/estoque.ts` |
| `ajustar_estoque` | NO AR | `whatsapp-handlers/estoque.ts` |
| `consultar_estoque` | NO AR | `whatsapp-handlers/estoque.ts` |
| `adicionar_item_lista` | CONGELADA | `whatsapp-handlers/lista-de-compra.ts` |
| `consultar_lista_compra` | CONGELADA | idem |
| `remover_item_lista` | CONGELADA | idem |
| `comprei_item_lista` | CONGELADA | idem |
| `calcular_cerca` | CONGELADA | `whatsapp-handlers/calculadora.ts` |
| `calcular_sementes` | CONGELADA | idem |
| `calcular_sal` | CONGELADA | idem |
| `calcular_racao` | CONGELADA | idem |
| `consultar_meu_dia` | CONGELADA | `whatsapp-handlers/meu-dia.ts` |
| `consultar_amanha` | CONGELADA | idem |
| `consultar_semana` | CONGELADA | idem |
| `criar_tarefa` | NO AR (desde 2026-08-04) | `whatsapp-handlers/tarefas.ts` |
| `consultar_saldo` | NO AR | `whatsapp-handlers/financeiro.ts` |
| `gerar_relatorio` | NO AR | idem |
| `registrar_lancamento_financeiro` | NO AR (texto e recibo por foto/PDF) | idem |
| `ajuda` | NO AR | `whatsapp-handlers/ajuda.ts` |
| `resumo` | NO AR | `whatsapp-handlers/resumo.ts` |
| `ambigua` | NO AR | tratada dentro de `whatsapp-router.ts` (sem handler) |
| `cadastrar_servico_ordem` | NO AR | `whatsapp-handlers/prestador.ts` |
| `consultar_cliente` | NO AR | idem |

Observação: `criar_tarefa` não aparece na tabela da §4 do guia do n8n, só no cabeçalho
dele (linhas 30 a 36), que afirma que ela entrou no prompt em 2026-08-04.

---

## 0. Peças comuns que todo handler usa

### 0.1 Leitores de parâmetro

| helper | onde | o que aceita | armadilha |
|---|---|---|---|
| `str(v)` | `shared.ts` | só `string` não vazia, com `trim` | número (`10`) vira `null`. Campo de texto enviado como número é ignorado |
| `num(v)` | `shared.ts` | `number` finito, ou string que `Number()` aceita | `"1.200"` vira 1.2, `"2.000"` vira 2, `"60 mil"` vira `null`. Ainda usado em lista de compra e prestador |
| `lerNumeroBr(v)` | `src/lib/numero-br.ts` | número; `"60000"`, `"60.000"`, `"60.000,50"`, `"60000.50"`, `"2,5"`, `"60 mil"`, `"1,5 milhão"`, `"R$ 1.200"`, `"mil"` | sem vírgula, ponto só é decimal com 1 ou 2 casas no fim (`"1.50"` = 1,5; `"1.500"` = 1500). Palavra por extenso ("uma", "dez") devolve `null` |
| `lerDinheiro(params, ...campos)` | `parsers.ts` | `lerNumeroBr` no primeiro campo que tiver valor legível | percorre os aliases na ordem dada |
| `lerData(params, ...campos)` | `parsers.ts` | ISO `2026-12-10`, `10/12/2026`, `10/12/26`, `10/12` (ano corrente), `dia 10` ou `10` (sempre o MÊS CORRENTE, mesmo se já passou), `hoje`, `ontem` | devolve `{tipo:"vazio"}`, `{tipo:"ok"}` ou `{tipo:"invalida"}`. Data impossível (31/02) é `invalida`. "amanhã", "quinta", "sexta" NÃO são lidos: o classificador precisa converter para data |
| `extrairNumeroDeParcelas` | `parsers.ts` | primeiro número de 1 ou 2 dígitos num texto ("3x", "em 3 vezes") | "em três vezes" por extenso devolve `null` |
| `interpretarSim` | `parsers.ts` | `true`, `"sim"`, `"s"`, `"ja paguei"`, `"já paguei"`, `"pago"`, `"paguei"`, `"true"` | qualquer outra coisa é `false` |
| `custosDosParametros` | `parsers.ts` | lista `custos: [{descricao|description, valor|amount}]` OU campos planos `frete`, `comissao`, `taxa`, `taxa_leilao`, `taxa_feira`, `carregamento`, `descarregamento`, `guia`, `guia_transporte`, `exames`, `vacinas`, `pedagio`, `outros` | a lista, se tiver algum item válido, anula os campos planos |

### 0.2 Formas de resposta

- `ask(texto)`: `requires_confirmation: false`, `action_taken: "clarification_requested"`.
- `confirmFlow` (`shared.ts`), usado por `criar_tarefa`, `registrar_lancamento_financeiro`,
  `remover_item_lista` e `cadastrar_servico_ordem`:
  - `explicitNo` verdadeiro: devolve o texto de cancelamento, `action_taken: "<intent>:cancelado"`.
  - `confirmed` falso: devolve a pergunta, `requires_confirmation: true`,
    `auxiliary_data` com o resumo, `action_taken: "<intent>:aguardando_confirmacao"`.
  - `confirmed` verdadeiro: segue e grava.
  - **Não guarda nada.** O "sim" só grava se a chamada seguinte trouxer de novo a
    MESMA intenção com os parâmetros completos (o que o guia do n8n manda o LLM fazer).
    Os parâmetros gravados são os da chamada do "sim", não os que foram mostrados.
- `failReply`: `reply_text: "⚠️ <mensagem da action>"`, `action_taken: "<intent>:falhou:<code>"`.

### 0.3 De onde vêm `confirmed` e `explicitNo` (execute-action)

- `confirmed = (corpo.confirmed === true) || detectConfirmation(message_text) === "yes"`.
- `explicitNo = detectConfirmation(message_text) === "no"`. **Só o texto recusa**:
  `confirmed: false` e `confirmed: null` são tratados como ausência de confirmação, nunca
  como "não". Sem `message_text`, não existe caminho de recusa.
- `detectConfirmation` (`src/lib/actions/confirmation.ts`) tira pontuação, baixa caixa e
  casa a frase INTEIRA ou o COMEÇO da frase seguido de espaço:
  - sim: `sim, s, confirmo, confirmado, confirma, isso mesmo, isso, correto, pode, ok, beleza, positivo`
  - não: `não, nao, n, cancela, cancelar, cancelado, errado, negativo, deixa pra la, deixa pra lá, deixa quieto, esquece, esquecer, melhor nao, melhor não, nao quero, não quero, para, parar`
  - sim é testado antes de não.
- **Efeito colateral importante para o prompt**: como é "começa com", frases de gesto
  podem virar confirmação ou recusa sem querer:
  - "ok, anota 500 de diesel" ou "pode lançar 380 de energia" chegam com `confirmed`
    verdadeiro e **gravam sem perguntar** em `criar_tarefa` e
    `registrar_lancamento_financeiro` (que usam `confirmFlow` sem âncora).
  - "para amanhã, me lembra de vacinar" começa com "para " e chega como `explicitNo`:
    `criar_tarefa` responde "Lembrete cancelado."
  - No estoque isso é mitigado: o "sim" só executa pedido guardado (ver §1.0).

### 0.4 Matriz de permissão (`src/lib/permissions.ts`)

| módulo | OWNER | ADMIN | OPERADOR | VISUALIZADOR |
|---|---|---|---|---|
| `rebanho` | escreve | escreve | escreve | lê |
| `financeiro` | escreve | escreve | escreve | lê |
| `tarefas` | escreve | escreve | escreve | lê |
| `prestador` | escreve | escreve | escreve | lê |

Recusa do roteador: `"Você não tem permissão para executar essa ação."`
(`action_taken: "<intent>:sem_permissao"`). Perfil inativo:
`Esse recurso requer o perfil "Fazenda" ativo, que não está habilitado para sua empresa.`
(`"<intent>:perfil_inativo"`).

### 0.5 Ordem do roteador (`routeIntent`, `whatsapp-router.ts`) que afeta estas intenções

1. `desempatarIntencao`: `registrar_negocio_produto` cujo `produto`/`product`/`item` é
   categoria de rebanho exata (`resolveCategoryTerm`, ex.: "bezerros") vira
   `registrar_negocio_gado`.
2. Resposta curta de negócio de gado (fora deste catálogo).
3. `registrar_negocio_gado` cujo item (`produto`/`product`/`item`/`categoria`) NÃO é
   categoria de rebanho e casa com UM produto do catálogo vira `registrar_negocio_produto`.
4. "sim" com pedido de estoque em `confirmacao`: troca a intenção pela do pedido guardado,
   desde que a mensagem não traga `movement_type` nem mude o pedido (`mudaOPedido`) e não
   exista cadastro assistido de animal mais recente.
5. **Cadastro assistido de animal em andamento** (`handleActiveFlow`): para qualquer
   intenção que não seja das 4 de estoque, a mensagem é oferecida ao formulário. Só
   escapam as de `INTERRUPTING`: `consultar_saldo`, `consultar_animal`, `consultar_cliente`,
   `gerar_relatorio`, `resumo`, `ajuda` e as 4 de estoque. **Lista de compra, calculadora,
   Meu Dia, `criar_tarefa` e `registrar_lancamento_financeiro` NÃO estão lá**: com um
   formulário aberto, "me lembra de comprar sal" vira resposta de campo. E qualquer
   `explicitNo` cancela o formulário antes de chegar ao handler.
6. Resposta curta de estoque: se a intenção está em `REMONTAVEIS` (`ambigua`,
   `registrar_movimentacao_rebanho`, `registrar_negocio_gado`, `registrar_negocio_produto`,
   `registrar_uso_estoque`, `ajustar_estoque`) e não traz `produto`, `product`,
   `categoria`, `category`, `item` nem `movement_type`, e há pedido de estoque mais
   recente que o de gado/rebanho, a intenção vira a do pedido de estoque.
7. Checagem de permissão e perfil (pula `ambigua`).
8. `ambigua` responde o texto fixo.
9. Handler.
10. Se a intenção é de escrita e o turno fechou (não pediu confirmação nem
    esclarecimento), `marcarExecucao` grava no Redis a hora da última escrita
    (invalida pedido de estoque mais antigo).

---

## 1. Estoque (Módulo 31, §9 e §10)

### 1.0 Mecanismo comum às três de escrita (`comMemoria` e `perguntar`, `estoque.ts`)

Pedido pendente no Redis (`src/lib/actions/stock-pending.ts`), chave
`tibe:estoque-pending:<tenant>:<user>`, **TTL 15 minutos**, um pedido por usuário (as três
intenções compartilham a chave). Campos guardados: `intent`, `parameters`, `aguardando`
(`tipo | produto | quantidade | valor | fazenda | data | vencimento | pagamento | confirmacao`),
`tentativas`, `salvo_em`.

Ordem de decisão a cada turno:

1. **`explicitNo`**: sempre cancela. Com pedido desta intenção: apaga o pedido, marca
   execução, responde `"Ok, não registrei nada."`. Sem pedido:
   `"Não tinha nada pendente para cancelar."`. Se existir negócio de gado pendente,
   acrescenta `" Você ainda tem um negócio de gado esperando confirmação: responda sim para registrar, ou não para cancelar também."`.
   `action_taken: "<intent>:cancelado"`. Não há exceção para correção contrastiva
   ("não é o proteinado, é o 60 P" cancela).
2. **`confirmed` (só compra/venda e ajuste; o uso ignora `confirmed`)**:
   - sem `user_id`: `"Não consegui identificar quem está falando comigo, então não vou registrar nada. Me conte de novo o que você quer lançar no estoque."`
   - pedido desta intenção em `confirmacao`: só executa se `salvo_em` for posterior à
     última gravação da pessoa E ao pedido mais recente de gado/rebanho. Senão apaga e
     responde `"Esse pedido não é o mais recente da nossa conversa, então não vou executá-lo. Me conte de novo o que você quer lançar no estoque."`.
     Se passa, **executa os parâmetros GUARDADOS**, ignorando os da mensagem (pode vir
     `parameters: {}`).
   - nenhum pedido: `"Não tenho nada esperando confirmação. Me conte de novo o que você quer lançar no estoque."`
   - pedido esperando um CAMPO: o "sim" não confirma; segue como resposta.
3. Sem pedido desta intenção: usa os parâmetros da mensagem.
4. Com pedido: `aplicarRespostaEstoque` pega **só o campo perguntado** da mensagem nova,
   pelos aliases:
   - `produto`: `produto, product, item, nome`
   - `quantidade`: `quantidade, quantity, qtd, saldo`
   - `valor`: `valor, amount, valor_total`
   - `tipo`: `tipo, type`
   - `fazenda`: `fazenda, property, property_name`
   - `data`: `data, date, occurred_at`
   - `vencimento`: `vencimento, due_date` (atenção: `data_pagamento` NÃO é aceito como resposta, só na frase inicial)
   - `pagamento`: lê `pagamento`, `resposta`, `pago`, `parcelas` (texto) por regex.
     `parcel|vezes|prazo|\dx` ou `parcelas`/`installments`/`parcelamento` preenchido: grava
     parcelas e `pago=false`. `pago|paguei|a vista|à vista` ou `pago: true`: `pago=true` e
     apaga parcelas.
   - `confirmacao`: qualquer campo de `CAMPOS_DE_CORRECAO` que vier sobrescreve o guardado
     (correção: "foram 50 sacas"). Os campos: `produto, product, item, quantidade, quantity, qtd, saldo, valor, amount, valor_total, tipo, type, fazenda, property, contato, contact_name, vendedor, comprador, vencimento, due_date, data_pagamento, parcelas, pago`.
   - Se a mensagem não traz o campo perguntado: mistura tudo por cima do guardado
     (`{...guardado, ...mensagem}`), mantém o contador e pergunta de novo.
5. **Trava de laço**: a mesma pergunta de campo feita 3 vezes (`MAX_TENTATIVAS = 3`) apaga
   o pedido e responde
   `Não estou conseguindo entender essa parte. Tente mandar tudo numa frase só, por exemplo: "<exemplo do gesto>".`
   Na confirmação, repetir 3 vezes sem mudar o pedido responde
   `Vou deixar esse registro de lado por enquanto. Quando quiser, me conte de novo, por exemplo: "<exemplo>".`
   Exemplos por gesto: uso `"usei 2 sacas de sal mineral no lote do curral"`; ajuste
   `"contei e tem 8 sacas de sal mineral"`; negócio
   `"comprei 10 sacas de sal do Zé por 1200, para pagar dia 10"`.

Resolução de produto (`resolverProduto`): só produto do catálogo não arquivado, **nunca
cria produto**. Compara sem acento e sem caixa; nome exato ganha; senão aceita UM
parcial nos dois sentidos ("sal" acha "Sal mineral 60 P").
- catálogo vazio: `"Você ainda não tem produto cadastrado no estoque. Cadastre no painel, em Estoque, e depois me chame."`
- sem nome: `"Qual produto?"` + lista `- <nome>`
- mais de um parcial: `Tenho mais de um parecido com "<nome>". Qual deles?` + lista
- nenhum: `Não achei "<nome>" no seu estoque. Você tem:` + lista + `Se for produto novo, cadastre no painel, em Estoque.`

Resolução de fazenda (`resolverFazenda`, `herd.ts`), aliases `fazenda`, `property`:
- nome dado e não achado: `Não encontrei a fazenda "<nome>". Confira o nome e tente de novo.`
- sem nome e tenant com 1 fazenda: usa essa, sem perguntar.
- sem nome e 0 fazendas: `"Você ainda não tem fazenda cadastrada. Cadastre uma no painel, em Minha Fazenda."`
- sem nome e várias: `"Em qual fazenda?"` + lista.

Quantidade (`lerQuantidade`): `lerNumeroBr`, precisa ser maior que zero. Pergunta
`"<Quantos|Quantas> <plural da unidade> de <produto>?"` (gênero pela unidade: Quantas sacas,
Quantos litros). Unidade não fracionável (unidade, frasco, caixa, pacote, rolo) com número
quebrado: `"<Produto> só entra em <plural> <inteiras|inteiros>, sem quantidade quebrada. <Quantos|Quantas> exatamente?"`.
Fracionáveis: saca, quilograma, litro, tonelada, metro, outro.

### 1.1 `registrar_negocio_produto`

1. **Handler**: `registrarNegocioProduto` em `src/lib/actions/whatsapp-handlers/estoque.ts`.
   Grava via `createProductNegotiation` (negociação, movimento de estoque, despesa/receita,
   conta a pagar/receber, contato).

2. **Parâmetros lidos** (ordem = ordem de pergunta):

| campo | aliases (ordem de precedência) | tipo / leitura |
|---|---|---|
| tipo | `tipo`, `type`, `movement_type` | texto, minúsculo, precisa estar em: `compra`, `compra_produto`, `comprei`, `venda`, `venda_produto`, `vendi` |
| produto | `produto`, `product`, `item` | texto, resolvido no catálogo |
| quantidade | `quantidade`, `quantity`, `qtd` | `lerNumeroBr`, maior que 0, fração conferida pela unidade |
| valor total | `valor`, `amount`, `valor_total` | `lerDinheiro`, maior que 0. **`preco` NÃO é lido de propósito** (preço unitário) |
| fazenda | `fazenda`, `property` | texto |
| data do negócio | `data`, `date`, `occurred_at` | `lerData`; vazio = agora |
| vencimento | `vencimento`, `due_date`, `data_pagamento` | `lerData`; vazio = "sem data informada (vou lançar para hoje)" |
| pago | `pago`, `paid` | `interpretarSim` |
| parcelas | `parcelas`, `installments`, `parcelamento` | `lerNumeroBr` ou `extrairNumeroDeParcelas`. Só vale se maior que 1 e não pago. Datas mensais a partir do vencimento (ou data + 1 mês); a última absorve o centavo |
| custos | ver §0.1 (`custos` ou campos planos) | `lerDinheiro` |
| contato | `contato`, `contact_name`, `contact`; depois `vendedor` (se compra) ou `comprador` (se venda); depois o outro | texto; vira `Contact` só com o nome |
| observação | `observacao`, `notes` | texto |

3. **Obrigatórios e perguntas** (a primeira que faltar é perguntada e guardada):
   - tipo: `"Você comprou ou vendeu esse produto?"` (campo `tipo`)
   - produto: textos de `resolverProduto` (campo `produto`)
   - quantidade: `"Quantas sacas de Sal mineral?"` ou recusa de fração (campo `quantidade`)
   - valor: `"Por quanto você comprou 10 sacas de Sal mineral?"` / `vendeu` (campo `valor`)
   - fazenda: textos de `resolverFazenda` (campo `fazenda`)
   - data ilegível: `Não entendi a data "<bruto>". Pode dizer 10/12 ou "hoje"?` (campo `data`)
   - vencimento ilegível: `Não entendi o vencimento "<bruto>". Pode dizer 10/12?` (campo `vencimento`)
   - parcelas ilegíveis: `Não entendi o parcelamento "<bruto>". Em quantas vezes você vai pagar?` (campo `pagamento`)
   - pago + parcelas maiores que 1: `"Você já pagou ou vai parcelar? Uma coisa ou outra."` (campo `pagamento`)
   - venda acima do saldo da fazenda (conferido ANTES da confirmação):
     `"Existem apenas 3 sacas de Sal mineral em Fazenda X. Revise a quantidade informada."` (campo `quantidade`)

4. **Confirmação**: SEMPRE, qualquer valor. Texto:
   ```
   Confirma?
   Compra de 10 sacas de Sal mineral por R$ 1.200,00 mais R$ 200,00 de custos, em Fazenda X.
   Com: Zé.
   Data: 14/09/2026.
   Custos: Frete R$ 200,00
   A pagar em 10/09/2026.   (ou "Já pago." / "Em 3x de R$ 400,00, a primeira em ..." / "A pagar, sem data informada (vou lançar para hoje).")
   ```
   `requires_confirmation: true`, `auxiliary_data: null`,
   `action_taken: "registrar_negocio_produto:aguardando_confirmacao"`.
   - `confirmed: true` (ou "sim" no texto) com pedido guardado em confirmação: executa o
     guardado (§1.0). Sucesso:
     `"✅ Registrado: compra de 10 sacas de Sal mineral por R$ 1.200,00. Estoque agora: 30 sacas."`,
     `auxiliary_data: { negotiation_id }`, `action_taken: "registrar_negocio_produto:ok"`.
   - `confirmed: false` ou `null`: nada; repete a confirmação (contando tentativa).
   - "não": cancela (§1.0).

5. **Estado pendente**: sim, §1.0. Guardado em confirmação com `tipo` canônico
   (`compra_produto`/`venda_produto`) e `fazenda` resolvida.

6. **Permissão**: módulo `rebanho`, escrita, perfil `fazenda`. VISUALIZADOR recusado.

7. **Frases**:
   - "Comprei 10 sacas de sal do Zé por 1200, para pagar dia 10" (cabeçalho do handler e `EXEMPLO_POR_GESTO`; `ajuda` usa a mesma com "pra pagar").
   - "Comprei 10 sacas de sal por 1.800 reais." (docx `docs/moduloNegociacao/`, §18.3)
   - "Comprei 20 sacas de adubo." seguido de "Qual foi o valor total da compra?" (§18.6; o texto real do handler é "Por quanto você comprou 20 sacas de Adubo?")
   - "comprei sal por 3.000 em 3 vezes" (comentário de parcelas no handler)
   - "comprei 2.000 kg de racao" (comentário de `lerQuantidade`)

8. **Vizinhas**:
   - `registrar_negocio_gado`: mesma forma de frase. Desempate em código: item que é
     categoria de rebanho vai para gado; item que casa com um produto do catálogo vai para
     produto. O classificador não precisa acertar.
   - `comprei_item_lista` (CONGELADA): "comprei o sal" citando item da LISTA, sem produto/quantidade.
   - `registrar_lancamento_financeiro`: despesa sem estoque ("gastei 500 com diesel").
     Se o insumo é do catálogo e muda saldo, é negócio de produto.
   - `registrar_uso_estoque`: "usei", sem dinheiro.

### 1.2 `registrar_uso_estoque`

1. **Handler**: `registrarUsoEstoque` em `estoque.ts`. Grava `recordStockMovement` com
   `movement_type: "utilizacao"`.

2. **Parâmetros**:

| campo | aliases | leitura |
|---|---|---|
| produto | `produto`, `product`, `item` | catálogo |
| quantidade | `quantidade`, `quantity`, `qtd` | `lerNumeroBr`, maior que 0, fração pela unidade |
| fazenda | `fazenda`, `property` | texto |
| data | `data`, `date`, `occurred_at` | `lerData`; vazio = agora (a action decide) |
| finalidade | `finalidade`, `purpose` | texto opcional |

   `pasto` e grupo de animais (opcionais no §10.4 do docx) **não são lidos**.

3. **Obrigatórios**: produto, quantidade, fazenda (com as mesmas perguntas de §1.0).
   Data ilegível: `Não entendi a data "<bruto>". Pode dizer 10/12 ou "hoje"?`.
   Saldo insuficiente: a action recusa e volta `failReply` ("⚠️ ..."), o pedido NÃO é
   apagado (o produtor pode corrigir a quantidade).

4. **Confirmação**: **NÃO pede**. `confirmed` é ignorado ("ok, usei 3 sacas" grava).
   "não"/"cancela" continua cancelando. Sucesso:
   `"✅ Anotei: 2 sacas de Sal mineral usadas em Fazenda X. Restam 8 sacas."`,
   `auxiliary_data: { movement_id, saldo }`, `action_taken: "registrar_uso_estoque:ok"`.
   **DIVERGÊNCIA** com o docx (`docs/moduloNegociacao/` §18.4), que mostra
   "Deseja registrar a utilização de 1 saca...?": decisão de código (§10.3, comentário do handler).

5. **Pendente**: sim, só para campos faltantes (§1.0).

6. **Permissão**: `rebanho`, escrita, perfil `fazenda`.

7. **Frases**:
   - "Usei uma saca de sal." (docx §10.3 e §18.4; atenção: "uma" precisa chegar como `1`)
   - "usei 2 sacas de sal mineral no lote do curral" (`EXEMPLO_POR_GESTO` e `ajuda`)
   - "usei 2,5 sacas" (comentário de `lerQuantidade`)
   - "Usei diesel no trator." (docx `docs/modulo-meu-dia/` §36, entrada universal)

8. **Vizinhas**: `ajustar_estoque` (informa o que EXISTE, não o que saiu);
   `registrar_negocio_produto` com `tipo: venda` (sai com dinheiro); consumo de
   confinamento (`registrar_alimentacao_confinamento`, fora deste catálogo).

### 1.3 `ajustar_estoque`

1. **Handler**: `ajustarEstoque` em `estoque.ts`. Grava `adjustStock` com `corrected_balance`.

2. **Parâmetros**:

| campo | aliases | leitura |
|---|---|---|
| produto | `produto`, `product`, `item` | catálogo |
| saldo contado | `saldo`, `quantidade`, `quantity`, `corrected_balance` | `lerNumeroBr`, maior ou igual a 0 (zero é aceito) |
| diferença (proibida) | `diferenca`, `faltaram`, `sobraram`, `difference` | se vier sem `saldo` e sem `quantidade`, vira pergunta |
| fazenda | `fazenda`, `property` | texto |
| motivo | `motivo`, `reason` | texto; padrão `"Contagem informada pelo WhatsApp"` |

   Atenção: `qtd` NÃO é lido aqui na frase inicial (só como resposta ao campo `quantidade`).

3. **Obrigatórios e perguntas**:
   - produto: `resolverProduto`.
   - diferença sem total: `"Para corrigir eu preciso do total, não da diferença. Quantas sacas de Sal mineral tem hoje, ao todo?"`
   - saldo ausente ou negativo: `"Quantas sacas de Sal mineral você contou?"`
   - fração em unidade inteira: recusa de §1.0.
   - fazenda: `resolverFazenda`.

4. **Confirmação**: SEMPRE.
   `"Confirma? Sal mineral em Fazenda X passa de 20 sacas para 8 sacas."`,
   `requires_confirmation: true`, `action_taken: "ajustar_estoque:aguardando_confirmacao"`.
   Com "sim" ancorado: `"✅ Corrigido: Sal mineral agora está com 8 sacas em Fazenda X. Tirei 12 sacas."`
   (ou "Somei ..."), `auxiliary_data: { movement_id, diferenca }`, `"ajustar_estoque:ok"`.
   Contagem igual ao saldo: responde a mensagem da action sem ⚠️,
   `action_taken: "ajustar_estoque:sem_mudanca"`.

5. **Pendente**: sim (§1.0), guardado com `saldo` e `fazenda` resolvidos.

6. **Permissão**: `rebanho`, escrita, perfil `fazenda`.

7. **Frases**:
   - "Contei e tem só 6 sacas de sal" (cabeçalho do handler)
   - "contei e tem 8 sacas de sal mineral" (`EXEMPLO_POR_GESTO`)
   - "contei e tem só 6 sacas de sal" (`ajuda`)
   - "O sistema mostra 9 sacas, mas existem 8." (docx `docs/moduloNegociacao/` §10.6)
   - "contei 1.500" deve virar 1500 (`scripts/m38-estoque-whatsapp.test.ts`, linha 535)
   - Caso proibido: "faltaram 2 sacas" (guia do n8n §4 e comentário do handler)

8. **Vizinhas**: `registrar_uso_estoque` ("usei 2" é saída; "tem 2" é saldo);
   `consultar_estoque` ("quanto tenho de sal?" é pergunta, não contagem).

### 1.4 `consultar_estoque`

1. **Handler**: `consultarEstoque` em `estoque.ts` (leitura via `listProductsWithBalance`).

2. **Parâmetros**: `produto`, `product`, `item` (texto, opcional). Nenhum outro.

3. **Obrigatórios**: nenhum.
   - catálogo vazio: `"Você ainda não tem produto cadastrado no estoque. Cadastre no painel, em Estoque."` (`consultar_estoque:vazio`)
   - com produto: resolve no catálogo (mesmas perguntas de `resolverProduto`, sem guardar
     pendente) e responde `"📦 Sal mineral: 8 sacas (seu mínimo é 10 sacas)."` (o parêntese
     só quando abaixo do mínimo), `consultar_estoque:ok`. É o saldo TOTAL, somando fazendas.
   - sem produto: se há produto abaixo do mínimo que já movimentou,
     `"📦 Precisa repor:\n- Sal mineral: 3 sacas"` (até 10 linhas, depois
     `...e mais N.`), `consultar_estoque:acabando`; senão lista os com saldo
     (`"📦 No estoque:\n..."`, `consultar_estoque:ok`); tudo zerado:
     `"Seu estoque está zerado em todos os produtos."` (`consultar_estoque:zerado`).

4. **Confirmação**: não. "não" é ignorado.
5. **Pendente**: não.
6. **Permissão**: `rebanho`, leitura, perfil `fazenda` (VISUALIZADOR pode).
7. **Frases**: "Quanto tenho de sal?" e "o que está acabando?" (cabeçalho do handler);
   "quanto tenho de sal" e "o que está acabando" (`ajuda`).
8. **Vizinhas**: `consultar_lista_compra` ("o que tenho para COMPRAR?"); `consultar_rebanho`
   ("quantos animais tenho"); `resumo` com escopo financeiro/rebanho.

---

## 2. Minha Lista de Compra (Módulo 36, §17) - CONGELADAS

Pendente próprio: `src/lib/actions/shopping-pending.ts`, chave
`tibe:lista-compra-pending:<tenant>:<user>`, TTL padrão 15 minutos,
`aguardando: confirmacao_remocao | confirmacao_duplicata`. **Não participa** das guardas
do roteador (não está em `REMONTAVEIS` nem em `INTERRUPTING`). Consequência: o "sim"
só chega a este handler se o classificador reemitir a MESMA intenção de lista; um "sim"
classificado como `ambigua` recebe o texto fixo de `ambigua`.

Unidade válida é o **id** de `STOCK_UNITS` (`src/lib/stock/units.ts`): `saca`,
`quilograma`, `litro`, `unidade`, `frasco`, `caixa`, `pacote`, `rolo`, `tonelada`,
`metro`, `outro`. "kg", "sacas", "litros" não são ids.

### 2.1 `adicionar_item_lista`

1. **Handler**: `adicionarItemLista` em `src/lib/actions/whatsapp-handlers/lista-de-compra.ts`.
   Grava `criarItemAction` (sempre com `permitirDuplicata: true`).

2. **Parâmetros** (`lerItens`):
   - **Vários itens**: lista em `itens`, `items` ou `produtos`. Cada elemento pode ser
     string (vira descrição) ou objeto com descrição em `descricao`, `description`,
     `produto`, `item`; quantidade em `quantidade`, `quantity` (lida com `num`); unidade
     em `unidade`, `unit`. Urgência NÃO é lida no formato lista.
   - **Item único**: descrição em `descricao`, `description`, `produto`, `item`;
     quantidade `quantidade`, `quantity` (`num`); unidade `unidade`, `unit`; urgente se
     `urgente === true` ou `prioridade === "urgente"`.
   - Unidade que não é id válido é descartada (item nasce sem unidade).
   - Quantidade lida com `num()`, não com `lerNumeroBr`: `"2.000"` vira 2 e `"60 mil"` vira
     nulo. Mande número JSON.

3. **Obrigatórios**: descrição. Sem nenhum item: `"O que você quer colocar na lista?"`.
   Quantidade e unidade opcionais (§19.4 do docx). Fração em unidade inteira é recusada
   pela action (`failReply`). Numa lista, se um item falha, os anteriores já foram gravados.

4. **Confirmação**: só para duplicata e só com **um** item. Se já há pendente parecido
   (descrição normalizada contida nos dois sentidos):
   - `explicitNo`: `"Tudo bem, não anotei de novo."` (`adicionar_item_lista:cancelado`)
   - sem `confirmed`: guarda `confirmacao_duplicata` e pergunta
     `"Você já tem 10 sacas de sal na sua lista. Quer anotar mais assim mesmo?"`
     (`clarification_requested`, `requires_confirmation: false`, `auxiliary_data: {descricao}`).
     **Atenção**: `requires_confirmation` vem `false` aqui, então o n8n não trata como confirmação.
   - com `confirmed` na mesma chamada: anota direto.
   Sucesso: `"Anotei 10 sacas de sal na sua Lista de Compra."` ou
   `"Anotei na sua Lista de Compra:\n- ...\n- ..."`, `auxiliary_data: { anotados }`,
   `action_taken: "adicionar_item_lista"`.

5. **Pendente**: `confirmacao_duplicata`. Na volta, o pedido é apagado sempre; "não"
   cancela; "sim" grava a descrição/quantidade/unidade GUARDADAS (a unidade guardada não é
   filtrada pelo id nesse caminho); qualquer outra coisa segue como mensagem nova.

6. **Permissão**: `rebanho`, escrita, perfil `fazenda`.

7. **Frases** (docx `docs/modulo-lista-de-compras/` §17 e §19.7):
   - "Coloca 10 sacas de sal na minha lista."
   - "Preciso comprar arame." (sem quantidade)
   - "Coloca na lista 2 rolos de arame, 5 litros de óleo e uma correia para o trator." (três itens; `scripts/m63-lista-de-compra.test.ts` seção 15 manda `itens` com `unidade: "rolo"`, `"litro"`, `"unidade"`)
   - "Coloca sal na lista." com sal já pendente (duplicata, §19.7)

8. **Vizinhas**: `criar_tarefa` ("me lembra de comprar sal na quinta" é lembrete com data;
   "coloca sal na lista" é item). `registrar_negocio_produto` ("comprei" já é compra).

### 2.2 `consultar_lista_compra`

1. **Handler**: `consultarListaCompra` em `lista-de-compra.ts`.
2. **Parâmetros**: nenhum lido.
3. **Obrigatórios**: nenhum. Vazia: `"Sua Lista de Compra está vazia."`
   (`auxiliary_data: {total: 0}`). Com itens:
   `"Sua lista tem 3 itens:\n🔴 10 sacas de sal (Agropecuária)\n- arame"`
   (urgentes primeiro com 🔴, lugar entre parênteses), `auxiliary_data: {total}`,
   `action_taken: "consultar_lista_compra"`. Só pendentes.
4. **Confirmação**: não. 5. **Pendente**: não.
6. **Permissão**: `rebanho`, leitura, perfil `fazenda`.
7. **Frases**: "O que tenho para comprar?" (docx §17).
8. **Vizinhas**: `consultar_estoque` ("o que está acabando?"); `consultar_meu_dia`.

### 2.3 `remover_item_lista`

1. **Handler**: `removerItemLista` em `lista-de-compra.ts`. Grava `removerItemAction`
   (status `removido`).
2. **Parâmetros**: termo em `descricao`, `description`, `item` (texto). **`produto` NÃO é lido aqui.**
3. **Obrigatórios**: termo. Sem termo: `"O que você quer tirar da lista?"`. Busca
   (`acharItem`, normalizada, "contém"):
   - lista vazia: `"Sua Lista de Compra está vazia."`
   - nada: `Não achei "<termo>" na sua lista. O que tem nela:` + lista
   - vários: igual exato ganha; senão `"Tenho mais de um parecido. Qual deles?"` + lista
4. **Confirmação**: SEMPRE (`confirmFlow`).
   `"Quer tirar 2 rolos de arame da sua Lista de Compra?"`, `requires_confirmation: true`,
   `auxiliary_data: {item_id}`, `remover_item_lista:aguardando_confirmacao`.
   Recusa: `"Tudo bem, continua na lista."`. Sucesso: `"Tirei 2 rolos de arame da sua lista."`,
   `action_taken: "remover_item_lista:<item_id>"`.
   Se a primeira mensagem já vier com `confirmed`, remove sem perguntar.
5. **Pendente**: guarda `confirmacao_remocao` com `item_id`. Na volta, "sim" com
   `parameters: {}` remove o item guardado (item sumido: `"Esse item não está mais na sua lista."`);
   "não" apaga o pendente. Outra mensagem sem sim/não segue como mensagem nova, sem apagar.
6. **Permissão**: `rebanho`, escrita, perfil `fazenda`.
7. **Frases**: "Tira o arame da lista." e resposta "Deseja remover os 2 rolos de arame da
   sua Lista de Compra?" (docx §17); teste `m63` seção 18 confirma com `{}` + `confirmed`.
8. **Vizinhas**: `comprei_item_lista` (sai da lista porque comprou, status `comprado`);
   `adicionar_item_lista`.

### 2.4 `comprei_item_lista`

1. **Handler**: `compreiItemLista` em `lista-de-compra.ts`.
2. **Parâmetros**: termo em `descricao`, `description`, `item`; valor em `valor`,
   `amount`, `valor_total` (`lerDinheiro`); `pago` (só `false` literal conta) e
   `pagamento` (só `"prazo"` conta).
3. **Obrigatórios**: termo (`"O que você comprou?"`), busca igual a §2.3.
   - **sem valor**: risca (`concluirItemAction`), responde
     `"Riscei 10 sacas de sal da sua lista. Se quiser registrar a compra no financeiro, me diga quanto pagou."`,
     `auxiliary_data: {item_id, registrou_compra: false}`.
   - **com valor, item sem `product_id` ou sem `property_id`**: risca e responde
     `"... Para lançar a compra no estoque eu preciso saber qual produto do seu catálogo é esse, e isso é mais rápido no painel, em Lista de Compra."`
   - **com valor e item vinculado**: `registrarCompraDoItemAction` (negociação, estoque,
     financeiro). Pago por padrão; a prazo só com `pago: false` ou `pagamento: "prazo"`.
     Sucesso: `"Registrei a compra de 10 sacas de sal por R$ 1.800,00, como conta a pagar, e risquei da sua lista."`,
     `auxiliary_data: {item_id, negotiation_id}`. Item sem quantidade: a action recusa com
     `"⚠️ Quanto você comprou?"` e o item NÃO é riscado (e não há pendente para a resposta).
   - `action_taken` em todos os sucessos: `"comprei_item_lista:<item_id>"`.
4. **Confirmação**: **NÃO pede**, nem para registrar compra com valor.
   **DIVERGÊNCIA** com o docx (§17: "Deseja registrar essa compra no TIBÉ? Caso a resposta
   seja sim, inicia-se o fluxo de Negociações" e §19.3 "somente após confirmação").
5. **Pendente**: não.
6. **Permissão**: `rebanho`, escrita, perfil `fazenda`.
7. **Frases**: "Comprei o sal." (docx §17); "comprei o sal por 1800" (comentário do handler).
8. **Vizinhas**: `registrar_negocio_produto` ("comprei 10 sacas de sal do Zé por 1200"
   cita produto do catálogo com quantidade). O comentário em `whatsapp-intents.ts` diz que a
   diferença é citar o item da LISTA. Não existe desempate em código entre as duas.

---

## 3. Calculadora (Módulo 37, §40) - CONGELADAS

Regras comuns (`src/lib/actions/whatsapp-handlers/calculadora.ts`):
- **Nada grava.** Nenhuma pede confirmação; `confirmed` e `explicitNo` são ignorados.
- **Não guardam pendente.** **DIVERGÊNCIA** com a spec
  `docs/superpowers/specs/2026-09-11-modulo-37-calculadora.md` (T11: "Reusam o mecanismo de
  pendência"). Na prática, "pergunta só o que falta" só funciona se o classificador reenviar,
  na resposta, os parâmetros já ditos antes junto com o novo.
- Números via `lerNumeroBr` (por extenso não funciona: "um mês" precisa chegar como `30`).
- Erro de validação da função pura volta como `ask(r.error)` (texto sem acento, ex.:
  `"Numero de fios deve ser um numero inteiro maior que zero."`).
- Textos das respostas estão sem acento no código ("voce", "mouroes").
- Permissão: `rebanho`, **leitura**, perfil `fazenda` (VISUALIZADOR pode).
- `action_taken` no sucesso: o próprio nome da intenção.

### 3.1 `calcular_cerca`

1. **Handler**: `calcularCercaWhatsapp` (usa `calcularCerca`, `src/lib/calculadoras/cerca.ts`).
2. **Parâmetros**:

| campo | aliases | obrigatório |
|---|---|---|
| comprimento (m) | `comprimento`, `metros`, `tamanho` | sim |
| fios | `fios`, `numero_fios`, `quantidade_fios` | sim (inteiro maior que 0) |
| espaçamento entre mourões (m) | `espacamento`, `distancia_mouroes`, `distancia` | sim (sem padrão) |
| metros por rolo | `metros_por_rolo` | não |

3. **Perguntas**, nesta ordem: `"Quantos metros de cerca voce vai fazer?"`,
   `"Quantos fios de arame essa cerca vai ter?"`, `"Qual a distancia entre os mouroes, em metros?"`.
4. **Resposta**: `"Para 1000 metros de cerca com 5 fios e mouroes a cada 4 metros, voce vai precisar de aproximadamente:\n- N mouroes\n- N metros de arame (N rolos)\n- N kg de grampos"` (rolos só com `metros_por_rolo`).
5. Sem pendente. 6. Permissão acima.
7. **Frases**: "Vou fazer 1.000 metros de cerca com 5 fios." (docx `docs/modulo-calculadora/` §40); memória do cálculo "Comprimento: 1.000 m, Fios: 5, Mourões a cada 4 m" (§42).
8. **Vizinhas**: `adicionar_item_lista` ("preciso comprar arame"); `calcular_racao` não.

### 3.2 `calcular_sementes`

1. **Handler**: `calcularSementesWhatsapp` (`calcularSementes`, `calculadoras/sementes.ts`).
2. **Parâmetros**:

| campo | aliases | obrigatório |
|---|---|---|
| área (ha) | `area`, `hectares`, `area_hectares` | sim |
| variedade | `variedade`, `capim`, `produto` | não; usada para sugerir taxa |
| taxa (kg/ha) | `taxa`, `kg_por_hectare`, `taxa_kg_ha` | sim, a menos que a variedade tenha taxa sugerida |
| peso da saca (kg) | `peso_saca`, `peso_embalagem`, `kg_por_saca` | não; sem ele a resposta não fala em sacas |

   Taxas sugeridas (`TAXAS_SUGERIDAS`): Mombaca 12, Tanzania 12, Marandu (braquiarao) 10,
   Brachiaria decumbens 10, Piata 10, Xaraes 10, Massai 8, Humidicola 8. Casamento: o nome
   sugerido (normalizado) precisa CONTER o que foi dito, então mande só a variedade
   ("mombaça"), não "capim mombaça".
3. **Perguntas**: `"Quantos hectares voce vai plantar?"`; taxa:
   `"Quantos quilos de semente por hectare voce quer usar no <variedade>?"` (ou sem variedade).
4. **Resposta**: `"Para 20 hectares voce vai precisar de aproximadamente 240 kg de semente, o que da 24 sacas de 10 kg (sobram N kg). Usei 12 kg/ha, que e a referencia para Mombaca; se o seu tecnico indicou outra taxa, e so me dizer."`
5. Sem pendente. 6. Permissão acima.
7. **Frases**: "Quantas sacas de Mombaça preciso para 20 hectares?" (docx §40). Sem
   `peso_saca`, essa frase recebe a resposta só em kg.
8. **Vizinhas**: `calcular_sal`/`calcular_racao` (outros insumos); nenhuma intenção de adubação/calagem existe no WhatsApp.

### 3.3 `calcular_sal`

1. **Handler**: `calcularSalWhatsapp` (`calcularSalMineral`, `calculadoras/sal-mineral.ts`).
2. **Parâmetros**:

| campo | aliases | obrigatório |
|---|---|---|
| animais | `animais`, `quantidade`, `numero_animais`, `cabecas` | sim |
| dias | `dias`, `periodo`, `dias_periodo` | sim |
| consumo (g/animal/dia) | `consumo`, `gramas_por_animal`, `consumo_dia` | não |
| peso médio (kg) | `peso`, `peso_medio` | não; padrão 450 |
| peso da saca (kg) | `peso_saca`, `kg_por_saca` | não |

3. **Perguntas**: `"Quantos animais vao comer esse sal?"`, `"Por quantos dias voce quer calcular?"`.
4. **Resposta**: com consumo, `"100 animais consumindo 100 g por dia comem N kg de sal em 30 dias. Isso da N sacas."`;
   sem consumo, faixa: `"Para 100 animais de 450 kg em 30 dias, a estimativa e de N a M kg de sal mineral. Isso da N sacas. Se voce souber o consumo por animal que o rotulo do seu sal indica, me diga que eu refaco a conta."`
5. Sem pendente. 6. Permissão acima.
7. **Frases**: "Quanto de sal 100 bois comem em um mês?" (docx §40, que também prevê a
   pergunta "Qual consumo diário por animal deseja utilizar?"; o código não pergunta, usa a faixa).
8. **Vizinhas**: `consultar_estoque` ("quanto sal eu TENHO"); `registrar_uso_estoque`.

### 3.4 `calcular_racao`

1. **Handler**: `calcularRacaoWhatsapp` (`calcularMistura`, `calculadoras/mistura.ts`).
2. **Parâmetros**:
   - ingredientes em `ingredientes`, `receita` ou `itens`:
     - lista de objetos `{nome|ingrediente|produto, percentual|porcentagem|percent}`;
     - lista de strings `"65% milho"` / `"milho 65%"`;
     - ou uma string única separada por `,`, ` e ` ou `;`, cada pedaço com `N%`.
   - quantidade final (kg) em `quantidade`, `kg`, `quantidade_final`, `total`.
   - Preço por ingrediente NÃO é lido, então o custo nunca aparece pelo WhatsApp.
3. **Perguntas**: `"Quais sao os ingredientes da receita, e a porcentagem de cada um?"`,
   `"Quantos quilos dessa mistura voce quer fazer?"`. Percentuais que não somam 100: erro da
   função pura via `ask`.
4. **Resposta**: `"Para 500 kg dessa mistura:\n- milho: 325 kg\n- soja: 145 kg\n- nucleo: 30 kg"`.
5. Sem pendente. 6. Permissão acima.
7. **Frases**: "Quero fazer 500 kg daquela ração de 65% milho, 29% soja e 6% núcleo." (docx §40 e comentário do handler).
8. **Vizinhas**: `registrar_alimentacao_confinamento` (fora); `adicionar_item_lista` quando o
   produtor fala em comprar os ingredientes. Atenção: `itens` também é o campo da lista de compra.

Não implementado: a conversa "Vou contratar 3 pessoas por 5 dias a R$ 150 a diária" (docx §40, mão de obra) não tem intenção de calculadora.

---

## 4. Meu Dia e tarefas (Módulos 27 e 38)

As três consultas leem `lerItensDoDia` + `classificar` (`src/lib/actions/meu-dia.ts`), a
mesma fonte da tela: tarefas, contas a pagar e a receber (saldo ainda devido), vacinas,
serviços, estadias e estoque abaixo do mínimo. Até 6 linhas por bloco
(`• e mais N no painel`). Formato de linha: `• 14:00, Veterinário, R$ 2.500,00`.
Nenhuma lê parâmetro, nenhuma confirma, nenhuma guarda pendente. Permissão: módulo
`tarefas`, leitura, **sem perfil** (prestador também usa). Estado: CONGELADAS.

### 4.1 `consultar_meu_dia`

1. **Handler**: `consultarMeuDia` em `src/lib/actions/whatsapp-handlers/meu-dia.ts`.
2. **Parâmetros**: nenhum. 3. **Obrigatórios**: nenhum.
4. **Resposta**: `"<Bom dia|Boa tarde|Boa noite>. Hoje você tem 4 coisas para acompanhar:\n• ...\n\nE 2 coisas precisam de atenção:\n• ..."`
   (atenção = atrasados, depois de hoje). Vazio:
   `"Bom dia. Não tem nada marcado para hoje, e nada atrasado."`. `action_taken: "consultar_meu_dia"`.
   A saudação não usa o nome do usuário (o docx mostra "Bom dia, João").
5. Sem pendente. 6. `tarefas` leitura.
7. **Frases**: "O que tenho para hoje?" (docx `docs/modulo-meu-dia/` §38, e spec
   `2026-09-11-modulo-38-meu-dia.md` T09); `scripts/m65-meu-dia-fase-38.test.ts` chama com `parameters: {}`.
8. **Vizinhas**: `resumo` (visão por área), `consultar_saldo` (dinheiro do mês),
   `consultar_lista_compra`.

### 4.2 `consultar_amanha`

1. **Handler**: `consultarAmanha` em `meu-dia.ts`.
2. e 3. Nenhum parâmetro.
4. **Resposta**: `"Amanhã você tem 2 coisas:\n• ..."` ou `"Não tem nada marcado para amanhã."`
   (`consultar_amanha`). Só itens com `dias === 1`; atrasados não entram.
5. a 6. Como acima.
7. **Frases**: "O que tenho amanhã?" (docx §39); "e amanhã?" (comentário de `whatsapp-intents.ts`).
8. **Vizinhas**: `consultar_semana`; `criar_tarefa` quando há verbo de lembrar ("me lembra amanhã de...").

### 4.3 `consultar_semana`

1. **Handler**: `consultarSemana` em `meu-dia.ts`.
2. e 3. Nenhum parâmetro.
4. **Resposta**: `"Nos próximos 7 dias:\n\nHoje:\n• ...\n\nAmanhã:\n• ...\n\nQuinta-feira:\n• ..."`
   (hoje + próximos 7 dias, agrupado por dia; atrasados não entram). Vazio:
   `"Não tem nada marcado para os próximos 7 dias."` (`consultar_semana`).
5. a 6. Como acima.
7. **Frases**: "O que tenho essa semana?" (docx §40).
8. **Vizinhas**: `resumo` com `contas_a_pagar` ("o que vence esta semana?" do docx
   `docs/modulo-area-financeiro/` §43 é pergunta de dinheiro, mas a resposta de contas a
   pagar do `resumo` é do MÊS, não da semana).

### 4.4 `criar_tarefa` (NO AR)

1. **Handler**: `criarTarefa` em `src/lib/actions/whatsapp-handlers/tarefas.ts`. Grava `createTaskAction`.
2. **Parâmetros**:

| campo | aliases | leitura |
|---|---|---|
| título | `title` (SÓ este nome) | texto |
| data | `due_date`, `data`, `date` | `lerData`: ISO, dd/mm, dd/mm/aaaa, "dia 10", hoje, ontem. Datas relativas ("quinta", "amanhã", "sexta") precisam chegar convertidas; o guia do n8n manda `current_date` ao classificador para isso |
| horário | `due_time`, `horario`, `hora` | regex `14h`, `14:00`, `14`, `1400` vira `"14:00"`. Ignorado se não houver data |
| urgente | `urgente === true` ou `priority`/`prioridade === "urgente"` | boolean |
| responsável | `assignee`, `responsavel` | texto |

3. **Obrigatórios**: só `title`. Sem título: `"O que você quer anotar? (ex: 'comprar sal na quinta')"`.
   Data opcional desde o Módulo 38; data ilegível: `"Não entendi a data. Pode dizer de novo, com o dia?"`.
4. **Confirmação**: SEMPRE (`confirmFlow`), sem âncora guardada.
   `"Confirma: Comprar vacina, dia 18/09/2026 às 14:00, urgente, com João?"`
   (`"sem data"` quando não há data), `requires_confirmation: true`,
   `auxiliary_data: {title, due_date (ISO), due_time, priority, assignee}`,
   `criar_tarefa:aguardando_confirmacao`. Recusa: `"Lembrete cancelado."`. Sucesso:
   com data `"Combinado! Vou te lembrar: Comprar vacina, dia 18/09/2026."`; sem data
   `"Anotado: Limpar o bebedouro. Fica na sua lista até você concluir."`; `action_taken: "criar_tarefa"`.
   - `confirmed: true`: grava com os parâmetros DESTA chamada (precisa reenviar `title` etc.).
   - `confirmed: false`/`null`: pergunta de novo.
   - Riscos de §0.3: frase começando com "ok"/"pode" grava direto; começando com "para" cancela.
   - Observação: a data do texto de confirmação é formatada em UTC; `lerData` monta meio-dia
     local, então não pula dia no fuso do Brasil.
5. **Pendente**: não guarda. O "sim" classificado como `ambigua` NÃO grava a tarefa.
6. **Permissão**: `tarefas`, escrita, sem perfil. VISUALIZADOR recebe `criar_tarefa:sem_permissao`
   (`scripts/m28-meu-dia.test.ts`, linha 253).
7. **Frases**:
   - "me lembra de comprar sal na quinta" (cabeçalho do handler e comentário de `whatsapp-intents.ts`)
   - "Anota consertar a porteira" (sem data, cabeçalho do handler)
   - "Me lembra sexta de comprar vacina." gerando "Comprar vacina: sexta-feira" (docx `docs/modulo-meu-dia/` §41)
   - "me lembra de vacinar o lote 3 amanhã" (comentário do roteador)
   - `m28`: `{title: "Comprar arame", due_date: <ISO>}`; `m65`: `{title: "Limpar o bebedouro"}`
8. **Vizinhas**: `adicionar_item_lista` ("preciso comprar arame" sem quando); consultas do Meu
   Dia. Fora de escopo em código (decisão 38.3): "Passa o veterinário de amanhã para sexta"
   (§42) e "Já arrumei a cerca" (§43) não têm intenção.

---

## 5. Financeiro

### 5.1 `consultar_saldo`

1. **Handler**: `consultarSaldo` em `src/lib/actions/whatsapp-handlers/financeiro.ts` (via `getBalanceAction`, `src/lib/actions/financial-summary.ts`).
2. **Parâmetros**: `period` (texto). Só o formato `"YYYY-MM"` é reconhecido; qualquer
   outra coisa ("junho", "2026-06-01", número) cai **em silêncio** no mês atual.
3. **Obrigatórios**: nenhum. Resposta:
   `"Saldo de setembro de 2026: receita R$ X, despesa R$ Y, saldo R$ Z."`,
   `auxiliary_data: {period_label, income, expense, balance}`, `action_taken: "consultar_saldo"`.
   Soma lançamentos com `status: "paid"` pelo `paid_at` no mês.
4. Sem confirmação. 5. Sem pendente.
6. **Permissão**: `financeiro`, leitura, sem perfil. Está em `INTERRUPTING` (responde mesmo com cadastro assistido aberto).
7. **Frases**: "qual meu saldo de junho" (`ajuda`); "Quanto gastei este mês?" e "Quanto entrou este mês?" (docx `docs/modulo-area-financeiro/` §43, que a resposta cobre só no agregado).
8. **Vizinhas**: `consultar_rebanho` (o guia do n8n avisa: "qual meu saldo" é dinheiro);
   `consultar_estoque` ("saldo de sal"); `resumo` `financeiro`/`contas_a_pagar`/`contas_a_receber`
   ("quanto tenho para pagar?" é `resumo contas_a_pagar`, não saldo).

### 5.2 `gerar_relatorio`

1. **Handler**: `gerarRelatorio` em `financeiro.ts`.
2. **Parâmetros**: `tipo` (texto: `financeiro`, `rebanho`, `lavoura`, `prestador`), `period`.
   **`period` é ignorado na prática**: o handler chama `resolvePeriod(period, null)`, que só
   usa as datas quando início E fim vêm; com fim nulo, é sempre o mês corrente.
3. **Obrigatórios**: `tipo`. Ausente ou fora da lista:
   `"Qual tipo de relatório você quer? (financeiro, rebanho, lavoura ou prestador)"`.
   - Sem acesso ao módulo do tipo: `"Você não tem permissão para gerar esse relatório."` (`gerar_relatorio:sem_permissao`).
   - Perfil do tipo inativo: `"O perfil necessário para o relatório de <tipo> não está ativo neste tenant."` (como `clarification_requested`).
   - `rebanho`, `lavoura`, `prestador`: `"O relatório de <tipo> em PDF ainda não está disponível: por enquanto só o relatório financeiro é gerado. Em breve!"` (`gerar_relatorio:tipo_nao_suportado`).
   - `financeiro`: `"Aqui está o relatório financeiro de 01/09/2026 a 01/10/2026: <url>"`,
     `report_url` preenchido (link assinado), `gerar_relatorio:financeiro`.
   **DIVERGÊNCIA**: o guia do n8n (§4) ainda diz que retorna "em breve" para todos; o financeiro já gera link.
4. Sem confirmação. 5. Sem pendente.
6. **Permissão**: `module: null` no roteador (passa sempre); o handler checa `canAccess` do módulo do tipo e o perfil (`fazenda` para rebanho/lavoura, `prestador` para prestador). Está em `INTERRUPTING`.
7. **Frases**: "Posso te mandar o relatório financeiro em PDF, é só pedir." (`ajuda`).
8. **Vizinhas**: `resumo financeiro` (texto curto em vez de PDF); `consultar_saldo`.

### 5.3 `registrar_lancamento_financeiro`

1. **Handler**: `registrarLancamentoFinanceiro` em `financeiro.ts`. Grava `createManualEntryAction`.
2. **Parâmetros**:

| campo | aliases | leitura |
|---|---|---|
| valor | `amount`, `valor`, `valor_total` | `lerDinheiro` |
| categoria | `category` (SÓ este nome) | texto; casa sem caixa com categoria ATIVA de despesa do tenant |
| fornecedor | `vendor` | texto; vai para `notes` |
| descrição | `description` | texto; vai para `notes` se não houver `vendor` |

   Categoria final: nome exato do tenant; senão palpite por palavra-chave
   (`suggestCategory` sobre categoria + fornecedor + descrição) se existir no tenant; senão
   `"Outras despesas"`. **DIVERGÊNCIA**: o guia do n8n diz "cai em Outros" e fala em lista
   fixa; o código lê as categorias do banco e cai em "Outras despesas".
3. **Obrigatórios**: valor. Ausente (`null`):
   `"Não consegui identificar o valor do lançamento. Pode informar quanto foi?"`.
   Valor zero ou negativo não é barrado no handler.
4. **Confirmação**: SEMPRE, qualquer valor (`confirmFlow`, sem âncora).
   `"Entendi: R$ 450,50, categoria Combustíveis, Posto XX. Confirma o lançamento?"`,
   `auxiliary_data: {amount, category, vendor, description}`,
   `registrar_lancamento_financeiro:aguardando_confirmacao`. Recusa: `"Lançamento cancelado."`.
   Sucesso: `"Lançamento registrado: R$ 450,50, Combustíveis, Posto XX."`,
   `action_taken: "registrar_lancamento_financeiro:<entry_id>"`.
   - O "sim" precisa vir com a mesma intenção E os parâmetros (`scripts/m11-financial-media-intent.test.ts`
     reenviam `parameters` completos com `message_text: "sim"`).
   - Riscos de §0.3 valem aqui ("pode lançar 500 de diesel" grava sem perguntar).
5. **Pendente**: não.
6. **Permissão**: `financeiro`, escrita, sem perfil. **Não** está em `INTERRUPTING`.
7. **O que grava, e o limite**: sempre **despesa** (`entry_type: "expense"`), `status: "pending"`,
   vencimento **hoje**, `related_module: "geral"`. Não há receita nem "já pago".
   "Recebi 1.500 de aluguel" e "Paguei 380 reais de energia hoje" (docx
   `docs/modulo-area-financeiro/` §42) não são representáveis fielmente: a primeira viraria
   despesa, a segunda fica pendente.
8. **Frases**: "gastei 50 reais com ração" (guia do n8n §4); "anota uma despesa de 500 reais com diesel" (comentário de `reaisBr` em `numero-br.ts`); foto ou PDF de recibo (guia do n8n §5); "como faco pra registrar gasto?" é `ajuda`, não lançamento (`scripts/m42-execute-action-endurecido.test.ts`).
9. **Vizinhas**: `registrar_negocio_produto` (insumo do catálogo que entra no estoque);
   `comprei_item_lista`; `registrar_diaria`/`registrar_pagamento_trabalhador` (fora deste catálogo).
   Pagamento de conta existente ("Paguei o João hoje", §42) não tem intenção.

---

## 6. Utilitárias

### 6.1 `ajuda`

1. **Handler**: `ajuda` em `src/lib/actions/whatsapp-handlers/ajuda.ts`.
   (O `.claude/rules/whatsapp.md` e o guia do n8n dizem que `HELP_TEXT` mora em
   `whatsapp-router.ts`; mora em `ajuda.ts`.)
2. **Parâmetros**: `topic` (texto), que precisa ser uma CHAVE de `HELP_TEXT`:
   `cadastrar_animal`, `registrar_peso`, `registrar_vacina`, `registrar_movimento`,
   `cadastrar_servico_ordem`, `consultar_saldo`, `consultar_animal`, `consultar_cliente`,
   `gerar_relatorio`, `registrar_lancamento_financeiro`, `registrar_uso_estoque`,
   `ajustar_estoque`, `registrar_negocio_produto`. Não há texto para lista de compra,
   calculadora, Meu Dia, `criar_tarefa`, `consultar_estoque`, rebanho novo nem negócio de gado.
3. **Obrigatórios**: nenhum.
   - tópico conhecido e perfil ativo: o texto fixo (`ajuda:<topic>`).
   - tópico de perfil inativo: `Esse recurso requer o perfil "..." ativo...` (`ajuda:perfil_inativo`).
   - sem tópico ou tópico desconhecido: `"Posso te ajudar com: cadastro de animais, pesagens, ... . Sobre qual desses você quer saber mais? Ou me conta direto o que você quer fazer que eu tento entender."` (só rótulos do perfil ativo; `ajuda:geral`).
4. Sem confirmação. 5. Sem pendente (o funil, se houver, é pelo `recent_history`).
6. **Permissão**: `module: null`; em `INTERRUPTING`.
7. **Frases**: "o que você faz?" (guia do n8n e texto de `ambigua`); "como eu cadastro um animal?" (checklist do guia); "como faco pra registrar gasto?" (`m42`); `m12` usa `topic: "cadastrar_animal"` e `"cadastrar_servico_ordem"`.
8. **Vizinhas**: `ambigua` (não entendeu); qualquer intenção de ação (a regra do guia: `ajuda` é quando pergunta COMO, não quando tenta fazer).

### 6.2 `resumo`

1. **Handler**: `resumo` em `src/lib/actions/whatsapp-handlers/resumo.ts`.
2. **Parâmetros**: `scope` (texto). Valores:

| scope | exige perfil | resposta |
|---|---|---|
| `rebanho` | fazenda | `"🐄 Rebanho: N animal(is) ativo(s).\n<vacinas dos próximos 30 dias com previsão de gasto>"` + oferta `"Quer registrar um valor previsto para <vacina> (brinco X)? Me diga o valor."` (a resposta a isso é `registrar_previsao_vacina`) |
| `lavoura` | fazenda | `"🌱 Lavoura: N talhão(ões) com ciclo ativo.\n<até 5 colheitas previstas>"` |
| `financeiro` | nenhum | `"💰 Financeiro: saldo do mês R$ X. N alerta(s) pendente(s)."` |
| `prestador` | prestador | `"Quer saber sobre Clientes, Agendamentos, Ordens a faturar?"` (`resumo:prestador:aguardando_escopo`) |
| `clientes`, `agendamentos`, `ordens_a_faturar` | prestador | contagem de clientes; até 5 agendamentos; ordens concluídas a faturar com total |
| `contas_a_pagar`, `contas_a_receber` | nenhum | até 5 lançamentos pendentes com vencimento até o fim do mês (vencidas com `⚠️ VENCIDA há N dias`), mais `Total a pagar no período: R$ X`; vazio `"Nenhuma conta a pagar no período."` |
| ausente, desconhecido, ou de perfil inativo no nível 1 | | `"Sobre o que você quer saber: Rebanho, Lavoura, Prestador, Financeiro?"` (`resumo:aguardando_escopo`) |

   `action_taken`: `resumo:<scope>`.
3. **Obrigatórios**: nenhum; falta de escopo vira a pergunta de nível 1.
4. Sem confirmação. 5. Sem pendente: o funil de 2 perguntas é reconstruído pelo classificador a partir do `recent_history`; se já perguntou e não resolveu, o guia manda emitir `ambigua`.
6. **Permissão**: `module: null`; perfis conferidos por escopo; em `INTERRUPTING`.
7. **Frases**: "minhas contas a pagar deste mês" vira `{"intent":"resumo","parameters":{"scope":"contas_a_pagar"}}` (guia do n8n §4.2); "me mostra o que eu tenho" (checklist do guia); "Quanto tenho para pagar?" e "Quanto tenho para receber?" (docx `docs/modulo-area-financeiro/` §42, que pedem o total, e o código entrega total do mês mais as 5 primeiras).
8. **Vizinhas**: `consultar_meu_dia` (o dia, não a área); `consultar_saldo`; `consultar_rebanho`/`consultar_estoque` (perguntas específicas); `gerar_relatorio`.

### 6.3 `ambigua`

1. **Handler**: nenhum. Tratada em `routeIntent` (`whatsapp-router.ts`), e também é o
   destino de qualquer `intent` que não esteja em `INTENTS` (a rota converte).
2. **Parâmetros**: nenhum lido.
3. **Resposta fixa**: `"Não entendi. Posso cadastrar novas informações ou te contar o que já está cadastrado: me diga o que você precisa, ou pergunte 'o que você faz?' que eu te mostro as opções."`, `action_taken: "ambigua"`.
4. **Mas antes disso** ela pode ser capturada:
   - com cadastro assistido de animal aberto, é tratada como RESPOSTA DE CAMPO (`handleActiveFlow`);
   - com pedido de estoque em confirmação e "sim" no texto, vira a intenção do pedido (§0.5 passo 4);
   - com pedido de estoque mais recente que o de gado/rebanho e sem `produto`/`item`/`categoria`/`movement_type`, vira a intenção do pedido (resposta curta como "2", "60 mil").
   - com negócio de gado pendente, a guarda de rebanho do roteador não age sobre `ambigua` (age só sobre `registrar_movimentacao_rebanho`), mas o handler de gado tem regras próprias fora deste catálogo.
5. Não confirma, não guarda pendente. 6. Sem permissão exigida.
7. **Frases**: respostas soltas como "não sei" no meio do funil do `resumo` (checklist do guia); "Nelore" solto (comentário de `whatsapp-flow-bridge.ts`); o "sim" curto que o LLM rotula como `ambigua` (comentário do roteador).
8. **Vizinhas**: `ajuda` ("o que você faz?"). **Implicação para o prompt**: o "sim" de
   `criar_tarefa`, `registrar_lancamento_financeiro`, `remover_item_lista`,
   `adicionar_item_lista` (duplicata) e `cadastrar_servico_ordem` NÃO pode sair como
   `ambigua`, porque nenhuma delas é recuperada por guarda.

### 6.4 `cadastrar_servico_ordem` (perfil Prestador)

1. **Handler**: `cadastrarServicoOrdem` em `src/lib/actions/whatsapp-handlers/prestador.ts`.
2. **Parâmetros**: `client_name` (texto), `service_name` (texto), `quantity` (`num`, padrão 1;
   ignorado se o serviço for de preço fixo). Só esses nomes.
3. **Obrigatórios**: cliente e serviço. Falta qualquer um:
   `"Para registrar a ordem, preciso do nome do cliente e do serviço prestado."`.
   Cliente não achado: `"Não encontrei nenhum cliente chamado '<nome>'. Cadastre o cliente primeiro."`;
   vários: `"Encontrei mais de um cliente com esse nome: A, B. Qual deles?"` (`auxiliary_data.clients`);
   serviço não achado: `"Não encontrei o serviço '<nome>' no catálogo."`.
4. **Confirmação**: só se total maior que R$ 5.000 (`CONFIRMATION_THRESHOLD`), via `confirmFlow` sem âncora:
   `Confirma a ordem de serviço "<serviço>" para <cliente> no valor de R$ X? Responda "sim" para confirmar.`
   Recusa: `"Ação cancelada."`. Sucesso: `"Ordem de serviço registrada para <cliente>: <serviço>, total R$ X."`,
   `action_taken: "cadastrar_servico_ordem:<id>"`. Data sempre agora.
5. Sem pendente. 6. **Permissão**: `prestador`, escrita, perfil `prestador`.
7. **Frases**: "fiz uma diária de trator pro cliente João" (`ajuda`).
8. **Vizinhas**: `registrar_servico_prestado` e `iniciar_servico` (serviço com máquina do perfil fazenda, fora deste catálogo); `registrar_diaria`.

### 6.5 `consultar_cliente` (perfil Prestador)

1. **Handler**: `consultarCliente` em `prestador.ts`.
2. **Parâmetros**: `client_name`.
3. Sem nome: `"Qual o nome do cliente que você quer consultar?"`; não achado:
   `"Não encontrei nenhum cliente chamado '<nome>'."`; vários: `"Encontrei mais de um cliente: A, B. Qual deles?"`.
   Resposta: `"<cliente>: faturado R$ X, pendente R$ Y (N ordens registradas)."`, `auxiliary_data` com o resumo.
4. Sem confirmação. 5. Sem pendente.
6. **Permissão**: `prestador`, leitura, perfil `prestador`. Em `INTERRUPTING`.
7. **Frases**: "quanto o João me deve" (`ajuda`).
8. **Vizinhas**: `resumo clientes`; "Quem está me devendo?" (docx financeiro §43) é `resumo contas_a_receber`.

---

## 7. Achados que o prompt do n8n precisa saber (resumo)

1. Só o TEXTO recusa (`message_text`); `confirmed: false` não cancela. Sempre mande `message_text`.
2. `detectConfirmation` casa o começo da frase: "ok/pode/isso ..." confirmam e "para ..." recusa. Em `criar_tarefa` e `registrar_lancamento_financeiro` isso grava ou cancela sem perguntar.
3. Estoque guarda o pedido: o "sim" pode vir com `parameters: {}`. Lista (remoção/duplicata) também. Tarefa, lançamento financeiro e ordem de serviço NÃO guardam: o "sim" precisa repetir intenção e parâmetros, e nunca pode sair como `ambigua`.
4. Calculadoras não guardam pendente (contrário à spec 37): a resposta a "quantos fios?" precisa voltar com comprimento e fios juntos.
5. Com cadastro assistido de animal aberto, lista, calculadora, Meu Dia, tarefa e lançamento financeiro são engolidos como resposta de campo.
6. Nomes de campo exatos que só aceitam UM nome: `title` (tarefa), `category`/`vendor`/`description` (lançamento), `topic` (ajuda), `scope` (resumo), `period` e `tipo` (saldo/relatório), `client_name`/`service_name` (prestador).
7. Formatos: `period` só `YYYY-MM`; datas relativas convertidas pelo classificador; unidade da lista como id (`saca`, `litro`, `rolo`...); números como número JSON onde o handler usa `num()` (lista, `quantity` do prestador).
8. `gerar_relatorio` ignora `period` (sempre mês atual) e já gera PDF financeiro.
9. `registrar_lancamento_financeiro` só cria despesa pendente vencendo hoje.
10. `comprei_item_lista` registra compra com valor SEM confirmação.

---

## 8. Contrato geral

### 8.1 `POST /api/internal/whatsapp/execute-action`

Arquivo: `src/app/api/internal/whatsapp/execute-action/route.ts`, envolvido por `withApi`.

**Autenticação**: header `x-internal-secret` comparado em tempo constante com
`INTERNAL_API_SECRET` (`src/lib/internal-guard.ts`). Ausente/errado: 401 `UNAUTHORIZED`.
Variável não configurada: 500 `SERVER_MISCONFIGURED`.

**Corpo** (Zod):

| campo | tipo | obrigatório | uso |
|---|---|---|---|
| `tenant_id` | string não vazia | sim | conferido contra o dono do `user_id`; não é autoridade |
| `user_id` | string não vazia | sim | usuário ativo; a role é relida do banco |
| `intent` | string | sim | se não estiver em `INTENTS`, vira `ambigua` (sem erro) |
| `parameters` | objeto (record) | não, padrão `{}` | repassado ao handler |
| `message_text` | string, `null` ou ausente | não | log de entrada e detecção de sim/não; é a ÚNICA fonte de recusa |
| `confirmed` | boolean, `null` ou ausente | não | só `true` conta |
| `provider_message_id` | string não vazia, `null` ou ausente | não | `wamid`, chave de idempotência |

Corpo inválido: 422 `VALIDATION_ERROR` `"Corpo inválido: tenant_id, user_id e intent são obrigatórios"`.

**Sequência**:
1. Segredo.
2. Parse do corpo.
3. `prisma.user.findUnique(user_id)` com client base; tenant diferente ou usuário
   inexistente: 403 `TENANT_MISMATCH` `"O usuário informado não pertence a este tenant"`.
4. **Idempotência**: com `provider_message_id`, procura `AgentRequest` do tenant com esse
   id. Achou: devolve **200 com a resposta gravada**, sem executar, sem log de conversa.
   Sem o campo: executa normalmente e registra aviso `SEM_CHAVE_DE_IDEMPOTENCIA`.
5. Usuário ativo no tenant; senão 404 `INVALID_USER` `"Usuário não encontrado ou inativo neste tenant"`.
6. Busca o `WhatsAppContact` do usuário e os perfis ativos do tenant.
7. Se há contato, grava log de entrada (`message_text`, ou `"[intent] {parameters}"` sem texto).
8. Calcula `confirmed` e `explicitNo` (§0.3) e chama `routeIntent`.
9. Se há contato, grava log de saída com `reply_text` e `action_taken`.
10. Com `provider_message_id`, grava `AgentRequest {provider_message_id, intent, response}`
    DEPOIS de executar (colisão `P2002` ignorada: corrida entre duas chamadas iguais).

**Resposta 200** (envelope `{ data, meta }` de `apiOk`, `meta` vazio):

```json
{
  "data": {
    "reply_text": "texto pronto em português",
    "requires_confirmation": false,
    "auxiliary_data": null,
    "report_url": null,
    "action_taken": "registrar_uso_estoque:ok"
  },
  "meta": {}
}
```

- `reply_text`: sempre presente; é a mensagem a enviar.
- `requires_confirmation`: `true` quando a resposta é uma pergunta de sim/não. Atenção:
  a pergunta de duplicata de `adicionar_item_lista` vem com `false`.
- `auxiliary_data`: objeto ou `null`; varia por handler (listas de candidatos, ids gravados,
  resumo da confirmação). É só saída: devolvê-lo no corpo não tem efeito.
- `report_url`: string só em `gerar_relatorio` financeiro.
- `action_taken`: extensão aditiva usada pelo n8n para NÃO reescrever no humanizador.
  Padrões: `clarification_requested` (pergunta de campo), `<intent>:aguardando_confirmacao`,
  `<intent>:cancelado`, `<intent>:ok`, `<intent>:<id>`, `<intent>:falhou:<code>`,
  `<intent>:sem_permissao`, `<intent>:perfil_inativo`, `cadastro_assistido:*`, `ambigua`.
- Erros inesperados passam por `withApi` (erro conhecido do Prisma traduzido, senão 500 com `request_id`).

**Múltiplas intenções numa mensagem**: a rota aceita **uma** intenção por chamada. O
fan-out é do n8n (guia §0.2): o classificador devolve `intents: []` (teto de 3), o
`Parse Resposta LLM` emite um item por intenção, o `Execute Action` roda uma vez para
cada, e `Separar Respostas` manda uma mensagem por assunto; se alguma pedir confirmação,
ela responde sozinha. Consequências no Tibé:
- cada chamada grava seu próprio log de entrada com o MESMO `message_text` (o histórico
  duplica a frase);
- `detectConfirmation` roda sobre o mesmo texto em todas as chamadas;
- **idempotência colide**: a chave é `(tenant_id, provider_message_id)` e a busca não olha
  a intenção. Se o n8n mandar o mesmo `wamid` nas 2 ou 3 chamadas de uma mensagem, a
  segunda e a terceira recebem de volta a resposta da PRIMEIRA e não executam. Hoje o n8n
  não manda o campo (comentário da rota), então isso ainda não acontece; ao ligar, a chave
  precisa ser composta (ex.: `wamid` + índice da intenção) ou o fan-out continua sem chave.

**Idempotência, resumo**: por `provider_message_id` (o `wamid`, nunca o id de execução do
n8n), escopo por tenant, resposta inteira reaproveitada, gravada só após sucesso.

### 8.2 `POST /api/internal/whatsapp/resolve-contact`

Arquivo: `src/app/api/internal/whatsapp/resolve-contact/route.ts`. Único lookup cross-tenant legítimo.

**Autenticação**: mesmo `x-internal-secret`.

**Corpo**: `{ "phone": string (mínimo 3 caracteres) }`. Inválido: 422 `VALIDATION_ERROR`
`"phone é obrigatório"`. O telefone é reduzido a dígitos (`normalizePhone`) e casado por
igualdade exata (sem acrescentar DDI).

**Lógica**:
1. Procura `WhatsAppContact` com esse telefone em qualquer tenant.
2. Não achou: procura `User` ativo com esse telefone em qualquer tenant.
   - não achou: `200 { data: { identified: false }, meta: { suggested_reply: "Este número não está cadastrado no Tibé. Peça para o administrador da sua empresa cadastrar seu telefone no sistema." } }`
   - achou: cria o `WhatsAppContact` (vínculo) e marca `first_contact = true`.
3. Contato existente: atualiza `last_interaction_at`.
4. Contato sem `user_id`, ou usuário inativo: `200 { data: { identified: false }, meta: {} }` (sem `suggested_reply`).
5. Identificado:

```json
{
  "data": {
    "identified": true,
    "tenant_id": "...",
    "user_id": "...",
    "user_name": "...",
    "role": "OWNER | ADMIN | OPERADOR | VISUALIZADOR",
    "active_profiles": ["fazenda", "prestador"]
  },
  "meta": {
    "first_contact": false,
    "suggested_reply": null,
    "recent_history": [
      { "direction": "in | out", "content": "...", "intent_detected": "...", "created_at": "ISO8601" }
    ]
  }
}
```

- `recent_history`: as **5 últimas linhas** de `AgentConversationLog` do contato (entrada e
  saída contam separadas, então são cerca de 2 turnos e meio), em ordem cronológica.
  Com multi-intenção, a mesma frase de entrada aparece repetida.
- `suggested_reply` no primeiro contato:
  `"Olá, <nome>! 👋 Bem-vindo(a) ao Tibé. Sua empresa tem os módulos: <Rebanho e Lavoura, Prestador de Serviço> e Financeiro. Você pode me pedir para cadastrar animais, registrar pesagens e vacinas, criar ordens de serviço, ou consultar informações: é só me mandar uma mensagem."`;
  fora do primeiro contato, `null`.
- O resolve-contact não devolve pendentes, cadastro assistido aberto nem a data de hoje:
  `current_date` é montado no próprio n8n.
