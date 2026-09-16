# Catálogo de intenções: Leite, Mão de obra, Serviços e Prestador

Leitura do código em 2026-09-14, `main` em `b31d9f1`. Nada foi executado nem gravado.
Tudo abaixo vem do handler de verdade; onde o comentário do código diz uma coisa e o
código faz outra, vale o código, e isso está marcado.

Estado de emissão: das 16 intenções, só `cadastrar_servico_ordem` e `consultar_cliente`
estão no prompt do classificador hoje (`docs/n8n-whatsapp-workflow.md` §4). As outras 14
estão roteadas e testadas, mas o n8n não as emite (comentários em `src/lib/whatsapp-intents.ts`
linhas 60 a 101, e §4.3 do guia do n8n, que só documenta as quatro do leite).

---

## 0. Mecânica comum (vale para as 14 intenções novas)

### 0.1 O que a rota faz antes do handler

`src/app/api/internal/whatsapp/execute-action/route.ts`:

- Corpo: `tenant_id`, `user_id`, `intent`, `parameters` (objeto), `message_text` (opcional),
  `confirmed` (boolean, opcional, aceita null), `provider_message_id` (opcional, idempotência).
- Intenção desconhecida vira `ambigua`.
- `confirmed` efetivo = `body.confirmed === true` **ou** `detectConfirmation(message_text) === "yes"`.
  Portanto `confirmed: false` e `confirmed: null` são idênticos: ausência de confirmação, **nunca** recusa.
- `explicitNo` = `detectConfirmation(message_text) === "no"`. **Só vem do texto.** Sem
  `message_text`, "não" não cancela nada.
- `detectConfirmation` (`src/lib/actions/confirmation.ts`): tira pontuação, compara a frase
  inteira ou o começo (`palavra + espaço`). Testa SIM antes de NÃO.
  - SIM: `sim, s, confirmo, confirmado, confirma, isso mesmo, isso, correto, pode, ok, beleza, positivo`
  - NÃO: `não, nao, n, cancela, cancelar, cancelado, errado, negativo, deixa pra la, deixa pra lá, deixa quieto, esquece, esquecer, melhor nao, melhor não, nao quero, não quero, para, parar`

### 0.2 O que o roteador faz antes do handler

`src/lib/actions/whatsapp-router.ts`, `routeIntent`, nesta ordem:

1. `desempatarIntencao` (não afeta estas 16).
2. Se há pendente de **estoque** em `confirmacao` e `confirmed` é true, a intenção é trocada
   pela do estoque, salvo se os parâmetros mudam o pedido do estoque ou se há um formulário
   de cadastro de animal mais recente. **Não considera os pendentes de leite, mão de obra ou
   serviço** (ver risco R3).
3. `handleActiveFlow` (cadastro assistido de animal): se há formulário aberto, a mensagem é
   oferecida a ele como resposta de campo, exceto intenções em `INTERRUPTING`. Das 16, só
   `consultar_cliente` está em `INTERRUPTING` (`whatsapp-flow-bridge.ts` linha 53). As outras
   15 são engolidas como resposta de campo enquanto um cadastro de animal estiver aberto.
4. Permissão (`INTENT_ACCESS` + `canWrite`/`canAccess` de `src/lib/permissions.ts`). Recusa:
   `"Você não tem permissão para executar essa ação."`, `action_taken: <intent>:sem_permissao`.
5. Perfil ativo. Recusa: `Esse recurso requer o perfil "Fazenda" ativo, que não está habilitado para sua empresa.`
   (ou `"Prestador de Serviço"`), `action_taken: <intent>:perfil_inativo`.
6. Handler. Depois dele, se foi escrita e o turno fechou (sem `requires_confirmation` e sem
   `clarification_requested`), grava `marcarExecucao`.

⚠️ `ambigua` responde `"Não entendi. Posso cadastrar novas informações..."` e **não consulta
nenhum pendente destes domínios**. Para estas 14 intenções, a resposta curta ("480", "sim",
"o João") só chega ao pedido guardado se o classificador **reemitir a MESMA intenção**.

### 0.3 Matriz de permissão relevante

| módulo | OWNER | ADMIN | OPERADOR | VISUALIZADOR |
|---|---|---|---|---|
| `rebanho` (leite) | escreve | escreve | escreve | lê |
| `mao_de_obra` | escreve | escreve | **nada** | **nada** |
| `servicos` | escreve | escreve | escreve | lê |
| `prestador` | escreve | escreve | escreve | lê |

### 0.4 Pendente entre mensagens (Redis)

`src/lib/actions/pending-store.ts`, um store por domínio, chave `tibe:<prefixo>:<tenant>:<user>`,
TTL 15 min. Sem `user_id` não há memória.

`abrirConversa` (cópia igual em `leite.ts`, `mao-de-obra.ts`, `servico.ts`):

- `explicitNo` é checado **antes** de tudo: limpa o pendente e responde
  `"Tudo bem, não registrei nada."`, `action_taken: <intent>:cancelado`.
- `confirmed === true`:
  - sem `user_id`: `"Não consegui identificar quem está falando comigo, então não vou registrar nada. Me conte de novo ..."`
  - pendente do MESMO gesto em `confirmacao`: **os parâmetros da mensagem são descartados** e
    usa-se o pedido guardado (o "sim" executa o que foi mostrado).
  - senão: recusa sem gravar (texto por domínio, ver cada seção).
- `confirmed` falso, pendente do mesmo gesto esperando um CAMPO: entra **só** o campo
  perguntado, lido de `parameters[campo]` ou do atalho em inglês. Aceita número ou string
  não vazia. Se a mensagem não traz esse campo, o pendente é ignorado e o handler roda só
  com os parâmetros novos (e sobrescreve o pendente na próxima pergunta).
- Pendente em `confirmacao` e `confirmed` falso: não junta nada; roda com os parâmetros novos.
  Se o classificador reenviar o pedido inteiro, a confirmação é refeita; se mandar `{}`, volta
  a perguntar o primeiro campo e perde o pedido.
- Consequência testada (`m58` bloco 16): responder dois campos de uma vez perde o segundo.

Atalhos por domínio:

| domínio (prefixo) | campo guardado: atalho aceito na resposta |
|---|---|
| leite (`leite-pending`) | `litros: liters`, `quantidade: quantity`, `fazenda: property`, `lote: group`, `data: date` |
| mão de obra (`mao-de-obra-pending`) | `nome: name`, `funcao: role`, `valor: amount`, `frequencia: pay_frequency` |
| serviço (`servico-pending`) | `servico: description`, `valor: amount`, `quantidade: quantity`, `pessoas: worker_count`, `quem: contact_name`, `maquina: machine`, `unidade: pricing`, `produto: product` |

### 0.5 Parsers

- `str(v)`: string não vazia, com trim; número NÃO vale como string.
- `lerNumeroBr(v)` (`src/lib/numero-br.ts`): número finito passa direto. String: tira `R$`;
  `mil`/`milhão` multiplicam; com vírgula, ponto é milhar (`1.500,50`); sem vírgula, ponto só é
  decimal se sobrarem 1 ou 2 casas (`2.5`), senão é milhar (`1.500` = 1500). **Qualquer texto
  extra invalida**: `"480 litros"`, `"3x"`, `"4 dias"` devolvem `null` e o handler pergunta de novo.
  O classificador deve mandar número puro ou `"60 mil"`.
