# Avaliação de modelos do agente, Fase 3: rodada r2b

Partição: ajuste. Gerado em 2026-09-16.

O limite de 85% por intenção usa todas as notas do resultado gravado, não o filtro de partição acima: gravações indevidas, intenção geral e campos seguem a partição pedida.

## Modelos

| modelo | aprovado | gravações indevidas | confirmações que não gravaram | falhas do modelo (mensagens / passos) | intenção geral | intenção (sem exemplo) | intenção (exemplo) | pior intenção (5+ casos) | campos | campos (sem exemplo) | campos (exemplo) | US$ por 1.000 mensagens | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4.1-mini | não | 0 | 0 | 0 / 0 | 81.9% | 83.4% (137) | 79.3% (84) | registrar_servico_contratado 0.0% (5) | 95.4% | 95.0% | 96.0% | 0.8535 | 1967 ms | 3231 ms |
| gpt-5.6-luna (low) | não | 0 | 0 | 0 / 0 | 92.6% | 94.7% (137) | 89.2% (84) | registrar_producao_servico 20.0% (5) | 96.3% | 96.0% | 96.8% | 0.2564 | 2956 ms | 4908 ms |

## Falhas do modelo por detalhe

Nenhuma.

## Gravações indevidas

Nenhuma.

## Erros de intenção mais frequentes

| texto | esperado | obtido | vezes | modelos |
|---|---|---|---|---|
| já fiz mais 10 hectares no serviço da Agropecuária Santa Fé | registrar_producao_servico | ambigua | 2 | gpt-4.1-mini, gpt-5.6-luna |
| fiz mais 8 hectare pro joão e gastei 60 litro de diesel | registrar_producao_servico | cadastrar_servico_ordem | 2 | gpt-4.1-mini, gpt-5.6-luna |
| ja paguei o Pedro esse mes? | ambigua | consultar_cliente | 1 | gpt-4.1-mini |
| comprei 10 sacas de sal do Ze e tambem anota que morreu uma bezerra, nao anota essa nao | (nenhum: pedido a mais) | registrar_movimentacao_rebanho | 1 | gpt-4.1-mini |
| usei 5 sacas de racao de engorda na Boa Vista e tira o arame farpado da lista, nao tira nada ainda | (nenhum: pedido a mais) | remover_item_lista | 1 | gpt-4.1-mini |
| hoje deu 480 litros de leite e anota que nasceu um bezerro tambem, deixa o bezerro pra eu confirmar depois | (nenhum: pedido a mais) | registrar_movimentacao_rebanho | 1 | gpt-4.1-mini |
| entao eu fui la no leilao e comprei vinte e duas cabeça de bezerro do joao do leilao por sessenta mil pra pagar dia dez | registrar_negocio_gado | ambigua | 1 | gpt-4.1-mini |
| comprei o sal que tava na lista paguei oitocentos reais | comprei_item_lista | registrar_negocio_produto | 1 | gpt-4.1-mini |
| contratei o pedro pra fazer uma cerca fechado por seis mil | registrar_servico_contratado | ambigua | 1 | gpt-4.1-mini |
| hoje avancei mais oito hectare la no servico do joao | registrar_producao_servico | ambigua | 1 | gpt-4.1-mini |
| terminei o servico do joao hoje | encerrar_servico | ambigua | 1 | gpt-4.1-mini |
| me da a relacao de contas a pagar desse mes | resumo | ambigua | 1 | gpt-4.1-mini |
| comprei o arame farpado, foi 1800 | comprei_item_lista | registrar_negocio_produto | 1 | gpt-4.1-mini |
| o que eu tenho pra amanhã e nessa semana | consultar_amanha | ambigua | 1 | gpt-4.1-mini |
| o que eu tenho pra amanhã e nessa semana | consultar_semana | (nenhum) | 1 | gpt-4.1-mini |
| gastei 40 litros de diesel no serviço do João e já terminei | encerrar_servico | (nenhum) | 1 | gpt-4.1-mini |
| terminei o serviço do Zé | encerrar_servico | ambigua | 1 | gpt-4.1-mini |
| comecei o serviço do João, já fiz 8 hectares | iniciar_servico | ambigua | 1 | gpt-4.1-mini |
| comecei o serviço do João, já fiz 8 hectares | registrar_producao_servico | (nenhum) | 1 | gpt-4.1-mini |
| to comecando agora o servico pro marcos | iniciar_servico | ambigua | 1 | gpt-4.1-mini |
| adiantei 500 pro Zé Carlos pra resolver uma coisa | registrar_adiantamento | registrar_lancamento_financeiro | 1 | gpt-4.1-mini |
| fechei um servico de limpeza de pasto com o antonio por quatro mil e quinhentos | registrar_servico_contratado | ambigua | 1 | gpt-4.1-mini |
| o Pedro trabalhou 3 dias fazendo cerca, diária de 150 | registrar_diaria | ambigua | 1 | gpt-4.1-mini |
| tres pessoa trabalhou quatro dia na rocada diaria de cento e oitenta reais | registrar_diaria | ambigua | 1 | gpt-4.1-mini |
| comecei agora o serviço do Sítio Alegre | iniciar_servico | ambigua | 1 | gpt-4.1-mini |

## Ordem de preferência

Aprovados por custo por 1.000 mensagens, depois p95; os não aprovados vêm depois, com o motivo.

1. gpt-4.1-mini: não aprovado (intenção geral 82% < 95%; consultar_estoque 80% < 85% (5 casos); registrar_entrada_confinamento 80% < 85% (5 casos); comprei_item_lista 40% < 85% (5 casos); registrar_adiantamento 80% < 85% (5 casos); registrar_servico_contratado 0% < 85% (5 casos); registrar_producao_servico 0% < 85% (5 casos); criar_tarefa 80% < 85% (5 casos); consultar_amanha 80% < 85% (5 casos))
2. gpt-5.6-luna: não aprovado (intenção geral 93% < 95%; registrar_uso_estoque 80% < 85% (5 casos); registrar_lancamento_financeiro 80% < 85% (5 casos); registrar_entrada_confinamento 80% < 85% (5 casos); registrar_alimentacao_confinamento 60% < 85% (5 casos); registrar_producao_servico 20% < 85% (5 casos))
