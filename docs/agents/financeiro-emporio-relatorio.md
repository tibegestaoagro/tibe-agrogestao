# Financeiro do Empório: relatório de evidências da missão

Missão: executar as quatro entregas da spec
[../superpowers/specs/2026-11-07-emporio-financeiro-design.md](../superpowers/specs/2026-11-07-emporio-financeiro-design.md)
sem o usuário, em branches empilhadas sobre `emporio-financeiro-spec`
(`emporio-financeiro-1` a `-4`), com merge, push na `main`, deploy e migração
no Neon reservados ao usuário, na ordem 1, 2, 3, 4, cada uma com a migração
antes do push.

Cada entrega só conta como pronta com os nove critérios do contrato batidos,
e cada critério vem com o comando e a saída real. Comandos de suíte rodaram
com `DATABASE_URL` do Docker inline (`127.0.0.1:55432`), nunca com o `.env`.

## Entrega 1: a casa do financeiro (branch `emporio-financeiro-1`)

Plano: [../superpowers/plans/2026-11-07-emporio-financeiro-entrega-1.md](../superpowers/plans/2026-11-07-emporio-financeiro-entrega-1.md)
(8 tarefas, autoavaliação da skill writing-plans feita no próprio plano).
Range: `aefba60..` HEAD da branch. Ledger da execução (não versionado):
`.superpowers/sdd/2026-11-07-emporio-financeiro-entrega-1/progress.md`.

