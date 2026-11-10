# Empório: desfazer acordo, aviso de pedido por email e recalcular o mês. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar as dívidas 2.39, 2.40 e 2.53 conforme Q275 a Q277.

**Architecture:** uma migração pequena (três colunas em `EmporioCreditAgreement`); três actions novas ou estendidas, com rotas finas e botões nas telas que já existem.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx` no Docker, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-09-emporio-acordo-aviso-rateio-design.md`.

## Global Constraints

- Invariantes do `CLAUDE.md`; migração só no Docker (URL inline), sem os dois `DROP INDEX` parciais; `registrarNoHistorico` em toda escrita; `createLinkedEntry` para lançamento novo; transação serializável (`runSerializableTenantTransaction`) nas três escritas.
- Regra do mês fechado (Q240 e o cofre `docs/conhecimento/o-mes-que-ja-tem-conta-paga-nao-se-recalcula.md`): nenhuma escrita em mês com ocorrência paga do modelo.
- Email: `sendEmail` de `src/lib/email-send.ts` (grava `EmailLog`, nunca lança); template novo em `src/lib/email-templates.ts`; falha de email não derruba o pedido.
- Recusa por campo no campo; sem cor crua; sem travessão; sem heredoc com escape. Sonnet implementa e revisa; subagente não commita.

## Review Focus

1. **Acordo com uma parcela paga em parte:** desfazer recusa `ACORDO_COM_MOVIMENTO` e nada muda. Teste na Task 1.
2. **Origem que tinha pagamento parcial antes do acordo:** ao desfazer, volta pendente com o mesmo aberto de antes (os pagamentos antigos seguem ligados a ela). Teste na Task 1.
3. **Recalcular mês com uma ocorrência paga em qualquer loja:** `MES_FECHADO`, nenhuma ocorrência tocada. Teste na Task 3.
4. **Gatilho de leitura depois do recálculo:** não recria nem duplica as ocorrências (o mês segue "nascido"). Teste na Task 3.
5. **Dono sem telefone:** recebe o email; o WhatsApp é pulado. Teste na Task 2.

---

### Task 1: Desfazer acordo (Q275)

**Files:** `prisma/schema.prisma` (`EmporioCreditAgreement` l.3721: `undone_at DateTime?`, `undone_by_user_id String?`, `undone_reason String?`), migração `prisma/migrations/20261110120000_emporio_acordo_desfeito/migration.sql`; `src/lib/actions/emporio-acordos.ts` (`desfazerAcordoAction`; `montarAcordos` l.77 devolve `undone_at`, `undone_reason`, `can_undo`); rota nova `src/app/api/v1/emporio/customers/[id]/agreements/[agreementId]/undo/route.ts` (POST `{ reason }`); `src/app/(public)/docs/api/endpoints.ts`; tela `src/app/(dashboard)/emporio/clientes/_components/acordos-do-cliente.tsx` (botão "Desfazer acordo" com motivo, quando `can_undo`; acordo desfeito listado como "Desfeito em DD/MM: motivo").

**Interfaces:** `desfazerAcordoAction(db, ator, acordoId: string, input: { reason: string }): Promise<ActionResult<AcordoView>>`; permissão igual a `fazerAcordoAction`; recusas: `NOT_FOUND`, `ACORDO_DESFEITO` 409, `ACORDO_COM_MOVIMENTO` 409 (mensagem diz o motivo: parcela paga, abatida por devolução ou parcela extra de cheque), `VALIDATION_ERROR` campo `reason` (vazio). Efeito em `runSerializableTenantTransaction`: parcelas `cancelled`; origens (`agreement_id` = acordo, `status` `cancelled` gravado pelo acordo) voltam a `pending` com `agreement_id` nulo; acordo com `undone_*`; histórico `fiado.acordo.desfazer`.

- [ ] **Step 1: Testes (m106 seção 1):** acordo de duas vendas em fiado (100 e 50) em 3 parcelas; desfazer → parcelas canceladas, as duas origens pendentes de novo com `agreement_id` nulo e o mesmo vencimento, o cliente deve 150 de novo, `undone_at` preenchido; desfazer de novo → `ACORDO_DESFEITO`; acordo com uma parcela paga em parte → `ACORDO_COM_MOVIMENTO` e nada muda; origem com pagamento parcial antes do acordo → volta com o mesmo aberto; motivo vazio → campo `reason`; tenant B → `NOT_FOUND`; depois de desfeito, cancelar a venda original não recusa mais `VENDA_EM_ACORDO`.
- [ ] **Step 2: Implementar** (migração no Docker, `prisma generate`). `test:m100`, `test:m99`, `test:docs-api`, `test:isolation`, `tsc`, `lint`.
- [ ] **Step 3: Commit** (sessão principal).

### Task 2: Aviso de pedido também por email (Q276)

