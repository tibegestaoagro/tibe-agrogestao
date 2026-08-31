---
tipo: armadilha
data: 2026-08-31
tags: [processo, time-de-agentes, git]
origem: 62ca3b1
---

# `git checkout` num arquivo de agente descarta trabalho que não está em commit nenhum

## O que aconteceu

Durante a validação de uma trava, a sessão principal reverteu **de propósito**
uma linha de `herd-stays.ts` para provar que as asserções da suíte
discriminavam. Elas discriminaram: as duas suítes reprovaram.

Para restaurar, rodou `git checkout -- <arquivo>`. O comando funcionou, e
**descartou também o trabalho não commitado do agente** que tinha construído
aquele arquivo minutos antes, na mesma onda.

O `sed` seguinte, que deveria desfazer só a linha do teste, não casou nada
(o arquivo já era outro), então não corrompeu. O estrago foi só a perda.

## Por que importa

No protocolo de ondas, **subagente não commita**: ele deixa a mudança no
working tree e a sessão principal commita depois. Isso significa que, entre o
fim da onda e o commit, **todo o trabalho da onda existe apenas no working
tree**. Qualquer comando que descarte working tree, nessa janela, apaga o
trabalho de vários agentes de uma vez, e não há reflog que o traga de volta:
nunca foi um objeto do git.

É uma consequência direta do desenho, e não um acidente isolado: quanto mais o
protocolo funciona, maior a janela.

## Como aplicar

- **Para desfazer uma alteração SUA, desfaça a alteração**, não o arquivo. Se
  você mudou uma linha com `sed`, mude-a de volta com `sed`.
- **Antes de qualquer `git checkout`, `restore`, `reset` ou `clean`, rode
  `git status`** e pergunte de quem é cada arquivo modificado. Na janela de uma
  onda, a resposta quase nunca é "meu".
- **Se precisar mesmo reverter, commite antes.** Um commit a mais é barato;
  refazer o trabalho de um agente pela memória do relatório dele é caro e
  inseguro.
- **A rede que salvou aqui foi a suíte.** O trecho foi refeito, e o que provou
  que estava certo não foi a lembrança do relatório: foram as asserções que o
  outro agente tinha escrito, e que já haviam sido provadas discriminando. Sem
  elas, o refazimento seria adivinhação.

## Relacionado

- [[agentes-da-mesma-onda-veem-o-plantio-um-do-outro]]
- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
