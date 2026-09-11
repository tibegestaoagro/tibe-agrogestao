---
tipo: licao
data: 2026-09-11
tags: [whatsapp, formatacao, dinheiro, validacao-viva]
origem: npm run wa contra o agente de producao
---

# O cálculo estava certo e a resposta estava em outro idioma: "R$ 500.00"

## O que aconteceu

Validando a fase 35.1 pelo banco de provas, "anota uma despesa de 500 reais com
diesel do trator" devolveu:

> Entendi: R$ 500.00, categoria Combustíveis. Confirma o lançamento?

A categoria veio do banco, que era o ponto da prova, e passou. O **valor** é que
estava escrito como o inglês escreve: ponto decimal, sem separador de milhar.
Era `R$ ${valor.toFixed(2)}`, em 25 pontos do código, espalhados pelos handlers
do WhatsApp, pelos alertas, pelo resumo diário e pelas duas calculadoras.

Ao mesmo tempo, **cinco handlers já tinham a função certa**, copiada palavra por
palavra, cada um com o seu `reais()` privado. Três outros tinham a mesma função
com outro nome, `moeda()`.

## Por que importa

Em R$ 500,00 a diferença é cosmética. Em sessenta mil não é: "R$ 60000.00" é um
número que o produtor precisa contar com o dedo para saber quanto é, na hora de
confirmar uma compra de gado pelo WhatsApp. É o lugar em que ele mais precisa
ler rápido e com certeza.

**Nenhuma suíte reclamava, e a suíte estava inteira verde.** Elas leem número e
código de erro, nunca a frase montada. É o mesmo ponto cego de
[[zod-em-ingles-nas-71-rotas]]: contrato formalmente correto, inútil para quem
lê.

E o padrão de fundo se repetiu: enquanto a função certa mora dentro de um
módulo, quem está fora não a usa. Foi por isso que `src/lib/numero-br.ts` nasceu
separado, para a leitura de número; a escrita continuava presa dentro de cada
handler.

## Como aplicar

- Dinheiro sai por `reaisBr()`, de `src/lib/numero-br.ts`, no servidor, no
  handler e na tela. A **conferência 16** do `npm run check` impede a volta, e
  ela nasceu no zero, sem linha de base.
- Ao achar a mesma função copiada em três lugares, o problema não é a cópia: é
  que ela mora no lugar errado. Mova para o módulo puro e as cópias somem
  sozinhas.
- **Leia a frase que o produtor lê.** O caso que discrimina não é o valor
  redondo: é o de mil para cima, onde falta o separador inteiro.

## Relacionado

- [[zod-em-ingles-nas-71-rotas]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
