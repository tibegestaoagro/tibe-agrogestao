---
tipo: armadilha
data: 2026-09-16
tags: [agente-whatsapp, numero, anti-alucinacao]
origem: src/lib/agente/trecho-literal.ts
---

# "cento e vinte, cinquenta de frete" virava 170, e a trava anti-alucinação aceitava

## O que aconteceu

A trava que impede o agente de gravar número que o produtor não disse compara o
valor devolvido pelo modelo com os números do texto. Ela lia número por extenso
com uma tabela de um a vinte, e a conversa de produtor passa disso o tempo todo
("sessenta mil", "cento e trinta mil", "vinte e duas cabeças"). O efeito medido:
nas mensagens de áudio transcrito, o acerto de campo caía de mais de 90% para
62%, porque o campo convertido era **apagado** por não parecer no texto.

Ao ampliar a leitura para número composto, a primeira versão passou a somar
qualquer par ligado por "e", e a pontuação era descartada junto com o espaço.
Resultado, medido com script: "paguei cento e vinte, **cinquenta** de frete"
aceitava 170, e "chego entre **sete e oito** da manhã" aceitava 15. A trava
anti-alucinação passou a aceitar números que ninguém falou.

A regra que fechou os dois lados: a pontuação corta a sequência, e o "e" só liga
quando a parte da esquerda é dezena, centena ou escala (mil, milhão) e a da
direita é de magnitude menor. Conferido nos 316 números dos gabaritos: nenhum
número legítimo foi perdido.

## Por que importa

É a trava que separa "o agente pergunta" de "o agente grava valor inventado".
Frouxa demais, ela deixa passar; dura demais, ela apaga o que o produtor disse e
a conversa vira uma pergunta repetida.

## Como aplicar

- Mudança nessa trava se prova nos DOIS sentidos, com casos de aceitar e de
  recusar, e com um diferencial contra os gabaritos que já existem.
- Número por extenso composto é fala normal de produtor, não caso de canto.
- Fração e ordinal continuam fora: valor assim é removido e o handler pergunta.

## Relacionado

- [[o-valor-certo-escrito-em-outro-idioma]]
- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