| # | critério | evidência |
|---|---|---|
| 1 | plano com autoavaliação | o plano, seção final "Autoavaliação" |
| 2 | migração no Docker e `migrate diff` limpo | `20261107130000_emporio_financeiro_papel` aplicada; `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (URL do Docker inline): `-- This is an empty migration.` |
| 3 | check, tsc, lint, build | `npm run check`: "Repositorio consistente: 0 falhas."; `npx tsc --noEmit`: saída vazia, código 0; `npm run lint`: "0 errors, 13 warnings" (os 13 são `<img>` em arquivos fora da branch, já existiam); `npm run build`: código 0 |
| 4 | suíte nova e `test:all` | `npm run test:m98`: "M98 verde" (244 checagens, 6 seções: matriz do papel, equipe, conta da compra, Empório fora do /financeiro, a casa, isolamento); `npm run test:all -- --sem-redis`: 97/98 na rodada de 08/11, com a `m92` (turno, não tocada nesta branch) vermelha sob o build em paralelo e verde duas vezes sozinha logo depois; repetição final em 08/11, com a máquina quieta: "98/98 passaram, em ~6 min." |
| 5 | isolamento | `npm run test:isolation`: "Isolamento multi-tenant validado: 0 falhas." |
| 6 | roteiro de navegador nos dois sentidos | `npm run navegador -- emporio-financeiro-casa` (9 passos): 0 falhas; com `ehDoEmporio` devolvendo falso, reprovou no passo 7 (o Tibé pagou a conta do Empório); depois do juiz, com a regra de adiar aberta ao Gestor de propósito, reprovou com 2 falhas no passo 9; 0 falhas com o código íntegro nas duas vezes |
| 7 | juiz Opus, 6 critérios | rodada 1: 6/10, reprovado (1 ALTO: o Gestor adiava e cancelava conta; 5 MEDIO; 4 BAIXO); os 10 corrigidos em 8 commits revisados (Opus nas actions, Sonnet nas telas) e 36 checks novos na m98; rodada 2: 8/10, aprovado (C1 8, C2 9, C3 9, C4 9, C5 9, C6 8), zero CRITICO ou ALTO, os 10 antigos dados como resolvidos; os 2 menores da rodada 2 (botões de cheque para o Financeiro, exemplo do /docs/api) corrigidos em seguida |
| 8 | manual e `manual-emporio` | parte "Financeiro das lojas" no manual; `npm run navegador -- manual-emporio`: 0 falhas; PNGs `financeiro-hoje` e `financeiro-pagar` (computador e celular) |
| 9 | dívidas, Q214 a Q237, docs/api, handoff | `dividas.md`: 2.26 fechada, 2.27 fechada como decisão, 2.28 a 2.35 novas; Q214 a Q237 na tabela de `module-39-meu-emporio.md`; `npm run test:docs-api`: 0 falhas; handoff atualizado |

Decisões tomadas sem o usuário (todas registradas no ledger, com o custo se
erradas):

- a Lista de Compra, sem lugar do dinheiro, lança a compra da loja a prazo
  com vencimento no dia (a regra da "nota de ontem" da spec);
- `cancelarPagamentoAction` do Tibé também recusa conta do Empório (lacuna da
  spec, mesmo princípio das outras quatro);
- as páginas de leitura (Despesas, Resultado, Relatórios, Configurações,
  Histórico, Clientes) guardam por `veAPagina`, a mesma lista do menu;
- a ocorrência de despesa fixa cancelada sem o texto "Cancelada:" volta ao
  rateio quando a loja volta (o comportamento de antes do deploy);
- o pagamento de várias contas grava uma linha de Histórico por conta, com a
  compra como alvo quando a conta vem de compra;
- o extrato da Posição de caixa vale para gaveta e gerência, não só conta;
- depositar, compensar e devolver cheque aceitam `dinheiro`.

Antes do deploy desta entrega (com o usuário): `prisma migrate deploy` no
Neon com a URL Direct; nada de ajuste em dado da Agromax (as compras à vista
de antes continuam sem movimento, por decisão da spec).

## Entrega 2: crédito e cobrança (branch `emporio-financeiro-2`)

Plano: [../superpowers/plans/2026-11-08-emporio-financeiro-entrega-2.md](../superpowers/plans/2026-11-08-emporio-financeiro-entrega-2.md)
(8 tarefas, autoavaliação no próprio plano). Range: `emporio-financeiro-1..`
HEAD da branch (18 commits, 50 arquivos). Ledger (não versionado):
`.superpowers/sdd/2026-11-08-emporio-financeiro-entrega-2/progress.md`.

| # | critério | evidência |
|---|---|---|
| 1 | plano com autoavaliação | o plano, seção final "Autoavaliação"; pré-voo do ledger com a tabela de conflitos entre tarefas |
| 2 | migração no Docker e `migrate diff` limpo | `20261108120000_emporio_financeiro_credito` aplicada (`EmporioSettings` e `EmporioCustomer` ganham os campos do fiado; model `EmporioCreditRelease`); `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (URL do Docker inline): `-- This is an empty migration.` |
| 3 | check, tsc, lint, build | `npm run check`: "Repositorio consistente: 0 falhas."; `npx tsc --noEmit`: saída vazia, código 0; `npm run lint`: "0 errors, 13 warnings" (os mesmos 13 de antes da branch); `npm run build`: código 0, "Compiled successfully" |
| 4 | suíte nova e `test:all` | `npm run test:m99`: "M99 verde" (197 checagens: regras puras do prazo e da mensagem, telefone do WhatsApp, configurações do fiado, limite e prazo por cliente com exclusão dias/dia sob concorrência, ficha de crédito por papel e recorte por loja, bloqueio por atraso e por limite com 409 no campo `payments`, liberação consumida uma vez e duas liberações simultâneas gravando uma só, cobrança e Histórico, isolamento entre contas); `npm run test:all -- --sem-redis` em 08/11, com o build já feito: "99/99 passaram, em ~6 min." |
| 5 | isolamento | `npm run test:isolation`: "Isolamento multi-tenant validado: 0 falhas." (`EmporioCreditRelease` em `TENANT_SCOPED_MODELS`) |
| 6 | roteiro de navegador nos dois sentidos | `npm run navegador -- emporio-financeiro-credito` (8 passos, 81 conferências): 0 falhas; com `blocked_by_delay` forçado falso em `estadoDeCredito`, 9 falhas já no passo 2 (o aviso de bloqueio some e a venda fiado fecha em vez de ser recusada); 0 falhas de novo com o código íntegro, e 0 falhas contra o HEAD final da branch |
| 7 | juiz Opus, 6 critérios | rodada 1: 8/10, aprovado (C1 8, C2 10, C3 8, C4 9, C5 9, C6 9), zero CRITICO ou ALTO; 2 MEDIO: o atalho do balcão perdia a venda montada (corrigido: abre a ficha em outra aba) e a conferência do limite fora da transação da venda (dívida 2.37, já registrada); 3 BAIXO: "há 1 dias" na mensagem do cliente (corrigido: `{dias}` sai por extenso), "Sem telefone" quando o que falta é o DDD (corrigido), `fiado.liberar` sem `changes` (fica: o resumo traz o motivo inteiro) |
| 8 | manual e `manual-emporio` | tarefas "Limite, bloqueio e liberação" e "Cobrar fiado vencido" na parte do Fiado, e o Financeiro na parte de função; PNGs `fiado-credito` e `financeiro-cobranca` (computador e celular); `npm run navegador -- manual-emporio` inteiro contra o HEAD final: 0 falhas (uma rodada antes deu 3 falhas em figuras antigas porque os clientes de teste "Cred" do roteiro tiraram a Maria das Dores da primeira página da lista; limpos com `--limpar`, 0 falhas) |
| 9 | dívidas, Q-table, docs/api, handoff | `dividas.md`: 2.35 fechada, 2.36 a 2.38 novas; a entrega 2 na spec do módulo; `npm run test:docs-api`: 0 falhas; handoff atualizado |

