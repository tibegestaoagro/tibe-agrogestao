# Empório: conferir o cartão (frente B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a parcela de cartão ganha os estados Prevista, A conferir, Atrasada e Conferida, com conferência por parcela e por dia, ajuste da diferença no saldo e no Custo do cartão, e desfazer.

**Architecture:** um campo novo (`CardReceivable.confirmed_net`) e uma origem nova (`ajuste_cartao`); a regra numa action nova `src/lib/actions/emporio-conferencia-cartao.ts` (estado, conferir uma, conferir o dia, desfazer), usada pelas rotas novas, pelo carimbo do extrato e pela antecipação pontual; telas no A receber, no Caixa, no Hoje e no extrato.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx`, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-17-emporio-conferir-cartao-design.md`

## Global Constraints

- Nunca travessão (U+2014). Edição só com Edit/Write.
- Migração ANTES do push (invariante 3); no Docker local primeiro, com a URL inline.
- O saldo nunca é gravado: o ajuste é um `CashMovement`.
- Estado calculado: Atrasada quando hoje > `proximoDiaUtil(effective_on + 1 dia)` (`src/lib/emporio/dia-util.ts`), sem conferência (segunda atrasa na quarta; sexta e sábado na terça).
- Reparte do lote em centavos, proporcional ao `effective_net`, sobra na maior parcela; soma dos ajustes = diferença do dia, exata.
- Permissão de conferir e desfazer: `dinheiro`. Toda escrita com `registrarNoHistorico` (conferência 19 do `check`).
- Recusa com `fail(..., field)` e `apiErroDeZod`; rotas novas no `/docs/api`.
- Suíte nova: `test:m121` (`scripts/m121-emporio-conferir-cartao.test.ts`).

## Review Focus

1. **Lote com parcela já conferida no meio:** o "Conferir o dia" só pega as não conferidas; a soma prevista exibida e a usada no servidor são as mesmas (corrida: duas pessoas conferindo o mesmo dia ao mesmo tempo, só uma grava). Teste na Task 3.
2. **Desfazer depois de antecipar:** parcela conferida pela antecipação pontual não se desfaz pelo botão da conferência, só desfazendo a antecipação. Teste na Task 3.
3. **Venda cancelada depois de conferida:** o estorno do cartão (`estorno_cartao`) leva também o ajuste? A conferida cancelada some dos estados; o ajuste fica no extrato como dinheiro que de fato entrou ou saiu. Teste na Task 3.
4. **Fim de semana e feriado:** parcela de sexta só fica Atrasada depois do próximo dia útil seguinte (terça, se segunda for dia útil). Teste na Task 3.
5. **Migração Q353:** parcela de 8 dias atrás nasce conferida sem ajuste; de 6 dias atrás fica Atrasada; já carimbada ganha `confirmed_net`. Teste na Task 1 (SQL conferido no Docker com dados de seed) e na Task 3.

---

### Task 1: schema e migração (sessão principal)

**Files:** `prisma/schema.prisma`, `prisma/migrations/<timestamp>_emporio_conferir_cartao/migration.sql`

- [ ] `CardReceivable.confirmed_net Decimal? @db.Decimal(14, 2)` com comentário da Q349; `ajuste_cartao` em `CashMovementOrigin`.
- [ ] SQL pelo `migrate diff` com a URL do Docker inline (tirar os dois `DROP INDEX` dos índices parciais), mais o `UPDATE` da Q353.
- [ ] `db:deploy` no Docker, `npx prisma generate`, `migrate diff` vazio, `npm run test:drift` se existir localmente, `tsc`.
- [ ] Commit.

### Task 2: servidor

**Files:** Create `src/lib/actions/emporio-conferencia-cartao.ts`; Create as três rotas da spec em `src/app/api/v1/emporio/finance/card-receivables/`; Modify `emporio-financeiro.ts` (`CartaoAReceberView` com `status`, `confirmed_net`, `adjustment`; a lista traz passadas não conferidas; `summary.overdue` soma as atrasadas; o Hoje com `cards_to_confirm` e `cards_overdue`; o carimbo de cartão delega), `emporio-antecipacao.ts` (pontual nasce conferida, desfazer desconfere), o Resultado (Custo do cartão soma os ajustes), o extrato (linha de ajuste com rótulo), `/docs/api`.

**Interfaces (produz):**
- `type EstadoDaParcela = "prevista" | "a_conferir" | "atrasada" | "conferida"`
- `estadoDaParcela(p: { effective_on: Date; reconciled_at: Date | null }, hoje: Date): EstadoDaParcela` (pura)
- `conferirParcelaAction(db, ator, id: string, input: { received_amount: number; notes?: string })`
- `conferirDiaAction(db, ator, input: { bank_account_id: string; acquirer_id: string; effective_on: string; received_total: number; notes?: string })`
- `desfazerConferenciaAction(db, ator, id: string, input: { reason: string })`
- `CartaoAReceberView` ganha `status: EstadoDaParcela`, `confirmed_net: number | null`, `adjustment: number | null`

- [ ] Implementar pela spec; `tsc`, `test:isolation`, `test:docs-api`, `test:m120` (o Vencido agora soma atrasadas: ajustar a m120 só se ela afirmar o contrário, registrando no relato).
- [ ] Commit.

### Task 3: suíte `test:m121` (em paralelo à Task 2, escrita da spec)

- [ ] Seções: estados com sexta, sábado e dia útil; conferir uma (menos, mais, zero) com saldo da conta, ajuste e Custo do cartão; conferir o dia com reparte exato; corrida de dois lotes; desfazer; antecipação pontual conferida e desfeita junto; venda cancelada depois de conferida; 403; isolamento entre contas e lojas; recusas com `field`.
- [ ] Vermelha no HEAD antes da Task 2; verde depois. Commit.

### Task 4: telas

**Files:** `_components/cartoes-a-receber.tsx`, `financeiro-receber.tsx`, `caixa/page.tsx`, `financeiro-hoje.tsx`, `financeiro-extrato.tsx`, painéis novos `conferir-parcela-form.tsx` e `conferir-dia-form.tsx` (kit `FormSheet`, `useErrosDeFormulario`).

- [ ] Selo de estado; Conferir por linha; Conferir o dia por grupo; Desfazer com motivo; confirmação acima de 10%; Hoje com os dois avisos; extrato com o ajuste; tirar a frase provisória da frente A.
- [ ] `check`, `tsc`, `lint`; commit.

### Task 5: roteiro `emporio-conferir-cartao` (dois sentidos) e Task 6: fechamento (manual, `test:all`, juiz, handoff, migração no Neon e merge com autorização)