- `num(v)` (`shared.ts`, só em `cadastrar_servico_ordem`): `Number(v)` cru. `"1.500"` vira 1,5.
- `lerData(parameters, "data", "date")` (`parsers.ts`): aceita `hoje`, `ontem`, ISO `AAAA-MM-DD`
  (com conferência de dia válido), `DD/MM`, `DD/MM/AA(AA)`, `dia N` ou `N` (sempre mês corrente,
  mesmo se já passou). Não aceita `amanhã`, `anteontem`, dia da semana. Texto não entendido
  devolve `invalida` e o handler pergunta `Não entendi a data "<bruto>". Qual foi o dia?`.
  Ausente = hoje.

### 0.6 Riscos transversais achados na leitura (não validados ao vivo)

- **R1. "para o João" cancela.** `para` está em `NO_WORDS` e casa por prefixo. As perguntas
  `Para quem você fez a <serviço>?` e `Para quem foi o adiantamento?` convidam exatamente essa
  resposta, que vira `explicitNo` e cancela o pedido inteiro (`<intent>:cancelado`).
- **R2. SIM ganha de NÃO por prefixo.** `"pode cancelar"`, `"isso não"`, `"ok, deixa pra lá"`
  viram confirmação. E `"isso, 32 vacas"` como resposta a um campo vira `confirmed` e o handler
  responde "Não tenho nenhum registro ... esperando confirmação", sem juntar o campo.
- **R3. "sim" roubado pelo estoque.** Com um pedido de estoque em `confirmacao` vivo (15 min),
  um "sim" dado para leite, mão de obra ou serviço é trocado pela intenção do estoque no
  roteador (passo 2 de 0.2), porque a checagem de recência não conhece esses três domínios.
- **R4. Formulário de animal aberto engole 15 destas intenções** (passo 3 de 0.2).

---

## 1. `registrar_producao_leite`

**1. Handler.** `src/lib/actions/whatsapp-handlers/leite.ts`, `registrarProducaoLeite`. Grava por
`recordMilkProduction` (`src/lib/actions/milk-production.ts`). Gesto de pendente: `producao`.

**2. Parâmetros lidos.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `fazenda` | `property` | string | `resolverFazenda`: nome exato (insensitive), senão `contains`. Primeiro achado vence no `contains`. |
| `manha`, `tarde`, `noite` | nenhum | número ou string | `lerNumeroBr`; só conta se > 0. Litros daquela ordenha. |
| `litros` | `liters`, `quantidade` | número ou string | `lerNumeroBr`. **Ignorado** se qualquer turno > 0 veio (turno manda, não soma). |
| `data` | `date` | string | `lerData`. Ausente = agora. |
| `lote` | `group` | string | Lote leiteiro por `includes` normalizado (sem acento), dentro da fazenda. Opcional. |

**3. Obrigatórios e perguntas, na ordem em que são checados.**

1. Fazenda (só se não resolver): nome dado e não achado: `Não encontrei a fazenda "<nome>". Confira o nome e tente de novo.`;
   nenhuma cadastrada: `Você ainda não tem fazenda cadastrada. Cadastre uma no painel, em Minha Fazenda.`;
   mais de uma e nenhum nome: `Em qual fazenda?\n- A\n- B`. Guarda `fazenda`. Com uma fazenda só, resolve sozinho.
2. Litros: nenhum turno > 0 e `litros` nulo ou <= 0: `Quantos litros você tirou?`. Guarda `litros`
   (a resposta precisa vir em `litros` ou `liters`; `manha: 300` como resposta não junta, ver 0.4).
3. Data inválida: `Não entendi a data "<bruto>". Qual foi o dia?`. Guarda `data`.
4. Lote dado e não resolvido: sem lotes: `Você ainda não tem lote leiteiro cadastrado, então não consigo registrar em "<nome>". Cadastre no painel, em Leite, ou me diga sem o lote.`;
   não achado: `Não achei o lote "<nome>". Os que você tem:\n- ...`; mais de um: `Qual lote?\n- ...`. Guarda `lote`.

**4. Confirmação.** Sempre. Texto: `Deseja registrar uma produção total de <N litros> <hoje | em DD/MM/AAAA>< (300 litros de manhã, 180 litros à tarde)>?`,
`requires_confirmation: true`, `auxiliary_data: {litros, fazenda}`, `action_taken: registrar_producao_leite:aguardando_confirmacao`.
- `confirmed: true` com pendente `producao` em `confirmacao`: grava o guardado. Sem pendente certo:
  `Não tenho nenhum registro de leite esperando confirmação. Me conte de novo o que aconteceu.`
- `false`/`null`: pergunta de novo (ou pede o campo que faltar).
- `explicitNo`: cancela e limpa.
- Sucesso: `✅ Produção de <N litros> registrada <quando> em <Fazenda>.< Média de X litros por vaca.>` (média só se há contagem de lactação na data).
  Com turnos, grava UMA LINHA POR TURNO (`m52`: "e grava DUAS linhas").
- Recusas da action viram `⚠️ <mensagem>` com `action_taken: registrar_producao_leite:falhou:<CODE>`
  (ex.: `PROPERTY_ARCHIVED`, `QUANTIDADE_INVALIDA`, `FORMAS_MISTURADAS`).

**5. Pendente.** Sim, `leite-pending`, campos `litros | quantidade | fazenda | lote | data | confirmacao`.
O gesto `producao` é distinto do gesto `lactacao`.

**6. Permissão.** Módulo `rebanho`, escrita (OWNER, ADMIN, OPERADOR). Perfil `fazenda`.

**7. Frases.**
- "Tirei 480 litros hoje." e resposta "Deseja registrar a produção de 480 litros de leite hoje?" (documento do cliente em `docs/area-funcional-confinamento/`, o .docx "Área Leite", daqui em diante "Área Leite.docx", §36 Produção).
- "Tirei 300 litros de manhã e 180 à tarde." e "Deseja registrar uma produção total de 480 litros hoje?" (mesmo documento, §36 Produção por ordenha; `scripts/m52-leite.test.ts` bloco 11 usa `{manha: 300, tarde: 180}`).
- `docs/specs/module-32-area-leite.md` §9: "tirei 480 litros hoje"; e "tirei 300 de manhã" às nove, "mais 180 à tarde" às cinco (§ decisão 4.3, duas mensagens separadas são aceitas).

**8. Vizinhas.**
- Frases do §36 que **não têm intenção**: "Coloquei os 480 litros no tanque" (armazenamento), "Levei 600 litros para o ponto de coleta do Zé", "O João trouxe 300 litros para o meu tanque", "Vendi 500 litros por R$ 2,40 o litro", "Entreguei 500 litros para o Laticínio Boa Vida. Eles pagam dia 10". Todas citam litros e podem ser forçadas para produção por engano; nenhuma é produção.
- `registrar_uso_estoque` / `registrar_combustivel_servico`: "gastei 60 litros de diesel" também tem litros; o que distingue é o verbo (tirar/ordenhar) e o produto (leite).
- `definir_vacas_em_lactacao`: "tirei 480 litros de 32 vacas" traz os dois números; o handler de produção não lê vacas. São duas mensagens/intenções.
- `registrar_lancamento_financeiro`: venda de leite com valor não é produção.

