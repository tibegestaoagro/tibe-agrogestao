# Empório, entrega 3: vendedor na venda e relatórios. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A venda passa a guardar o vendedor (quem atendeu), separado de quem registrou. O Caixa escolhe o vendedor no balcão. O vendedor aparece na venda, na lista e nos dois papéis. A loja ganha os relatórios por período: vendas por vendedor, por produto, produtos parados e vendas por loja.

**Architecture:** Uma coluna nova, `EmporioSale.seller_user_id`, preenchida em toda venda nova. Na migração, as vendas antigas recebem o valor de `sold_by_user_id`. A lista de quem pode ser vendedor numa loja sai de uma função só, usada pela validação da venda, pela rota e pelo balcão. Os relatórios ficam numa action nova, que lê a venda e a devolução com a mesma regra do Resultado: cancelada não conta, e a devolução desconta pelo valor proporcional do item, no dia em que aconteceu.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-04-emporio-orcamento-caixa-impressao-design.md`, seção "Entrega 3: vendedor na venda e relatórios". Spec do módulo: `docs/specs/module-39-meu-emporio.md` (as decisões desta entrega entram a partir da **Q168**).

## Global Constraints

- **As oito invariantes do `CLAUDE.md`.** Em especial:
  - nunca travessão (U+2014);
  - nada de heredoc para escrever arquivo;
  - regra de negócio em `src/lib/actions`, com a rota fina;
  - migração antes do push.
- **Ordem action, rota, tela.** Toda rota nova é documentada em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`).
- **Permissão:** sai de `src/lib/emporio/papel.ts` (`pode`, `exigir`, `papelDoEmporio`). Leitura não registra no Histórico; a venda já registra (`venda.criar`).
- **Recusa de campo:**
  - sai com `field` (4º parâmetro de `fail`), com o nome do campo na API;
  - o Zod passa por `apiErroDeZod`;
  - na tela, todo campo do `ORDEM` renderiza `error=` (conferência 15).
- **Suíte nova `test:m93`** (`scripts/m93-emporio-vendedor.test.ts`): escrita a partir da spec e vista falhando antes. Comando sempre com as URLs locais inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m93`
- **Migração local:**
  - `migrate diff` e `db:deploy`, os dois com a URL do Docker inline, e o SQL salvo à mão;
  - **nunca no Neon** nesta branch;
  - tirar do SQL os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`.
- **Subagente não commita:** deixa no working tree e relata os arquivos.
- **Venda em teste precisa de turno aberto** (`abrirTurnoDeTeste` de `scripts/_emporio-turno.ts`).

### Valores fixados por este plano (o que a spec deixou ao builder)

| o quê | valor |
|---|---|
| coluna | `EmporioSale.seller_user_id String?`, sem FK (como `sold_by_user_id`), índice `[tenant_id, seller_user_id, sold_at]` |
| migração | `prisma/migrations/20261105140000_emporio_vendedor_da_venda`, aditiva, com `UPDATE "EmporioSale" SET seller_user_id = sold_by_user_id WHERE seller_user_id IS NULL` |
| quem pode ser vendedor numa loja | usuário **ativo** e com uma destas situações: Dono (`role = OWNER`), Gerente geral, ou Gestor ou Vendedor ligado à loja (`UserEstablishment`). O Caixa nunca, e quem não tem papel no Empório também não. Ordem por nome |
| campo no payload da venda | `seller_user_id?: string` |
| sem `seller_user_id` | o Caixa recebe a recusa `SELLER_REQUIRED`; os outros papéis ficam como vendedor da própria venda |
| vendedor da troca | a venda nova da troca (`trocarAction`) herda o vendedor da venda original; se a original não tiver, fica quem registrou |
| papel A4 | "Vendedor: <vendedor>" |
| bobina | "Vendedor: <vendedor>"; quando a venda tem turno, também "Caixa: Caixa N (<quem registrou>)" |
| período do relatório | `from` e `to` em `AAAA-MM-DD`, os dois inclusivos, no dia de Brasília; no máximo 366 dias |
| filtro de loja | `establishment_id` opcional. Ausente vale todas as lojas que o ator vê (o Gestor, as dele). Loja fora do alcance: 404 no `establishment_id` |
| quantidade de vendas | vendas concluídas no período, sem contar a venda nova de troca (`exchange_return_id` preenchido), que não é atendimento novo |
| total vendido | soma de `net_amount` das concluídas no período (a de troca inclusa), menos o devolvido no período. O devolvido é o valor proporcional do item, como em `produtosDoMesAction`, vai ao vendedor e à loja da venda original e só conta se a venda original segue concluída |
| ticket médio | total ÷ quantidade, com 2 casas; nulo quando a quantidade é zero |
| vendas por produto | quantidade na unidade-base e total, os dois líquidos de devolução; ordem por total decrescente, empate por nome |
| produto parado | não arquivado, com preço (`PresentationPrice.price` não nulo) em alguma apresentação ativa da loja, e nenhum item vendido naquela loja no período. Uma linha por produto e loja |
| página | `/emporio/relatorios`, rótulo "Relatórios", logo depois de Resultado no menu, `exige: "gestor_da_loja"` |
| padrão da página | do mês corrente até hoje (Brasília) |

