---
tipo: licao
data: 2026-08-31
tags: [processo, validacao-viva, qualidade]
origem: docs/agents/current-handoff.md
---

# Os piores defeitos deste projeto passaram por tsc, lint e a suíte inteira verdes

## O que aconteceu

Seis defeitos graves, todos achados em uso real e nenhum em suíte:

| defeito | como apareceu |
|---|---|
| formulário de máquina não abria sem sinal | modo avião num Android, no curral |
| `Tenant.archived_at` não fazia nada | nenhum ponto de auth, sessão ou billing lia o campo |
| o middleware não bloqueava nada por sessão de tenant | havia meses |
| "não, deixa pra lá" gravava a compra recusada | o classificador do n8n não remonta os parâmetros literalmente |
| 71 rotas devolviam a recusa do Zod em inglês | ver [[zod-em-ingles-nas-71-rotas]] |
| pílula invisível | ver [[pilula-invisivel-o-portao-compara-token-nao-uso]] |

## Por que importa

Nenhum é erro de cálculo. São erros de **integração com o mundo**: com o
aparelho, com a rede, com o classificador, com o olho de quem lê a tela. A
suíte prova que a função devolve o que a função promete, e nenhum destes seis
era uma função quebrada.

## Como aplicar

**A ordem que funciona:** quebre a trava de propósito, rode a suíte, e **abra a
tela**. Em três frentes seguidas os piores defeitos só apareceram na terceira
etapa. Reservar tempo para ela é parte da estimativa, não sobra.

Antes de reportar um módulo como concluído, valide no navegador real, no
aparelho, ou pelo banco de provas (`npm run wa`, que conversa com o agente de
produção e lê a resposta por programa).

## Relacionado

- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
