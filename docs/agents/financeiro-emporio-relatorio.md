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
  primeira venda fiado do cliente naquela loja (dívida 2.38 pede
  confirmação);
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

Não começou.

## Entrega 4: projeção, relatórios e rateio (branch `emporio-financeiro-4`)

Não começou.
