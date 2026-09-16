# Avaliação do agente: rodada homologacao-2

**Atenção: este resultado inclui casos da partição guardada (`final`). Ele serve para medir, nunca para ajustar prompt.**

Partição: todas. Casos de homologacao.json. Gerado em 2026-09-16.

O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.

`campos` é a coluna do limite de 90%: mede só os pedidos cuja intenção acertou. `campos absoluto` mede na base que inclui os campos perdidos junto com a intenção errada, e é a comparável entre modelos que erram intenção em ritmos diferentes.

`confirmações que não gravaram` é sinal de defeito de conversa (o gabarito de "deve" não é confiável, e o agente às vezes pergunta a fazenda em vez de gravar, o que é certo), não critério de aprovação: a porcentagem informa, mas não reprova.

## Modelos

| modelo | aprovado | gravações indevidas | confirmações que não gravaram (informativo) | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos absoluto | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-5.6-luna (low) | sim | 0 | 19 / 27 (70.4%) | 0 / 0 | 0.0% | 0.0% (0) | 0.0% (0) | nenhuma | 100.0% | 100.0% | 100.0% | 100.0% | 0.1796 | 2325 ms | 4542 ms |

## Falhas do modelo por detalhe

Nenhuma.

## Gravações indevidas

Nenhuma.

## Erros de intenção mais frequentes

Nenhum.

## Ordem de preferência

Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.

1. gpt-5.6-luna