**Files:** `src/lib/emporio/pedido-pagamento.ts` (`avisarAprovadores` l.125-155), `src/lib/email-templates.ts` (`buildPaymentRequestEmailHtml`).

**Interfaces:** destinatários do email: usuários ativos do tenant com `role` `OWNER` ou `emporio_role` `gerente_geral`, com email (todos têm); `sendEmail({ to, subject: "Pedido de pagamento de R$ X para aprovar", html, tenant_id, type: "emporio_pedido_pagamento", related_id: pedido.id })`; o WhatsApp segue igual para quem tem telefone; uma falha de um envio não impede os outros.

- [ ] **Step 1: Testes (m106 seção 2):** com um Dono sem telefone e um Gerente geral com telefone, criar um pedido acima do teto (como a `m100` faz): `EmailLog` com dois registros do tipo `emporio_pedido_pagamento` e `related_id` do pedido; o envio de email desligado ou falhando (como as outras suítes fazem com o canal de email em dev; leia `email-send.ts`) não impede o pedido. Se o canal de email em dev não grava `EmailLog` sem credencial, prove pela chamada interceptada e diga no relatório.
- [ ] **Step 2: Implementar.** `test:m100`, `tsc`, `lint`.
- [ ] **Step 3: Commit** (sessão principal).

### Task 3: Recalcular o mês (Q277)

**Files:** `src/lib/actions/emporio-despesas.ts` (`recalcularMesDaDespesaFixaAction`; `garantirOcorrenciasDoMes` l.1282 trata `NOTA_RECALCULADO` como `NOTA_VIROU_AUTOMATICO` na regra do mês nascido, l.1310-1316); rota nova `src/app/api/v1/emporio/fixed-expenses/[id]/recalculate/route.ts` (POST `{ month: "AAAA-MM" }`); `endpoints.ts`; tela da despesa fixa em `src/app/(dashboard)/emporio/despesas/` (botão "Recalcular este mês" no modelo automático, com a frase da spec e o mês corrente pré-escolhido).

**Interfaces:** `recalcularMesDaDespesaFixaAction(db, ator, modeloId, { month }): Promise<ActionResult<{ month: string; parts: { establishment_id: string; amount: number }[] }>>`; permissão igual a editar despesa fixa; recusas: `NOT_FOUND`, `VALIDATION_ERROR` (modelo não automático: campo `split_kind`; mês passado ou inválido: campo `month`), `MES_FECHADO` 409. Efeito: ocorrências não pagas do mês `cancelled` com `NOTA_RECALCULADO`, novas por `ratearOMes` com as lojas ativas e as bases de hoje, histórico `despesa.fixa.recalcular`.

- [ ] **Step 1: Testes (m106 seção 3):** modelo por funcionários, duas lojas no mês; uma terceira loja ganha funcionários; recalcular o mês corrente → três ocorrências com as partes novas somando o valor do modelo, as antigas canceladas com a nota; chamar `garantirOcorrenciasDoMes` em seguida → nada muda (sem duplicar); pagar uma ocorrência e recalcular → `MES_FECHADO` e nada muda; mês passado → campo `month`; modelo manual → campo `split_kind`; tenant B → `NOT_FOUND`.
- [ ] **Step 2: Implementar.** `test:m101`, `test:m83`, `test:docs-api`, `tsc`, `lint`.
- [ ] **Step 3: Commit** (sessão principal).

### Task 4: Suíte m106 da spec (onda 1)

`scripts/m106-emporio-acordo-aviso-rateio.test.ts` e `package.json` (`test:m106`), com as asserções dos Step 1 das Tasks 1 a 3, módulos novos por `import()` com especificador em variável, isolamento. Rodar no HEAD: compila e falha por ausência.

### Task 5: Roteiro, manual, docs

`scripts/_cenario-emporio-acordo-rateio.ts`, `scripts/navegador/emporio-acordo-rateio.py` (desfazer um acordo pela ficha do cliente e ver a dívida voltar; recalcular o mês e ver as partes novas; sabotagem: desfazer sem voltar as origens faz reprovar); manual (fiado e despesas); `docs/agents/dividas.md` (fechar 2.39, 2.40, 2.53); `docs/agents/financeiro-emporio-relatorio.md`. Gates e handoff com a sessão principal.

## Ondas

| onda | tarefas | agentes (Sonnet) |
|---|---|---|
| 1 | Task 1 (inclui a migração), Task 4 | `servidor-acao`, `prova-suite` |
| 2 | Task 2, Task 3 | `servidor-acao` x2 (arquivos disjuntos; `endpoints.ts` só na Task 3 nesta onda) |
| 3 | Task 5 | `general-purpose` (papel do `prova-viva`) |

Cada tarefa de servidor faz também a sua tela (são botões pequenos em telas existentes). Revisão Sonnet da branch antes da Task 5 fechar.
