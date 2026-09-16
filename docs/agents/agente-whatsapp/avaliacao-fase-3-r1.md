# Avaliação de modelos do agente, Fase 3: rodada r1

Partição: todas. Gerado em 2026-09-15.

O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.

## Modelos

| modelo | aprovado | gravações indevidas | confirmações que não gravaram | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4.1-mini | não | 0 | 1 | 0 / 0 | 73.6% | 71.9% (193) | 77.7% (84) | cadastrar_servico_ordem 0.0% (5) | 82.6% | 82.1% | 83.8% | 0.6965 | 1912 ms | 3106 ms |
| gpt-4o-mini | não | 0 | 1 | 1 / 0 | 60.1% | 60.2% (193) | 59.8% (84) | cadastrar_servico_ordem 0.0% (5) | 74.7% | 72.9% | 78.6% | 0.3240 | 1826 ms | 3477 ms |
| gpt-5-mini (low) | não | 0 | 1 | 0 / 0 | 67.3% | 66.9% (193) | 68.1% (84) | cadastrar_servico_ordem 0.0% (5) | 81.2% | 80.1% | 83.8% | 1.1090 | 8508 ms | 15840 ms |
| gpt-5-nano (low) | não | 0 | 1 | 0 / 1 | 70.4% | 68.1% (193) | 76.0% (84) | cadastrar_servico_ordem 0.0% (5) | 81.1% | 80.3% | 82.7% | 0.3358 | 5716 ms | 9665 ms |
| gpt-5.6-luna (low) | não | 0 | 1 | 0 / 0 | 73.4% | 75.0% (193) | 69.9% (84) | cadastrar_servico_ordem 0.0% (5) | 81.7% | 81.2% | 83.1% | 0.3784 | 2788 ms | 4599 ms |
| gpt-5.6-terra (low) | não | 0 | 1 | 0 / 0 | 79.6% | 80.7% (193) | 77.1% (84) | resumo 0.0% (5) | 82.9% | 83.3% | 81.8% | 3.5962 | 3085 ms | 5212 ms |

## Falhas do modelo por detalhe

- gpt-4o-mini: o modelo não respondeu a tempo (1)

## Gravações indevidas

Nenhuma.

## Erros de intenção mais frequentes

| texto | esperado | obtido | vezes | modelos |
|---|---|---|---|---|
| usei 5 sacas de racao de engorda na Boa Vista e tira o arame farpado da lista, nao tira nada ainda | (nenhum: pedido a mais) | remover_item_lista | 7 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| hoje deu 480 litros de leite e anota que nasceu um bezerro tambem, deixa o bezerro pra eu confirmar depois | (nenhum: pedido a mais) | registrar_movimentacao_rebanho | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| manda a previsao do tempo pra semana e tambem anota que comprei 10 sacas de racao por 800 | registrar_negocio_produto | ambigua | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| manda a previsao do tempo pra semana e tambem anota que comprei 10 sacas de racao por 800 | (nenhum: pedido a mais) | registrar_negocio_produto | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| vendi treze boi pro frigorifico bom boi ali por cento e trinta mil e ainda paguei dois mil de frete | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| coloquei quinze garrote no confinamento boa vista hoje eles sairam do pasto da sede | (nenhum: pedido a mais) | registrar_movimentacao_rebanho | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| poe na lista sal e tambem duas caixa de ivermectina | (nenhum: pedido a mais) | adicionar_item_lista | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| vacinei o brinco 1234 de aftosa, custou 35 | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| troquei 10 novilhas por um trator, paguei 20 mil de diferenca | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| comprei o arame farpado, foi 1800 | comprei_item_lista | registrar_negocio_produto | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| e hoje o que que tem pra fazer tem conta vencendo | (nenhum: pedido a mais) | ambigua | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| quero o relatório do prestador em pdf | gerar_relatorio | ambigua | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| a aftosa do brinco 1234 vai ficar uns 35, marca pro dia 20 | (nenhum: pedido a mais) | criar_tarefa | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| comprei o arame farpado, deu 800, foi a prazo | comprei_item_lista | registrar_negocio_produto | 6 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| vende minha fazenda pra mim, arruma um comprador | (nenhum: pedido a mais) | ambigua | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna |
| vacinei o brinco mil duzentos e trinta e quatro de aftosa hoje custou trinta e cinco reais | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.6-luna, gpt-5.6-terra |
| olha a brucelose do brinco mil duzentos e trinta e quatro vai custar oitenta reais quando fizer dia vinte | (nenhum: pedido a mais) | ambigua | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.6-luna |
| comprei o sal que tava na lista paguei oitocentos reais | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.6-luna, gpt-5.6-terra |
| Comprei 20 bezerros por 60 mil pra pagar dia 10 de setembro | (nenhum: pedido a mais) | ambigua | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.6-luna, gpt-5.6-terra |
| manda o relatório da lavoura | gerar_relatorio | ambigua | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-terra |
| vacinei o brinco 1234 de brucelose, custou 40 | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.6-luna, gpt-5.6-terra |
| dei 15 novilha e recebi 10 vaca, ainda paguei 5 mil de diferença | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5.6-luna, gpt-5.6-terra |
| quero o relatório do rebanho em pdf | gerar_relatorio | ambigua | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |
| fiz 2 gradagem pra agropecuária santa fé | cadastrar_servico_ordem | registrar_servico_prestado | 5 | gpt-4.1-mini, gpt-4o-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna |
| quanto o joão já pagou? | consultar_cliente | ambigua | 5 | gpt-4.1-mini, gpt-5-mini, gpt-5-nano, gpt-5.6-luna, gpt-5.6-terra |

