# Empório: total do orçamento na tela e orçamento só com nome e telefone (Q335, Q336)

Pedido do usuário em 16/11/2026: "o frete no orçamento, ao gerar o orçamento
tenho que conseguir ver a soma do valor, só estava aparecendo quando gerava a
impressão"; "a obrigatoriedade do CPF ao gerar o orçamento, precisamos deixar
somente nome e telefone como obrigatório, CPF e outros dados somente ao
finalizar a venda".

## Causas

- A linha "Itens + frete = Total com frete" (e a do crédito do franqueado) mora
  dentro do bloco de pagamento do balcão (`venda-campos.tsx`, `!semPagamento`).
  O orçamento não tem pagamento: a soma só aparecia no impresso.
- O orçamento confere o cadastro do cliente com `faltaNoCadastro` (PJ: CNPJ e
  endereço principal) e, quando é para entrega, com `faltaParaEntrega`
  (`src/lib/emporio/cliente-cadastro.ts`), que exige o CPF da pessoa física.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q335 | **No modo orçamento, o balcão mostra o resumo do total** perto do total: itens, desconto no total, frete, crédito do franqueado (quando houver) e o total do orçamento, com a mesma conta do impresso. A barra de baixo mostra o total do orçamento já com frete e crédito | decisão do usuário |
| Q336 | **Salvar e editar orçamento exige do cliente só nome e telefone** (pessoa física ou jurídica; o Consumidor final segue servindo). CPF, CNPJ e endereço principal deixam de ser exigidos no orçamento, inclusive no orçamento para entrega. O endereço de ENTREGA do orçamento marcado para entrega continua sendo pedido (é o destino do pedido, não o cadastro do cliente). Ao faturar e em toda venda, valem as regras de hoje (`faltaNoCadastro` e, na entrega, `faltaParaEntrega` com o CPF): o que faltar aparece ao finalizar a venda, com a mesma recusa de hoje | decisão do usuário; a manutenção do endereço de entrega no orçamento é escolha do agente, para confirmar |

## Fora

Autocompletar endereço pelo CEP (plano à parte).
