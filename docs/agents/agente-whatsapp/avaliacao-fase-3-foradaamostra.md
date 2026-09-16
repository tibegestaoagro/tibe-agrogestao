# Avaliação de modelos do agente, Fase 3: rodada foradaamostra

Partição: todas. Casos de forademostra.json. Gerado em 2026-09-16.

O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.

`campos` é a coluna do limite de 90%: mede só os pedidos cuja intenção acertou. `campos absoluto` mede na base que inclui os campos perdidos junto com a intenção errada, e é a comparável entre modelos que erram intenção em ritmos diferentes.

`confirmações que não gravaram` é sinal de defeito de conversa (o gabarito de "deve" não é confiável, e o agente às vezes pergunta a fazenda em vez de gravar, o que é certo), não critério de aprovação: a porcentagem informa, mas não reprova.

## Modelos

| modelo | aprovado | gravações indevidas | confirmações que não gravaram (informativo) | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos absoluto | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-5.6-luna (low) | sim | 0 | 4 / 5 (80.0%) | 0 / 0 | 97.7% | 97.7% (38) | 0.0% (0) | registrar_movimentacao_rebanho 100.0% (5) | 95.7% | 92.4% | 95.7% | 100.0% | 0.2879 | 2550 ms | 5029 ms |
| gpt-5.6-terra (low) | sim | 0 | 3 / 5 (60.0%) | 0 / 0 | 95.5% | 95.5% (38) | 0.0% (0) | registrar_movimentacao_rebanho 100.0% (5) | 96.4% | 90.8% | 96.4% | 100.0% | 2.8459 | 3173 ms | 5742 ms |

## Falhas do modelo por detalhe

Nenhuma.

## Gravações indevidas

Nenhuma.

## Erros de intenção mais frequentes

| texto | esperado | obtido | vezes | modelos |
|---|---|---|---|---|
| a próxima vacina de brucelose do brinco 1234 vai custar 80, dia 20 | registrar_previsao_vacina | ambigua | 1 | gpt-5.6-luna |
| e ai comprei quinze garrote do joao do leilao quarenta e cinco mil pago dia quinze e tambem morreu uma vaca no pasto da sede ontem | registrar_negocio_gado | ambigua | 1 | gpt-5.6-terra |
| terminei o serviço da Santa Fé e paguei o adiantamento de 500 pro Zé Carlos | registrar_adiantamento | ambigua | 1 | gpt-5.6-terra |

## Ordem de preferência

Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.

1. gpt-5.6-luna
2. gpt-5.6-terra
