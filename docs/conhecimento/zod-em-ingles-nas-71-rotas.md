---
tipo: licao
data: 2026-08-31
tags: [api, contrato-de-erro, zod, formulario]
origem: bb631e4
---

# As 71 rotas devolviam a recusa do Zod em inglês, e a infraestrutura para consertar já existia

## O que aconteceu

Até 2026-08-31, as rotas faziam
`apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422)`, com dois
defeitos numa linha só:

1. **O texto era o default do Zod, em inglês.** Quem cadastrava máquina com
   custo negativo lia "Too small: expected number to be >=0" no rodapé do
   painel.
2. **O `field` não atravessava**, então a recusa caía no rodapé do painel em vez
   de embaixo do campo que a causou.

## Por que importa

**Nada disso aparecia em teste**, e a suíte inteira estava verde: as suítes leem
o `code` da resposta, nunca a frase. Um contrato pode estar formalmente correto
e completamente inútil para quem lê a tela.

E o mais caro: **a infraestrutura de `field` já existia e já funcionava**. O
`ActionResult`, o `fail()` com quarto parâmetro, o `<Field>` que casa `id` com
`error.field`, tudo pronto. Faltava só ligar, em 71 lugares.

## Como aplicar

- A recusa do Zod sai por `apiErroDeZod(parsed.error)`, nunca à mão. A
  **conferência 12** do `npm run check` impede a volta.
- A tradução é um mapa global (`src/lib/erros-de-zod.ts`), e a precedência do
  Zod resolve o caso difícil: **mensagem escrita no schema vence**, e o mapa só
  responde quando o autor não escreveu nada.
- Ao encontrar infraestrutura pronta e não usada, desconfie de que o problema é
  de fiação, não de desenho. Procurar o que falta ligar é mais barato que
  projetar de novo.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
