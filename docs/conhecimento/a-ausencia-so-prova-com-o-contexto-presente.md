---
tipo: licao
data: 2026-10-29
tags: [validacao, navegador, teste, qualidade]
origem: scripts/navegador/emporio-f5.py
---

# A ausência só prova alguma coisa quando o contexto em volta está na tela

## O que aconteceu

O roteiro da F5 do Empório tinha dois lados de uma mesma regra: o Owner vê o
botão "Criar composição desta receita" na Calculadora, e o usuário fora da
lista do recurso não vê. Na primeira rodada, o lado do Owner reprovou e o do
usuário de fora **passou**. O motivo: a Calculadora só mostra o resultado (e o
botão junto) depois de clicar em Calcular, e o roteiro nunca clicava. O botão
não aparecia para ninguém, e "não tem o botão" era verdade para qualquer
usuário, com ou sem a regra.

## Por que importa

Um `confere(not tem(...))` verde parece prova de isolamento, e é o tipo de
item que ninguém relê. Se o lado positivo não existisse no roteiro, a regra
"quem está fora da lista não vê o Empório" teria um item verde que não
dependia dela.

## Como aplicar

1. Antes de conferir que algo **não** está na tela, confira que o contexto
   onde ele estaria **está**: aqui, o título "Resultado" do cálculo.
2. Todo item de ausência tem que ter um par de presença, de outro usuário ou
   de outro estado, que reprove se o caminho até a tela mudar.
3. Na quebra de propósito, olhe também quais itens de ausência **não**
   ficaram vermelhos: se nenhum ficou, eles não estão provando nada.

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
