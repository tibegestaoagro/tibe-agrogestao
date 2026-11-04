# Empório, entrega 1: configurações e impressão da venda. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao Empório uma área de Configurações (cabeçalho por loja, logo, validade do orçamento, rodapés, largura da bobina), um número legível para cada venda, e a impressão da venda em A4 e na bobina, sem valor fiscal.

**Architecture:** dois models novos com `tenant_id` (`EmporioSettings`, 1:1 com a conta, e `EmporioCounter`, contador por chave), campos novos em `Establishment` e `EmporioSale.number`. Actions em `src/lib/actions/emporio-configuracoes.ts` e `src/lib/actions/emporio-impressao.ts`, rotas finas em `src/app/api/v1/emporio/settings/` e `sales/[id]/receipt`. A impressão é uma página server num route group próprio, sem a casca do painel, impressa pelo navegador (`window.print()` por botão, `@page` por formato).

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind (`print:`), scripts `tsx`, roteiros Python pelo `npm run navegador`.

**Spec:** `docs/superpowers/specs/2026-11-04-emporio-orcamento-caixa-impressao-design.md` (seção "Entrega 1"), sobre `docs/specs/module-39-meu-emporio.md`.

## Global Constraints

- As 8 invariantes do `CLAUDE.md`. Nunca travessão (U+2014). Nunca heredoc para escrever conteúdo. Regra de negócio só em `src/lib/actions/*`.
- Todo model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`); `npm run test:isolation` cobra.
- Migração gerada com a URL do Docker inline (`DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`), salva em `prisma/migrations/<timestamp>_emporio_configuracoes_impressao/migration.sql`, aplicada local com `npm run db:deploy` com a mesma URL. Remover do SQL gerado qualquer `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`. **Nunca aplicar no Neon** (é o controlador, com autorização do usuário).
- Toda action de escrita do Empório chama `registrarNoHistorico` (conferência 19 do `npm run check`); a permissão sai de `exigir`/`pode` em `src/lib/emporio/papel.ts`.
- Ordem: action, rota, tela. Rota nova ou mudada entra em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`).
- Campo de formulário com `Field id` = nome do campo na API e `error=` no `<Field>` (conferência 15). Sem `<input type="number">` novo (conferência 7). Cor só por token (conferência 8).
- Suíte nova: `scripts/m91-emporio-impressao.test.ts`, entrada `"test:m91": "tsx scripts/m91-emporio-impressao.test.ts"` no `package.json`; texto impresso "M91: Módulo 39 (Meu Empório), entrega 1: configurações e impressão". Testes rodam com `DATABASE_URL` e `REDIS_URL` locais inline.
- Subagente não commita: deixa no working tree e relata os arquivos.
- O papel diz "sem valor fiscal". Nada de NFC-e.

## Valores fixados

| item | valor |
|---|---|
| `quote_validity_days` | inteiro de 1 a 365, padrão 7. Recusa: `"A validade deve ser de 1 a 365 dias."` |
| `quote_footer`, `sale_footer` | texto até 500 caracteres, vazio vira `null`. Recusa: `"O rodapé aceita até 500 caracteres."` |
| `receipt_width` | `80` ou `58`, padrão 80. Recusa: `"Escolha a largura da bobina: 80 ou 58 mm."` |
| logo | PNG ou JPEG (conferido pelos bytes iniciais, não só pelo mime), até 200 KB depois de decodificado. Recusas: `"O logo deve ser PNG ou JPEG."` e `"O logo deve ter até 200 KB."` |
| CNPJ da loja (`document`) | opcional; `normalizarCnpj` + `cnpjValido` de `src/lib/contatos/cadastro.ts`. Recusa: `"CNPJ inválido. Confira os 14 caracteres."` |
| UF da loja (`state`) | opcional, `UFS` de `src/lib/contatos/cadastro.ts`, em maiúscula. Recusa: `"Escolha a UF da lista."` |
| CEP da loja (`zip`) | opcional, 8 dígitos guardados sem traço. Recusa: `"CEP inválido. Use os 8 números."` |
| `phone`, `whatsapp` da loja | opcionais, texto livre até 40 caracteres, guardados como digitados |
| número da venda | inteiro por conta, começando em 1, sem buraco; exibido com 6 dígitos (`004581`) |
| chaves do contador | `"venda"` agora; `"orcamento"` fica reservada para a entrega 4 |
| Histórico | `configuracoes.editar`, `configuracoes.logo` |
| títulos do papel | A4: `"VENDA"`; bobina: `"COMPROVANTE DE VENDA"` e `"SEM VALOR FISCAL"`; rodapé do A4: `"Documento sem valor fiscal."`; venda cancelada: `"VENDA CANCELADA"` em destaque nos dois |
| menu | item `{ href: "/emporio/configuracoes", rotulo: "Configurações", exige: "gestor_da_loja" }`, último da lista `PAGINAS_DO_EMPORIO` |

