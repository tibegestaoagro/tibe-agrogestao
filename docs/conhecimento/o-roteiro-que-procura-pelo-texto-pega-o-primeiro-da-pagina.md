---
tipo: armadilha
data: 2026-11-20
tags: [navegador, roteiro, falso-positivo, emporio]
origem: 89b56577, a0efa293, scripts/navegador/_lib.py
---

# O roteiro que procura pelo texto pega o primeiro da página, e uma tela nova muda qual é o primeiro

## O que aconteceu

Em 20/11/2026, o roteiro `emporio-antecipacao` reprovava 7 passos no
"Desfazer": o diálogo esperado não abria e o saldo não voltava. Parecia
defeito em produção no desfazer da antecipação.

Não era. `clicar("Desfazer")` (`scripts/navegador/_lib.py`) clica o primeiro
botão com esse texto na página. Desde 17/11, cada parcela conferida tem o seu
próprio "Desfazer", e esses botões vêm antes da seção Antecipações. O roteiro
abria "Desfazer a conferência"; os outros 6 passos falhavam em cascata. A
correção foi `clicar_no_bloco("Pontual", "Desfazer")`.

No mesmo dia, no `emporio-data-da-baixa`, o auxiliar `botoes_da_linha("R$
30,00")` pegava a primeira `main tbody tr` com esse texto. Um cheque novo no
cenário pôs outra linha com "R$ 30,00" antes da do extrato, e dois passos que
eram verdes passaram a ler `[]`. A correção foi limitar a busca às tabelas do
extrato (cabeçalho Data e Valor) e exigir "Venda" na linha.

## Por que importa

O roteiro não quebra quando a tela dele muda, e sim quando outra parte da
mesma página ganha um elemento com o mesmo texto. A falha aparece longe da
mudança que a causou (aqui, três dias depois e noutra frente), e com cara de
defeito de produto. Uma sessão pode gastar a rodada investigando a action
certa.

## Como aplicar

- Em roteiro novo, procure sempre dentro de um bloco: `clicar_no_bloco`,
  ou a tabela pelo cabeçalho, ou a linha por um texto que só ela tem. Nunca o
  primeiro da página por um texto comum ("Desfazer", "Editar", um valor em
  reais).
- Quando um roteiro antigo reprova numa tela que ninguém mexeu, antes de
  abrir a action: veja o que o clique realmente abriu (título do painel,
  texto do diálogo) e se a página ganhou outro elemento com o mesmo texto.
- Teste se a falha existe na versão anterior do roteiro: se existe, é o
  roteiro ou o dado, não a mudança da rodada.

## Relacionado

- [[o-eh-404-dos-roteiros-casa-o-numero-404-em-qualquer-texto]]
- [[a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador]]
