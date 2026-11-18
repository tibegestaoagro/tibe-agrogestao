---
tipo: armadilha
data: 2026-11-17
tags: [navegador, roteiro, falso-positivo]
origem: scripts/navegador/_lib.py, eb5aacd
---

# O eh_404 dos roteiros casa o número 404 em qualquer texto da página

## O que aconteceu

Em 17/11/2026, o roteiro `emporio-conferir-cartao` reprovou numa tela que
abria normalmente. O `eh_404()` de `scripts/navegador/_lib.py` procura "404"
em qualquer lugar do texto da página, e casou com a venda nº 004043. O roteiro
novo passou a usar `nao_achada()`, que procura só "could not be found", a frase
da página 404 do Next.

O `eh_404()` da lib não mudou, e seis roteiros ainda o chamam (`emporio-f0`,
`emporio-financeiro-casa`, `emporio-impressao`, `emporio-informacao-amarrada`,
`emporio-relatorios-exportacao` e `manual-animacoes`).

## Por que importa

O erro vale nos dois sentidos:
- uma tela boa com "404" no conteúdo (número de venda, preço R$ 404,00, código)
  reprova como se não abrisse;
- pior, uma conferência de "o Gestor não abre esta página" passa sempre que a
  página permitida mostrar um "404" qualquer. É uma prova de ausência que não
  prova nada.

## Como aplicar

- Para conferir a página 404, procure a frase "could not be found", não o
  número.
- Se um roteiro antigo reprovar "abre a tela" com a tela visivelmente certa,
  procure "404" no texto antes de culpar o app.
- A troca na lib está registrada como dívida (5.23 em `docs/agents/dividas.md`).

## Relacionado

- [[a-ausencia-so-prova-com-o-contexto-presente]]
- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