Decisões tomadas sem o usuário (todas no ledger):

- o Caixa lê a ficha de crédito (ele precisa do limite e do bloqueio no
  balcão); quem define limite e prazo é `dinheiro`, quem libera é o Gestor
  da loja, quem cobra é `dinheiro`;
- a liberação pontual vale até o fim do dia (São Paulo) e é consumida pela
  primeira venda fiado do cliente naquela loja (dívida 2.38, confirmada
  pelo usuário em 08/11);
- `{dias}` na mensagem de cobrança sai por extenso ("1 dia", "20 dias"),
  para o modelo não precisar saber plural;
- a mensagem de cobrança com mais de 1000 caracteres é recusada (422 no
  campo), não cortada;
- a cobrança não envia nada: abre o WhatsApp do aparelho com o texto e, se o
  pop-up for bloqueado, deixa o link "Abrir o WhatsApp" na lista;
- duas vendas fiado simultâneas do mesmo cliente podem passar as duas pelo
  limite (dívida 2.37; o dano máximo é o valor de uma venda).

Antes do deploy desta entrega (com o usuário): `prisma migrate deploy` no
Neon com a URL Direct. Não há ajuste de dado: fiado antigo sem
`fiado_due_date` vence pela venda mais o prazo padrão da conta.

## Entrega 3: acordo, alçada e carimbo (branch `emporio-financeiro-3`)

Plano: [../superpowers/plans/2026-11-08-emporio-financeiro-entrega-3.md](../superpowers/plans/2026-11-08-emporio-financeiro-entrega-3.md)
(9 tarefas, autoavaliação no próprio plano). Range: `emporio-financeiro-2..`
HEAD da branch. Ledger (não versionado):
`.superpowers/sdd/2026-11-08-emporio-financeiro-entrega-3/progress.md`.

**Nove critérios batidos.** Os critérios 6 e 8 ficaram bloqueados pelo
ambiente de 08/11 de manhã (dev server com o client do Prisma anterior à
migração, sem como reiniciar) e foram fechados à tarde, depois que o usuário
encerrou os processos presos.

