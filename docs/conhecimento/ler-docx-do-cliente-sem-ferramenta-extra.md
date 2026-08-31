---
tipo: referencia
data: 2026-08-31
tags: [ambiente, spec, documento-do-cliente]
origem: docs/area-funcional-confinamento/
---

# Dá para ler os `.docx` do cliente com `unzip`, sem instalar nada

## O que aconteceu

As specs deste projeto citam os documentos do cliente **por parágrafo**
(`§12.7`, `§17.9`), e esses documentos são `.docx`: o Módulo 31 nasceu de
`docs/moduloNegociacao/`, e os próximos vêm de
`docs/area-funcional-confinamento/`.

A ferramenta de leitura do agente não abre `.docx`, e **não há Python neste
ambiente** (`python` cai no atalho da Microsoft Store). Isso parecia um
bloqueio para escrever spec citando parágrafo.

Não é. Um `.docx` é um zip com XML dentro:

```
unzip -p "<arquivo>.docx" word/document.xml | sed -e 's/<[^>]*>/ /g' | tr -s ' '
```

Testado em 2026-08-31 contra `Área Funcional Confinamento.docx`: sai o texto
corrido, legível, com os títulos numerados preservados.

## Por que importa

Sem isso, escrever spec de módulo novo dependeria de alguém colar o conteúdo na
conversa, o que faz o documento **entrar no contexto inteiro** em vez de ser
lido em pedaços, e some no primeiro resumo automático.

## Como aplicar

- A saída é texto corrido, **sem quebra de parágrafo confiável**. Para citar
  `§N`, ache o número do título no texto, não conte parágrafos.
- Tabela do Word vira sequência de células soltas. Se a spec depender de uma
  tabela, confira com o usuário em vez de reconstruir por adivinhação.
- Vale para qualquer `.docx`, e o mesmo truque serve para `.xlsx`
  (`xl/sharedStrings.xml`).

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
