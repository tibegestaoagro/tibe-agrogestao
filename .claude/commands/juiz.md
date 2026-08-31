---
description: Despacha o julgamento independente sobre um range de commits, por rubrica
---

Despache o julgamento independente sobre: $ARGUMENTS

Se nada vier depois do comando, use o range da frente atual e diga qual você
escolheu antes de despachar.

Use o agente `prova-juiz`, em `opus`. Ele recebe **apenas**:

- a spec (ou o contrato do cliente)
- o range de commits (`<antes>..<depois>`)

⚠️ **Não passe o relato de quem implementou, nem a sua leitura do que foi
feito.** Ler a explicação de por que está certo antes de julgar é pedir a
resposta antes da prova. E avise o juiz para **não tomar mensagem de commit
como verdade estabelecida**: mensagem é afirmação a conferir contra o código.

Se o `prova-juiz` não registrar (já aconteceu: ver
`docs/conhecimento/agente-com-modelo-nao-padrao-pode-nao-registrar.md`),
pergunte ao usuário antes de substituir. A substituição por `general-purpose`
preserva a rubrica e a cegueira, mas perde a garantia estrutural: o juiz passa
a ter `Write`, e "não conserta" vira disciplina em vez de impossibilidade.
**Confira com `git status` que ele não escreveu nada.**

⚠️ **Nunca substitua o juiz pela própria sessão que orquestrou.** Uma frente
entregue sem julgamento independente é uma frente com uma lacuna, e dizer isso
vale mais que preencher a lacuna com a opinião de quem fez o trabalho.

Ao receber o veredito: **confira os números dele** antes de aceitar ou
contestar, e relate ao usuário o que conferiu.
