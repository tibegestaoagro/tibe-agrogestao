# Teste no aparelho: Estoque e produtos (Módulo 31, missão 2)

Roteiro para o Dilton rodar do celular. Mesmo formato do
[roteiro de Negociações](roteiro-aparelho-negociacoes.md), que achou 2 bugs de
código que nenhuma suíte pegou.

Mande uma mensagem por vez e espere a resposta (leva uns 20 a 30 segundos, por
causa do buffer de 12s mais as chamadas de LLM). Para abandonar um bloco no
meio, mande "cancela".

---

## Antes de começar: tudo pronto desde 2026-08-18

Os quatro passos que este roteiro exigia foram feitos, nesta ordem e com sua
autorização: merge na `main`, migração `20260814190000_estoque_de_produtos`
aplicada no Neon **antes** do push, deploy, e as 4 intenções ensinadas ao
classificador do n8n (`registrar_uso_estoque`, `ajustar_estoque`,
`consultar_estoque`, `registrar_negocio_produto`).

A ordem importava e vale registrar para a próxima vez: **ensinar o
classificador antes do deploy quebraria produção**, porque a `main` ainda não
teria os handlers, e o n8n classificaria a intenção para chamar uma rota
inexistente.

Se algum dia o agente responder "não entendi" a uma frase de estoque, o
suspeito número um é o prompt do classificador ter sido sobrescrito. Há backup
do workflow na pasta `n8n-backup` dentro de `D:\tmp`.

---

## Bloco 0: preparar o catálogo, no painel (não pelo WhatsApp)

O WhatsApp **não cadastra produto**, de propósito: nome, unidade e mínimo são
decisão de catálogo, não de conversa no curral. Se você mandar "usei 2 sacas de
X" sem cadastrar, a resposta certa é ele mandar você cadastrar no painel.

Abra `/estoque` no painel e cadastre **três** produtos. Os três existem para
testar coisas diferentes, então vale seguir à risca:

| Nome | Unidade | Mínimo | Serve para |
|---|---|---|---|
| `Sal mineral 60 P` | Saca | 5 | o gesto do dia a dia e o aviso de reposição |
| `Sal mineral proteinado` | Saca | (vazio) | o par que confunde: dois "sal mineral" |
| `Vermífugo` | Frasco | (vazio) | frasco não parte ao meio: a trava de fração |

Depois, ainda no painel, use o botão de movimentação para dar saldo inicial aos
dois primeiros, informando o total contado: **20 sacas** de `Sal mineral 60 P` e
**10 sacas** de `Sal mineral proteinado`. Deixe o `Vermífugo` zerado.

Isso já testa o caminho da tela. O resto é tudo pelo celular.

---

## Bloco 1: os dois roteiros que mais importam

Dependem de como o n8n remonta os parâmetros, então só se provam com o
classificador de verdade.

**Os dois já foram exercitados contra produção em 2026-08-18**, pelo banco de
provas (`npm run wa`), e passaram. O 1a chegou a FALHAR nesse teste, gravando
uma compra recusada de R$ 1.200, e foi corrigido antes de chegar aqui. Refazer
no aparelho continua valendo: o banco de provas não cobre entrega no celular,
áudio nem foto.

### 1a. Recusar e depois agradecer NÃO pode gravar

| # | Mande | Deve responder |
|---|---|---|
| 1.1 | `Comprei 10 sacas de sal mineral 60 P do Zé por 1200, para pagar dia 10` | Um `Confirma?` com: Compra de 10 sacas de Sal mineral 60 P por R$ 1.200,00, a fazenda, `Com: Zé`, a data e `A pagar em 10/...` |
| 1.2 | `não, deixa pra lá` | `Ok, não registrei nada.` |
| 1.3 | `ok obrigado` | **Não pode registrar nada.** Resposta de conversa, ou "não tenho nada esperando confirmação" |
| 1.4 | `Quanto tenho de sal mineral 60 P?` | `📦 Sal mineral 60 P: 20 sacas.` As mesmas 20 do bloco 0 |

**Por que este é o teste número um:** até a quinta rodada, o "ok" do 1.3
gravava a compra recusada, com conta a pagar de R$ 1.200. A suíte passava
verde, porque simulava um classificador que não remonta os parâmetros. O que o
1.4 mede é justamente isso: se sobrou saldo a mais, gravou escondido.

### 1b. Corrigir contrastando CANCELA, e isso é deliberado

