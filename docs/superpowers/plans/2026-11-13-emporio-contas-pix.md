# Contas PIX escolhidas no lançamento: plano de implementação

> **Para agentes:** executar pela skill `orquestrar-ondas` (subagente não
> commita; a sessão principal commita uma tarefa por vez).

**Objetivo:** várias contas PIX com CNPJ, favorecido e lojas onde valem; o
caixa escolhe a conta ao lançar PIX na venda e no fiado; o relatório de vendas
mostra o PIX por conta.

**Arquitetura:** reaproveita `BankAccount` (dois campos e uma bandeira) e um
model de junção para as lojas. A regra fica em `emporio-caixa.ts` e
`emporio-vendas.ts`; as telas só mandam o `bank_account_id` que o servidor já
aceita.

**Spec:** [../specs/2026-11-13-emporio-contas-pix-design.md](../specs/2026-11-13-emporio-contas-pix-design.md) (Q310 a Q317).

## Restrições globais

- Invariantes do `CLAUDE.md`: nada de travessão; `tenant_id` nunca do client;
  migração no Docker com a URL inline; regra na action, rota fina.
- Nomes de campo na API (costura 1): `document`, `beneficiary`,
  `pix_all_establishments`, `establishment_ids`, `bank_account_id`,
  `payments`.
- Mensagens em português, recusa com `field`.

## Foco de revisão

1. Conta restrita a uma loja mandada numa venda de outra loja: recusa 422 em
   `payments` (m114).
2. Editar venda antiga cujo PIX caiu numa conta que deixou de valer para a loja:
   a edição passa (m114).
3. Restringir a disponibilidade de uma conta que é a PIX padrão de uma loja fora
   da lista: recusa em `establishment_ids`, citando a loja (m114).
4. CNPJ com máscara (`12.345.678/0001-95`) grava só dígitos; CNPJ com dígito
   verificador errado recusa em `document` (m114).
5. Papel Caixa abre o balcão e enxerga a lista das contas PIX da loja, sem
   saldo (m114 e roteiro).

---

## Onda 1

### T01: schema e migração (`servidor-dados`)

**Arquivos:** `prisma/schema.prisma`, `prisma/migrations/20261113120000_emporio_contas_pix/migration.sql`, `src/lib/prisma.ts`
**Depende-de:** nenhuma

- `BankAccount`: `document String?`, `beneficiary String?`,
  `pix_all_establishments Boolean @default(true)`, relação
  `pix_establishments BankAccountPixEstablishment[]`.
- Model `BankAccountPixEstablishment`: `id`, `tenant_id`, `bank_account_id`,
  `establishment_id`, `created_at`; `@@unique([bank_account_id, establishment_id])`,
  `@@index([tenant_id])`; `onDelete: Cascade` para conta, loja e tenant.
  Relação inversa em `Establishment` e `Tenant`.
- Entra em `TENANT_SCOPED_MODELS`.
- SQL pelo `migrate diff` com a URL do Docker inline, sem os dois `DROP INDEX`
  conhecidos; aplicar no Docker com `npm run db:deploy` (URL inline);
  `npx prisma generate`; `npm run test:isolation` verde.

### T02: suíte m114 escrita da spec (`prova-suite`)

**Arquivos:** `scripts/m114-emporio-contas-pix.test.ts`, `package.json` (só a linha `test:m114`)
**Depende-de:** nenhuma (escreve da spec; roda depois da T03)

Seções mínimas, chamando as actions ou os route handlers como as suítes m112
e m113 fazem: cadastro com os campos novos e a view devolvendo os quatro;
CNPJ com máscara e CNPJ inválido; `pix_all_establishments: false` sem lojas;
os cinco itens do foco de revisão; venda sem `bank_account_id` cai na conta
da loja; fiado com conta de outra loja recusa em `bank_account_id`; leitura
das contas PIX da loja para o vendedor e o caixa sem `balance`; relatório de
vendas com `pix_by_account` somando por conta, no total e por loja; isolamento
entre dois tenants na leitura nova.

