---
tipo: armadilha
data: 2026-10-07
tags: [validacao, navegador, browser-harness, ambiente]
origem: docs/agents/current-handoff.md (seção Ambiente, até 07/10)
---

# A aba oculta e a leitura cedo imitam defeito no navegador

## O que aconteceu

A validação de tela com `browser-harness` funciona nas duas máquinas, e foi
assim que os Módulos 36 e 37 e as dívidas 3.2 e 5.8 foram validados. Mas seis
atritos do controle se repetem e, nos dois piores, o sintoma é igual ao de
defeito do app. Em 07/10, na 5.8, dois deles apareceram na mesma tela: o painel
de encerrar estadia "não abriu" (aba oculta) e o envio "não gravou" (lido aos
9 s, o POST respondeu em 18 s por ser a primeira compilação da rota).

## Por que importa

Cada um já custou uma investigação de defeito que não existia. A conclusão
errada ("a tela não grava") vira correção desnecessária no código.

## Como aplicar

1. A primeira conexão exige `new_tab(url)` explícito.
2. Clique por coordenada não dispara o botão no rodapé do `FormSheet`: use
   `js` com `click()` e ache por `[role=dialog] button[type=submit]` (texto com
   acento não casa).
3. Os ids da árvore de acessibilidade mudam a cada render: resolva na mesma
   chamada.
4. **Aba em segundo plano pausa a animação do Radix**: o painel fica fechado
   ou fora da tela e parece defeito. `activate_tab(current_tab())` no começo
   de todo roteiro.
5. **Texto passado ao `js(...)` chega com acento corrompido**: compare por
   prefixo sem acento ou monte o caractere com `String.fromCharCode`. Um
   `includes("Você já recebeu?")` falso não prova que o texto falta.
6. **A primeira visita a uma rota ainda não compilada leva até 20 s**, no
   `goto_url` e no primeiro POST. Não renavegue: espere a linha da rota no log
   do `next dev`, e decida pelo banco, não pelo painel.

Cenário de tela se monta com script `tsx`, nunca com `curl` (acento em
Windows-1252 entra torto no banco).

## Relacionado

- [[a-data-dita-vence-a-palavra-que-quita]]