---

## 2. `definir_vacas_em_lactacao`

**1. Handler.** `leite.ts`, `definirVacasEmLactacao = fabricarLactacao("definir", ...)`. Grava por
`recordLactationEntry` (`src/lib/actions/milk-lactation.ts`) com `type: "definir"`. Gesto de pendente: `lactacao`.

**2. Parâmetros lidos.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `fazenda` | `property` | string | igual à produção |
| `quantidade` | `quantity`, `vacas` | número ou string | `lerNumeroBr`. O TOTAL que existe agora, não a diferença. |
| `data` | `date` | string | `lerData` |
| `lote` | `group` | string | igual à produção |

**3. Obrigatórios e perguntas.**
1. Fazenda: mesmas três respostas da seção 1. Guarda `fazenda`.
2. Quantidade: nula, negativa: `Quantas vacas estão em lactação?`. **Zero é aceito** só aqui. Guarda `quantidade`
   (resposta em `quantidade` ou `quantity`; `vacas` não serve como resposta).
3. Não inteira: `<N> vaca não dá. Quantas vacas exatamente?`. Guarda `quantidade`.
4. Data inválida e lote: iguais à seção 1.

**4. Confirmação.** Sempre. `Deseja atualizar para <N> o número de vacas em lactação em <Fazenda>?`,
`auxiliary_data: {quantidade, tipo: "definir", fazenda}`.
- `confirmed: true` sem pendente `lactacao` em `confirmacao`: `Não tenho nenhum registro de leite esperando confirmação. Me conte de novo o que aconteceu.` (testado em `m52`: "um 'sim' sem pedido guardado não grava").
- Sucesso: `✅ Registrado <quando> em <Fazenda>.< Agora são N em lactação.>`

**5. Pendente.** `leite-pending`, gesto `lactacao`.
⚠️ **As três intenções de lactação compartilham o gesto `lactacao` e o pendente não guarda o tipo.**
Se a confirmação mostrada foi de `definir` (32) e o "sim" chegar classificado como
`registrar_entrada_lactacao`, o handler de entrada aceita o pendente e grava uma ENTRADA de 32.
O tipo gravado é o da intenção do "sim", não o da pergunta. O classificador precisa reemitir
exatamente a mesma intenção no "sim".

**6. Permissão.** `rebanho` escrita; perfil `fazenda`.

**7. Frases.**
- "Estou com 32 vacas dando leite." e "Deseja atualizar para 32 o número de vacas em lactação?" (Área Leite.docx, §36 Vacas em lactação; `m52`: "'estou com 32 vacas' define 32").
- "não tenho mais nenhuma vaca em lactação" (zero legítimo: comentário em `leite.ts` e `docs/n8n-whatsapp-workflow.md` §4.3).

**8. Vizinhas.** A escolha é **o verbo, não o número** (`docs/n8n-whatsapp-workflow.md` §4.3):
- "estou com / tenho / são N vacas dando leite" = definir.
- "entraram / pariram e entraram no leite N" = `registrar_entrada_lactacao`.
- "sequei / saíram N" = `registrar_saida_lactacao`.
- `consultar_rebanho` ("quantas vacas eu tenho?") é pergunta, não afirmação, e é do rebanho.
- `registrar_movimentacao_rebanho` com `saldo_inicial` ("tenho 32 vacas") mexe no rebanho; lactação é condição, não categoria (§37.1 e §37.2 do documento). "dando leite" / "em lactação" / "no leite" é o marcador.

---

## 3. `registrar_entrada_lactacao`

**1. Handler.** `leite.ts`, `registrarEntradaLactacao = fabricarLactacao("entrada", ...)`; `recordLactationEntry` com `type: "entrada"`.

**2. Parâmetros.** Iguais à seção 2 (`fazenda|property`, `quantidade|quantity|vacas`, `data|date`, `lote|group`). Quantidade = quantas ENTRARAM.

**3. Obrigatórios.** Fazenda como na seção 1. Quantidade nula, negativa **ou zero**: `Quantas vacas?`.
Não inteira: `<N> vaca não dá. Quantas vacas exatamente?`. Data e lote como na seção 1.

**4. Confirmação.** Sempre. `Deseja acrescentar <N> vaca(s) ao lote de animais em lactação em <Fazenda>?`.
Mesmo tratamento de `true`/`false`/`null`/`explicitNo` da seção 2. Sucesso: `✅ Registrado <quando> em <Fazenda>. Agora são N em lactação.`

**5. Pendente.** `leite-pending`, gesto `lactacao` compartilhado (ver alerta da seção 2).

**6. Permissão.** `rebanho` escrita; perfil `fazenda`.

**7. Frases.**
- "Entraram mais 4 vacas no leite." e "Deseja acrescentar 4 vacas ao lote de animais em lactação?" (Área Leite.docx, §36 Entrada em lactação).
- "entraram mais 4" (cabeçalho de `leite.ts`; `m52`: "'entraram mais 4' soma: 36, e não 4").

**8. Vizinhas.** `definir_vacas_em_lactacao` (mesmo número, sentido de total); `registrar_saida_lactacao`
(erra por 2N no sentido oposto). `registrar_movimentacao_rebanho` `nascimento`/`compra` ("entraram 4 vacas na fazenda") mexe no rebanho; "no leite"/"em lactação" é o marcador.

---

## 4. `registrar_saida_lactacao`

**1. Handler.** `leite.ts`, `registrarSaidaLactacao = fabricarLactacao("saida", ...)`; `recordLactationEntry` com `type: "saida"`.

**2. Parâmetros.** Iguais à seção 2. Quantidade = quantas SECARAM/saíram.

**3. Obrigatórios.** Iguais à seção 3 (zero recusado com `Quantas vacas?`).

**4. Confirmação.** Sempre. `Deseja retirar <N> vaca(s) da quantidade em lactação em <Fazenda>?`.
Recusa de saldo depois do "sim": `⚠️ Não é possível retirar <N> da lactação: há <X> em produção nesta data.`,
`action_taken: registrar_saida_lactacao:falhou:SALDO_INSUFICIENTE` (testado em `m52`). O pendente é limpo antes da recusa.

**5. Pendente.** `leite-pending`, gesto `lactacao` compartilhado (ver alerta da seção 2).

**6. Permissão.** `rebanho` escrita; perfil `fazenda`.

**7. Frases.**
- "Sequei 3 vacas." e "Deseja retirar 3 vacas da quantidade em lactação?" (Área Leite.docx, §36 Saída da lactação; `m52`: "'sequei 3' subtrai: 33").

**8. Vizinhas.** `registrar_entrada_lactacao` e `definir_vacas_em_lactacao` (ver seção 2).
`registrar_movimentacao_rebanho` `morte`/`venda` ("morreu uma vaca", "vendi 3 vacas") tira do rebanho; secar não tira do rebanho (§37.4 do documento).

