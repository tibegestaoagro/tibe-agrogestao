---
tipo: armadilha
data: 2026-11-17
tags: [validacao, navegador, manual, cenario, banco-local]
origem: 520e478
---

# A conta do seed acumula o que os cenários deixam, e as figuras do manual quebram como se a tela tivesse defeito

## O que aconteceu

Em 16/11/2026, o roteiro `manual-emporio` reprovou 23 figuras. Parecia defeito
de tela: captura em branco, lista cortada, elemento fora da área da figura. A
causa era o banco local. Os cenários `_cenario-emporio-*` criam loja, cliente,
conta e produto na MESMA conta do seed, cada um com prefixo próprio, e nenhum
limpa tudo. A conta tinha 46 lojas em vez das 3 da demonstração, 81 clientes e
17 contas bancárias. As telas cresceram além da altura fixa de cada figura.

Correção que dura: `scripts/_limpar-conta-do-seed.ts`, chamado pelo
`scripts/_cenario-manual-emporio.ts` antes de montar a demonstração. Ele apaga
o que não é da demonstração, seguindo as chaves estrangeiras do próprio banco.
Depois disso, o manual passou com 0 falhas, e só 3 figuras precisaram de mais
altura por mudança real de tela (Caixa e Relatórios).

Efeito colateral visto na mesma rodada: a limpeza roda com
`session_replication_role = replica`, que desliga as chaves estrangeiras. Uma
loja apagada assim deixou um modelo de despesa fixa sem rateio, um estado que
as telas não produzem, e a projeção do financeiro deu 500. A limpeza passou a
apagar os modelos que não são da demonstração.

## Por que importa

O sintoma é igual ao de defeito de tela, e a investigação começa no lugar
errado: no CSS, na altura da captura, no componente. Cada roteiro novo que usa
a conta do seed piora o quadro para todos os outros, em silêncio, e o defeito
aparece na rodada de outra frente.

E apagar com as chaves desligadas cria estado que o produto não cria. Um erro
que nasce daí não é defeito do produto até prova em contrário.

## Como aplicar

- Figura ou roteiro reprovou em massa? **Conte as linhas da conta do seed antes
  de abrir o código** (lojas, clientes, contas). Muito acima da demonstração, a
  causa é sujeira.
- Roteiro que fotografa tela com altura fixa precisa de conta limpa: chame a
  limpeza no cenário dele, como faz o do manual.
- Cenário novo: limpe o que criou, ou use prefixo que a limpeza reconheça.
- Erro que só aparece depois de uma limpeza com `replica`: confira primeiro se
  o estado pode ser criado pelas telas.

## Acréscimo de 2026-11-23: nome fixo pega o cliente da rodada anterior

O `scripts/_cenario-emporio-franqueado.ts` limpa vendas e devoluções, mas não
apaga clientes. O passo novo da Q386 criava dois clientes com nome fixo, e na
segunda rodada o seletor do balcão escolheu o cliente da rodada anterior: a
ficha mostrava "Total comprado R$ 0,00" e parecia defeito da ficha. Saída: o
nome do cliente criado pelo roteiro leva um sufixo por rodada (`time.time()`).
Vale para qualquer registro que o roteiro cria e o cenário não apaga.

## Acréscimo de 2026-11-26: o pedido de pagamento fica órfão porque não tem chave estrangeira

Na passada dos roteiros da onda 2 de UX, a lista de Aprovações aparecia com
os pedidos dobrados, e parecia defeito da paginação. `EmporioPaymentRequest.establishment_id`
não tem chave estrangeira: o cenário que apaga a loja deixa os pedidos dela no
banco, e nenhum `onDelete` avisa. O cenário da paginação
(`scripts/_cenario-emporio-paginacao-listas.ts`) passou a apagar os pedidos
pela assinatura deles (data antes de 2020 e total entre 700 e 724), e não pela
loja. Vale para qualquer coluna de id sem relação no schema: apagar o pai não
leva o filho, e o resto aparece em outra tela, na rodada de outro roteiro.

## Relacionado

- [[o-cenario-com-data-relativa-muda-de-mes-conforme-o-dia-em-que-roda]]
- [[a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador]]
- [[a-suite-e-o-roteiro-no-mesmo-banco-reprovam-sem-defeito]]
- [[dado-herdado-invalido-trava-o-caminho-novo]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