### Recusas (código, status, `field`, mensagem exata)

| código | status | field | mensagem |
|---|---|---|---|
| `SELLER_REQUIRED` | 422 | `seller_user_id` | `Escolha o vendedor que atendeu.` |
| `INVALID_SELLER` | 422 | `seller_user_id` | `Escolha um vendedor desta loja.` |
| `VALIDATION_ERROR` | 422 | `from` | `Informe a data inicial no formato AAAA-MM-DD.` |
| `VALIDATION_ERROR` | 422 | `to` | `Informe a data final no formato AAAA-MM-DD.` |
| `VALIDATION_ERROR` | 422 | `to` | `A data final não pode ser antes da inicial.` |
| `VALIDATION_ERROR` | 422 | `to` | `O período vai até 366 dias.` |

## Review Focus

1. **O Caixa trocar de loja no balcão com um vendedor já escolhido.** O vendedor da Loja 1 não vale na Loja 2: o servidor recusa (`INVALID_SELLER`), e a tela limpa a escolha ao trocar de loja. Teste na Task 1 e no roteiro da Task 6.
2. **A venda das 23h30 do último dia do período** (já é o dia seguinte em UTC) entra no relatório, e a das 0h10 do dia seguinte não. Teste na Task 4.
3. **A devolução no período de uma venda feita antes dele** desconta do vendedor e da loja da venda original. O total pode ficar negativo, e a quantidade de vendas não muda. Teste na Task 4.
4. **O vendedor que saiu da empresa** (usuário desativado) continua com nome no relatório e na venda antiga, mas não aparece mais na lista do balcão e é recusado com `INVALID_SELLER`. Teste nas Tasks 1 e 4.
5. **O Gestor da Loja 1 pedindo a Loja 2:** 404. Sem loja, ele vê só as dele. O Vendedor e o Caixa recebem 403. Teste na Task 4.

---

### Task 1: O vendedor na venda (schema, action, rota)

**Files:**
- Modify: `prisma/schema.prisma` (`EmporioSale`)
- Create: `prisma/migrations/20261105140000_emporio_vendedor_da_venda/migration.sql`
- Modify: `src/lib/actions/emporio-vendas.ts`:
  - `VenderInput`, `prepararVenda`, `gravarVenda`, `trocarAction`;
  - `VendaView` e `montarVendas`.
- Create: `src/lib/emporio/vendedores.ts` (a regra de quem pode ser vendedor)
- Modify: as rotas e os schemas Zod:
  - `src/app/api/v1/emporio/sales/route.ts` (POST, `seller_user_id` opcional);
  - `src/app/api/v1/emporio/sales/[id]/exchange/route.ts`, só se o schema dela precisar.
- Create: `src/app/api/v1/emporio/establishments/[id]/sellers/route.ts` (GET)
- Modify: `endpoints.ts`
- Create: `scripts/m93-emporio-vendedor.test.ts`; Modify: `package.json` (`test:m93`)
- Modify: os cenários que vendem como usuário de papel Caixa; achar com `grep -rn "venderAction" scripts` e conferir o ator de cada um

**Interfaces:**
- Produces, em `src/lib/emporio/vendedores.ts`:
  - `vendedoresDaLoja(db: TenantPrismaClient, establishmentId: string): Promise<{ id: string; name: string }[]>`