| # | Mande | Deve responder |
|---|---|---|
| 1.5 | `Contei e tem 8 sacas de sal mineral proteinado` | `Confirma? Sal mineral proteinado em ... passa de 10 sacas para 8 sacas.` |
| 1.6 | `não é o proteinado, é o 60 P` | **`Ok, não registrei nada.`** Não é defeito: leia a nota abaixo |
| 1.7 | `Contei e tem 8 sacas de sal mineral 60 P` | `Confirma? Sal mineral 60 P ... passa de 20 sacas para 8 sacas.` |
| 1.8 | `isso` | `✅ Corrigido: Sal mineral 60 P agora está com 8 sacas ... Tirei 12 sacas.` |

**Por que o 1.6 cancela, se essa é a correção mais natural do português.** Até
2026-08-18 ele corrigia, e essa regra foi removida porque **gravava**. Ela
distinguia recusa de correção comparando o pedido guardado com o que o
classificador mandava de volta. A premissa era que uma recusa devolve o pedido
igual. Medido contra o classificador de verdade, ela é falsa: ele remonta os
parâmetros a partir da confirmação que o próprio assistente imprimiu, então
`"dia 10"` volta como `"10/08/2026"` e a fazenda volta preenchida, sem o
produtor ter dito nada. Com isso toda recusa parecia correção, e um "ok
obrigado" depois de um "não" gravou uma compra de R$ 1.200 em produção.

A troca aceita: o produtor repete a frase, como no 1.7. É a mesma regra do
negócio de gado, que está no ar desde 14/08 e nunca teve esse defeito.

---

## Bloco 2: o gesto do dia a dia

O uso é o único gesto que **não** pede confirmação: é o mais frequente, não
mexe em dinheiro, e um erro se desfaz contando de novo.

| # | Mande | Deve responder |
|---|---|---|
| 2.1 | `usei 2 sacas de sal mineral 60 P no lote do curral` | `✅ Anotei: 2 sacas de Sal mineral 60 P usadas em ... Restam 6 sacas.` Sem pedir "sim" |
| 2.2 | `o que está acabando?` | `📦 Precisa repor:` com o Sal mineral 60 P, porque 6 é acima do mínimo 5... **ou** a lista de saldos. Veja a nota abaixo |
| 2.3 | `usei mais 2 sacas de sal mineral 60 P` | `Restam 4 sacas.` |
| 2.4 | `o que está acabando?` | `📦 Precisa repor:` **agora sim** com Sal mineral 60 P, 4 sacas (abaixo do mínimo 5) |

**Nota sobre o 2.2:** com 6 sacas o produto está acima do mínimo, então a
resposta certa ali é a lista do que tem no estoque, não o aviso de reposição.
O par 2.2/2.4 existe para provar que o aviso liga quando cruza o mínimo, e não
antes. O `Vermífugo` **não** deve aparecer em nenhuma das duas: produto
cadastrado que nunca se moveu fica de fora, senão quem cadastra 20 itens numa
tarde recebe 20 avisos de "0 em estoque".

---

## Bloco 3: as travas, uma a uma

Cada linha aqui é uma regra que, sem trava de código, dependeria de o LLM
acertar. É onde a conversa costuma quebrar.

| # | Mande | Deve responder |
|---|---|---|
| 3.1 | `usei 2 sacas de sal` | Deve **perguntar qual**, listando os dois: `Tenho mais de um parecido com "sal". Qual deles?` Nunca escolher sozinho |
| 3.2 | `o 60 P` | Registra as 2 sacas do Sal mineral 60 P e diz quanto restou |
| 3.3 | `usei meio frasco de vermífugo` | `Vermífugo só entra em frascos inteiros, sem quantidade quebrada. Quantos exatamente?` |
| 3.4 | `cancela` | Encerra sem registrar |
| 3.5 | `vendi 500 sacas de sal mineral 60 P por 60 mil` | `Existem apenas N sacas de Sal mineral 60 P em ... Revise a quantidade informada.` **A recusa vem ANTES de pedir "sim"** |
| 3.6 | `faltaram 2 sacas de sal mineral proteinado` | Uma pergunta pelo TOTAL: `Quantas sacas de Sal mineral proteinado você contou?`, ou a versão longa `Para corrigir eu preciso do total, não da diferença...`. As duas servem; o que **não** pode é virar saldo 2 |
| 3.7 | `8` | `Confirma? Sal mineral proteinado ... passa de 10 sacas para 8 sacas.` |
| 3.8 | `cancela` | Encerra sem registrar |