## Review Focus

1. **Duas vendas ao mesmo tempo** não podem receber o mesmo número nem deixar buraco (Task 1 testa 5 vendas em `Promise.all`).
2. **Loja sem cabeçalho preenchido** (só o nome): o papel sai sem linhas vazias, sem "CNPJ undefined" (Task 3 testa).
3. **Venda ao Consumidor final** e **venda cancelada**: o papel não mostra bloco de cliente vazio no primeiro caso, e mostra "VENDA CANCELADA" no segundo (Task 3 testa).
4. **Logo grande ou que não é imagem** (um PDF renomeado para .png): recusa no campo, nada gravado (Task 2 testa pelos bytes).
5. **Nome de produto longo na bobina de 58 mm**: quebra em linhas, sem estourar a largura (Task 3 confere no roteiro, Task 5).

---

### Task 1: schema, migração e número da venda

**Files:**
- Modify: `prisma/schema.prisma` (`Establishment`, `EmporioSale`, models novos `EmporioSettings` e `EmporioCounter`, relações em `Tenant`)
- Create: `prisma/migrations/<timestamp>_emporio_configuracoes_impressao/migration.sql`
- Modify: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS` ganha `EmporioSettings` e `EmporioCounter`)
- Create: `src/lib/emporio/numeracao.ts`
- Modify: `src/lib/actions/emporio-vendas.ts` (`gravarVenda`, `VendaView`, a view da lista de vendas)
- Create: `scripts/m91-emporio-impressao.test.ts`; Modify: `package.json`

**Interfaces:**
- Produces: `proximoNumero(tx: Tx, chave: "venda" | "orcamento"): Promise<number>`; `VendaView.number: number`; `formatarNumero(n: number): string` (6 dígitos com zero à esquerda) exportado de `src/lib/emporio/numeracao.ts`.
- Schema produzido (nomes fixos, usados pelas tasks seguintes):
  - `EmporioSettings`: `id`, `tenant_id @unique`, `quote_validity_days Int @default(7)`, `quote_footer String?`, `sale_footer String?`, `receipt_width Int @default(80)`, `logo Bytes?`, `logo_mime String?`, `logo_updated_at DateTime?`, `created_at`, `updated_at`.
  - `EmporioCounter`: `id`, `tenant_id`, `key String`, `value Int`, `@@unique([tenant_id, key])`.
  - `Establishment` ganha `document String?`, `phone String?`, `whatsapp String?`, `state String?`, `zip String?`.
  - `EmporioSale` ganha `number Int` e `@@unique([tenant_id, number])`.

- [ ] **Step 1: Escrever a seção 1 da `m91` (falha):** cria dois tenants com loja e produto com preço e estoque (siga o arranjo de `scripts/m90-emporio-cliente.test.ts`, que vende pelo `venderAction`); checa:
  - a primeira venda do tenant A tem `number === 1`, a segunda `2`;
  - a primeira venda do tenant B tem `number === 1` (contador por conta);
  - 5 vendas em `Promise.all` no tenant A recebem 5 números distintos e consecutivos (`[3,4,5,6,7]` ordenados);
  - `lerVendaAction` devolve `number`;
  - `formatarNumero(4581) === "004581"` e `formatarNumero(1234567) === "1234567"`.
- [ ] **Step 2:** `npm run test:m91` com as URLs locais inline. Esperado: falha (campo `number` inexistente).
- [ ] **Step 3: Schema e migração.** O SQL, além do que o `migrate diff` gerar: acrescenta `number` anulável, preenche as vendas existentes com `ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY sold_at, created_at, id)`, torna `NOT NULL`, cria o índice único, e semeia `EmporioCounter` (`key = 'venda'`, `value = MAX(number)`) para cada tenant com venda (`gen_random_uuid()::text` no `id`). Aplicar no Docker local.
- [ ] **Step 4: `proximoNumero`.** Incremento atômico por `upsert` em `EmporioCounter` (`create: { value: 1 }`, `update: { value: { increment: 1 } }`), devolvendo o `value`; em `P2002` (corrida na criação da linha), tentar de novo uma vez. Chamado em `gravarVenda` dentro da mesma transação, antes do `emporioSale.create`, para a venda que falha não queimar número.
- [ ] **Step 5:** `test:m91` verde; `test:isolation`, `test:m81`, `test:m82`, `test:m90` verdes (vendas continuam saindo).
- [ ] **Step 6:** relatar os arquivos (o controlador commita: `Empório: número da venda e as tabelas de configuração`).

### Task 2: actions e rotas das configurações e do cabeçalho da loja

**Files:**
- Create: `src/lib/actions/emporio-configuracoes.ts`
- Modify: `src/lib/actions/emporio-catalogo.ts` (`EstablishmentView`, `EstablishmentInput`, `validarLoja`, `ROTULOS_LOJA`, `pegarLoja`, criar e editar)
- Create: `src/app/api/v1/emporio/settings/route.ts` (GET, PATCH), `src/app/api/v1/emporio/settings/logo/route.ts` (GET devolve a imagem com o `logo_mime`; PUT recebe `{ data_base64, mime }`; DELETE)
- Modify: `src/app/api/v1/emporio/establishments/route.ts` e `[id]/route.ts` (Zod aceita os cinco campos novos)
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m91-emporio-impressao.test.ts` (seção 2)