---

## 5. `registrar_trabalhador`

**1. Handler.** `src/lib/actions/whatsapp-handlers/mao-de-obra.ts`, `registrarTrabalhador`. Grava por
`createWorker` (`src/lib/actions/workers.ts`) com `type: "fixo"`, o que também cria a previsão de pagamento pendente. Gesto: `cadastro`.

**2. Parâmetros.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `nome` | `name` | string | nome livre |
| `funcao` | `role` | string | função livre (vaqueiro, tratorista...) |
| `valor` | `amount` | número ou string | `lerNumeroBr`, > 0 |
| `frequencia` | `pay_frequency` | string | `lerFrequencia`: normaliza e procura, por `includes`, nesta ordem: `mes, mensal, mensalmente` = mensal; `quinzena, quinzenal` = quinzenal; `semana, semanal` = semanal; `dia, diaria, diária` = diaria. "por mês" e "mensal" funcionam; valor em inglês (`monthly`) não. |

Não lê data, dia de pagamento nem fazenda.

**3. Obrigatórios e perguntas, na ordem.**
1. `Qual o nome do trabalhador?` (guarda `nome`)
2. `O que <nome> faz na fazenda? (vaqueiro, tratorista, caseiro...)` (guarda `funcao`)
3. `Quanto <nome> recebe?` (guarda `valor`)
4. `<nome> recebe esse valor por mês, por quinzena, por semana ou por dia?` (guarda `frequencia`)

**4. Confirmação.** Sempre. `Deseja cadastrar <nome> como <funcao>, com pagamento de R$ X,XX <por mês|por quinzena|por semana|por dia>?`,
`auxiliary_data: {nome, funcao, valor, frequencia}`.
- `confirmed: true` sem pendente `cadastro` em `confirmacao`: `Não tenho nenhum registro de mão de obra esperando confirmação. Me conte de novo.`
- Sucesso: `✅ <Nome> cadastrado como <função>, R$ X <frequência>.\nPróximo pagamento: R$ X em DD/MM/AAAA.`

**5. Pendente.** `mao-de-obra-pending`, campos `nome | funcao | valor | frequencia | confirmacao`.
Testado turno a turno em `scripts/m57-mao-de-obra.test.ts` bloco 14 (o classificador manda só o campo perguntado).

**6. Permissão.** Módulo `mao_de_obra`: **só OWNER e ADMIN**. OPERADOR recebe `"Você não tem permissão para executar essa ação."` (`m57` bloco 19). Perfil `fazenda`.

**7. Frases.**
- "João é meu vaqueiro e ganha 2.500 por mês." e "Deseja cadastrar João como vaqueiro, com pagamento mensal de R$ 2.500?" (`docs/modulo-area-mao-de-obra/tibe-area-mao-de-obra.docx`, §32 Funcionário fixo; cabeçalho de `mao-de-obra.ts`).

**8. Vizinhas.**
- `registrar_diaria`: "o Zé trabalhou 3 dias a 150" é diária de serviço, não cadastro de fixo. "ganha X por mês/semana" é o marcador do cadastro.
- `registrar_pagamento_trabalhador`: "paguei 2.500 pro João" não é cadastro.
- Cadastro de contato/cliente não existe por WhatsApp.

---

## 6. `registrar_pagamento_trabalhador`

**1. Handler.** `mao-de-obra.ts`, `registrarPagamentoTrabalhador`. Grava por `confirmWorkerPayment`: quita a previsão pendente mais antiga e cria a próxima. Gesto: `pagamento`.

**2. Parâmetros.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `nome` | `name` | string | `resolverTrabalhador`: ativos, `includes` normalizado |
| `valor` | `amount` | número ou string | opcional; `lerNumeroBr`. Sem ele, usa o valor da previsão. |

Não lê data ("hoje" é ignorado; paga agora).

**3. Obrigatórios e perguntas.**
1. `Quem você pagou?` (guarda `nome`)
2. Trabalhador: nenhum cadastrado: `Você ainda não tem ninguém cadastrado, então não consigo achar "<nome>". Me diga quem é e quanto ganha, ou cadastre no painel, em Mão de Obra.`;
   não achado: `Não achei "<nome>" na sua equipe. Quem você tem:\n- Nome (função)`;
   mais de um: `Tenho mais de um com esse nome. Qual deles?\n- ...`. **Nenhum destes guarda pendente.**
3. Sem valor dito e sem previsão: `Não tenho pagamento previsto para <Nome>, e você não me disse o valor. Quanto você pagou?`. **Não guarda pendente**: a resposta "2500" sozinha chega sem `nome` e o handler volta a perguntar `Quem você pagou?`. O classificador precisa remontar `nome` + `valor`.
   (E mesmo com valor, sem previsão pendente a action recusa depois do "sim": `⚠️ Não há pagamento previsto para <Nome>. Registre um adiantamento ou um pagamento avulso, ou confira se o cadastro tem valor e frequência.`)

**4. Confirmação.** Sempre. `Deseja registrar o pagamento de R$ X para <Nome>, referente ao pagamento <por mês>?`
(o trecho "referente" só aparece quando o valor veio da previsão). `auxiliary_data: {worker_id, valor}`.
- `confirmed: true` sem pendente `pagamento` em `confirmacao`: `Não tenho nenhum registro de mão de obra esperando confirmação. Me conte de novo.`
- Sucesso: `✅ Pagamento de R$ X para <Nome> registrado.\nPróximo: DD/MM/AAAA.`

**5. Pendente.** `mao-de-obra-pending`, gesto `pagamento`. Só guarda `nome` e `confirmacao`.

**6. Permissão.** `mao_de_obra` (OWNER e ADMIN). Perfil `fazenda`.

**7. Frases.**
- "Paguei o João hoje." e, sabendo o previsto, "Deseja registrar o pagamento mensal de João no valor de R$ 2.500?" (mão de obra.docx, §32 Pagamento; `m57` bloco 18: "oferece o valor PREVISTO sem o produtor dizer").

**8. Vizinhas.**
- `registrar_adiantamento`: "dei 500 adiantado pro João". A palavra "adiantado/adiantamento/vale" é o marcador; pagamento quita a previsão, adiantamento fica separado.
- `registrar_lancamento_financeiro`: "paguei 300 de diesel" é despesa avulsa; aqui o objeto é uma PESSOA da equipe.
- Pagamento de serviço contratado ("paguei o Pedro da cerca", "Vou pagar o Pedro dia 10", §32 Pagamento futuro) **não tem intenção**; `registrar_servico_contratado` já cria a conta a pagar e não lê vencimento.
- Recebimento de serviço prestado ("João me pagou 2 mil hoje", máquinas.docx §42 Recebimento) **não tem intenção** (`registrar_recebimento_servico` está planejada na spec `docs/superpowers/specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md` §6, não existe no código).

---

## 7. `registrar_adiantamento`

**1. Handler.** `mao-de-obra.ts`, `registrarAdiantamento`. Grava por `recordWorkerAdvance`, lançamento próprio sem mexer na previsão. Gesto: `adiantamento`.

