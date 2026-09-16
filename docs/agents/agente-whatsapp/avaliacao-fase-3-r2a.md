# Avaliação de modelos do agente, Fase 3: rodada r2a

Partição: ajuste. Gerado em 2026-09-16.

O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.

## Modelos

| modelo | aprovado | gravações indevidas | confirmações que não gravaram | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4.1-mini | não | 0 | 0 | 0 / 0 | 82.0% | 81.4% (137) | 83.0% (84) | registrar_servico_contratado 40.0% (5) | 84.1% | 83.3% | 85.2% | 0.7841 | 2075 ms | 3393 ms |
| gpt-5.6-luna (low) | não | 0 | 0 | 0 / 0 | 89.9% | 89.0% (137) | 91.3% (84) | registrar_uso_estoque 60.0% (5) | 84.2% | 84.4% | 83.9% | 0.4044 | 2965 ms | 4655 ms |

## Falhas do modelo por detalhe

Nenhuma.

## Gravações indevidas

Nenhuma.

## Erros de intenção mais frequentes

| texto | esperado | obtido | vezes | modelos |
|---|---|---|---|---|
| fiz uns hectares de gradagem pro Joao | cadastrar_servico_ordem | ambigua | 2 | gpt-4.1-mini, gpt-5.6-luna |
| coloquei quinze garrote no confinamento boa vista hoje eles sairam do pasto da sede | (nenhum: pedido a mais) | registrar_movimentacao_rebanho | 2 | gpt-4.1-mini, gpt-5.6-luna |
| entraram 8 boi no confinamento boa vista, saíram da própria boa vista | (nenhum: pedido a mais) | ambigua | 2 | gpt-4.1-mini, gpt-5.6-luna |
| tirei 10 boi do confinamento boa vista, venderam por 90 mil | (nenhum: pedido a mais) | ambigua | 2 | gpt-4.1-mini, gpt-5.6-luna |
| saíram 2 vaca do leite, foram pro confinamento | registrar_entrada_confinamento | ambigua | 2 | gpt-4.1-mini, gpt-5.6-luna |
| terminei o serviço do joão | encerrar_servico | ambigua | 2 | gpt-4.1-mini, gpt-5.6-luna |
| vendi quantos bois esse mes? | ambigua | consultar_rebanho | 1 | gpt-4.1-mini |
| ja paguei o Pedro esse mes? | ambigua | consultar_cliente | 1 | gpt-4.1-mini |
| gastei quanto de diesel essa semana? | ambigua | consultar_estoque | 1 | gpt-4.1-mini |
| comprei 10 sacas de sal do Ze e tambem anota que morreu uma bezerra, nao anota essa nao | (nenhum: pedido a mais) | registrar_movimentacao_rebanho | 1 | gpt-4.1-mini |
| usei 5 sacas de racao de engorda na Boa Vista e tira o arame farpado da lista, nao tira nada ainda | (nenhum: pedido a mais) | remover_item_lista | 1 | gpt-4.1-mini |
| entao eu fui la no leilao e comprei vinte e duas cabeça de bezerro do joao do leilao por sessenta mil pra pagar dia dez | registrar_negocio_gado | ambigua | 1 | gpt-4.1-mini |
| poe na lista sal e tambem duas caixa de ivermectina | (nenhum: pedido a mais) | adicionar_item_lista | 1 | gpt-4.1-mini |
| comprei o sal que tava na lista paguei oitocentos reais | (nenhum: pedido a mais) | registrar_lancamento_financeiro | 1 | gpt-4.1-mini |
| contratei o pedro pra fazer uma cerca fechado por seis mil | registrar_servico_contratado | ambigua | 1 | gpt-4.1-mini |
| terminei o servico do joao hoje | encerrar_servico | ambigua | 1 | gpt-4.1-mini |
| Comprei 20 bezerros por 60 mil pra pagar dia 10 de setembro | (nenhum: pedido a mais) | consultar_saldo | 1 | gpt-4.1-mini |
| comprei o arame farpado, foi 1800 | comprei_item_lista | ambigua | 1 | gpt-4.1-mini |
| ja comprei o arame la mas foi fiado | (nenhum: pedido a mais) | ambigua | 1 | gpt-4.1-mini |
| o que eu tenho pra amanhã e nessa semana | consultar_amanha | ambigua | 1 | gpt-4.1-mini |
| o que eu tenho pra amanhã e nessa semana | consultar_semana | (nenhum) | 1 | gpt-4.1-mini |
| gastei 40 litros de diesel no serviço do João e já terminei | encerrar_servico | (nenhum) | 1 | gpt-4.1-mini |
| terminei o serviço do Zé | encerrar_servico | ambigua | 1 | gpt-4.1-mini |
| comecei o serviço do João, já fiz 8 hectares | iniciar_servico | ambigua | 1 | gpt-4.1-mini |
| comecei o serviço do João, já fiz 8 hectares | registrar_producao_servico | (nenhum) | 1 | gpt-4.1-mini |

## Ordem de preferência

Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.

1. gpt-4.1-mini: não aprovado (intenção geral 82% < 95%; ambigua 57% < 85% (7 casos); consultar_estoque 80% < 85% (5 casos); registrar_entrada_confinamento 80% < 85% (5 casos); comprei_item_lista 60% < 85% (5 casos); registrar_servico_contratado 40% < 85% (5 casos); registrar_producao_servico 40% < 85% (5 casos); criar_tarefa 80% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos); campos 84% < 90%)
2. gpt-5.6-luna: não aprovado (intenção geral 90% < 95%; ambigua 71% < 85% (7 casos); registrar_uso_estoque 60% < 85% (5 casos); registrar_entrada_confinamento 80% < 85% (5 casos); registrar_alimentacao_confinamento 60% < 85% (5 casos); criar_tarefa 80% < 85% (5 casos); campos 84% < 90%)
