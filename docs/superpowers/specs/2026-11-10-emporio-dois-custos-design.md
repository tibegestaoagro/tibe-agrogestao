# Empório: custo médio, última compra e base do preço sugerido (Q293 a Q297)

> ⚠️ **Q293, Q294 e Q295 desfeitas em 11/11/2026** pela
> [spec do custo único](2026-11-11-emporio-custo-um-so-design.md): o cliente
> quer um custo só, sem opção. O diagnóstico abaixo também estava errado: a
> compra não foi lançada antes da contagem, ela foi carimbada ao meio-dia e
> caiu antes dela no histórico (Q298). Seguem valendo a Q296 e a Q297.

Pedido do usuário em 10/11/2026: o produto custava 20,00, acabou, foi reposto a
30,00, e o sistema mostrou algo perto da média dos dois. Pesquisa e
recomendação aceitas pelo usuário ("vamos seguir suas recomendações").

## O que o diagnóstico mostrou (produção, só leitura, 10/11/2026)

A conta do custo médio ponderado móvel (`src/lib/emporio/custo-medio.ts`,
Q64) está certa: com saldo zero, a média recomeça pelo custo da compra. O caso
real foi **estoque que só existia no sistema**: o TALCO/ GEL da loja AGROMAX
tinha implantação de 5.000 kg a 1,28; o sistema achava 3.892 kg quando entrou a
compra de 100 kg a 2,35, e a média virou 1,31. A contagem que zerou o
estoque veio depois da compra. Com o saldo zerado, o produto continuou
mostrando 1,31 como custo.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q293 | **Dois custos à vista:** o custo médio (ponderado móvel, por loja) e o custo da **última compra** com a data (a entrada `compra` mais recente com custo, na loja). O estoque, o custo da mercadoria vendida e o Resultado continuam pelo custo médio | a norma contábil e o Fisco aceitam o custo médio; o preço precisa enxergar a reposição |
| Q294 | **Base do preço sugerido por loja** (`Establishment.price_cost_basis`): `medio`, `ultima_compra` ou `maior` (o maior dos dois), **padrão `maior`**. Quem edita é quem já edita os percentuais padrão da loja. Só muda o **preço sugerido** da formação de preço: o preço de venda continua gravado à mão (`PresentationPrice`) e nada muda sozinho | na alta protege a margem; na baixa não derruba o preço antes de o estoque caro sair |
| Q295 | **Aviso de diferença:** quando a última compra difere do custo médio em mais de 10% (para cima ou para baixo), o produto, a formação de preço e o estoque mostram o aviso com o percentual. Limite fixo por enquanto | chama atenção para repor o preço ou contar o estoque |
| Q296 | **Saldo antes da compra:** ao lançar uma compra, cada item mostra o saldo e o custo médio que o sistema tem na loja antes da entrada; com saldo maior que zero, o aviso "O sistema tem N un. a R$ X nesta loja. Se o produto tinha acabado, faça a contagem antes de lançar a compra, senão o custo novo se mistura com esse saldo." | o caso do TALCO/ GEL |
| Q297 | **Saldo zero ou negativo:** o custo médio fica "sem estoque" e o preço sugerido usa a última compra, em qualquer base; sem compra nenhuma, o custo de referência do produto (Q52), como hoje | o médio velho de um estoque que acabou não representa nada |

## Contrato (aditivo)

- Leituras do produto, da formação de preço e do estoque: `average_cost`,
  `last_purchase_cost`, `last_purchase_on`, `price_cost_basis`,
  `suggested_cost` (o custo usado no sugerido), `suggested_cost_source`
  (`medio` | `ultima_compra` | `referencia`), `cost_gap_pct` (null sem os dois).
- Loja: `price_cost_basis` no PATCH da loja (recusa 422 no campo para valor
  fora da lista).
- Compra: a leitura usada pelo formulário de compra traz, por produto na loja,
  `stock_balance` e `average_cost` atuais.
- `/docs/api` documenta.

## Fora

Propor a atualização do preço de venda na própria compra (dívida 2.71); limite
do aviso configurável; custo de reposição digitado (cotação sem compra).

Suíte: `test:m112`.