| # | critério | evidência |
|---|---|---|
| 1 | plano com autoavaliação | o plano, seção final "Autoavaliação"; pré-voo no ledger com a tabela de conflitos |
| 2 | migração no Docker e `migrate diff` limpo | `20261108180000_emporio_financeiro_acordo_alcada_carimbo` aplicada (models `EmporioCreditAgreement` e `EmporioPaymentRequest`; `FinancialEntry.agreement_id`; `EmporioSettings.payment_approval_limit`; carimbo em `CashMovement` e `CardReceivable`); `migrate diff` (URL do Docker inline): `-- This is an empty migration.` |
| 3 | check, tsc, lint, build | `npm run check`: "Repositorio consistente: 0 falhas."; `npx tsc --noEmit`: vazio, código 0; `npm run lint`: "0 errors, 13 warnings" (os mesmos 13); `npm run build`: código 0, "Compiled successfully in 21.4s" |
| 4 | suíte nova e `test:all` | `npm run test:m100`: "M100 verde" (248 checagens: funções puras; acordo com total igual antes e depois, parcela vencida bloqueia, acordo em dia desbloqueia, Gerente geral 403, devolução abate e em dinheiro com acordo quitado, cheque devolvido vira parcela extra, fila por vencimento, venda em acordo não cancela; alçada com pedido em vez de pagar, aprovar com e sem saldo, dois approve simultâneos, pedido desatualizado, recusar com motivo, as travas em pagar, cancelar, adiar, corrigir, editar e encerrar despesa fixa, cancelar compra e venda; carimbo só em linha de conta, filtro e totais; isolamento); `npm run test:all -- --sem-redis`: "99/100 passaram, em ~5 min", com a `m92` (turno, não tocada) reprovando sob carga e verde sozinha logo depois |
| 5 | isolamento | `npm run test:isolation`: "Isolamento multi-tenant validado: 0 falhas." |
| 6 | roteiro de navegador nos dois sentidos | `TIBE_BASE="http://localhost:3002" npm run navegador -- emporio-financeiro-acordo` (5 passos, dev server do HEAD no worktree `D:/Projetos/tibe-wt2`, 08/11 à tarde): íntegro "RESULTADO: 0 falha(s)" (90 conferências); sabotado (`papel.ts`, a ação `acordo` aceitando `gerente_geral`): saída 1, "RESULTADO: 1 falha(s)", a falha exatamente em "o Gerente geral recebe 403 ao fazer acordo pela API" (veio 422, a regra deixou passar); restaurado: "RESULTADO: 0 falha(s)", 90 conferências. A primeira execução do dia deu 10 falhas por culpa do roteiro, não do código: ele supunha a conta do seed sem outros pedidos e contas (o cenário de demonstração deixa um pedido pendente de R$ 2.400,00 e um Aluguel de R$ 900,00), e clicava no primeiro "Aprovar" da fila; o roteiro passou a filtrar pedidos pela conta Aco Banco, contas pelo Aco Fornecedor e a clicar no botão do cartão certo |
| 7 | juiz Opus, 6 critérios | rodada 1: 6/10, reprovado (2 ALTO: a ocorrência de despesa fixa em pedido pendente ainda mudava de valor e a aprovação pagava o aberto atual sem conferir; a devolução em dinheiro de venda em acordo descontava só a própria venda; 1 MEDIO; 4 BAIXO); corrigidos em 2 commits com 22 checks novos na m100; rodada 2: 8/10, aprovado (C1 8, C2 9, C3 8, C4 9, C5 9, C6 9), os 2 ALTO resolvidos, zero CRITICO ou ALTO; o MEDIO e os 2 BAIXO da rodada 2 corrigidos em seguida |
| 8 | manual e `manual-emporio` | tarefas "Fazer acordo de fiado", "Aprovar um pagamento" e "Conferir o extrato com o carimbo"; `FIGURAS=fiado-acordo,financeiro-aprovacoes,financeiro-extrato TIBE_BASE=... npm run navegador -- manual-emporio`: "RESULTADO: 0 falha(s)", as seis PNGs (computador e celular) gravadas; a figura do extrato ganhou `rolar="M.H('Extrato')"` porque o banco de dev tem 29 lojas de cenários antigos e a tabela de posições empurrava o extrato para fora da janela. Para o pedido pendente da figura das aprovações foi preciso apagar e remontar o cenário de demonstração (`--apagar --confirmar`, só banco local), o que achou dois defeitos do próprio cenário, corrigidos: o `--apagar` não apagava os pedidos de pagamento, os acordos e as liberações (chave estrangeira em `User` e `EmporioCustomer`), e o `montar` não refazia o vínculo de loja de quem já existia (a Gestora sem loja recebia "Estabelecimento não encontrado"). O manual inteiro: ver a linha abaixo da tabela |
| 9 | dívidas, Q-table, docs/api, handoff | `dividas.md`: 2.28 reescrita, 2.39 a 2.44 novas, 2.41 fechada; Q238 (recebimento pelo vencimento) na tabela do módulo, confirmada pelo usuário em 08/11; `npm run test:docs-api`: 0 falhas; handoff atualizado |

