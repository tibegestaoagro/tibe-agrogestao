---
tipo: design
data: 2026-11-09
modulo: 39 (Meu Empório)
origem: decisão do usuário em 09/11 ("faça o que você pode sem esperar ninguém"); dívidas 2.39, 2.40 e 2.53; decisões Q275 a Q277
---

# Meu Empório: desfazer acordo, aviso de pedido por email e recalcular o mês

Três dívidas que não dependem de ninguém e corrigem dor real: um acordo de
fiado errado hoje só se corrige por fora; o pedido de pagamento acima do
teto só avisa quem tem WhatsApp cadastrado; e a loja que nasce ou ganha base
no meio do mês só entra no rateio automático no mês seguinte. As decisões
entram na tabela de `docs/specs/module-39-meu-emporio.md` como **Q275 a
Q277**.

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| Q275 | **Desfazer acordo de fiado (2.39):** `desfazerAcordoAction(db, ator, acordoId, { reason })` e `POST /customers/:id/agreements/:aid/undo`. Permitido só se **nenhuma parcela teve pagamento** (nem parcial), nenhuma foi abatida por devolução e não há parcela extra de cheque devolvido; senão `ACORDO_COM_MOVIMENTO` 409 dizendo o que impede. Efeito, numa transação serializável: as parcelas (`CATEGORIA_ACORDO`, `agreement_id` do acordo) viram `cancelled`; as origens (os lançamentos que o acordo absorveu) voltam a `pending` com `agreement_id` nulo, com o vencimento que tinham; o acordo ganha `undone_at`, `undone_by_user_id` e `undone_reason` (migração); histórico `fiado.acordo.desfazer`. Permissão igual à de fazer o acordo (Financeiro e Dono, Q233). A tela do cliente mostra "Desfazer acordo" quando permitido e o acordo desfeito fica listado como "Desfeito em DD/MM: motivo". | Acordo com parcela paga já moveu dinheiro: desfazer nesse caso pede estorno, que é outra conversa; sem movimento, voltar ao estado anterior é seguro e é o caso do erro de digitação. |
| Q276 | **Aviso de pedido de pagamento também por email (2.40):** `avisarAprovadores` manda, além do WhatsApp (para quem tem telefone), um email para todo Dono e Gerente geral ativo, com valor, fornecedor ou categoria, vencimento, quem pediu e o link para `/emporio/financeiro/aprovacoes`, por `sendEmail` (com `EmailLog`) e um template novo em `src/lib/email-templates.ts`. Falha de envio não impede o pedido (como hoje com o WhatsApp). Sem preferência por usuário (não existe e não há pedido). | Quem aprova sem telefone cadastrado hoje só vê o pedido se abrir o Hoje. |
| Q277 | **Recalcular o mês do rateio automático (2.53):** `recalcularMesDaDespesaFixaAction(db, ator, modeloId, { month })` e `POST /fixed-expenses/:id/recalculate`. Só para modelo automático (`faturamento`, `area`, `funcionarios`), mês corrente ou futuro, e **mês não fechado** (nenhuma ocorrência paga do modelo no mês: a regra Q240 e a lição do cofre `o-mes-que-ja-tem-conta-paga-nao-se-recalcula`); senão 409 `MES_FECHADO`. Efeito, numa transação: as ocorrências não pagas do mês viram `cancelled` com a nota `NOTA_RECALCULADO`, e nascem de novo por `ratearOMes` com as lojas ativas e as bases de hoje; histórico `despesa.fixa.recalcular`. O gatilho de leitura (`garantirOcorrenciasDoMes`) trata a nota nova como trata `NOTA_VIROU_AUTOMATICO` (o mês continua "nascido"). Botão "Recalcular este mês" na despesa fixa automática, com a frase "Divide de novo o valor do mês entre as lojas de hoje". | A loja nova ou que ganhou funcionário entra no mês sem esperar o mês seguinte, por ação explícita de quem cuida do dinheiro, sem nunca tocar mês com conta paga. |

## Fora deste documento

- 2.52 (`FixedExpenseSplit` com valor 0): inócuo; fica.
- 2.36 (fila de pedir liberação), 2.42, 2.44, 2.47, 2.48: dependem de decisão do usuário.

## Entrega

Branch `emporio-acordo-aviso-rateio`, empilhada sobre `emporio-relatorios-e-limpeza` (que espera autorização): migração no Docker (três colunas no acordo),
action e rota antes de tela, suíte nova (`test:m106`) mais `test:all`,
roteiro de navegador nos dois sentidos, manual, `/docs/api`, dívidas e
handoff. Sonnet implementa e revisa.