**Interfaces:**
- Consumes: schema da Task 1.
- Produces:
  - `type EmporioSettingsView = { quote_validity_days: number; quote_footer: string | null; sale_footer: string | null; receipt_width: 80 | 58; has_logo: boolean; logo_updated_at: string | null }`
  - `lerConfiguracoesAction(db, ator): Promise<ActionResult<EmporioSettingsView>>`: qualquer usuário com papel no Empório (sem linha gravada devolve os padrões, sem criar a linha).
  - `salvarConfiguracoesAction(db, ator, input: Partial<{ quote_validity_days: number; quote_footer: string | null; sale_footer: string | null; receipt_width: number }>)`: `exigir(db, ator, "conta", "alterar as configurações do Empório")`; grava por `upsert`; Histórico `configuracoes.editar` com as diferenças.
  - `salvarLogoAction(db, ator, input: { data_base64: string; mime: string })` e `removerLogoAction(db, ator)`: `conta`; Histórico `configuracoes.logo`.
  - `lerLogo(db): Promise<{ bytes: Uint8Array; mime: string } | null>` (sem permissão própria: a rota GET exige papel no Empório).
  - `EstablishmentView` e `EstablishmentInput` ganham `document`, `phone`, `whatsapp`, `state`, `zip`.

- [ ] **Step 1: Seção 2 da `m91` (falha):**
  - padrões sem linha: `quote_validity_days 7`, `receipt_width 80`, `has_logo false`;
  - Dono salva `{ quote_validity_days: 10, quote_footer: "Pague no Pix", receipt_width: 58 }` e lê de volta; Histórico ganha 1 linha `configuracoes.editar`;
  - Gestor e Vendedor recebem 403 em `salvarConfiguracoesAction`; Vendedor lê (200);
  - recusas com o `field` e a mensagem exata da tabela: validade 0, 366 e 7,5; rodapé de 501 caracteres; largura 70;
  - logo PNG de 1 KB (bytes `89 50 4E 47 0D 0A 1A 0A` mais preenchimento) aceito e `has_logo true`; os bytes de um PDF (`%PDF`) com `mime: "image/png"` recusados com `"O logo deve ser PNG ou JPEG."`; um PNG de 201 KB recusado com `"O logo deve ter até 200 KB."`; remover volta `has_logo false`;
  - tenant B não lê as configurações nem o logo de A (pela rota GET, com o Bearer de B: 200 com os padrões de B, e o logo 404);
  - cabeçalho da loja: Gestor da loja grava `{ document: "12.abc.345/01de-35", state: "mg", zip: "39400-000", phone: "(38) 3221-0000" }` e lê `document "12ABC34501DE35"`, `state "MG"`, `zip "39400000"`; CNPJ `"11222333000180"` recusado em `document`; UF `"XX"` recusada em `state`; CEP `"3940"` recusado em `zip`; a edição vai para o Histórico `estabelecimento.editar` com os rótulos `CNPJ`, `Telefone`, `WhatsApp`, `UF`, `CEP`.
