---
description: Guarda uma lição, decisão ou armadilha no cofre de conhecimento (docs/conhecimento/)
---

Guarde no cofre de conhecimento do Tibé o que vem a seguir: $ARGUMENTS

Se nada vier depois do comando, olhe a conversa desta sessão e proponha o que
merece nota, com o título e o tipo de cada uma, **antes** de escrever.

Use a skill `memoria-cofre`. O caminho, em resumo:

1. **Aplique o teste:** uma sessão futura ficaria surpresa e grata de saber
   disto antes de começar? Se não, diga que não vale nota e pare.
2. **Procure duplicata** com `grep -ril` em `docs/conhecimento/`. Se já existe,
   acrescente na nota que existe em vez de criar outra.
3. **Escreva** a partir de `docs/conhecimento/_template.md`, com título que é a
   lição em uma frase, e uma consequência concreta em "Por que importa".
4. **Ligue** com `[[wikilink]]` para as notas vizinhas que existem.
5. **Acrescente a linha** em `docs/conhecimento/_indice.md`.
6. **Rode `npm run check`** e mostre o resultado.

Não guarde estado do projeto (isso é o handoff), dívida (isso é `dividas.md`),
nem o que já está no `CLAUDE.md`, numa regra de `.claude/rules/` ou numa spec.
