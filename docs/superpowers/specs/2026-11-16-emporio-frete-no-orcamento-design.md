# Empório: frete no orçamento (Q326)

Pedido do usuário em 16/11/2026. O frete entrou na venda em 09/11 (Q244 a
Q249); o orçamento ficou sem ele, então o cliente recebia o orçado sem o frete
e o vendedor precisava digitá-lo ao faturar.

## Decisão

| # | decisão | por quê |
|---|---|---|
| Q326 | **O orçamento leva o frete, do mesmo jeito que o crédito do franqueado (Q309):** campo "Frete cobrado do cliente (opcional)" no balcão em modo orçamento (sem a "Origem da venda"); `EmporioQuote.freight_amount`, fora do `net_amount`, somado ao `total_amount`; o impresso (A4 e cupom) mostra a linha Frete e o total com ele (o frete é cobrado do cliente, ele precisa ver); "a partir deste" copia o frete se o corpo não traz; no PATCH, ausente mantém; ao faturar sem `freight_amount` no corpo, a venda nasce com o frete do orçamento (e a conta a pagar "Frete de entrega", Q246). O balcão manda o frete sempre explícito, zero inclusive | decisão do usuário: "inclui o frete no orçamento desse jeito" |

Migração aditiva `20261116150000_emporio_frete_no_orcamento` (uma coluna com
default 0). Valem as recusas do frete da venda (negativo: 422 `freight_amount`).

## Fora

Calcular o frete; frete por item.
