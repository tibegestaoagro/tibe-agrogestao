# Agente do WhatsApp: as 55 intenções, com o estado no Tibé

Data: 2026-09-14. Decisões do usuário tomadas na mesma data, todas nas opções
recomendadas. Material de apoio em `docs/agents/agente-whatsapp/`: a pesquisa
externa e os catálogos de contrato por intenção. A auditoria técnica do
workflow fica fora do repositório até a correção de segurança da Fase 1 (o
repositório é público).

## Por que agora, e por que não em paralelo

O classificador do n8n foi congelado quando cada módulo novo ajustava o prompt
e desalinhava o anterior. Com os módulos no ar, a visão é ampla o bastante para
desenhar uma vez só. O WhatsApp é **canal de entrada**; alertas saem pelo
**aplicativo**. Os testes usam a Evolution API.

## O estado encontrado (auditado em 14/09)

- O Tibé aceita **55** intenções (`src/lib/whatsapp-intents.ts`); o prompt do
  n8n descreve **23**. As 32 restantes têm handler e suíte, e nenhuma é emitida.
- O prompt é um bloco de ~12.800 caracteres no `gpt-4o-mini`, dentro de um nó
  HTTP, sem versão no git e com regras que se contradizem.
- **Confirmação e recusa** vêm de `detectConfirmation`, que casa a PRIMEIRA
  palavra em qualquer mensagem, com ou sem pedido pendente: "pode lançar 500 de
  diesel" e "ok, anota..." contam como sim; "para o João" e "para amanhã" contam
  como não.
- **Resposta curta** a uma pergunta aberta só é entendida se o classificador
  repetir a intenção certa; como `ambigua`, ela se perde. Tarefa, lançamento,
  ordem de serviço e calculadoras nem guardam o pedido.
- **Mensagem com várias intenções**: se uma pede confirmação, o n8n descarta as
  outras respostas, inclusive de registros já gravados. A idempotência por
  `provider_message_id` daria à segunda intenção a resposta da primeira.
- O `provider_message_id` não chega ao Tibé; nenhum nó tem retry, rota de erro
  ou tempo limite; o buffer de 12 s perde mídia em sequência.
- O humanizador (segundo LLM) pode reescrever número e data, e a conferência
  deixa passar troca de linha e "1.200" virando "12,00".
- Achado de segurança no ponto de entrada do workflow, tratado na Fase 1
  (detalhe fora do repositório público até a correção).

### Defeitos de handler que o WhatsApp expõe

1. `registrar_movimentacao_rebanho` com `ajuste` monta origem e destino juntos,
   e o livro-razão recusa: o ajuste pela conversa falha depois do "sim".
2. `registrar_lancamento_financeiro` só cria despesa: "recebi 1.500 de aluguel"
   vira despesa.
3. `registrar_servico_prestado` grava o serviço já concluído, e "comecei",
   "fiz 8 hectares", "terminei" não o encontram; a quantidade prevista entra
   como feita.
4. Combustível de serviço sem saldo lança exceção em vez de responder.
5. Pagamento de trabalhador sem valor previsto não guarda o pendente, e o nome
   se perde.
6. As três intenções de lactação dividem um pendente que não guarda o tipo: um
   "sim" pode gravar entrada onde se perguntou atualização.
7. Um pedido de estoque esperando confirmação toma o "sim" dado a outro domínio.
8. Um cadastro de animal em andamento engole quase todas as outras intenções
   como resposta de campo; o cadastro assistido grava sempre na primeira
   fazenda.
9. `comprei_item_lista` registra compra com valor sem confirmar (§17 e §19.3
   da Lista de Compra).
10. `consultar_saldo` só entende `YYYY-MM`; `gerar_relatorio` ignora o período.
11. Caminhos antigos gravam fora do livro-razão: `registrar_lote_animal` (a
    venda não baixa o saldo), `registrar_movimento` e `cadastrar_animal` sem
    categoria.
12. "Vendi 20 bois do confinamento" classificado como negócio de gado tira as
    cabeças do pasto, não do lote: não há desempate em código.

## Decisões

| # | tema | decisão |
|---|---|---|
| 1 | arquitetura | a pergunta pendente e a confirmação ficam **guardadas no Tibé**; o "sim" executa o guardado; classificação em **duas etapas** (domínio, depois intenção e campos) com formato estrito |
| 2 | onde roda | **no Tibé**: uma rota interna recebe a mensagem consolidada, classifica e executa; o n8n só transporta (webhook, buffer, mídia, envio). Muda a decisão original do PRD de LLM dentro do n8n |
| 3 | modelo | **decidido pela avaliação**: zero gravação indevida, depois acerto de intenção e campos, depois custo e tempo |
| 4 | homologação | **segundo número na Evolution + workflow de homologação + tenant BANCO DE PROVAS**; promoção à produção só com aprovação |
| 5 | alertas | **push primeiro**; WhatsApp só para quem não tem push ativo; email mantido nos críticos |
| 6 | humanizador | **templates** em toda mensagem com valor, quantidade ou data; LLM só em ajuda, "não entendi" e conversa sem número |
| 7 | defeitos | **todos corrigidos antes** de ligar as intenções, com suíte provada falhando |
| 8 | legado | `registrar_lote_animal` e `registrar_movimento` **saem do classificador** (handlers ficam); `cadastrar_animal` fica, gravando no livro-razão |
| 9 | segurança da entrada | corrigida **na Fase 1**; a rotação das 22 credenciais segue adiada |
| 10 | intenções novas | **receita e recebimento** ("recebi 1.500 de aluguel", "o João me pagou", "o João já pagou?") e **pagamento futuro de mão de obra** ("vou pagar o Pedro dia 10"). Leite (tanque, venda) e permuta com máquina ficam fora |
| 11 | tom | **próximo e objetivo**: primeira pessoa, "você", frases curtas, uma pergunta por vez, opções numeradas que aceitam a palavra, emoji só com função |
| 12 | autonomia | livre na homologação, no tenant de provas e no gasto de avaliação; workflow de produção, migração no Neon, merge e push com aprovação a cada vez |

