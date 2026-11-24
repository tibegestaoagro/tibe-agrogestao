---
tipo: armadilha
data: 2026-11-23
tags: [emporio, fiado, acordo, ficha-do-cliente, financeiro]
origem: ae721f52
---

# O fiado que vira acordo perde a venda de vista, e quem procura dívida pela venda acha que ela foi paga

## O que aconteceu

Em 23/11/2026, na Q386, a ficha do cliente passou a dizer "O recebido inclui
R$ X de crédito do franqueado" só para vendas sem nada em aberto. A primeira
versão olhava o que estava em aberto ligado à venda: fiado com saldo, cheque em
carteira, boleto aberto e recebimento agendado. A suíte passou.

O agente que fez a mudança achou o buraco lendo o modelo: quando o fiado vira
acordo de parcelas, a conta original da venda fica cancelada com
`agreement_id`, e as parcelas novas nascem com a venda vazia (`sale_id` nulo).
A dívida continua existindo, mas não aponta mais para a venda. Pela regra da
primeira versão, a venda parecia quitada, e o crédito entrava na frase antes de
o cliente pagar as parcelas.

A correção segue o caminho `agreement_id`: vendas com crédito, depois as contas
de origem delas com `agreement_id`, depois as parcelas abertas desse acordo
(`entradasAbertas`), numa consulta em lote.

## Por que importa

Qualquer pergunta "esta venda ainda deve alguma coisa?" respondida só pelo que
aponta para a venda erra no acordo, e erra para o lado do "já pagou". O número
sai plausível e ninguém estranha. Quem conferir com um fiado simples vê o
caso certo, e o acordo é exatamente o cliente que mais deve.

Ficou um resto: o recebimento AGENDADO de uma parcela de acordo ainda não
marca a venda (o item agendado do fiado não traz nem a venda nem o acordo).
Está na dívida 5.32 do `docs/agents/dividas.md`.

## Como aplicar

- Ao decidir se uma venda está quitada, siga também o acordo: conta da venda
  com `agreement_id`, e parcelas abertas desse acordo.
- Ao testar regra de "em aberto" por venda, inclua um caso com acordo criado
  pela action, com uma parcela paga e outra aberta.
- Reuse a noção de "em aberto" que a ficha já usa (`leituraFinanceiraDoCliente`
  em `src/lib/actions/emporio-clientes.ts`). Uma segunda regra parecida diverge
  da primeira.

## Relacionado

- [[o-teste-que-monta-o-dado-no-banco-aprova-o-que-a-action-nunca-grava]]
- [[a-lista-que-ganha-linha-que-nao-e-pendencia-contamina-a-soma-da-tela]]
- [[somar-em-vez-de-gravar-tem-um-preco-no-dia-um]]
