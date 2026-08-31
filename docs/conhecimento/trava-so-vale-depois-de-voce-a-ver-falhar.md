---
tipo: licao
data: 2026-08-31
tags: [processo, catraca, qualidade, teste]
origem: docs/agents/current-handoff.md
---

# Trava só vale depois de você a ver FALHAR

## O que aconteceu

Uma trava nova do `npm run check` nasceu com uma regex que aceitava a palavra
`toast` solta. A palavra aparece no `import`. Resultado: **todo arquivo que
apenas importava o módulo passava na trava**, sem tratar recusa nenhuma. A trava
existia, rodava em CI, e não protegia nada.

Foi corrigida para casar a **chamada** (`toast.\w+(`), não o nome solto.

## Por que importa

Uma trava é código, e código não conferido é código quebrado. A diferença é que
uma trava quebrada **falha em silêncio para sempre**: ela sempre passa, e passar
é o resultado que ninguém investiga.

Uma segunda lição da mesma família: **decida de propósito qual é a unidade que a
trava mede.** A conferência 10 lê o **arquivo**, não a função, e por isso dois
`category-manager` passavam tratando a recusa num painel enquanto o botão de
ativar/desativar a engolia em silêncio.

## Como aplicar

**Prove nos dois sentidos, sempre:**

1. Plante um caso que **deve** reprovar. Rode. **Veja reprovar.**
2. Corrija o caso. Rode. Veja passar.

Sem o passo 1, a trava é decorativa. E ao desenhar, escreva qual é a unidade
medida (arquivo? função? linha?), porque a escolha errada cria um furo do
tamanho da diferença.

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