- Produces, em `emporio-vendas.ts`:
  - `listarVendedoresDaLojaAction(db, ator, establishmentId): Promise<ActionResult<{ id: string; name: string }[]>>`. Exige `vendedor_da_loja` naquela loja, e o Caixa passa. Loja fora do alcance: 404 no `establishment_id`.
- Produces, `VendaView` ganha:
  - `seller_user_id: string | null`;
  - `seller_name: string | null`;
  - `sold_by_name: string | null`.
  Os nomes saem de um `findMany` de usuários só em `montarVendas`, ativos ou não.

- [ ] **Step 1: m93, seção 1 (falhando).**
  - **Lista de vendedores:** para a Loja 1, `vendedoresDaLoja` traz o Dono, o Gerente geral, o Gestor e o Vendedor da Loja 1, e não traz o Caixa, o Vendedor só da Loja 2, nem o usuário desativado.
  - **Vendedor sozinho:** sem `seller_user_id`, a venda grava `seller_user_id = sold_by_user_id = vendedor`.
  - **Caixa sem vendedor:** a venda é recusada com `SELLER_REQUIRED` no `seller_user_id`, e nenhuma venda é gravada.
  - **Caixa com vendedor:** com o Vendedor da Loja 1, a venda tem `seller_user_id` = Vendedor, `sold_by_user_id` = Caixa e `seller_name` com o nome do Vendedor.
  - **Vendedor inválido:** recebe `INVALID_SELLER` quando é o Vendedor só da Loja 2, outro Caixa, o usuário desativado, ou um id de outra conta.
  - **Troca:** a venda nova de uma troca, feita pelo Gestor, herda o vendedor da venda original.
  - **Rota `GET /establishments/:id/sellers`:** responde ao Caixa da loja; o Caixa de outra loja recebe 404; sem sessão, 401.
  - **Migração:** no banco local, nenhuma venda com `sold_by_user_id` preenchido fica com `seller_user_id` nulo. Ler pelo client sem escopo, como o m92 faz para conferir a migração.
- [ ] **Step 2:** Rodar `test:m93` e ver falhar.
- [ ] **Step 3:** Schema, migração (aplicar no Docker local), `vendedoresDaLoja`, validação em `prepararVenda` e gravação em `gravarVenda`.
  - O vendedor é validado fora da transação, como a loja e o cliente já são.
  - `trocarAction` passa o vendedor herdado para `gravarVenda`.
  - Rota e `endpoints.ts`.
- [ ] **Step 4:** Verdes: `test:m93`, `test:m81`, `test:m90`, `test:m92`, `test:isolation`, `test:docs-api`, `tsc`, `check`. Reiniciar o `next dev` é com a sessão principal.
- [ ] **Step 5:** Relatar os arquivos.

### Task 2: O vendedor nos papéis, na venda e na lista

**Files:**
- Modify: `src/lib/actions/emporio-impressao.ts` (campos `vendedor` e `caixa`, no lugar do uso atual de `registrada_por` como vendedor)
- Modify: `src/components/emporio/impresso/papel-a4.tsx` e `papel-cupom.tsx`
- Modify: `src/app/(dashboard)/emporio/vendas/page.tsx` (o vendedor em cada linha) e `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` ("Vendedor" e "Registrada por", este só quando é outra pessoa)
- Test: `scripts/m91-emporio-impressao.test.ts` (ajustar ao campo novo) e m93, seção 2

**Interfaces:**
- Consumes: `VendaView.seller_name`, `sold_by_name` e `cash_session_id` da Task 1. Se `VendaView` ainda não expõe `cash_session_id`, entra junto.
- Produces, os dados do papel:
  - `vendedor: string | null`;
  - `caixa: string | null`, no formato `Caixa N (Nome)`, nulo sem turno.
  - `registrada_por` sai.

- [ ] **Step 1: m93, seção 2 (falhando).** Para a venda do Caixa com o Vendedor, os dados do papel trazem `vendedor` = nome do Vendedor e `caixa` = `Caixa 1 (<nome do Caixa>)`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar.
  - A4: "Vendedor:" mostra o vendedor.
  - Bobina: mostra as duas linhas.
  - Telas da venda e da lista, no kit atual.
