---
tipo: decisao
data: 2026-11-19
tags: [producao, suporte, dados, emporio]
origem: scripts/zerar-financeiro-conta.ts, scripts/limpar-demonstracao-conta.ts
---

# Apagar dado de cliente se prova pela digital do que fica, não pela contagem do que sai

## O que aconteceu

Duas limpezas na conta real da Da Mata, as duas a pedido do usuário: em 06/11 a
demonstração (3.688 registros, `scripts/limpar-demonstracao-conta.ts`) e em
19/11 o financeiro, "como se a empresa abrisse hoje, sem perder os orçamentos"
(494 registros, `scripts/zerar-financeiro-conta.ts`). O desenho é o mesmo nos
dois: antes de apagar, tira o md5 das linhas que devem ficar, tabela por
tabela; apaga em passadas (a ordem das chaves estrangeiras se resolve sozinha);
confere o md5 do que sobrou; qualquer diferença desfaz tudo. O de 06/11 lista o
que FICA; o de 19/11 lista o que SAI, porque ali quase tudo fica.

No ensaio local de 19/11, a trava reprovou numa conta de teste com 12
orçamentos faturados: apagar a venda faria o `ON DELETE SET NULL` mudar o
`sale_id` deles. A contagem de linhas batia (12 antes, 12 depois); só o md5 viu
a mudança. Em produção nenhum orçamento estava faturado, e a gravação passou.

Descartado: apagar com `DELETE` à mão tabela por tabela e conferir por
contagem. A contagem não vê a cascata de `SET NULL`, nem a linha que mudou.

## Por que importa

Dado apagado em produção não volta pela tela. Uma cascata que mexe numa linha
que devia ficar (um orçamento perde a venda, um pagamento perde a conta) passa
despercebida até o cliente reclamar, semanas depois.

## Como aplicar

- Pedido de limpar ou zerar dado de uma conta: reuse um dos dois scripts (ou o
  padrão deles), nunca SQL solto. Antes, levante tudo só lendo (inventário por
  tabela com `tenant_id`) e leve ao usuário as decisões que o pedido não
  resolve: o que sai, numeração, Histórico, efeito no estoque.
- Rode nesta ordem: ensaio no banco local (apaga, confere e desfaz), contagem
  em produção (sessão somente leitura), confirmação do usuário com os números,
  e só então `--confirmar`. Prove a trava falhando no ensaio.
- Grave uma linha no Histórico dizendo o que o suporte fez; a ação precisa de
  rótulo em `ACOES_DO_HISTORICO`, senão a tela mostra a chave crua.
- Registre a escrita no handoff: é produção, e outra sessão precisa saber.

## Relacionado

- [[o-guarda-bash-le-vercel-como-deploy-ate-no-nome-do-arquivo]]
