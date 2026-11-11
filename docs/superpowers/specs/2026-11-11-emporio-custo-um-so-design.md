# Empório: um custo só, que zera com o estoque (Q298 e Q299)

Reunião com a Agromax em 11/11/2026 (gravação fora do repositório, que é
público). Substitui as decisões Q293, Q294 e Q295 da
[spec de 10/11](2026-11-10-emporio-dois-custos-design.md).

## O que o cliente pediu

- A média ponderada com estoque está certa: "toda vez que chegar um produto novo
  e tiver estoque, ele faz a média ponderada. Isso está certo."
- "O que não está certo é não zerar quando o estoque zera." Zerou o estoque,
  zera o histórico: a próxima compra (ou implantação) é o custo do produto.
- Sem opção de ligar e desligar: "o sistema ter essa opção não faz sentido,
  então não pode ter."
- Um número só: uma média do ano pode ser um relatório à parte, mas "não pode
  deixar duas, para não levar a erro".

## O que os dados mostraram (produção, só leitura, 11/11/2026)

A regra pedida já existia no cálculo (Q64): com saldo zero na entrada, a média
recomeça pelo custo da entrada. O defeito era a **ordem** dos lançamentos:

- a contagem grava a hora exata;
- a compra gravava só o dia, carimbado ao meio-dia (a tela manda
  `AAAA-MM-DDT12:00`).

A Agromax contou primeiro e lançou a compra depois, e o histórico ficou com a
compra ANTES da contagem. Casos em 10/11, na loja AGROMAX:

| produto | contagem (físico 0) | compra lançada | carimbo da compra |
|---|---|---|---|
| TALCO/ GEL | 14:13 | 14:16, 100 kg a 2,35 | 12:00 |
| TALCO/ GEL | 14:13 | 19:01, 100 kg a 27,99 | 12:00 |
| ARUANA-PONTOS | 19:05 | 19:06, 100 a 10,00 | 12:00 |

Resultado: o TALCO ficou com 1,31 (mistura com 3.883 kg que não existiam) em vez
de 2,35. Antes do meio-dia a ordem saía certa, e por isso a simulação parecia
funcionar. A compra é a única entrada que grava data em vez de hora: a
implantação, a produção, a transferência e a devolução gravam a hora.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q298 | **Compra com a data de hoje (em Brasília) entra no estoque na hora do lançamento**, e não ao meio-dia. Vale para a compra recebida na criação e para o recebimento posterior. Compra com data de outro dia fica como veio. A data da compra em si (`purchased_at`) e o financeiro não mudam | "contei e depois lancei a compra" tem de ficar nessa ordem no histórico; com data passada, a mercadoria chegou antes e a contagem de hoje já a inclui |
| Q299 | **Um custo só por produto e loja**: o médio enquanto há estoque; sem estoque, a última compra; sem compra, o custo de referência (Q297, Q52). O preço sugerido usa esse custo. Saem a base por loja (`Establishment.price_cost_basis`, Q294), a última compra ao lado do médio (Q293) e o aviso de 10% (Q295) | o pedido do cliente: um número, sem opção |

Seguem valendo: Q296 (saldo antes da compra, com o aviso de contar antes) e
Q297 (sem estoque, o custo é a última compra).

## Contrato

- Saem `last_purchase_cost`, `last_purchase_on`, `price_cost_basis` e
  `cost_gap_pct` das leituras do produto e do estoque; `price_cost_basis` sai da
  loja (o PATCH ignora o campo, como qualquer campo desconhecido).
- Ficam `average_cost` (nulo sem estoque), `suggested_cost` (o custo único) e
  `suggested_cost_source` (`medio`, `ultima_compra` ou `referencia`).
- Migração `20261111150000_emporio_custo_um_so`: derruba a coluna e o enum.

## Correção do histórico em produção

Autorizada pelo usuário em 11/11/2026: as entradas `compra` da conta lançadas no
mesmo dia da data escolhida passam a ter `occurred_at` igual à hora do
lançamento (`created_at`), como a Q298 teria gravado. Nada é apagado.

Suíte: `test:m112`. Roteiro: `emporio-custo`.
