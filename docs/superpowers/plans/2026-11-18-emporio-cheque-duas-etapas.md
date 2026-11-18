# Empório: cheque em duas etapas (frente C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** no balcão o cheque pede só valor e nome; número, banco e bom para viram opcionais e são completados (ou corrigidos) depois pelo Financeiro ou pelo Gestor da loja, com o cheque incompleto destacado e fora das datas.

**Architecture:** `EmporioCheck.number`, `bank` e `good_for` passam a anuláveis (migração sem dado novo). "A completar" é calculado por uma função pura. Uma action nova `completarChequeAction` com a rota `PATCH /api/v1/emporio/checks/:id`; a venda aceita o cheque parcial; os leitores de `good_for` tratam o nulo; telas no balcão, na carteira (A receber e Caixa), no Hoje e na venda.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx`, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-18-emporio-cheque-duas-etapas-design.md`

## Global Constraints

- Nunca travessão (U+2014). Edição só com Edit/Write; nada de heredoc com escape.
- Migração ANTES do push (invariante 3); no Docker local primeiro, com a URL inline. Neon só com autorização do usuário.
- "A completar" = `status === "recebido"` e (`number` nulo ou `bank` nulo ou `good_for` nulo). Nunca data ou número fictício.
- No balcão: valor e "Em nome de" obrigatórios (nome até 120 letras); número (até 30), banco (até 60) e bom para (data válida) opcionais e aparados; texto vazio vira `null`. Cheque segue exigindo cliente de verdade.
- Sem `good_for`: fora de vencido, hoje, a vencer, Projeção e vencido da ficha do cliente; DENTRO do "em aberto" do cliente e da carteira. Com data e sem número ou banco: entra pelas datas normalmente.
- Incompleto não se deposita: 409 `CHEQUE_INCOMPLETO`, "Complete o número, o banco e o bom para antes de depositar."
- Completar/corrigir: só em `recebido`; permissão `dinheiro` ou `gestor_da_loja` da loja do cheque (`EmporioCheck.establishment_id`); pode deixar vazio o que ainda falta, não pode apagar o que já tem nem esvaziar o nome.
- Toda escrita com `registrarNoHistorico` (conferência 19 do `check`); resumos do Histórico com "sem número" quando `number` é nulo.
- Recusa com `fail(..., field)` e `apiErroDeZod`; contrato novo e mudado no `/docs/api`.
- Suíte nova: `test:m122` (`scripts/m122-emporio-cheque-duas-etapas.test.ts`), com entrada no `package.json`.

## Review Focus

1. **Cheque sem data na lista ordenada por `good_for`:** vai ao topo da carteira, não some. Teste na Task 3 (seção da carteira).
2. **Editar venda com cheque incompleto:** a venda recriada mantém o que o Financeiro já completou quando o payload o reenvia, e aceita o payload ainda parcial. Teste na Task 3 (seção editar venda); tela na Task 5.
3. **Completar cheque já depositado, compensado, voltou ou devolvido ao cliente:** 409 e nada muda. Teste na Task 3.
4. **Gestor de outra loja e Vendedor tentando completar:** 403; conta de outro tenant: 404. Teste na Task 3.
5. **Somas:** a faixa Vence hoje do A receber, o "Vence hoje a receber" do Hoje e a Projeção não contam o cheque sem data; o "em aberto" da ficha do cliente conta; o vencido da ficha não. Teste na Task 3.

---

### Task 1: schema e migração (sessão principal)

**Files:** `prisma/schema.prisma` (model `EmporioCheck`), `prisma/migrations/20261118120000_emporio_cheque_duas_etapas/migration.sql`

- [ ] `number String?`, `bank String?`, `good_for DateTime? @db.Date`, com comentário da Q354 e da Q356.
- [ ] SQL pelo `migrate diff` com a URL do Docker inline (tirar os dois `DROP INDEX` dos índices parciais): três `ALTER COLUMN ... DROP NOT NULL`, nada mais.
- [ ] `db:deploy` no Docker, `npx prisma generate`, `migrate diff` vazio, `tsc` (os erros de tipo que aparecerem são o mapa da Task 2; não corrigir aqui).
- [ ] Commit.

### Task 2: servidor (`servidor-acao`)

**Files:**
- Create: `src/lib/emporio/cheque.ts` (função pura)
- Create: `src/app/api/v1/emporio/checks/[id]/route.ts` (PATCH)
- Modify: `src/lib/emporio/venda-schema.ts`, `src/lib/actions/emporio-vendas.ts` (`prepararVenda` bloco cheque, tipos `:213`, `:628`, `:828`, a view da venda `:506-509`), `src/lib/actions/emporio-caixa.ts` (`ChequeView`, `ChequeRow`, `viewDoCheque`, ordenação `:1473` e `:1863` com nulo primeiro, `depositarChequeAction`, resumos do Histórico, a action nova), `src/lib/actions/emporio-financeiro.ts` (recorte do A receber sem data fora; o Hoje ganha `checks_to_complete`), `src/lib/actions/emporio-clientes.ts` (vencido ignora sem data), `src/lib/actions/emporio-projecao.ts` (tipo), `src/app/(public)/docs/api/endpoints.ts`.