## Desenho

```
Evolution -> n8n (transporte)
   webhook autenticado -> normaliza -> buffer -> mídia (transcreve / lê recibo)
   -> POST /api/internal/whatsapp/turno   { telefone, texto, provider_message_id, mídia }
                         |
                         v
   Tibé: turno de conversa
     1. idempotência pelo provider_message_id (por intenção executada)
     2. identifica o contato (o que resolve-contact faz hoje)
     3. há pedido pendente?  -> o LLM classifica SÓ a resposta:
          confirma | recusa | responde o campo | corrige | outro assunto
        confirma = executa o guardado; recusa = descarta; campo = aplica
     4. sem pendente (ou outro assunto): etapa 1 escolhe o domínio,
        etapa 2 extrai intenção e campos do domínio (JSON Schema estrito)
     5. normaliza em código (parsers), confere trecho literal, roteia ao handler
     6. resposta por template; humanizador só onde não há número
   <- { mensagens: [...] }
n8n envia as mensagens (send-message) e registra falha
```

- **Registro de intenções**: cada intenção declara domínio, descrição, campos
  (nome, tipo, obrigatório, aliases), exemplos e vizinhas. O prompt de cada
  etapa é gerado desse registro; o `npm run check` confere que toda intenção
  de `INTENTS` tem entrada e que nenhuma entrada aponta para intenção
  inexistente.
- **Pendente unificado**: um só "pedido aberto" por conversa, com domínio,
  intenção, parâmetros, campo aguardado e o texto que foi mostrado ao
  produtor. Substitui a disputa entre os pendentes por domínio.
- **Versão do prompt** gravada em cada registro de conversa.
- O `execute-action` atual continua funcionando até a promoção, para o fluxo
  de produção não quebrar no meio.

## Fases

| fase | entrega | depende de |
|---|---|---|
| 1 | Fundação: segurança da entrada, confirmação estrita, idempotência por intenção, os 12 defeitos | nada |
| 2 | Turno no Tibé: pendente unificado, registro de intenções, classificação em duas etapas, templates | 1 |
| 3 | Avaliação: conjunto escrito por subagentes sem contexto, adversarial, e escolha do modelo | 2 |
| 4 | Homologação: workflow fino no n8n, segundo número, blocos de conversa por subagentes testadores | 3 e o chip |
| 5 | Intenções novas: receita, recebimento de serviço, pagamento futuro de mão de obra | 2 |
| 6 | Alertas: push primeiro nos críticos; revisão do resumo diário e do lembrete de cadastro | nada |
| 7 | Promoção: troca do fluxo de produção, semana observada, desligar o caminho antigo | 4, 5 e aprovação |

Cada fase tem plano próprio em `docs/superpowers/plans/`, escrito quando a
anterior fecha: a Fase 3 muda o que a 4 testa, e decidir tudo agora seria
chutar.

## Fase 2: decisões de 15/09/2026

| tema | decisão |
|---|---|
| pedido aberto | **cursor da conversa**: um registro por usuário com a intenção, o campo esperado e o texto mostrado, gravado depois de cada roteamento a partir dos guardadores que já existem. Resposta curta, sim e não vão direto a essa intenção. Os 11 guardadores por área continuam |
| entrada | **rota nova `POST /api/internal/whatsapp/turno`**. O `execute-action` continua igual até a Fase 7 |
| provedor | **OpenAI**, modelo em variável de ambiente (`AGENTE_MODELO`). A Fase 3 compara modelos e só acrescenta outro provedor se ele ganhar. Pendência do usuário: `OPENAI_API_KEY` nas variáveis da Vercel |

Domínios da etapa 1 e suas intenções (legado `registrar_lote_animal` e
`registrar_movimento` fora):

