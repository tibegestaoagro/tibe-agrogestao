---
tipo: armadilha
data: 2026-09-16
tags: [agente-whatsapp, llm, classificacao]
origem: src/lib/agente/prompts.ts
---

# Na classificação em duas etapas, domínio errado vira "não entendi", e a culpa parece da intenção

## O que aconteceu

O classificador do agente decide primeiro o **domínio** da mensagem e só então
extrai a intenção e os campos, e a segunda etapa recebe **apenas as intenções
daquele domínio**. Quando o domínio sai errado, a intenção certa nem está na
lista de opções, e a única saída possível é `ambigua`.

Na avaliação, isso apareceu como "a intenção X está com 0% de acerto", e a
reação natural foi reescrever a descrição da intenção X. Não adiantava: a
mensagem nunca chegava lá. Os casos de `gerar_relatorio`, `consultar_cliente`,
`comprei_item_lista` e das intenções de andamento de serviço só melhoraram
quando o texto mudou em `DESCRICAO_DOS_DOMINIOS`, não nas intenções.

Pelo mesmo motivo, a `vizinhas` de uma intenção (que distingue ela da parecida)
é invisível para a etapa de domínio: regra que precisa valer na hora de escolher
o domínio tem de morar no prompt de domínio.

## Por que importa

Cada rodada de ajuste custa dinheiro e tempo. Mexer na camada errada gasta a
rodada inteira e não move o número.

## Como aplicar

- Intenção com acerto muito baixo e erro saindo como `ambigua`: suspeite do
  domínio antes da intenção. Uma prova barata é ver se o erro obtido é uma
  intenção de OUTRO domínio (aí a etapa 1 acertou) ou `ambigua` (aí ela errou).
- Regra que separa dois domínios vai no prompt de domínio. Regra que separa duas
  intenções do mesmo domínio vai em `vizinhas`.

## Relacionado

- [[prompt-antes-de-modelo-o-barato-passa-o-caro-erra-igual]]
- [[campo-homonimo-no-dominio-herda-a-descricao-da-primeira-intencao]]