**Interfaces (produz):**
- `chequeIncompleto(c: { status: string; number: string | null; bank: string | null; good_for: Date | string | null }): boolean` em `src/lib/emporio/cheque.ts`
- `ChequeView`: `number: string | null`, `bank: string | null`, `good_for: string | null` (AAAA-MM-DD), `incomplete: boolean`
- Cheque na view da venda: `number`, `bank`, `good_for` anuláveis e `incomplete: boolean`
- `completarChequeAction(db, ator, id: string, input: { number?: string | null; bank?: string | null; good_for?: Date | null; holder_name?: string | null }): Promise<ActionResult<ChequeView>>`
  - corpo sem nenhum dos quatro: 422 em `number`, "Informe ao menos um dado do cheque."
  - tentar apagar campo já preenchido: 422 no campo, "Não dá para apagar: troque por outro valor."
  - não `recebido`: 409 `CHEQUE_FORA_DA_CARTEIRA`
  - sem permissão: 403; inexistente ou de outro tenant: 404
  - Histórico `cheque.completar` com antes e depois
- `PATCH /api/v1/emporio/checks/:id`, corpo `{ number?, bank?, good_for? (AAAA-MM-DD), holder_name? }`, guard `emporio:write`
- `HojeView.checks_to_complete: { count: number; total: number }` (cheques A completar nas lojas visíveis, ou na loja do filtro)

- [ ] Implementar pela spec e por estes contratos; `tsc`, `test:isolation`, `test:docs-api`, `check`.
- [ ] Rodar `m82` e `m108`: as checagens de 422 por número, banco ou data faltando passam a falhar de propósito (a Task 3 as reescreve); registrar no relato quais.
- [ ] Commit.

### Task 3: suíte `test:m122` e as suítes antigas (`prova-suite`, em paralelo à Task 2, escrita da spec)

**Files:** Create `scripts/m122-emporio-cheque-duas-etapas.test.ts`; Modify `package.json` (`test:m122`), `scripts/m82-emporio-f3b.test.ts:393-398` e `scripts/m108-emporio-boleto-e-titular.test.ts:252-256` (o 422 por número, banco ou data vira venda aceita com cheque A completar; o 422 do nome vazio e do Consumidor final continua).

- [ ] Seções:
  1. pura: `chequeIncompleto` nos casos (completo, falta cada um, depositado com campo nulo é `false`).
  2. venda com cheque só valor e nome: 201, cheque com os três nulos, `incomplete: true`; venda com dados parciais; data inválida 422 em `payments`; número de 31 e banco de 61 letras 422; nome vazio 422; Consumidor final 422 em `customer_id`; dois cheques na venda com nomes diferentes.
  3. carteira: o sem data vem antes dos datados na lista; depositar incompleto 409 `CHEQUE_INCOMPLETO` e nada muda; voltou e cancelar a venda funcionam no incompleto.
  4. completar: Financeiro completa aos poucos (só número, depois banco e data) e o `incomplete` vira `false`; corrigir completo troca a data; apagar campo preenchido 422 no campo; corpo vazio 422; 409 em depositado, compensado, devolvido e devolvido ao cliente; Histórico gravado com "sem número" onde couber.
  5. permissão e isolamento: Gestor da loja completa; Gestor de outra loja 403; Vendedor e Caixa 403; outro tenant 404.
  6. somas: faixa Vence hoje e A vencer do A receber, `HojeView` (Vence hoje a receber e `checks_to_complete`), Projeção e ficha do cliente (em aberto conta, vencido não), com um cheque sem data e um com data de hoje.
  7. editar venda com cheque incompleto: payload parcial aceito; payload com os dados completados mantém os dados.
- [ ] Vermelha no HEAD da Task 1 (relatar quantas), verde depois da Task 2. Commit.

### Task 4: telas (`tela-pagina`)

**Files:** `_components/venda-campos.tsx` (bloco recolhido "Tenho os dados do cheque" com número, banco e bom para; rótulo do nome com a dica de terceiros), `_components/venda-estado.ts` (só valor e nome obrigatórios; vazio não vai no payload; carregar cheque com nulos), Create `_components/completar-cheque-form.tsx` (FormSheet do kit, `useErrosDeFormulario` com `ORDEM = ["number","bank","good_for","holder_name"]` e `prefixoDeId` por cheque), `_components/cheque-acoes.tsx` (Completar ou Corrigir para quem pode; Depositar escondido no incompleto), `_components/financeiro-receber.tsx` e `caixa/page.tsx` (selo "A completar", "-" no que falta, a prop de quem pode completar), `_components/financeiro-hoje.tsx` (linha "Cheques a completar: N" com o total e link para o A receber), `vendas/[id]/page.tsx` ("Cheque a completar" no lugar de número, banco e data).

- [ ] Implementar; `check`, `tsc`, `lint`; commit.

### Task 5: roteiro `emporio-cheque-duas-etapas` (`prova-viva`)

**Files:** Create `scripts/_cenario-emporio-cheque-duas-etapas.ts` (prefixo próprio, `--limpar`) e `scripts/navegador/emporio-cheque-duas-etapas.py`.

- [ ] No navegador: vender com cheque só valor e nome (e um de terceiros); ver "A completar" no A receber, no Caixa, no Hoje e na venda; Depositar ausente; completar pelo Gestor e pelo Financeiro (recusa embaixo do campo); depois de completo o cheque entra na faixa da data e o Depositar aparece; editar a venda com cheque incompleto; 390 px sem rolagem horizontal.
- [ ] Provado nos dois sentidos (sabotar o servidor, ver falhar, restaurar). Relatar sem commitar.

### Task 6: fechamento (sessão principal)

- [ ] Manual: o cheque na venda e a tarefa "Completar o cheque"; figuras só as que a frente mudou.
- [ ] `test:all`, juiz (`prova-juiz`, sonnet), correções, handoff, push da branch.
- [ ] Pedir ao usuário, separadas: a migração no Neon (URL Direct) e o merge com push.
