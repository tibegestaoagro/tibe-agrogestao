# Empório: as decisões pendentes de 23/11 (Q374 a Q384)

Origem: conversa de 23/11/2026 com o usuário sobre as demandas em aberto
(dívida 5.31, pendências do Empório de 05/11, decisões do franqueado de 13/11 e
as pontas da Q187). As decisões foram tomadas pelo usuário, uma por uma, com o
comportamento de hoje conferido no código e, quando havia dado em jogo, em
produção (só leitura).

## O que o Tibé faz hoje (conferido em 23/11)

- **Ficha do cliente** (`src/lib/actions/emporio-clientes.ts`, leitura
  `leituraFinanceiraDoCliente`): o fiado recebido com data futura já sai do "Em
  aberto" na gravação, porque a conta do fiado fica quitada; o "Recebido" só
  tira o que está `scheduled`. O cheque compensado com data futura e o boleto
  pago com data futura também não estão em nenhum dos dois.
- **Parcela conferida pela antecipação:** a tela mostra "Desfazer a
  conferência", e `desfazerConferenciaAction` sempre recusa
  (`CONFERIDA_PELA_ANTECIPACAO`). A view da parcela só expõe `anticipated`.
- **Franqueado e o Caixa:** o servidor já aceita o crédito lançado pelo Caixa
  (`vendedor_da_loja`); a tela esconde o campo, porque
  `listarFranqueadosAction` exige `fora_do_caixa` e a lista volta vazia.
- **Franqueado na devolução:** nenhuma devolução mexe no crédito. O saldo do
  franqueado soma `franchisee_credit` das vendas não canceladas. O cliente
  recebe de volta só o valor do item, embora o papel dele mostre o item com a
  parte do crédito somada (Q308).
- **Taxa do cartão:** incide sobre o total pago, crédito incluído; o franqueado
  recebe o crédito cheio.
- **Orçamento faturado:** o servidor não confere o cliente da venda contra o do
  orçamento; a validade do preço orçado é medida pelo `sold_at` enviado; a mesma
  apresentação em duas linhas vale a linha mais barata.
- **Em produção (23/11):** 315 orçamentos, nenhum com apresentação repetida; 5
  franqueados, nenhuma venda com crédito.

## Decisões do usuário (23/11/2026)

| # | decisão | por quê |
|---|---|---|
| Q374 | As escolhas D1 a D7 da dívida 5.31 ficam como estão em produção | confirmadas pelo usuário |
| Q375 | Recebimento com data futura (fiado, cheque compensado, boleto pago) **continua no "Em aberto"** da ficha do cliente até o dia chegar; a linha segue marcada "Agendado" | a soma dos cartões fecha; o dinheiro ainda não caiu |
| Q376 | Cancelar venda com parcela de cartão já conferida **continua como está**: a conferência fica como história e o estorno compensa no saldo | confirmado pelo usuário |
| Q377 | Na parcela conferida pela antecipação, **o botão some**; no lugar, "Conferida pela antecipação: para desfazer, desfaça a antecipação" | o botão sempre falhava |
| Q378 | **O Caixa pode escolher o franqueado e digitar o crédito**, como o vendedor | decisão do usuário |
| Q379 | **Devolução tira o crédito do franqueado na proporção do que voltou** (total tira tudo), e **o cliente recebe o valor do papel**: o item mais a parte do crédito rateada nele (60 + 6 = 66) | a loja não fica com dinheiro de ninguém |
| Q380 | A taxa do cartão sobre a parte do crédito **é da loja**; o franqueado recebe o crédito cheio | já é assim; confirmado |
| Q381 | O reforço de troco da gerência **continua sem confirmação**; a contagem na abertura é a confirmação | confirmado pelo usuário |
| Q382 | Venda nascida de orçamento **fica com o cliente do orçamento**; outro cliente é recusado (422, `customer_id`) | Q187 (b) |
| Q383 | O preço orçado vale se o orçamento estiver **válido hoje**, qualquer que seja o `sold_at` enviado | Q187 (a) |
| Q384 | O orçamento **recusa a mesma apresentação em duas linhas** (422), ao salvar e ao editar | Q187 (d); nenhum orçamento de produção é afetado |

As pontas (c) e (e) da Q187 ficam como estão: orçamento sem vendedor usa a
regra normal, e a troca anula o `quote_id` da venda nova.
