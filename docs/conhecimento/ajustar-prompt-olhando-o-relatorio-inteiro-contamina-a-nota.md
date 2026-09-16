---
tipo: licao
data: 2026-09-16
tags: [agente-whatsapp, avaliacao, llm, metodo]
origem: docs/agents/agente-whatsapp/avaliacao-fase-3-foradaamostra.md
---

# Ajustar o prompt olhando o relatório inteiro transforma a nota final em decoreba

## O que aconteceu

Na Fase 3 do agente, o conjunto de avaliação foi dividido em 70% para ajustar o
prompt e 30% guardados só para a nota final. O plano mandava gerar o relatório
do ajuste com `--particao ajuste`. A rodada 1 foi gerada **sem** esse filtro, e
as três iterações de ajuste de prompt foram escritas com a lista inteira de
erros à vista, inclusive os casos guardados.

A revisão final mediu o estrago nos MESMOS casos da partição final: o
`gpt-5.6-terra` saiu de **84,8% antes do ajuste para 96,8% depois**. Cinco dos
dez casos que ele errava estavam citados no relatório committado, e cada um
ganhou uma regra correspondente no prompt. Duas expressões novas do prompt
("vai ficar uns", "fulano e mais 2") não existiam em nenhum caso da partição de
ajuste: só nos guardados.

A correção foi medir de novo com 50 casos inéditos, escritos por um autor sem
acesso ao prompt ajustado, ao código e aos casos antigos. Nessa rodada limpa o
modelo barato (`gpt-5.6-luna`) fez 97,7% e o caro fez 95,5%.

## Por que importa

O número que decide qual modelo o produto usa é o único produto da fase. Com a
partição vazada, ele mede o prompt acertando caso conhecido, e a decisão fica
sem base. O que sobreviveu ao vazamento foi o **ranking**: a ordem entre os seis
modelos já era a mesma na rodada 1, sem ajuste nenhum.

## Como aplicar

- Quem ajusta prompt só pode ler relatório filtrado pela partição de ajuste. Se
  o relatório mostra caso guardado, ele deixou de ser guardado.
- O gerador de relatório do projeto agora **carimba** no topo quando o resultado
  contém a partição guardada e o nome da rodada não é `final`.
- Vazou? Não tente corrigir por argumento: escreva um conjunto novo, por um
  autor sem acesso ao que foi ajustado, e meça de novo. Custou US$ 0,15 e uma
  hora.

## Relacionado

- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[escrever-a-licao-nao-impede-repeti-la]]
- [[prompt-antes-de-modelo-o-barato-passa-o-caro-erra-igual]]
