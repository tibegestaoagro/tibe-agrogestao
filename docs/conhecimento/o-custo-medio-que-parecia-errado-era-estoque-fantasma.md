---
tipo: licao
data: 2026-11-10
tags: [emporio, estoque, custo-medio, diagnostico]
origem: src/lib/emporio/custo-medio.ts
---

# O custo médio que parecia errado era estoque que só existia no sistema

## O que aconteceu

A Agromax relatou que o produto acabou, foi reposto mais caro e o sistema
mostrou "a média dos dois". A conta do custo médio ponderado móvel estava
certa (com saldo zero ela recomeça pelo custo da compra). Repassar o
histórico do TALCO/ GEL em produção, só leitura, mostrou a causa: implantação
de 5.000 kg a 1,28, consumo de 1.108, a compra de 100 kg a 2,35 entrou com o
sistema achando 3.892 kg, e a média virou 1,31. A contagem que zerou o
estoque foi lançada **depois** da compra. O produto ficou com saldo zero e
o médio velho de 1,31 à vista.

## Por que importa

A primeira tentação era "consertar" a fórmula, e a fórmula não tinha
defeito: a mudança teria estragado o custo de todo o estoque. O defeito era
de processo (contagem depois da compra) e de tela (nada avisava que havia
saldo antes da entrada, e o médio de um estoque zerado seguia sendo
mostrado como custo). Daí as decisões Q293 a Q297.

## Como aplicar

- Queixa de custo médio: antes de mexer na conta, repasse as movimentações
  do produto na loja em ordem e mostre o saldo que o sistema tinha em cada
  entrada. O `deltaDaLoja` de `src/lib/emporio/custo-medio.ts` serve para
  isso num script de leitura.
- Quem repõe produto que acabou conta antes de lançar a compra; a tela da
  compra mostra o saldo de antes e avisa (Q296).
- Custo de estoque e base de preço são perguntas diferentes: o primeiro
  segue o médio (norma contábil), o segundo pode seguir a última compra.

## Relacionado

- [[somar-em-vez-de-gravar-tem-um-preco-no-dia-um]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