## Ordem de preferência

Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.

1. gpt-4.1-mini: não aprovado (intenção geral 74% < 95%; ambigua 67% < 85% (9 casos); cadastrar_servico_ordem 0% < 85% (5 casos); registrar_combustivel_servico 80% < 85% (5 casos); registrar_entrada_confinamento 83% < 85% (6 casos); registrar_vacina 80% < 85% (5 casos); registrar_previsao_vacina 60% < 85% (5 casos); consultar_animal 60% < 85% (5 casos); comprei_item_lista 0% < 85% (5 casos); registrar_trabalhador 80% < 85% (5 casos); registrar_pagamento_trabalhador 80% < 85% (5 casos); registrar_diaria 0% < 85% (5 casos); registrar_servico_contratado 80% < 85% (5 casos); encerrar_servico 80% < 85% (5 casos); gerar_relatorio 40% < 85% (5 casos); criar_tarefa 80% < 85% (5 casos); consultar_semana 80% < 85% (5 casos); resumo 20% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos); consultar_cliente 0% < 85% (5 casos); campos 83% < 90%)
2. gpt-4o-mini: não aprovado (intenção geral 60% < 95%; registrar_movimentacao_rebanho 79% < 85% (19 casos); cadastrar_servico_ordem 0% < 85% (5 casos); registrar_negocio_gado 75% < 85% (12 casos); registrar_combustivel_servico 40% < 85% (5 casos); registrar_entrada_confinamento 83% < 85% (6 casos); registrar_permuta 83% < 85% (6 casos); registrar_previsao_vacina 40% < 85% (5 casos); consultar_animal 0% < 85% (5 casos); registrar_alimentacao_confinamento 60% < 85% (5 casos); ajustar_estoque 80% < 85% (5 casos); comprei_item_lista 0% < 85% (5 casos); registrar_trabalhador 80% < 85% (5 casos); registrar_diaria 20% < 85% (5 casos); registrar_servico_contratado 80% < 85% (5 casos); gerar_relatorio 40% < 85% (5 casos); criar_tarefa 40% < 85% (5 casos); consultar_meu_dia 80% < 85% (5 casos); resumo 0% < 85% (5 casos); registrar_servico_prestado 60% < 85% (5 casos); ajuda 80% < 85% (5 casos); calcular_racao 80% < 85% (5 casos); consultar_cliente 80% < 85% (5 casos); campos 75% < 90%)
3. gpt-5-mini: não aprovado (intenção geral 67% < 95%; ambigua 78% < 85% (9 casos); cadastrar_servico_ordem 0% < 85% (5 casos); registrar_combustivel_servico 80% < 85% (5 casos); adicionar_item_lista 83% < 85% (6 casos); registrar_entrada_confinamento 83% < 85% (6 casos); registrar_permuta 83% < 85% (6 casos); registrar_previsao_vacina 60% < 85% (5 casos); consultar_animal 80% < 85% (5 casos); registrar_alimentacao_confinamento 40% < 85% (5 casos); ajustar_estoque 80% < 85% (5 casos); comprei_item_lista 40% < 85% (5 casos); definir_vacas_em_lactacao 80% < 85% (5 casos); registrar_pagamento_trabalhador 80% < 85% (5 casos); registrar_diaria 20% < 85% (5 casos); registrar_servico_contratado 60% < 85% (5 casos); encerrar_servico 80% < 85% (5 casos); gerar_relatorio 40% < 85% (5 casos); criar_tarefa 80% < 85% (5 casos); calcular_sal 80% < 85% (5 casos); resumo 0% < 85% (5 casos); registrar_servico_prestado 80% < 85% (5 casos); ajuda 60% < 85% (5 casos); calcular_racao 80% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos); iniciar_servico 80% < 85% (5 casos); remover_item_lista 80% < 85% (5 casos); consultar_cliente 60% < 85% (5 casos); campos 81% < 90%)
4. gpt-5-nano: não aprovado (intenção geral 70% < 95%; ambigua 67% < 85% (9 casos); cadastrar_servico_ordem 0% < 85% (5 casos); registrar_negocio_gado 83% < 85% (12 casos); registrar_lancamento_financeiro 83% < 85% (6 casos); registrar_combustivel_servico 60% < 85% (5 casos); adicionar_item_lista 83% < 85% (6 casos); registrar_producao_leite 71% < 85% (7 casos); registrar_previsao_vacina 40% < 85% (5 casos); registrar_envio_boitel 80% < 85% (5 casos); registrar_alimentacao_confinamento 60% < 85% (5 casos); ajustar_estoque 80% < 85% (5 casos); comprei_item_lista 0% < 85% (5 casos); definir_vacas_em_lactacao 60% < 85% (5 casos); registrar_trabalhador 60% < 85% (5 casos); registrar_pagamento_trabalhador 80% < 85% (5 casos); registrar_diaria 20% < 85% (5 casos); registrar_servico_contratado 40% < 85% (5 casos); registrar_producao_servico 60% < 85% (5 casos); encerrar_servico 80% < 85% (5 casos); gerar_relatorio 20% < 85% (5 casos); criar_tarefa 60% < 85% (5 casos); consultar_meu_dia 80% < 85% (5 casos); consultar_semana 60% < 85% (5 casos); resumo 0% < 85% (5 casos); ajuda 60% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos); iniciar_servico 80% < 85% (5 casos); consultar_cliente 20% < 85% (5 casos); campos 81% < 90%)
5. gpt-5.6-luna: não aprovado (intenção geral 73% < 95%; ambigua 78% < 85% (9 casos); cadastrar_servico_ordem 0% < 85% (5 casos); registrar_combustivel_servico 80% < 85% (5 casos); registrar_entrada_confinamento 83% < 85% (6 casos); registrar_permuta 83% < 85% (6 casos); registrar_previsao_vacina 40% < 85% (5 casos); consultar_animal 80% < 85% (5 casos); registrar_alimentacao_confinamento 60% < 85% (5 casos); comprei_item_lista 40% < 85% (5 casos); registrar_saida_lactacao 80% < 85% (5 casos); registrar_adiantamento 80% < 85% (5 casos); encerrar_servico 80% < 85% (5 casos); gerar_relatorio 40% < 85% (5 casos); consultar_semana 80% < 85% (5 casos); resumo 60% < 85% (5 casos); ajuda 80% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos); iniciar_servico 80% < 85% (5 casos); consultar_cliente 0% < 85% (5 casos); campos 82% < 90%)
6. gpt-5.6-terra: não aprovado (intenção geral 80% < 95%; cadastrar_servico_ordem 20% < 85% (5 casos); registrar_alimentacao_confinamento 60% < 85% (5 casos); comprei_item_lista 40% < 85% (5 casos); encerrar_servico 60% < 85% (5 casos); gerar_relatorio 40% < 85% (5 casos); consultar_semana 80% < 85% (5 casos); resumo 0% < 85% (5 casos); registrar_servico_prestado 20% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos); iniciar_servico 80% < 85% (5 casos); consultar_cliente 20% < 85% (5 casos); campos 83% < 90%)