Decisões tomadas sem o usuário (todas no ledger):

- a parcela do acordo é uma conta a receber com categoria própria ("Acordo
  de fiado"); a origem fica cancelada e ligada ao acordo; não existe desfazer
  acordo (dívida 2.39);
- o teto da alçada é definido só pelo Dono e pelo Gerente geral;
- a aprovação recusa o pedido se o valor das contas mudou desde o pedido
  (`PEDIDO_DESATUALIZADO`), além de travar todos os caminhos que mudam a
  conta;
- o cheque devolvido de uma origem absorvida vira parcela extra do acordo;
- a devolução em dinheiro de venda em acordo conta o que o cliente pagou no
  acordo inteiro, menos o que já voltou em todas as vendas dele;
- Q238 (confirmada pelo usuário em 08/11): o recebimento de fiado vai
  primeiro ao que vence antes (venda ou parcela), não mais à venda mais
  antiga.

Antes do deploy desta entrega (com o usuário): `prisma migrate deploy` no
Neon com a URL Direct. Não há ajuste de dado.

O manual inteiro (`TIBE_BASE="http://localhost:3003" npm run navegador -- manual-emporio`,
contra o HEAD final, depois de `--limpar` nos cenários Cred, Fin e Aco e da
demonstração remontada): "RESULTADO: 0 falha(s)", 104 imagens gravadas (52
figuras em computador e celular); as PNGs que não mudaram foram restauradas
com `git checkout -- public/manual`. A primeira execução caiu
na figura `caixa-abrir` porque o dev server da 3002 travou (2,5 GB, sem
resposta) e o harness perdeu o IPC; o servidor foi reiniciado na 3003 com o
`.next` limpo.

## Entrega 4: projeção, relatórios e rateio (branch `emporio-financeiro-4`)

Plano: [../superpowers/plans/2026-11-08-emporio-financeiro-entrega-4.md](../superpowers/plans/2026-11-08-emporio-financeiro-entrega-4.md)
(8 tarefas, autoavaliação no próprio plano). Range: `emporio-financeiro-3..`
HEAD da branch. Ledger (não versionado):
`.superpowers/sdd/2026-11-08-emporio-financeiro-entrega-4/progress.md`.

**Nove critérios batidos.** Os gates abaixo foram rodados de novo contra o
HEAD final da branch (depois das quatro rodadas do juiz).

| # | critério | evidência |
|---|---|---|
| 1 | plano com autoavaliação | o plano, seção final "Autoavaliação"; pré-voo no ledger com a tabela de conflitos (10 pares) e três rulings |
| 2 | migração no Docker e `migrate diff` limpo | `20261108220000_emporio_financeiro_rateio_automatico` aplicada (enum `FixedSplitKind` com `faturamento`, `area`, `funcionarios`; `Establishment.area_m2` e `employees_count`); `migrate diff` (URL do Docker inline): `-- This is an empty migration.` |
| 3 | check, tsc, lint, build | `npm run check`: "Repositorio consistente: 0 falhas."; `npx tsc --noEmit`: vazio, código 0; `npm run lint`: "0 errors, 13 warnings" (os mesmos 13); `npm run build`: código 0, "Compiled successfully", 295 páginas (rodado duas vezes: antes e depois das rodadas do juiz) |
| 4 | suíte nova e `test:all` | `npm run test:m101`: "M101 verde (239 checagens)" (funções puras; loja: o Financeiro grava só área e funcionários; rateio: faturamento do mês anterior com devolução, área, funcionários, loja sem base com aviso, nenhuma base vira partes iguais, só o mês corrente nasce e o seguinte pelo gatilho uma vez só mesmo em paralelo, editar recalcula só as futuras não pagas, encerrar, Resultado igual ao de um modelo manual, `CRITERIO_SEM_LOJAS`, base que muda no meio do mês não cobra a mais, troca manual para automático recupera a loja; projeção: saldo igual ao Hoje, vencido na semana 1, cartão de hoje fora e de +10 dias na semana 2, cheque em 60 e não em 30, estimativa das fixas pela regra do mês nascido com a base de hoje, `days` 422, 403; relatórios: faixas de idade, a pagar por semana com o vencido na semana 1, posição por lugar por origem, cartão futuro fora; isolamento); `npm run test:all -- --sem-redis`: "101/101 passaram, em ~6 min" (eram 100 antes desta entrega), rodado duas vezes, a segunda no HEAD final |
| 5 | isolamento | `npm run test:isolation`: "Isolamento multi-tenant validado: 0 falhas." |
| 6 | roteiro de navegador nos dois sentidos | `TIBE_BASE="http://localhost:3003" npm run navegador -- emporio-financeiro-projecao` (5 passos, cenário "Pro "): íntegro "RESULTADO: 0 falha(s)" (83 conferências); sabotado (`rateio.ts`, `ratearPorPeso` sempre em partes iguais): "RESULTADO: 4 falha(s)", todas no passo 2 (a proporção 3:1 vira 38,46/38,46; a loja sem área não fica com zero; o aviso some na API e na tela); restaurado nos dois clones: 0 falhas, 83 conferências; repetido contra o HEAD final, depois das rodadas do juiz: "RESULTADO: 0 falha(s)", 83 conferências (uma rodada intermediária deu 1 falha porque o texto da nota de estimativa mudou com a correção do juiz, e o roteiro foi atualizado). O rateio automático divide entre todas as lojas ativas da conta (Q240), e o banco de dev tem 24: o roteiro confere a proporção entre as duas lojas Pro, a soma do modelo e o zero da loja sem base |
| 7 | juiz Opus, 6 critérios | rodada 1: 7/10, reprovado (3 MEDIO: a troca de manual para automático com conta futura paga gravava 1.250 num modelo de 1.000; a projeção só estimava os modelos automáticos, e a manual com o lote de 12 meses acabado sumia; o teto de 500 contas sem aviso; 6 BAIXO); rodada 2: 6/10 (1 ALTO: o mês corrente com conta paga ainda era refeito na troca); rodada 3: 6/10 (1 ALTO: o mês fechado só valia na edição da troca, e renomear o modelo reabria); rodada 4: 9/10, APROVADO (C1 9, C2 10, C3 9, C4 10, C5 10, C6 9), zero CRITICO ou ALTO. Cada rodada gerou commit com o caso na m101, provado nos dois sentidos |
| 8 | manual e `manual-emporio` | tarefas "Ver o fluxo projetado" e "Relatórios do dinheiro" (casa do financeiro) e "Rateio automático da despesa fixa" (despesas); `FIGURAS=financeiro-projecao,financeiro-relatorios,despesa-rateio-automatico ... manual-emporio`: 0 falhas, 6 PNGs conferidas a olho; o manual inteiro: 124 ok e 1 falha em `financeiro-hoje` (celular), porque as abas novas Projeção e Relatórios ganharam uma linha e a marca saiu da janela; `hc` de 1500 para 1700 e a figura reconferida: 0 falhas; PNGs que não mudaram restauradas com `git checkout -- public/manual` |
| 9 | dívidas, Q-table, docs/api, handoff | `dividas.md`: 2.45 a 2.53 novas (gráfico, PDF/planilha, conta bancária fora da projeção por loja, loja nova no faturamento, ocorrência só nasce no acesso, conta sem vencimento fora, teto de 500 contas, splits zerados nos automáticos, loja que ganha base no meio do mês); Q239 a Q243 na tabela do módulo, a confirmar; `/docs/api` com as quatro rotas novas e os campos novos (e a permissão da despesa fixa, que dizia OWNER e ADMIN); `npm run test:docs-api`: 0 falhas; handoff atualizado |

Decisões tomadas sem o usuário (todas no ledger e na Q-table):

- Q239: os relatórios do dinheiro ficam na casa do financeiro (aba
  Relatórios), com uma linha de ligação na página Relatórios do Empório;
- Q240: o critério automático divide entre TODAS as lojas ativas no momento
  em que a ocorrência nasce (sem `FixedExpenseSplit` com valor; as linhas
  ficam zeradas) e por isso exige ver todas as lojas (`CRITERIO_SEM_LOJAS`);
- Q241: a receber por idade é retrato de hoje, sem período;
- Q242: por loja, a projeção e a posição por lugar deixam a conta bancária
  de fora (a conta é da rede), com nota na tela;
- Q243: no a pagar por vencimento o vencido entra sempre na primeira semana,
  em destaque, mesmo anterior ao início do período (a spec pedia "vencido em
  destaque" e o padrão `de` = hoje o escondia);
- o mês do modelo conta como nascido quando já tem ocorrência: a base que
  muda no meio do mês (área preenchida depois, loja nova) só entra no mês
  seguinte ou num editar; nenhuma base em loja alguma vira partes iguais
  com aviso; `renovar` é inócuo em modelo automático;
- em modelo automático, o mês (corrente ou futuro) que já tem conta paga é
  fechado: nenhuma edição (troca de critério, renomear, mudar o valor) cancela
  nem recalcula as irmãs dele, e o gatilho não mexe nele (juiz, rodadas 1 a
  3); no manual as partes são fixas por loja e recalcular a irmã não paga é o
  comportamento de sempre;
- a projeção e o a pagar por vencimento olham até 5.000 contas e avisam ao
  bater o teto; a projeção estima as fixas de todos os critérios nos meses
  sem conta gerada (as automáticas com a base de hoje).

A confirmar com o usuário, além das Q239 a Q243: a receber por idade sem
período (Q241) e as partes iguais quando nenhuma loja tem base.

Antes do deploy desta entrega (com o usuário): `prisma migrate deploy` no
Neon com a URL Direct. Não há ajuste de dado: as lojas nascem sem área e sem
funcionários, e os modelos existentes continuam em percentual ou valor.

## Ajuste de 09/11: frete, origem e editar venda

Frete cobrado do cliente na venda (Q244 a Q247), origem balcão ou e-commerce
(Q248) e Editar venda por substituição (Q249). Evidências:

| prova | resultado |
|---|---|
| `test:m102` | 71/71 |
| roteiro `emporio-frete-ecommerce` (balcão, recibo, lista, detalhe, A pagar, Resultado, Editar, celular) | 47 checks, 0 falhas |
| sabotagem (gravação de `freight_amount` comentada em `gravarVenda`) | 8 falhas, 39 ok; desfeita, volta a 47 ok |
| `npm run check`, `tsc`, `lint` | limpos na rodada do manual |

Dívidas abertas: 2.54 (relatório por origem) e 2.55 (frete ao editar venda em
acordo ou com devolução).

## Entrega 1 das taxas de cartão, 09/11

Adquirente e bandeira por venda, taxa por faixa de parcelas e taxa fixa, com
vigência em datas, em Configurações (Q250 a Q258). Evidências:

| prova | resultado |
|---|---|
| `test:m103` | 89 checks |
| roteiro `emporio-cartoes` | 48 checks, 0 falhas (Caixa sem o bloco de taxas, balcão com bandeira e adquirente, prévia 4,5% e líquido R$ 95,50, detalhe, recibo, Cartões a receber, Configurações: criar, sobreposição recusada no campo, nova vigência, em uso) |
| sabotagem (`resolverTaxa` ignora a bandeira) | 3 falhas, 45 ok (os passos de bandeira sem taxa própria: Amex no parcelado e Elo na Cielo); desfeita, volta a 48 ok |
| `emporio-f3b` (roteiro antigo do cartão) | 41 checks, 0 falhas, depois de ajustar o roteiro à bandeira obrigatória e ao bloco de taxas fora do Caixa |

Dívidas: 2.25 parcialmente fechada (a taxa por parcelas saiu), 2.28 destravada
(a adquirente é a Stone), e novas 2.56 (taxa por parcela no recebível e dia
útil), 2.57 (antecipação) e 2.58 (extrato da Stone).