**2. Parâmetros.** `nome|name` (string, `resolverTrabalhador`), `valor|amount` (`lerNumeroBr`, > 0).

**3. Obrigatórios e perguntas, na ordem.**
1. `Para quem foi o adiantamento?` (guarda `nome`). ⚠️ Resposta natural "para o João" dispara `explicitNo` e cancela (R1).
2. Trabalhador: mesmas três respostas da seção 6, sem guardar pendente.
3. `Quanto você adiantou para <Nome>?` (guarda `valor`, com o nome já no pendente).

**4. Confirmação.** Sempre. `Deseja registrar um adiantamento de R$ X para <Nome>?`, `auxiliary_data: {worker_id, valor}`.
- `confirmed: true` executa o GUARDADO mesmo que a mensagem traga outro valor (`m57` bloco 16: mostrou 300, "sim" com `valor: 3000`, gravou 300).
- `explicitNo` cancela e não grava (`m57` bloco 15).
- Sucesso: `✅ Adiantamento de R$ X para <Nome> registrado.\nO pagamento previsto continua R$ Y: o adiantamento fica separado, e você desconta na hora de pagar se quiser.`

**5. Pendente.** `mao-de-obra-pending`, gesto `adiantamento`.

**6. Permissão.** `mao_de_obra` (OWNER e ADMIN). Perfil `fazenda`.

**7. Frases.**
- "Dei 500 reais adiantado para o João." e "Deseja registrar um adiantamento de R$ 500 para João?" (mão de obra.docx, §32 Adiantamento).

**8. Vizinhas.** `registrar_pagamento_trabalhador` (ver seção 6); `registrar_lancamento_financeiro` (despesa sem pessoa da equipe). Nome ambíguo PERGUNTA (`m57` bloco 17).

---

## 8. `registrar_diaria`

**1. Handler.** `src/lib/actions/whatsapp-handlers/servico.ts`, `registrarDiaria`. Grava por `createServiceJob`
(`src/lib/actions/service-jobs.ts`) com direção padrão (contratado), `pricing: "dia"`, `occurred_at: agora`, gerando conta a pagar. Gesto: `diaria`.

**2. Parâmetros.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `servico` | `description` | string | descrição livre (cerca, roçada) |
| `valor` | `amount` | número ou string | valor DE UMA diária, `lerNumeroBr`, > 0 |
| `quantidade` | `quantity` | número ou string | número de DIAS, `lerNumeroBr`, > 0 |
| `pessoas` | `worker_count` | número ou string | opcional, padrão **1** |
| `quem` | `contact_name` | string | opcional; `resolverPrestador` nos contatos, `includes` normalizado; nenhum achado cria o contato com o nome dito |

Total = dias x valor x pessoas; diárias = dias x pessoas. Não lê data, fazenda nem pasto. A fazenda é `fazendaPadrao`: a primeira ativa em ordem alfabética, **sem perguntar**.

**3. Obrigatórios e perguntas, na ordem.**
1. `Qual foi o serviço? (cerca, roçada, capina...)` (guarda `servico`)
2. `Quanto foi a diária?` (guarda `valor`)
3. `Quantos dias eles trabalharam?` (guarda `quantidade`)
- `pessoas` nunca é perguntado; a confirmação mostra o total, que é o que denuncia a suposição de 1 (`m58` bloco 16).
- Depois do "sim": sem fazenda: `Você ainda não tem fazenda cadastrada, então não sei onde registrar o serviço. Cadastre em Minha Fazenda, no painel.`;
  `quem` ambíguo: `Tenho mais de um contato com esse nome. Qual deles?\n- ...`. ⚠️ Essa pergunta sai DEPOIS da confirmação e não guarda nada novo: o pendente continua em `confirmacao`, e a resposta com o nome não é juntada.

**4. Confirmação.** Sempre. `Deseja registrar <N> diária(s), no total de R$ X, para serviço de <servico>?`,
`auxiliary_data: {servico, valor, dias, pessoas, total}`.
- `confirmed: true` sem pendente `diaria` em `confirmacao`: `Não tenho nenhum serviço esperando confirmação. Me conte de novo.`
- Sucesso: `✅ <N> diárias de <servico> registradas, R$ X no total.\nFicou como conta a pagar.`

**5. Pendente.** `servico-pending`, gesto `diaria`.

**6. Permissão.** Módulo `servicos` (OWNER, ADMIN, OPERADOR escrevem). Perfil `fazenda`.

**7. Frases.**
- "Vieram 3 homens trabalhar na cerca por 4 dias, 150 a diária." e "Deseja registrar 12 diárias, no total de R$ 1.800, para serviço de cerca?" (mão de obra.docx, §32 Diaristas; `m58` bloco 16 com `{servico: "cerca", valor: 150, quantidade: 4, pessoas: 3}`).
- Candidata sem handler próprio: "Contratei uma retroescavadeira por 2 dias a 1.500 a diária." e "Deseja registrar a contratação de uma retroescavadeira por 2 dias, no valor total de R$ 3.000?" (`docs/modulo-servico-com-maquinas/tibe-servicos-com-maquinas.docx`, §43). Pela forma (preço por diária x dias) cabe em `registrar_diaria` (`servico: "retroescavadeira"`, `valor: 1500`, `quantidade: 2`), mas a confirmação sairá com o texto de diárias, não o do §43.

**8. Vizinhas.**
- `registrar_servico_contratado`: valor FECHADO ("fez a cerca por 6 mil"). Diária tem preço por dia e número de dias.
- `registrar_servico_prestado`: EU fiz para alguém, com máquina, gera receita. Diária é alguém trabalhou para mim, gera despesa.
- `registrar_trabalhador` com frequência `dia`: cadastro de fixo diarista, sem dias trabalhados.
- `cadastrar_servico_ordem` (perfil prestador): a ajuda dele usa "fiz uma diária de trator pro cliente João", que tem a palavra "diária" (ver seção 16).

---

## 9. `registrar_servico_contratado`

**1. Handler.** `servico.ts`, `registrarServicoContratado`. `createServiceJob` com `pricing: "fechado"`, `agreed_amount`, `occurred_at: agora`, conta a pagar. Gesto: `empreito`.

**2. Parâmetros.** `servico|description` (string), `valor|amount` (`lerNumeroBr`, > 0, valor total fechado), `quem|contact_name` (string, `resolverPrestador`, cria contato se não achar). Não lê data, vencimento, parcelas nem pago.

**3. Obrigatórios e perguntas, na ordem.**
1. `Qual foi o serviço?` (guarda `servico`)
2. `Quanto ficou o serviço de <servico>?` (guarda `valor`)
3. `Quem fez o serviço de <servico>?` (guarda `quem`)
4. Contato ambíguo: `Tenho mais de um contato com esse nome. Qual deles?\n- ...` (**sem** guardar pendente; `m58` bloco 19).
- Fazenda: `fazendaPadrao` só depois do "sim", mesma recusa da seção 8.

