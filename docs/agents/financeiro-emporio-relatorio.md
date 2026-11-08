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
| 4 | suíte nova e `test:all` | `npm run test:m98`: "M98 verde" (244 checagens, 6 seções: matriz do papel, equipe, conta da compra, Empório fora do /financeiro, a casa, isolamento); `npm run test:all -- --sem-redis`: 97/98 na rodada de 08/11, com a `m92` (turno, não tocada nesta branch) vermelha sob o build em paralelo e verde duas vezes sozinha logo depois; repetição final: ver abaixo |
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

Plano: [../superpowers/plans/2026-11-08-emporio-financeiro-entrega-2.md](../superpowers/plans/2026-11-08-emporio-financeiro-entrega-2.md).
Em execução; esta seção é preenchida ao fim.

## Entrega 3: acordo, alçada e carimbo (branch `emporio-financeiro-3`)

Não começou.

## Entrega 4: projeção, relatórios e rateio (branch `emporio-financeiro-4`)

Não começou.
