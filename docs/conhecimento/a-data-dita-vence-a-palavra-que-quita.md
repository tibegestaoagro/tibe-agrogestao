---
tipo: armadilha
data: 2026-09-29
tags: [agente, whatsapp, financeiro, negocio, estoque]
origem: 60a1fe3
---

# A data dita vence a palavra que quita

## O que aconteceu

Em 29/09/2026 o agente passou a perguntar "Você já pagou, ou vai pagar depois?"
antes de gravar compra sem prazo (gado e insumo). A resposta "já paguei" é
reconhecida por `respondeuQueJaPagou` (`whatsapp-handlers/negociacao.ts`), que
procurava os pedaços `pago|paguei|quitad|receb|vista` no texto.

O subagente que estendeu isso ao estoque escreveu no próprio relatório o risco,
e decidiu não corrigir porque "o gado tem a mesma regex": **"vou receber dia 10"
tem o pedaço "receb"** e seria lido como "já recebi". A conta a receber viraria
receita QUITADA, e ninguém cobraria o dia 10.

Ao corrigir apareceu um segundo detalhe: `interpretarData("vou pagar dia 10")`
não lê a data, porque o parser não tolera palavra antes dela. Olhar só o que o
parser aceita não bastava para a guarda.

## Por que importa

É a mesma família do "não, deixa pra lá" que gravou compra e do "sim" que quitou
a conta errada: **dinheiro gravado num estado que o produtor não disse**, sem
erro nenhum, com a suíte verde.

## Como aplicar

- Quando a mesma frase pode ter a PALAVRA de um estado e a DATA de outro, a data
  manda. A guarda olha a menção de data (`dia N`, `N/N`, `amanhã`, `semana que
  vem`), não só o que o parser consegue converter.
- Risco escrito por subagente em relatório não é item de relatório: é defeito
  para corrigir antes do merge. Leia a seção de riscos com a mesma atenção da
  de entregas.
- O teste que discrimina é a frase com as duas coisas ao mesmo tempo.

## Relacionado

- [[a-porta-fraca-nao-pode-alcancar-quem-grava-sem-confirmar]]