- [ ] **Step 4:** Verdes: `test:m93`, `test:m91`, `tsc`, `check`, `lint`.
- [ ] **Step 5:** Relatar os arquivos.

### Task 3: O balcão escolhe o vendedor

**Files:**
- Modify: `src/app/(dashboard)/emporio/vender/page.tsx` (carrega, por loja visível, a lista de `vendedoresDaLoja` e se o ator é Caixa, e passa por prop)
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx` (`ORDEM` ganha `seller_user_id`), `venda-estado.ts`, `venda-campos.tsx`

**Interfaces:**
- Consumes: `vendedoresDaLoja` (Task 1) e as recusas `SELLER_REQUIRED` e `INVALID_SELLER`.

Regras de tela:
- **O campo "Vendedor":** é um select com a lista da loja escolhida.
  - Para quem não é Caixa, vem com o próprio usuário.
  - Para o Caixa, vem vazio e é obrigatório: sem ele, a tela recusa antes de enviar, com a mesma frase do servidor.
- **Trocar de loja** limpa a escolha, salvo quando o escolhido também está na lista da loja nova.
- **Recusa do servidor:** a recusa no `seller_user_id` aparece no campo, nunca só no rodapé.
- **Resumo "Venda registrada":** mostra o vendedor.

- [ ] **Step 1:** Implementar na receita do painel (`Field` com `error=`, `useErrosDeFormulario`, `err.doServidor(res)`).
- [ ] **Step 2:** Verdes: `tsc`, `check` (as conferências 10 e 15 em especial) e `lint`.
- [ ] **Step 3:** Relatar os arquivos. A prova viva é da Task 6.

### Task 4: Os relatórios (action e rota)

**Files:**
- Create: `src/lib/actions/emporio-relatorios.ts`, `src/app/api/v1/emporio/reports/sales/route.ts` (GET `?from=&to=&establishment_id=`)
- Modify: `endpoints.ts`; m93 seção 3

**Interfaces:**
- Consumes: `seller_user_id` (Task 1). Reaproveita de `emporio-resultado.ts` a regra da devolução proporcional; exportar dali uma função pequena em vez de copiar, se couber sem mexer no comportamento do Resultado.
- Produces: `relatorioDeVendasAction(db, ator, { from: string, to: string, establishment_id?: string }): Promise<ActionResult<RelatorioDeVendas>>`, com o tipo abaixo:

```ts
type RelatorioDeVendas = {
  periodo: { from: string; to: string };
  lojas: { id: string; name: string }[];
  por_vendedor: { seller_user_id: string | null; name: string; sales_count: number; total: number; average_ticket: number | null }[];
  por_produto: { emporio_product_id: string; name: string; base_unit: string; quantity: number; total: number }[];
  parados: { emporio_product_id: string; name: string; establishment_id: string; establishment_name: string }[];
  por_loja: { establishment_id: string; name: string; sales_count: number; total: number; average_ticket: number | null }[];
};
```

Detalhes do retorno:
- **Exigência:** `exigir(..., "gestor_da_loja", "ver os relatórios")`.
- **Venda sem vendedor:** sai numa linha com `seller_user_id: null` e `name: "Sem vendedor"`.
- **Ordem:** `por_vendedor` e `por_loja` saem por total decrescente.

- [ ] **Step 1: m93, seção 3 (falhando).** Montar duas lojas com vendas do Vendedor A e do Vendedor B, uma cancelada, uma troca e uma devolução, e conferir:
  - **Quantidade:** conta as concluídas, sem a cancelada e sem a venda nova da troca.
  - **Total e ticket:** os números exatos por vendedor e por loja. O ticket é o total dividido pela quantidade, com 2 casas.
  - **Devolução fora do período:** a devolução, dentro do período, de uma venda de antes dele desconta do vendedor e da loja da venda original. A quantidade não muda, e o total pode ficar negativo.
  - **Fronteira do dia:** com `sold_at` gravado pelo banco, a venda das 23h30 de Brasília do último dia entra, e a das 0h10 do dia seguinte não.
  - **Vendas por produto:** a quantidade e o total líquidos de devolução, em ordem por total.
  - **Parados:** traz o produto com preço na loja e sem venda. Não traz o arquivado, o sem preço naquela loja, nem o vendido.
  - **Vendedor desativado:** continua na linha dele, com o nome.
  - **Alcance:** o Gestor da Loja 1 pedindo a Loja 2 recebe 404 no `establishment_id`. Sem loja, ele vê só a Loja 1. O Vendedor e o Caixa recebem 403.
  - **Datas inválidas:** cada recusa de data da tabela, com o `field`.
  - **Rota:** responde pelo handler chamado direto, com 401 sem sessão.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar a action, a rota e `endpoints.ts`.
- [ ] **Step 4:** Verdes: `test:m93`, `test:m83` e `test:m84` (Resultado e mais vendidos, se a função extraída tocar neles), `test:docs-api`, `tsc`, `check`.
- [ ] **Step 5:** Relatar os arquivos.

### Task 5: A tela de Relatórios

**Files:**
- Create: `src/app/(dashboard)/emporio/relatorios/page.tsx`, componentes em `src/app/(dashboard)/emporio/_components/relatorios-*.tsx`
- Modify: `src/lib/emporio/paginas.ts` (entrada nova); o teste do menu, se ele fixar a lista de páginas

**Interfaces:**
- Consumes: `relatorioDeVendasAction` (Task 4), chamada no servidor como a página de Resultado faz.

O que a tela mostra:
- **Filtro por GET:** de, até e loja, com "Todas as minhas lojas" quando o ator vê mais de uma. O padrão é do mês corrente até hoje.
- **Quatro blocos:** Vendas por vendedor, Vendas por produto, Produtos parados e Vendas por loja. Cada um com o estado vazio próprio.
- **Dinheiro** sai no formato brasileiro (conferência do `check`).
- **Quem é redirecionado:** o Vendedor e o Caixa, que abrem a URL e voltam para `/emporio`.
- **No celular (390 px),** as tabelas não criam rolagem horizontal na página.

- [ ] **Step 1:** Implementar no kit, no padrão da página de Resultado.
- [ ] **Step 2:** Verdes: `tsc`, `check`, `lint` e o teste do menu.
- [ ] **Step 3:** Relatar os arquivos. A prova viva é da Task 6.

### Task 6: Roteiro do navegador, spec e handoff

**Files:**
- Create: `scripts/_cenario-emporio-vendedor.ts` e `scripts/navegador/emporio-vendedor.py`. O cenário parte do `_cenario-emporio-turno.ts`: Loja 1 com um Caixa e um Vendedor, Loja 2 sem Caixa, e mais um produto com preço e sem venda.
- Modify: `docs/specs/module-39-meu-emporio.md` (Q168 em diante: as decisões desta entrega e a tabela de valores acima), `docs/agents/current-handoff.md`

O roteiro, passo a passo:
1. **O Caixa no balcão:**
   - finalizar sem escolher o vendedor mostra a recusa no campo "Vendedor";
   - trocar de loja limpa a escolha;
   - com o Vendedor escolhido, a venda sai, e o resumo mostra o vendedor.
2. **A venda registrada:** a tela da venda mostra o Vendedor e "Registrada por" o Caixa. A bobina mostra "Vendedor:" e "Caixa: Caixa 1 (...)".
3. **O Vendedor no balcão:** o campo vem com ele mesmo, e a venda sai em nome dele.
4. **O Gestor em Relatórios:**
   - o período de hoje mostra as duas vendas nas linhas certas;
   - o produto sem venda aparece em Produtos parados.
5. **O Vendedor abre `/emporio/relatorios`:** volta ao início, e o menu não mostra Relatórios.
6. **Celular (390 px):** Relatórios e o balcão do Caixa sem rolagem horizontal.

- [ ] **Step 1:** Escrever o cenário e o roteiro.
- [ ] **Step 2:** Com o `next dev` reiniciado, rodar e ver verde.
- [ ] **Step 3:** Desfazer de propósito uma regra que o roteiro guarda e ver o roteiro reprovar; restaurar. Por exemplo, o balcão deixar de mandar o `seller_user_id`.
- [ ] **Step 4:** Atualizar a spec e o handoff, e ver o `check` verde.
- [ ] **Step 5:** Relatar os arquivos.