- [ ] **Step 2:** `test:m91` falha nas checagens novas.
- [ ] **Step 3: Implementar** as actions, a validação da loja e as rotas (wrappers finos: `getTenantDb()`, Zod da rota repassando os campos, `fail` em pt-BR com o `field`). A validação do logo decodifica o base64, confere o tamanho e a assinatura (PNG `89 50 4E 47`, JPEG `FF D8 FF`) e ignora o `mime` informado na decisão. A rota GET do logo responde com `Content-Type` do `logo_mime` e `Cache-Control: private, max-age=300`.
- [ ] **Step 4:** documentar as quatro rotas novas e os campos novos da loja em `endpoints.ts`.
- [ ] **Step 5:** `test:m91`, `test:docs-api`, `test:isolation`, `test:m77`, `test:m78` e `npm run check` verdes.
- [ ] **Step 6:** relatar (commit: `Empório: configurações e cabeçalho da loja, pela API`).

### Task 3: o papel da venda (dados, rota e páginas de impressão)

**Files:**
- Create: `src/lib/actions/emporio-impressao.ts`
- Create: `src/app/api/v1/emporio/sales/[id]/receipt/route.ts` (GET)
- Create: `src/app/(impressao)/layout.tsx` (sem a casca do painel, fundo branco, sem menu)
- Create: `src/app/(impressao)/emporio/imprimir/venda/[id]/page.tsx` (`?formato=a4` ou `?formato=cupom`; padrão `a4`)
- Create: `src/components/emporio/impresso/papel-a4.tsx`, `src/components/emporio/impresso/papel-cupom.tsx`, `src/components/emporio/impresso/botao-imprimir.tsx`
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m91-emporio-impressao.test.ts` (seção 3)

**Interfaces:**
- Consumes: `lerVendaAction`, `VendaView.number`, `lerConfiguracoesAction`, `EstablishmentView` com os campos novos, `formatarDocumento` e `formatarCep` de `src/lib/contatos/cadastro.ts`, `formatarNumero`.
- Produces: `type ImpressoVenda = { numero: string; emitida_em: string; cancelada: boolean; loja: { nome: string; documento: string | null; endereco: string | null; telefone: string | null; whatsapp: string | null }; tem_logo: boolean; cliente: { nome: string; documento: string | null; telefone: string | null; endereco: string | null } | null; itens: { produto: string; quantidade: string; preco: number; total: number }[]; subtotal: number; desconto: number; total: number; pagamentos: { forma: string; valor: number }[]; troco: number | null; registrada_por: string | null; rodape: string | null; largura_bobina: 80 | 58 }` e `lerImpressoDaVendaAction(db, ator, saleId): Promise<ActionResult<ImpressoVenda>>`. As entregas 2 a 4 acrescentam campos (vendedor, caixa, orçamento de origem) a este tipo.

- [ ] **Step 1: Seção 3 da `m91` (falha):** sobre uma venda a um cliente PJ com CNPJ e endereço, numa loja com cabeçalho completo:
  - `numero` com 6 dígitos; `loja.documento` formatado (`"12.ABC.345/01DE-35"`); `loja.endereco` junta endereço, cidade, UF e CEP numa linha só, sem vírgula sobrando;
  - `cliente.documento` formatado; `rodape` é o `sale_footer`; `largura_bobina` é a da configuração;
  - a quantidade da venda é contada na apresentação: `itens[0].produto` é `"<nome do produto> (<nome da apresentação>)"` e `itens[0].quantidade` é o número no formato brasileiro (`"2"`, `"12,5"`), como no resumo do balcão;
  - venda ao **Consumidor final**: `cliente === null`;
  - loja **só com o nome**: `loja.documento`, `endereco`, `telefone` e `whatsapp` são `null` (nunca string vazia nem "undefined");
  - venda **cancelada**: `cancelada === true`;
  - venda de outra loja que o Vendedor não alcança: 404; tenant B, pela rota `receipt`: 404.
- [ ] **Step 2:** falha.
- [ ] **Step 3: Implementar** a action (compõe venda, loja, contato e configuração; permissão de leitura igual à de `lerVendaAction`), a rota GET e as páginas. A página lê pela action no servidor e renderiza `PapelA4` ou `PapelCupom` no layout aprovado (seção "Os dois papéis" da spec). O formato do papel vai numa `<style>` da própria página: `@page { size: A4; margin: 12mm }` no A4, `@page { size: 80mm auto; margin: 0 }` (ou `58mm`) na bobina, com o corpo da bobina na largura exata. `BotaoImprimir` é um botão client que chama `window.print()` e é `print:hidden`; **a página não imprime sozinha** (o diálogo travaria os roteiros de navegador). O logo vem da rota GET do logo; sem logo, o bloco some. Na bobina, nome de produto longo quebra linha (`break-words`), e o logo não sai. Até a entrega 3 criar o vendedor, o papel escreve `Vendedor: <registrada_por>` (o nome de quem registrou a venda), e o caixa não aparece. A página exige sessão e papel no Empório; sem permissão, `notFound()`.
- [ ] **Step 4:** documentar a rota `receipt` em `endpoints.ts`.
- [ ] **Step 5:** `test:m91`, `test:docs-api` e `npm run check` verdes; `npx tsc --noEmit -p .` limpo.
- [ ] **Step 6:** relatar (commit: `Empório: o papel da venda em A4 e na bobina`).

### Task 4: as telas: Configurações, cabeçalho da loja, botões de imprimir e o número

**Files:**
- Create: `src/app/(dashboard)/emporio/configuracoes/page.tsx` e `src/app/(dashboard)/emporio/configuracoes/_components/configuracoes-form.tsx`, `logo-form.tsx`
- Modify: `src/app/(dashboard)/emporio/_components/estabelecimento-form.tsx` (os cinco campos novos, com `Field id` igual ao campo da API e `error=`)
- Modify: `src/lib/emporio/paginas.ts` (o item de Configurações, da tabela de valores)
- Modify: `src/app/(dashboard)/emporio/_components/balcao.tsx` (resumo "Venda registrada" ganha "Venda nº 004581" e os links **Imprimir A4** e **Imprimir cupom**, `target="_blank"`)
- Modify: `src/app/(dashboard)/emporio/vendas/[id]/page.tsx` (número no título e os dois links) e a lista `src/app/(dashboard)/emporio/vendas/page.tsx` (coluna Nº)
- Modify: `scripts/nav-build.test.ts` e `scripts/navegador/emporio-cliente-menu.py` (`ITENS_DO_DONO` ganha `/emporio/configuracoes` no fim; o Vendedor não o vê)

**Interfaces:**
- Consumes: as rotas da Task 2 (`apiPatch("/api/v1/emporio/settings", ...)`, `PUT` do logo com o arquivo lido como base64 no client), a página de impressão da Task 3 (`/emporio/imprimir/venda/<id>?formato=a4|cupom`).

- [ ] **Step 1:** atualizar `nav-build.test.ts` para esperar o item novo (Dono e Gestor veem; Vendedor não) e ver falhar.
- [ ] **Step 2: Página de Configurações.** Duas seções: **"Impressão e orçamento"** (validade, rodapé do orçamento, rodapé da venda, largura da bobina e o logo, com prévia e remover; editável só por quem passa em `conta`, e só leitura para o Gestor) e **"Cabeçalho das lojas"** (um cartão por loja visível com nome, CNPJ, endereço e telefones, e o botão que abre o `EstabelecimentoForm` daquela loja). Painéis de escrita pela receita do `FormSheet` (`.claude/rules/ui.md`). Validade e largura sem `<input type="number">`.
- [ ] **Step 3: `EstabelecimentoForm`** com CNPJ (mesma máscara alfanumérica de `mascararDocumento` de `src/components/contatos/campos-do-cadastro.tsx`), telefone, WhatsApp, UF (lista `UFS`) e CEP (`mascararCep`).
- [ ] **Step 4:** os links de imprimir e o número no balcão, na tela da venda e na lista.
- [ ] **Step 5:** `nav-build` verde; `npm run check` e `tsc` limpos; `npm run test:m90` verde.
- [ ] **Step 6:** relatar (commit: `Empório: tela de Configurações e os botões de imprimir`).

### Task 5: validação viva, decisões na spec e handoff

**Files:**
- Create: `scripts/navegador/emporio-impressao.py`
- Modify: `docs/specs/module-39-meu-emporio.md` (Q145 em diante: Configurações do Empório, número da venda, impressão A4 e bobina sem valor fiscal, logo no banco, impressão pelo navegador)
- Modify: `docs/agents/current-handoff.md`

- [ ] **Step 1: Roteiro** (cabeçalho: `# cenario: scripts/_cenario-emporio-f6b.ts`, `# sessao: owner owner@damata.com.br`, `# sessao: vendedor1 f6b-vendedor1@teste.local`; siga `scripts/navegador/emporio-cliente-menu.py`):
  1. Dono abre `/emporio/configuracoes`, salva validade 10, rodapé da venda "Obrigado, volte sempre" e bobina 58; a recusa de validade 0 fica no campo.
  2. Dono envia um logo PNG pequeno (gerado no roteiro) e vê a prévia.
  3. Dono preenche o cabeçalho da Loja 1 com CNPJ alfanumérico em minúscula e vê em maiúscula.
  4. Vende pelo balcão ao Consumidor final; o resumo mostra "Venda nº" e os dois links.
  5. Abre `?formato=a4`: confere "VENDA", o número, o CNPJ da loja, "Documento sem valor fiscal.", e o logo carregado (`naturalWidth > 0`); sem bloco de cliente.
  6. Abre `?formato=cupom`: confere "COMPROVANTE DE VENDA", "SEM VALOR FISCAL", o rodapé, a regra `@page` com `58mm` (lida das folhas de estilo da página), e que nenhum elemento passa da largura do papel (`scrollWidth <= clientWidth`).
  7. Vendedor: não vê Configurações no menu; abre o papel da venda da loja dele.
  8. Celular (390 px): a tela de Configurações sem rolagem horizontal.
- [ ] **Step 2:** rodar com a correção e ver verde; desfazer o `@page` da bobina (ou a passagem do número) e ver o roteiro reprovar; restaurar.
- [ ] **Step 3:** spec e handoff com os fatos verificados.
- [ ] **Step 4:** `npm run test:all -- --sem-redis` com as URLs locais: tudo verde.
- [ ] **Step 5:** relatar (commit: `Empório: roteiro da impressão e decisões Q145 em diante`).
