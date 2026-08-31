---
tipo: licao
data: 2026-08-31
tags: [processo, ondas, time-de-agentes]
origem: df62257
---

# Contrato incompleto produz saída inconsistente entre agentes paralelos

## O que aconteceu

No piloto do time de agentes, dois `tela-pagina` rodaram na mesma onda com o
mesmo mapa de tradução de cores. Os dois encontraram `divide-gray-NNN`, que o
mapa **não cobria**.

- O **T03** parou e relatou, como o briefing mandava.
- O **T04** converteu para `divide-borda`, citando precedente já em uso no
  projeto.

Nenhum dos dois errou. O briefing dizia "pare e relate se aparecer cor fora do
mapa" e também dizia "aplique exatamente este mapa", e a situação não era nem
uma coisa nem outra.

## Por que importa

Numa sessão única, essa ambiguidade se resolve sozinha: quem decide é sempre a
mesma cabeça, e a segunda ocorrência herda a decisão da primeira.

**Em paralelo isso não acontece.** Cada agente decide isolado, e a
inconsistência só aparece depois, na revisão, quando os dois já commitaram. O
custo não é o erro: é que o resultado fica **irregular sem ninguém ter errado**.

## Como aplicar

- A seção **"Decisões já tomadas (execute, não redecida)"** do briefing existe
  exatamente para isso, e falhou aqui por omissão, não por desenho.
- Antes de despachar uma onda, pergunte: **o que os agentes desta onda vão
  encontrar que o contrato não responde?** Se dois deles podem encontrar a
  mesma coisa, o contrato precisa responder antes.
- Quando a divergência acontecer, ela é achado: o T04 provou que
  `divide-borda` funciona e tem precedente, o que resolveu o impasse do T03.

## Relacionado

- [[suite-cega-cobra-mais-do-que-o-briefing-mandou]]
- [[portao-mede-a-relacao-que-lhe-deram]]