**4. Confirmação.** Sempre. `Deseja registrar um serviço terceirizado de <servico> realizado por <Quem>, no valor de R$ X?`,
`auxiliary_data: {servico, valor, quem}`.
- "sim" com `valor: 60000` grava o mostrado (6.000) (`m58` bloco 18). `explicitNo` cancela (`m58` bloco 17).
- Sem pendente: `Não tenho nenhum serviço esperando confirmação. Me conte de novo.`
- Sucesso: `✅ Serviço de <servico> por <Quem> registrado, R$ X.\nFicou como conta a pagar. Me avise quando pagar.` (não há intenção para o "avise quando pagar").

**5. Pendente.** `servico-pending`, gesto `empreito`.

**6. Permissão.** `servicos`; perfil `fazenda`.

**7. Frases.**
- "O Pedro fez a cerca por 6 mil." e "Deseja registrar um serviço terceirizado de cerca realizado por Pedro, no valor de R$ 6.000?" (mão de obra.docx, §32 Serviço fechado; `m58` bloco 17 com `{servico: "cerca", valor: 6000, quem: "Pedro Pedreiro"}`).

**8. Vizinhas.** `registrar_diaria` (preço por dia); `registrar_servico_prestado` (sentido do dinheiro invertido, exige máquina); `registrar_lancamento_financeiro` ("paguei 6 mil pro Pedro" sem ser registro do serviço); "Vou pagar o Pedro dia 10" não tem intenção.

---

## 10. `registrar_servico_prestado`

**1. Handler.** `servico.ts`, `registrarServicoPrestado`. `createServiceJob` com `direction: "prestado"`, `machine_id`, conta a RECEBER. Gesto: `prestado`.

**2. Parâmetros.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `servico` | `description` | string | gradagem, roçada, colheita |
| `maquina` | `machine` | string | `resolverMaquina`: máquinas `active`/`maintenance`, `includes` normalizado; nunca cria |
| `unidade` | `pricing` | string | normalizada e procurada no mapa exato `UNIDADES`: `hora, horas, hectare, hectares, ha, dia, dias, diaria, diarias, viagem, viagens, tonelada, toneladas, metro, metros, quilometro, quilometros, km, cabeca, cabecas, fechado, empreito`. "por hectare", "o hectare", "hectare(s)" com texto extra **não** casam. |
| `valor` | `amount` | número ou string | preço por unidade, ou total se `fechado` |
| `quantidade` | `quantity` | número ou string | ignorada se `fechado` |
| `quem` | `contact_name` | string | cliente, `resolverPrestador`, cria contato se não achar |

Não lê `data`. `occurred_at` é sempre agora.

**3. Obrigatórios e perguntas, na ordem.**
1. `Qual serviço você fez? (gradagem, roçada, colheita...)` (guarda `servico`)
2. `Qual máquina você usou na <servico>?` (guarda `maquina`)
3. Máquina: nenhuma cadastrada: `Você ainda não tem máquina cadastrada, e o serviço prestado precisa de uma. Cadastre em Máquinas, no painel.`;
   ambígua: `Tenho mais de uma máquina com esse nome. Qual delas?\n- ...`; não achada: `Não achei essa máquina. Qual você usou?\n- <todas>`. Guarda `maquina`.
4. `Cobrou por hora, por hectare, por diária, ou foi valor fechado?` (guarda `unidade`)
5. `Quanto ficou o serviço de <servico>?` (fechado) ou `Quanto você cobrou por <hectare>?` (guarda `valor`)
6. Se não fechado: `Quantos <hectares|horas|dias...> foram?` (guarda `quantidade`)
7. `Para quem você fez a <servico>?` (guarda `quem`). ⚠️ Resposta "para o João" cancela (R1).
8. Cliente ambíguo: `Tenho mais de um contato com esse nome. Qual deles?` (guarda `quem`).

**4. Confirmação.** Sempre. `Deseja registrar <servico> para <Cliente> com o <Máquina>, total previsto de R$ X?`,
`auxiliary_data: {servico, pricing, valor, quantidade, quem, total}`.
- Sem pendente: `Não tenho nenhum serviço esperando confirmação. Me conte de novo.`
- Sucesso: `✅ <servico> para <Cliente> registrada, R$ X.\nFicou como conta a receber. Me avise quando receber.`
- ⚠️ **Achado de leitura:** como `occurred_at` é agora, `createServiceJob` grava `status: "concluido"`
  (`service-jobs.ts` linha 493: só nasce `agendado` com data futura). "Amanhã vou gradear..." vira serviço
  **já concluído**, e as quatro intenções das seções 11 a 14, que só procuram `agendado`/`em_andamento`,
  **não o encontram**. Além disso a quantidade prevista (20 ha) entra como primeiro lançamento, e
  "fiz 8 hectares" soma por cima (`m60` mostra 5 + 8 = 13). O `m60` cria o serviço direto pela action
  e força `em_andamento`, então não cobre essa emenda.

**5. Pendente.** `servico-pending`, gesto `prestado`. Turno a turno testado em `m59` ("Ensilagem", "John Deere", "hora", 250, 8, "João Vizinho").

**6. Permissão.** `servicos`; perfil `fazenda` (tenant só `prestador` recebe recusa de perfil).

**7. Frases.**
- "Amanhã vou gradear 20 hectares para o João a 180 reais o hectare." e "Deseja registrar um serviço de gradagem para João, em 20 hectares, a R$ 180 por hectare, total previsto de R$ 3.600?" (máquinas.docx, §42 Novo serviço; `m59` com `{servico: "Gradagem", unidade: "hectare", valor: 180, quantidade: 20, quem: "João Vizinho", maquina: "Massey §32"}`).

**8. Vizinhas.**
- `cadastrar_servico_ordem`: mesmo gesto no perfil **prestador** (catálogo de serviços e clientes do Módulo 2, sem máquina). No perfil fazenda é esta.
- `registrar_servico_contratado` / `registrar_diaria`: dinheiro sai, não entra.
- `iniciar_servico`: "comecei a gradagem do João" é sobre um serviço já registrado.
- `criar_tarefa`: "amanhã vou gradear" tem forma de lembrete; valor e cliente são o marcador de serviço.

---

## 11. `iniciar_servico`

**1. Handler.** `servico.ts`, `iniciarServico`. `setServiceJobStatus(..., "em_andamento")`. Gesto: `iniciar`.

**2. Parâmetros.** `quem|contact_name` (string, opcional): nome do CLIENTE. É o único lido. Não lê descrição do serviço, data nem máquina.

**3. Resolução (`resolverServicoEmAndamento`).** Procura serviços `prestado`, não cancelados, `agendado` ou `em_andamento`, mais recentes primeiro.
- Nenhum: `Não encontrei nenhum serviço em andamento para atualizar.`
- Com `quem`: um achado resolve; mais de um: `Tenho mais de um serviço em andamento para esse cliente. Qual deles?\n- <descrição> para <cliente>`; nenhum: `Não achei serviço em andamento para esse cliente. Qual destes é?\n- ...`
- Sem `quem`: um só resolve sozinho; mais de um: `Tenho mais de um serviço em andamento. Qual deles?\n- ...`
- Toda falha guarda `quem`. ⚠️ A lista mostra descrição e cliente, mas a resposta só casa por **nome do cliente** (`contact.name`); responder "a gradagem" não resolve.
- Note que um serviço já `em_andamento` também é aceito para "iniciar".