## Onda 2

### T03: actions, rotas e documentação (`servidor-acao`)

**Arquivos:** `src/lib/actions/emporio-caixa.ts`, `src/lib/actions/emporio-vendas.ts`, `src/lib/actions/emporio-relatorios.ts`, `src/app/api/v1/emporio/bank-accounts/route.ts`, `src/app/api/v1/emporio/bank-accounts/[id]/route.ts`, `src/app/api/v1/emporio/establishments/[id]/pix-accounts/route.ts` (novo), `src/app/(public)/docs/api/endpoints.ts`
**Depende-de:** T01

- `ContaView` ganha `document`, `beneficiary`, `pix_all_establishments`,
  `pix_available_establishment_ids: string[]`.
- `criarContaAction`/`editarContaAction`: os campos novos, Q310, Q311, Q313;
  histórico com as diferenças.
- `definirContaPixAction`: recusa conta indisponível para a loja (Q313).
- `contaPixDisponivelParaLoja(db, contaId, lojaId): Promise<boolean>` exportada
  de `emporio-caixa.ts`, usada pela venda e pelo fiado.
- `listarContasPixDaLojaAction(db, ator, establishment_id)`: exige
  `vendedor_da_loja` na loja; devolve
  `{ id, name, bank, beneficiary, document, is_store_default }[]`, ativas e
  disponíveis, a da loja primeiro. Rota `GET /api/v1/emporio/establishments/[id]/pix-accounts`.
- `prepararVenda`: confere a conta (Q315); opção `contasPixAtuais?: string[]`
  passada por `editarVendaAction` com as contas dos PIX da venda substituída.
  A view do pagamento ganha `bank_account_name`.
- Fiado (`emporio-caixa.ts`, recebimento): mesma conferência, `field`
  `bank_account_id`.
- `relatorioDeVendasAction`: `pix_by_account: { bank_account_id, name, count, amount }[]`
  no total e em cada `por_loja`, das vendas que o relatório já conta.
- `/docs/api` com os campos e a rota nova; `npm run test:docs-api` verde.

## Onda 3

### T04: telas (`tela-pagina`)

**Arquivos:** `src/app/(dashboard)/emporio/_components/conta-form.tsx` (criar e editar), `src/app/(dashboard)/emporio/caixa/page.tsx`, `src/app/(dashboard)/emporio/_components/pix-loja-form.tsx`, `src/app/(dashboard)/emporio/_components/venda-estado.ts`, `src/app/(dashboard)/emporio/_components/venda-campos.tsx`, `src/app/(dashboard)/emporio/vender/page.tsx`, a página de editar venda, `src/app/(dashboard)/emporio/_components/receber-fiado-form.tsx` e quem o renderiza, `src/app/(dashboard)/emporio/vendas/[id]/page.tsx`, `src/app/(dashboard)/emporio/relatorios/page.tsx`
**Depende-de:** T03

- Contas: formulário com identificador, banco, CNPJ, favorecido e "Disponível
  para PIX em": todas as lojas ou lojas marcadas; botão "Editar" por linha;
  tabela mostra CNPJ formatado e onde vale.
- "Definir conta PIX" lista só contas disponíveis para a loja.
- Balcão e editar venda: na linha PIX, select "Conta do PIX" (id de campo
  ligado a `payments`), a da loja marcada, favorecido e CNPJ embaixo; uma
  conta só, já preenchida.
- Fiado: o mesmo select quando a forma é PIX.
- Tela da venda: "PIX (identificador)".
- Relatório: bloco "PIX por conta".
- Impressos não mudam (Q316).

## Onda 4

- Rodar `test:m114` e `test:all`; corrigir o que for da T03/T04.
- Roteiro `scripts/navegador/emporio-contas-pix.py` + cenário, provado nos dois
  sentidos (sabotar a conferência de disponibilidade).
- `prova-juiz` no range da branch; corrigir achados.
- Handoff.