**As quatro travas acima já foram verificadas contra produção em 2026-08-18**,
pelo banco de provas, e passaram. A 3.3 chegou a sair com a concordância errada
("frascos inteiras"), corrigida antes de chegar aqui.

**O 3.5 é o que mais importa deste bloco.** Perguntar "confirma a venda de 500
sacas?" quando existem 4 já é aceitar a premissa errada: o produtor diz sim e
só então ouve a recusa. O saldo é conferido antes.

**O 3.6 vale o mesmo:** "faltaram 2 sacas" é como se fala, e lido como saldo
final tiraria 8 de um estoque de 10. A confirmação mostrando "de 10 para 8" é o
par em código dessa regra, que no n8n vive só no prompt.

---

## Bloco 4: o negócio completo, com parcela

| # | Mande | Deve responder |
|---|---|---|
| 4.1 | `Comprei 20 sacas de sal mineral 60 P do Zé por 3.000 em 3 vezes` | `Confirma?` com R$ 3.000,00, `Com: Zé` e `Em 3x de R$ 1.000,00, a primeira em ...` |
| 4.2 | `sim` | `✅ Registrado: compra de 20 sacas de Sal mineral 60 P por R$ 3.000,00. Estoque agora: ...` |

**Conferir no painel depois:** em Financeiro devem existir **três** contas a
pagar de R$ 1.000, não uma de R$ 3.000. Esse é o defeito que um revisor
reproduziu inteiro: o parcelamento chegava como número do classificador e a
cópia deste handler só sabia ler texto, então virava uma conta única, calada, e
o alerta de vencimento disparava no mesmo dia.

Confira também o valor: `3.000` tem que virar três mil, não três.

---

## Bloco 5: os dois domínios ao mesmo tempo

Este é o único bloco que mistura gado e estoque de propósito. Ele existe porque
duas versões anteriores erraram nas pontas opostas: uma apagava o negócio de
gado junto, outra deixava o "sim" seguinte executar sem nada na tela.

| # | Mande | Deve responder |
|---|---|---|
| 5.1 | `Comprei 5 bezerros do João por 20 mil` | A confirmação do negócio de **gado** |
| 5.2 | `comprei 10 sacas de sal mineral 60 P por 1200` | A confirmação do negócio de **produto** |
| 5.3 | `não, deixa pra lá` | `Ok, não registrei nada.` **e mais**: `Você ainda tem um negócio de gado esperando confirmação: responda sim para registrar, ou não para cancelar também.` |
| 5.4 | `não` | Deve cancelar o de gado também |
| 5.5 | `Quantos animais eu tenho?` | O saldo de antes do 5.1, sem os 5 bezerros |
| 5.6 | `Quanto tenho de sal mineral 60 P?` | O saldo de antes do 5.2 |

**O que se mede no 5.3:** a frase sobre o gado tem que aparecer. Sem ela, o
"sim" seguinte gravaria um negócio de R$ 20.000 que o produtor não estava
olhando. E o negócio de gado **não pode** ser destruído junto: cancelar estoque
não é cancelar gado.

---

## O que conferir no painel, no fim

1. **`/estoque`**: os três produtos, com os saldos que a conversa deixou, e o
   histórico mostrando cada movimento com o autor.
2. **`/financeiro`**: as três parcelas de R$ 1.000 do bloco 4. **Nenhuma** conta
   de R$ 1.200 (bloco 1) e **nenhuma** de R$ 20.000 (bloco 5): se aparecerem, um
   cancelamento gravou.
3. **`/negociacoes`**: a compra de produto do bloco 4, e nada dos blocos 1 e 5.
4. **Alerta de reposição**: é o cron diário, não sai na hora. Confira no dia
   seguinte, ou dispare o job de alertas manualmente.

---

## Se algo falhar

Anote a **mensagem exata que você mandou** e a **resposta exata**, na ordem. No
Módulo 30 os dois bugs achados no aparelho dependiam de COMO o classificador
nomeia as coisas, e um resumo do que aconteceu perde justamente essa parte.

Se o agente ficar mudo (sem responder nada), a causa mais provável não é o
código: é `INTERNAL_API_SECRET` divergindo entre o n8n e a Vercel, que fica
silencioso, sem erro visível.