**4. Confirmação.** Sempre. `Vou marcar o serviço de <descrição de cliente> como iniciado. Confirma?`, `auxiliary_data: {service_job_id}`.
Sem pendente: `Não tenho nenhum serviço esperando confirmação. Me conte de novo.` Sucesso: `✅ Serviço de <descrição de cliente> iniciado.`

**5. Pendente.** `servico-pending`, gesto `iniciar`.

**6. Permissão.** `servicos`; perfil `fazenda`.

**7. Frases.**
- "Comecei a gradagem do João hoje." e "O TIBÉ deverá alterar a situação para: Em andamento." (máquinas.docx, §42 Início do serviço).
- "Comecei a roçada do Pedro hoje" (`scripts/m60-custeio-do-servico.test.ts`, com `{quem: "Pedro Lavrador"}`).

**8. Vizinhas.** `registrar_servico_prestado` (cria; esta só muda status); `registrar_producao_servico` ("comecei e fiz 8 hectares" traz quantidade); `encerrar_servico` (terminei).

---

## 12. `registrar_producao_servico`

**1. Handler.** `servico.ts`, `registrarProducaoServico`. `addServiceJobLog` (soma quantidade). Gesto: `producao` (do store de serviço, não o do leite).

**2. Parâmetros.** `quem|contact_name` (cliente, opcional), `quantidade|quantity` (`lerNumeroBr`, > 0). A unidade é a do serviço resolvido; não lê `unidade`, data, horímetro.

**3. Ordem.**
1. Resolver o serviço (mesmas mensagens da seção 11; guarda `quem`).
2. `Quanto foi feito no serviço de <descrição de cliente>?` (guarda `quantidade`).
- Depois do "sim", serviço fechado recusa: `⚠️ Este serviço foi combinado por valor fechado, então não tem quantidade para lançar.`

**4. Confirmação.** Sempre. `Deseja acrescentar <N> <hectares|horas|diárias|viagens|toneladas|metros|quilômetros|cabeças|unidades> ao serviço de <descrição de cliente>?`,
`auxiliary_data: {service_job_id, quantidade}`. Sucesso: `✅ Produção registrada. Total do serviço agora: <N> <unidade>, R$ X.`

**5. Pendente.** `servico-pending`, gesto `producao`.

**6. Permissão.** `servicos`; perfil `fazenda`.

**7. Frases.**
- "Fiz 8 hectares hoje." e "Deseja acrescentar 8 hectares ao serviço de gradagem do João?" (máquinas.docx, §42 Produção diária; `m60` bloco 1). Com dois serviços em andamento e sem nome, pergunta listando os dois (`m60` bloco 2).

**8. Vizinhas.**
- `registrar_producao_leite`: "tirei 480 litros" (leite). Aqui é área/hora/unidade de serviço.
- `registrar_combustivel_servico`: "gastei 60 litros" é consumo, não produção.
- `registrar_servico_prestado`: "fiz 8 hectares para o João a 180" com preço é serviço novo.
- `registrar_diaria`: "trabalharam 4 dias" é despesa de diarista.

---

## 13. `registrar_combustivel_servico`

**1. Handler.** `servico.ts`, `registrarCombustivelServico`. `recordServiceFuel` (`src/lib/actions/service-costs.ts`): custo `combustivel` no serviço e, se o produto existir no estoque, saída `utilizacao`. Gesto: `combustivel_servico`.

**2. Parâmetros.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `quem` | `contact_name` | string | cliente, opcional |
| `produto` | `product` | string | nome dito; `resolverProdutoOpcional` procura em TODOS os produtos não arquivados por `includes` |
| `quantidade` | `quantity` | número ou string | `lerNumeroBr`, > 0 |
| `valor` | `amount` | número ou string | opcional, valor TOTAL; `unit_price` não é lido pelo handler |

**3. Ordem.**
1. Resolver o serviço (seção 11; guarda `quem`).
2. `Qual combustível ou produto foi usado no serviço de <alvo>?` (guarda `produto`)
3. `Quanto de <produto> foi gasto?` (guarda `quantidade`)
4. Produto ambíguo no estoque: `Tenho mais de um produto parecido no estoque. Qual deles é?\n- ...` (guarda `produto`). Nenhum achado NÃO pergunta: registra o custo sem baixar estoque.
- ⚠️ Achado de leitura: se o produto existe e o saldo não cobre, `recordStockMovementInTx` recusa com `INSUFFICIENT_STOCK` e `recordServiceFuel` faz `throw` dentro da transação. Isso não vira `failReply`: a exceção sobe, e `limpar()` não roda. Não validado ao vivo.

**4. Confirmação.** Sempre. `Deseja registrar <N> <unidade do produto> de <produto> no serviço de <alvo>, R$ X?` (unidade e valor só quando existem),
`auxiliary_data: {service_job_id, produto, quantidade, valor}`. Sucesso: `✅ <N> de <produto> registrado no serviço de <alvo>. Baixei do estoque.` (a última frase só se baixou).

**5. Pendente.** `servico-pending`, gesto `combustivel_servico`. Turno a turno testado em `m60` bloco 3 (`quem`, depois `produto: "Diesel Comum"`, depois `quantidade: 60`, depois "sim": estoque 200 para 140).

**6. Permissão.** `servicos`; perfil `fazenda`.

**7. Frases.**
- "Gastei 60 litros de diesel hoje nesse serviço." e "Deseja registrar 60 litros de diesel no serviço de gradagem do João?" + "Caso exista estoque, deverá reduzir o saldo." (máquinas.docx, §42 Combustível).

**8. Vizinhas.**
- `registrar_uso_estoque`: "usei 60 litros de diesel" SEM serviço. O marcador é "nesse serviço" / "na gradagem do João". Com um único serviço em andamento, esta intenção resolve sozinha; se o classificador errar para cá, o diesel do trator da fazenda vira custo do serviço do cliente.
- `registrar_negocio_produto`: "comprei 200 litros de diesel" é compra.
- `registrar_lancamento_financeiro`: "gastei 500 reais de diesel" (dinheiro, sem quantidade).
- `registrar_producao_leite`: também "litros".

---

## 14. `encerrar_servico`

**1. Handler.** `servico.ts`, `encerrarServico`. `setServiceJobStatus(..., "concluido")`. Não mexe em dinheiro. Gesto: `encerrar`.

**2. Parâmetros.** `quem|contact_name` (cliente, opcional). Só isso.

**3. Resolução.** Igual à seção 11 (guarda `quem`).

**4. Confirmação.** Sempre. `Vou marcar o serviço de <alvo> como concluído. Confirma?`.
Sucesso: `✅ Serviço de <alvo> concluído. Total: <N> <unidade>, R$ X. <faltam R$ Y a receber | já está tudo recebido>.`
O §42 pede também perguntar "O João já pagou?"; o handler **não pergunta** e não há intenção de recebimento.

**5. Pendente.** `servico-pending`, gesto `encerrar`.

**6. Permissão.** `servicos`; perfil `fazenda`.

