# Avaliação de modelos do agente, Fase 3: rodada final

Partição: final. Gerado em 2026-09-16.

O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.

## Modelos

| modelo | aprovado | gravações indevidas | confirmações que não gravaram | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4.1-mini | não | 0 | 1 | 0 / 0 | 79.4% | 79.4% (56) | 0.0% (0) | registrar_movimentacao_rebanho 66.7% (6) | 97.1% | 97.1% | 100.0% | 0.6563 | 2019 ms | 3286 ms |
| gpt-5-nano (low) | não | 0 | 1 | 0 / 0 | 75.0% | 75.0% (56) | 0.0% (0) | registrar_movimentacao_rebanho 100.0% (6) | 88.7% | 88.7% | 100.0% | 0.3015 | 5130 ms | 8854 ms |
| gpt-5.6-luna (low) | não | 0 | 1 | 0 / 0 | 89.2% | 89.2% (56) | 0.0% (0) | registrar_movimentacao_rebanho 100.0% (6) | 95.9% | 95.9% | 100.0% | 0.2383 | 2425 ms | 4210 ms |
| gpt-5.6-terra (low) | sim | 0 | 1 | 0 / 0 | 96.8% | 96.8% (56) | 0.0% (0) | registrar_movimentacao_rebanho 100.0% (6) | 97.7% | 97.7% | 100.0% | 2.5425 | 2918 ms | 4261 ms |

## Falhas do modelo por detalhe

Nenhuma.

## Gravações indevidas

Nenhuma.

## Erros de intenção mais frequentes

| texto | esperado | obtido | vezes | modelos |
|---|---|---|---|---|
| e hoje o que que tem pra fazer tem conta vencendo | (nenhum: pedido a mais) | ambigua | 2 | gpt-4.1-mini, gpt-5-nano |
| quanto entrou e saiu esse mês | consultar_saldo | ambigua | 2 | gpt-4.1-mini, gpt-5-nano |
| mandei dez boi da boa vista pro sitio sao jose essa semana | registrar_movimentacao_rebanho | registrar_envio_boitel | 1 | gpt-4.1-mini |
| o pedro e mais dois trabalhou quatro dia na rocada cada diaria foi cento e cinquenta | registrar_diaria | cadastrar_servico_ordem | 1 | gpt-4.1-mini |
| gastei duzentos reais de diesel la no posto ipiranga | registrar_lancamento_financeiro | registrar_uso_estoque | 1 | gpt-4.1-mini |
| mandei 8 garrotes da Fazenda Boa Vista pro Sitio Sao Jose | registrar_movimentacao_rebanho | registrar_envio_boitel | 1 | gpt-4.1-mini |
| fiz uma gradagem pra Agropecuaria Santa Fe com o New Holland | registrar_servico_prestado | ambigua | 1 | gpt-4.1-mini |
| entraram 4 vacas no leite e secaram 3 | registrar_entrada_lactacao | ambigua | 1 | gpt-4.1-mini |
| entraram 4 vacas no leite e secaram 3 | registrar_saida_lactacao | (nenhum) | 1 | gpt-4.1-mini |
| manda o relatório da lavoura | gerar_relatorio | ambigua | 1 | gpt-4.1-mini |
| pesei o brinco 1234 hoje, deu 495, e já vacinei ele de aftosa | registrar_vacina | ambigua | 1 | gpt-4.1-mini |
| vou fazer uma roçada fechada pra agropecuária santa fé por 3 mil | registrar_servico_prestado | cadastrar_servico_ordem | 1 | gpt-4.1-mini |
| tem algo atrasado? | consultar_meu_dia | resumo | 1 | gpt-4.1-mini |
| contei o sal mineral aqui hoje, so tem oito saca, entao anota ai pra comprar mais sal | adicionar_item_lista | (nenhum) | 1 | gpt-5-nano |
| o pedro e diarista aqui recebe cento e cinquenta por dia | registrar_trabalhador | ambigua | 1 | gpt-5-nano |
| o pedro e mais dois trabalhou quatro dia na rocada cada diaria foi cento e cinquenta | registrar_diaria | ambigua | 1 | gpt-5-nano |
| quantas vacas eu tenho na Fazenda Boa Vista | consultar_rebanho | ambigua | 1 | gpt-5-nano |
| tenho 25 vacas em lactacao e produzi 420 litros hoje | definir_vacas_em_lactacao | consultar_rebanho | 1 | gpt-5-nano |
| quanto entrou e saiu esse mês | (nenhum: pedido a mais) | ambigua | 1 | gpt-5-nano |
| rodei uma colheita pro pessoal do Sítio Alegre | cadastrar_servico_ordem | registrar_servico_prestado | 1 | gpt-5-nano |
| o Sítio Alegre ainda deve alguma coisa? | consultar_cliente | consultar_saldo | 1 | gpt-5-nano |
| acabei de pagar o Zé Carlos, 2200 | registrar_pagamento_trabalhador | consultar_cliente | 1 | gpt-5-nano |
| bota no sistema uma novilha angus, brinco 87, lá na boa vista | cadastrar_animal | registrar_peso | 1 | gpt-5-nano |
| a aftosa do brinco 1234 vai ficar uns 35, marca pro dia 20 | registrar_previsao_vacina | criar_tarefa | 1 | gpt-5-nano |
| iniciei a gradagem da agropecuária santa fé | iniciar_servico | ambigua | 1 | gpt-5-nano |

## Ordem de preferência

Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.

1. gpt-5.6-terra
2. gpt-4.1-mini: não aprovado (intenção geral 79% < 95%; registrar_movimentacao_rebanho 67% < 85% (6 casos))
3. gpt-5-nano: não aprovado (intenção geral 75% < 95%; campos 89% < 90%)
4. gpt-5.6-luna: não aprovado (intenção geral 89% < 95%)
