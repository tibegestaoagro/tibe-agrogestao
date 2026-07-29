# Módulo 17: Agenda com custo, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan task-by-task.
> Steps use checkbox syntax for tracking.

**Goal:** entregar listas reais de agenda e contas no agente WhatsApp, persistir
previsões de vacinação e conciliá-las com o custo real sem duplicar despesas.

**Architecture:** preservar o schema atual e usar as actions como seam de
negócio. Previsões são `FinancialEntry` manuais com `related_id` sintético.
Consultas do WhatsApp passam pelo dispatcher existente e todas as queries usam
o client Prisma escopado por tenant.

**Tech Stack:** Next.js 14, TypeScript, Prisma 7, PostgreSQL, tsx e scripts de
integração do projeto.

**Fonte de verdade:** `docs/specs/module-17-agenda-com-custo.md`.

---

## Seams de teste aprovados

1. `listPendingEntries`: consulta pública da camada de actions.
2. `routeWhatsAppAction`: dispatcher público das intenções do agente.
3. `addVaccinationAction`: operação pública de registro e conciliação.
4. `generateAlertsForTenant`: geração observável do alerta `bill_due`.

Os testes usam o Postgres local real e não mockam módulos internos.

## Bloco 1: pendências financeiras

**Files:**

- Modify: `src/lib/actions/financial-reports.ts`
- Create: `scripts/m17-agenda-custo.test.ts`
- Modify: `package.json`

- [x] Escrever um teste que cria despesas pendentes vencidas, com vencimento
      hoje, futuras dentro do mês e futuras fora do mês.
- [x] Executar `npm run test:m17` e confirmar falha pela ausência de
      `listPendingEntries`.
- [x] Implementar:

```ts
export async function listPendingEntries(
  db: TenantPrismaClient,
  params: { entry_type: "income" | "expense"; end?: Date },
)
```

- [x] Retornar valores serializados, ordenar por vencimento e calcular
      `days_overdue` pelo início do dia.
- [x] Executar `npm run test:m17` e confirmar o primeiro slice verde.

## Bloco 2: agendas e escopos do resumo

**Files:**

- Modify: `src/lib/actions/whatsapp-handlers/resumo.ts`
- Modify: `scripts/m17-agenda-custo.test.ts`

- [x] Escrever testes de comportamento para `agendamentos`,
      `ordens_a_faturar`, `contas_a_pagar` e `contas_a_receber`.
- [x] Confirmar que os testes falham com o comportamento atual.
- [x] Implementar listas limitadas a 5 itens, total real e texto de vazio.
- [x] Escrever testes para vacinas com e sem previsão, usando uma única consulta
      de previsões.
- [x] Implementar a agenda de rebanho em 30 dias e a oferta da primeira previsão
      ausente.
- [x] Escrever testes para colheitas futuras e implementar a agenda de lavoura
      sem valor estimado.
- [x] Executar `npm run test:m17` após cada slice.

## Bloco 3: previsão e conciliação

**Files:**

- Modify: `src/lib/whatsapp-intents.ts`
- Modify: `src/lib/actions/financial-entries.ts`
- Modify: `src/lib/actions/whatsapp-handlers/rebanho.ts`
- Modify: `src/lib/actions/whatsapp-router.ts`
- Modify: `src/lib/actions/animals.ts`
- Modify: `scripts/m17-agenda-custo.test.ts`

- [x] Escrever teste da intenção `registrar_previsao_vacina` sem `due_date`.
- [x] Confirmar falha por intenção desconhecida.
- [x] Registrar a intenção, resolver animal e vacina no servidor e usar o
      `next_due_at` mais recente como padrão.
- [x] Persistir via `createManualEntryAction` com `related_id` opcional.
- [x] Escrever teste de segunda chamada e confirmar que ele detecta duplicação.
- [x] Implementar atualização idempotente da previsão existente.
- [x] Escrever teste de conciliação com custo real e confirmar que a despesa
      dobra antes da correção.
- [x] Atualizar a previsão para `paid` em `addVaccinationAction`, sem chamar
      `createLinkedEntry` quando houver conciliação.
- [x] Escrever teste sem custo real e manter a previsão pendente.
- [x] Atualizar o texto do handler com resultado de conciliação observável.
- [x] Executar `npm run test:m17` após cada slice.

## Bloco 4: integração e documentação

**Files:**

- Modify: `src/app/(dashboard)/financeiro/page.tsx`
- Modify: `docs/n8n-whatsapp-workflow.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `scripts/m17-agenda-custo.test.ts`

- [x] Trocar o fallback de vencimento nulo por `sem data`.
- [x] Documentar a nova intenção e os novos escopos no prompt do N8N.
- [x] Sincronizar status, comando `test:m17` e explicação da previsão em
      `AGENTS.md` e `CLAUDE.md`.
- [x] Cobrir corte em 5, vazios, vencidos, isolamento multi-tenant e geração de
      `bill_due`.
- [x] Confirmar que `/docs/api` não foi alterado.

## Verificação final

- [x] Implementação e verificação local concluídas, sem commit, push, migração
      ou deploy.

Com o Postgres local:

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
$env:INTERNAL_API_SECRET="dev-internal-secret"
npm run test:m17
npm run test:m3
npm run test:m4
npm run test:m11
npm run test:m12
npm run build
```

Auditorias:

```powershell
git diff --exit-code b238af2 -- prisma/schema.prisma prisma/migrations
$added = git diff --unified=0 b238af2 -- . |
  Where-Object { $_ -match '^\+(?!\+\+\+)' }
$bad = $added | Select-String -SimpleMatch ([char]0x2014)
if ($bad) { $bad; exit 1 }
graphify update .
```

Não criar commit, push, merge, migração ou deploy sem autorização separada.