**7. Frases.**
- "Terminei o serviço do João." e "O TIBÉ deverá apresentar: Quantidade total trabalhada; Valor total; Situação do pagamento. E perguntar: O João já pagou?" (máquinas.docx, §42 Finalização; `m60` bloco 5 com `{quem: "João Vizinho"}`).

**8. Vizinhas.** `iniciar_servico` (comecei); `registrar_producao_servico` ("terminei hoje, fiz os últimos 4 hectares" traz quantidade: são duas ações); `encerrar_confinamento` / `encerrar_remessa_evento` (outros "encerrar", sem cliente de serviço); "João me pagou 2 mil" não tem intenção.

---

## 15. `cadastrar_servico_ordem` (já emitida pelo classificador)

**1. Handler.** `src/lib/actions/whatsapp-handlers/prestador.ts`, `cadastrarServicoOrdem`. Grava por `createServiceOrderAction` (`src/lib/actions/service-orders.ts`). Módulo 2 (prestador), modelos `ServiceClient`/`Service`/`ServiceOrder`, **não** `ServiceJob`.

**2. Parâmetros.**

| nome | aliases | tipo | interpretação |
|---|---|---|---|
| `client_name` | nenhum | string | `findClientsByName`: contém, sem acento, case-insensitive (Fase 5, correção A1: era `contains`/`ILIKE`, que não dobra acento) |
| `service_name` | nenhum | string | `findServiceByName`: igual insensitive, senão primeiro `contains` |
| `quantity` | nenhum | número ou string | `num()` cru, padrão 1. `"1.500"` vira 1,5; `"2 horas"` vira 1 (padrão). Serviço `pricing_type: "fixed"` força 1. |

Sem aliases em português. Não lê data (usa agora), valor nem máquina.

**3. Obrigatórios e perguntas.**
- Falta cliente ou serviço: `Para registrar a ordem, preciso do nome do cliente e do serviço prestado.`
- Cliente não achado: `Não encontrei nenhum cliente chamado '<nome>'. Cadastre o cliente primeiro.`
- Mais de um: `Encontrei mais de um cliente com esse nome: A, B. Qual deles?` com `auxiliary_data.clients`.
- Serviço não achado no catálogo: `Não encontrei o serviço '<nome>' no catálogo.`
- Ambiguidade de serviço NÃO pergunta: pega o primeiro `contains`.

**4. Confirmação.** **Só acima de R$ 5.000** (`CONFIRMATION_THRESHOLD`), via `confirmFlow` sem estado:
`Confirma a ordem de serviço "<Serviço>" para <Cliente> no valor de R$ X? Responda "sim" para confirmar.`, `auxiliary_data: {client_id, service_id, quantity}`.
- `explicitNo` (só checado acima do limiar): `Ação cancelada.`, `cadastrar_servico_ordem:cancelado`.
- `confirmed: true`: grava com os parâmetros **da mensagem do "sim"**. Não há pedido guardado; o classificador tem que remontar `client_name`, `service_name` e `quantity` do histórico, e o que ele remontar é o que grava.
- Até R$ 5.000: grava direto, sem perguntar.
- Sucesso: `Ordem de serviço registrada para <Cliente>: <Serviço>, total R$ X.`, `action_taken: cadastrar_servico_ordem:<id>`.

**5. Pendente.** Nenhum.

**6. Permissão.** Módulo `prestador` escrita (OWNER, ADMIN, OPERADOR). Perfil `prestador`.

**7. Frases.**
- "fiz uma diária de trator pro cliente João" (texto de ajuda, `src/lib/actions/whatsapp-handlers/ajuda.ts` linha 28).
- Contrato: `client_name, service_name, quantity` (`docs/specs/module-03-agente-whatsapp.md` §3.4; `docs/n8n-whatsapp-workflow.md` §4).
- Nenhuma suíte em `scripts/` exercita este handler (só o texto de ajuda, em `m12`).

**8. Vizinhas.**
- `registrar_servico_prestado` (perfil fazenda, com máquina e contato criado na hora). O que decide na prática é o perfil ativo do tenant: com só `fazenda`, esta recusa por perfil; com só `prestador`, a outra recusa.
- `registrar_diaria`: o exemplo de ajuda contém "diária", mas aqui é EU presto para cliente, gera receita.
- `consultar_cliente`: "quanto o João me deve" é leitura.

---

## 16. `consultar_cliente` (já emitida pelo classificador)

**1. Handler.** `prestador.ts`, `consultarCliente`. Lê por `getClientSummaryAction` (`src/lib/actions/service-clients.ts`).

**2. Parâmetros.** `client_name` (string, contém, sem acento, insensitive). Sem aliases.

**3. Obrigatórios e perguntas.**
- `Qual o nome do cliente que você quer consultar?`
- `Não encontrei nenhum cliente chamado '<nome>'.`
- `Encontrei mais de um cliente: A, B. Qual deles?` com `auxiliary_data.clients`.

**4. Confirmação.** Não. Resposta: `<Cliente>: faturado R$ X, pendente R$ Y (<N> ordens registradas).`
"pendente" = soma das ordens `completed` (não faturadas); "faturado" = ordens `invoiced`. `auxiliary_data` traz o resumo inteiro. `action_taken: consultar_cliente`.
Não olha `FinancialEntry` nem `ServiceJob`: dívida de serviço prestado do perfil fazenda **não aparece aqui**.

**5. Pendente.** Nenhum. Está em `INTERRUPTING`: responde mesmo com cadastro de animal aberto.

**6. Permissão.** Módulo `prestador` leitura (inclui VISUALIZADOR). Perfil `prestador`.

**7. Frases.**
- "quanto o João me deve" (`ajuda.ts` linha 40).
- "quanto o cliente João me deve" e "retorna valor pendente correto" (`docs/n8n-whatsapp-workflow.md` §6, checklist manual).
- Nenhuma suíte exercita este handler.

**8. Vizinhas.**
- `resumo` com `scope: contas_a_receber` (receitas pendentes de qualquer origem) ou `ordens_a_faturar` (ordens concluídas não faturadas, de todos os clientes). Com NOME de cliente, é esta.
- `consultar_saldo`: saldo financeiro do mês, sem cliente.
- No perfil fazenda, "quanto o João me deve" de um serviço prestado não tem intenção que responda por cliente.

---

## Resumo das lacunas para o plano do n8n

1. Todas as 14 novas exigem que o "sim" e as respostas curtas voltem com a MESMA intenção, e as de lactação exigem até o mesmo TIPO (gesto compartilhado).
2. `message_text` precisa ir sempre: é a única fonte de `explicitNo`.
3. Números em `parameters` devem ser puros ("480", 480, "60 mil"), nunca com unidade.
4. Risco R1 ("para o João" cancela) atinge diretamente duas perguntas deste escopo.
5. `registrar_servico_prestado` grava como concluído, então o fluxo §42 (novo, começar, produção, combustível, terminar) não se encadeia pelo WhatsApp.
6. Frases do cliente sem intenção: tanque, ponto de coleta, leite de terceiro, venda de leite (§36 Leite); pagamento futuro de serviço (§32 Mão de obra); recebimento e "O João já pagou?" (§42 Máquinas).