| domínio | intenções |
|---|---|
| rebanho | consultar_rebanho, consultar_animal, registrar_movimentacao_rebanho, registrar_negocio_gado, cadastrar_animal, registrar_peso, registrar_vacina, registrar_previsao_vacina |
| confinamento | registrar_entrada_confinamento, registrar_envio_boitel, registrar_alimentacao_confinamento, encerrar_confinamento |
| eventos_e_permuta | registrar_remessa_evento, encerrar_remessa_evento, registrar_permuta |
| estoque | registrar_negocio_produto, registrar_uso_estoque, ajustar_estoque, consultar_estoque |
| lista_de_compra | adicionar_item_lista, consultar_lista_compra, remover_item_lista, comprei_item_lista |
| leite | registrar_producao_leite, definir_vacas_em_lactacao, registrar_entrada_lactacao, registrar_saida_lactacao |
| mao_de_obra | registrar_trabalhador, registrar_pagamento_trabalhador, registrar_adiantamento |
| servicos | registrar_diaria, registrar_servico_contratado, registrar_servico_prestado, iniciar_servico, registrar_producao_servico, registrar_combustivel_servico, encerrar_servico |
| financeiro | registrar_lancamento_financeiro, consultar_saldo, gerar_relatorio |
| dia | consultar_meu_dia, consultar_amanha, consultar_semana, criar_tarefa |
| calculadoras | calcular_cerca, calcular_sementes, calcular_sal, calcular_racao |
| prestador | cadastrar_servico_ordem, consultar_cliente |
| conversa | ajuda, resumo (e `ambigua` como saída quando nada casa) |

## Fase 3: decisões de 15/09/2026

Chamada real de fumaça antes das decisões (`gpt-4o-mini`): os 13 schemas de
extração foram aceitos no modo estrito; "comprei 20 bezerros do João por 60 mil,
pago dia 10" perdeu valor e vencimento (a etapa de domínio cortou uma ação em
duas); "o que tenho a pagar?" saiu `ambigua`; 4 a 5,5 s por mensagem.

| tema | decisão |
|---|---|
| modelos | **cinco baratos e um teto**: `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-5-nano`, `gpt-5-mini`, `gpt-5.6-luna`, e `gpt-5.6-terra` como referência do quanto o dinheiro compra |
| conjunto | **~300 casos de 5 autores sem contexto do código** (produtor comum, adversarial, áudio transcrito, conversa de várias mensagens, frases do documento do cliente), gabarito revisado por um juiz separado; 70% para ajuste de prompt e 30% guardados só para a nota final |
| aprovação | **zero gravação indevida** (eliminatório), intenção certa em **95%** no geral e **85%** em cada intenção com pelo menos 5 casos, campos certos em **90%**; entre os aprovados, custo e depois tempo |
| orçamento | **até US$ 30** somando todas as rodadas; o executor para sozinho no teto |
| modelo escolhido (16/09) | **`gpt-5.6-luna`, esforço `low`**, decidido pela medição fora da amostra: 97,7% de intenção, 95,7% de campos, zero gravação indevida, p95 de 5,0 s, US$ 0,29 por mil mensagens. O `gpt-5.6-terra` também passou (95,5% e 96,4%) e custa dez vezes mais. Gasto total da avaliação: US$ 4,93. Relatórios em `docs/agents/agente-whatsapp/avaliacao-fase-3-*.md` |

⚠️ **A primeira nota desta fase não valia, e o erro foi de condução.** A rodada 1
rodou e foi relatada sem separar a partição guardada, e as três iterações de
ajuste de prompt foram escritas com esses casos à vista. Medido pela revisão
final: nos mesmos casos da partição final, o `gpt-5.6-terra` saiu de **84,8%
antes do ajuste para 96,8% depois**, ou seja, parte do ganho era o prompt
acertando caso conhecido. O que se sustentava era o RANKING, que já era o mesmo
na rodada 1 sem ajuste nenhum. A correção foi medir de novo com **50 casos
inéditos** (`scripts/avaliacao/casos/forademostra.json`), escritos por um autor
sem acesso ao prompt ajustado, ao código e aos casos antigos: é dessa rodada que
saem os números da linha acima. O relatório agora carimba qualquer resultado que
contenha a partição guardada, para o erro não se repetir.

O ajuste de prompt subiu o `gpt-5.6-luna` de 73,4% para 93,4% de intenção e de 81,7% para 96,9% de campos na partição de ajuste, em três iterações. Os ganhos vieram de três defeitos reais, não de texto melhor: a etapa de domínio decide quais intenções a extração sequer vê (domínio errado vira `ambigua`); campo de mesmo nome em duas intenções do mesmo domínio herdava a descrição da primeira; e a trava anti-alucinação só lia número por extenso até vinte, apagando "sessenta mil" (`trecho-literal.ts`). Os três valem para qualquer modelo.

## Critérios de aceite do programa

- Zero gravação indevida no conjunto de avaliação e nos blocos de homologação
  (recusa, correção no meio, duas coisas numa mensagem, mensagem picada, áudio
  transcrito, resposta curta, "sim" fora de hora).
- As 53 intenções emitidas (55 menos as duas de legado) com acerto medido por
  intenção, e nenhuma abaixo do limite que a Fase 3 fixar.
- Todo texto com valor, quantidade ou data sai de template.
- Mensagem repetida pelo provider não grava duas vezes.
- Falha de LLM ou do Tibé devolve ao produtor uma frase, nunca silêncio.

## Pendências do usuário

- Um segundo chip conectado à Evolution para a homologação (Fase 4).
