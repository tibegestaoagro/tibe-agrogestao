# Empório: balcão rápido (frente D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o balcão ganha atalhos de teclado configuráveis com legenda, a apresentação ganha código de barras (digitado ou gerado, editável) que o leitor usa na busca, e uma tela imprime etiquetas de prateleira em folha A4 ou rolo, com as medidas nas Configurações do Empório.

**Architecture:** `ProductPresentation.barcode` (anulável, índice comum) e colunas novas em `EmporioSettings`. Duas libs puras (`codigo-de-barras.ts`: validar, normalizar, dígito, padrão EAN; `atalhos.ts`: teclas permitidas e tecla do evento). A unicidade e a geração vivem em `emporio-catalogo.ts`, em transação serializável; as configurações do balcão numa sub-rota de `settings`, como fiado e alçada. Telas: campo no painel da apresentação, leitura e atalhos no balcão, seção nas Configurações, tela de etiquetas e página de impressão com as barras em SVG.

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, suítes `tsx`, roteiro Python.

**Spec:** `docs/superpowers/specs/2026-11-18-emporio-balcao-rapido-design.md` (Q357 a Q361 e as respostas da revisão)

## Global Constraints

- Nunca travessão (U+2014). Edição só com Edit/Write; nada de heredoc com escape.
- Migração ANTES do push (invariante 3); Docker local primeiro, com a URL inline. Neon só com autorização do usuário.
- Código aceito: só dígitos, 8, 12 ou 13, dígito verificador conferido; aparado; vazio vira `null`; o de 12 é gravado com "0" na frente. Mensagens em `barcode`, 422: "O código de barras tem 8 ou 13 números." e "O código de barras não confere: verifique os números.".
- Único entre apresentações ativas (apresentação e produto sem `archived_at`) da conta: 409 `BARCODE_IN_USE` em `barcode`, mensagem nomeando produto e apresentação ("Este código já está em <produto> · <apresentação>."). Vale em criar, editar, desarquivar apresentação e desarquivar produto. Transação serializável.
- Código gerado: "20" + 10 dígitos de `EmporioCounter` (chave `codigo_de_barras`) + verificador; pula os usados em apresentação ativa; não grava na apresentação.
- Gravar código exige `cadastrar_produto`; ler é de quem vê o produto. Configurações do balcão exigem `conta`.
- Teclas permitidas: `F2`, `F4`, `F8`, `F9`, `Ctrl+Enter`, `Alt+1` a `Alt+9`. Padrões: produto `F2`, cliente `F4`, vendedor `F8`, pagamento `F9`, fechar `Ctrl+Enter`. Tecla repetida entre ações: 422 no campo da segunda.
- Medidas padrão: A4 3 x 7, 63,5 x 38,1 mm, margem de cima 15,15, esquerda 7,2, entre colunas 2,5, entre linhas 0; rolo 40 x 25 mm, 1 coluna, 2 mm entre colunas; formato padrão `a4`. A grade da folha tem de caber em 210 x 297 mm; rolo de 1 a 3 colunas.
- Toda escrita com `registrarNoHistorico` (conferência 19); recusas com `fail(..., field)` e `apiErroDeZod`; `/docs/api` atualizado.
- Suíte nova: `test:m123` (`scripts/m123-emporio-balcao-rapido.test.ts`), com entrada no `package.json`.
- Nenhuma dependência nova no `package.json` (barras desenhadas em SVG por nós).

## Review Focus

1. **Enter do leitor no balcão com itens já na venda:** adiciona o produto e não envia o formulário. Teste na Task 6 (roteiro, digitando o código + Enter com itens na lista).
2. **Leitura entra na apresentação lida, não na padrão:** produto com duas apresentações, código da segunda. Teste na Task 3 (catálogo traz `barcode` por apresentação) e na Task 6.
3. **Código de 12 dígitos lido contra o gravado com o 0:** acha a mesma apresentação. Teste na Task 3 (normalização) e na Task 6.
4. **Desarquivar com código tomado:** apresentação e produto, 409 e nada muda. Teste na Task 3.
5. **Atalho com o foco num campo de texto:** age e não escreve a tecla (Alt+1 não deixa "1" no campo). Teste na Task 6.

---

### Task 1: schema e migração (sessão principal)

**Files:** `prisma/schema.prisma` (`ProductPresentation`, `EmporioSettings`), `prisma/migrations/20261118150000_emporio_balcao_rapido/migration.sql`

- [ ] `ProductPresentation.barcode String?` com comentário da Q358 e `@@index([tenant_id, barcode])`.
- [ ] `EmporioSettings`: `shortcut_product String @default("F2")`, `shortcut_customer "F4"`, `shortcut_seller "F8"`, `shortcut_payment "F9"`, `shortcut_close "Ctrl+Enter"`, `show_shortcut_legend Boolean @default(true)`, `label_default_format String @default("a4")`, `label_a4_columns Int @default(3)`, `label_a4_rows Int @default(7)`, `label_a4_width`, `label_a4_height`, `label_a4_margin_top`, `label_a4_margin_left`, `label_a4_gap_x`, `label_a4_gap_y` (`Decimal @db.Decimal(6, 2)` com os padrões das Global Constraints), `label_roll_width` 40, `label_roll_height` 25 (Decimal 6,2), `label_roll_columns Int @default(1)`, `label_roll_gap_x` 2 (Decimal 6,2). Comentário da Q361.
- [ ] SQL pelo `migrate diff` com a URL do Docker inline (tirar os dois `DROP INDEX` dos índices parciais); `db:deploy` no Docker; `npx prisma generate`; `migrate diff` vazio; `tsc`.
- [ ] Commit.

### Task 2: servidor (`servidor-acao`)

**Files:**
- Create: `src/lib/emporio/codigo-de-barras.ts`, `src/lib/emporio/atalhos.ts`, `src/app/api/v1/emporio/presentations/barcode/route.ts` (POST), `src/app/api/v1/emporio/settings/balcao/route.ts` (PATCH)
- Modify: `src/lib/actions/emporio-catalogo.ts` (criar, editar e desarquivar apresentação; desarquivar produto; GET do produto com `barcode`; a action de gerar), as rotas de apresentação (`products/[id]/presentations`, `presentations/[id]`), `src/app/(dashboard)/emporio/_components/catalogo-venda.ts` e o tipo `ProdutoVenda` em `venda-estado.ts` (só o campo `barcode` em cada apresentação), `src/lib/actions/emporio-configuracoes.ts` (ler devolve os campos novos; action nova), `src/lib/emporio/historico.ts` (`ACOES_DO_HISTORICO` com a ação nova de configuração), `src/app/(public)/docs/api/endpoints.ts`.

**Interfaces (produz):**
- `codigo-de-barras.ts`:
  - `digitoVerificadorEan(semDigito: string): number`
  - `normalizarCodigoDeBarras(bruto: string | null | undefined): { ok: true; codigo: string | null } | { ok: false; mensagem: string }` (12 vira 13 com "0"; vazio vira `null`)
  - `modulosEan(codigo: string): string` (8 ou 13 dígitos; devolve "1" e "0" por módulo, guardas incluídas: 95 módulos no EAN-13, 67 no EAN-8)
  - `codigoParaBusca(texto: string): string | null` (só dígitos 8 a 14; 12 vira 13; senão `null`)
- `atalhos.ts`:
  - `TECLAS_PERMITIDAS: readonly string[]`, `ACOES_DE_ATALHO = ["produto","cliente","vendedor","pagamento","fechar"] as const`, `type AcaoDeAtalho`
  - `ATALHOS_PADRAO: Record<AcaoDeAtalho, string>`
  - `teclaDoEvento(e: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null` (no formato de `TECLAS_PERMITIDAS`)
- Apresentação: `barcode` (string ou `null`) no corpo do POST e do PATCH e na resposta; recusas das Global Constraints.
- `gerarCodigoDeBarrasAction(db, ator): Promise<ActionResult<{ barcode: string }>>` e `POST /api/v1/emporio/presentations/barcode` (exige `cadastrar_produto` em alguma loja).
- `ProdutoVenda.apresentacoes[].barcode: string | null`.
- `ConfiguracoesView` ganha `shortcuts: Record<AcaoDeAtalho, string>`, `show_shortcut_legend: boolean`, `label_default_format: "a4" | "rolo"`, `label_a4: { columns, rows, width, height, margin_top, margin_left, gap_x, gap_y }`, `label_roll: { width, height, columns, gap_x }` (números).
- `salvarConfiguracoesDoBalcaoAction(db, ator, input)` e `PATCH /api/v1/emporio/settings/balcao` com os campos planos: `shortcut_product`, `shortcut_customer`, `shortcut_seller`, `shortcut_payment`, `shortcut_close`, `show_shortcut_legend`, `label_default_format`, `label_a4_columns`, `label_a4_rows`, `label_a4_width`, `label_a4_height`, `label_a4_margin_top`, `label_a4_margin_left`, `label_a4_gap_x`, `label_a4_gap_y`, `label_roll_width`, `label_roll_height`, `label_roll_columns`, `label_roll_gap_x` (todos opcionais; recusa no próprio campo). Histórico `configuracoes.balcao` com antes e depois.

- [ ] Implementar; `tsc`, `test:isolation`, `test:docs-api`, `check`; rodar as suítes do catálogo e das configurações que existirem (`grep -l "presentations\|settings" scripts/m*.test.ts`) e relatar.
- [ ] Commit (sessão principal).

### Task 3: suíte `test:m123` (`prova-suite`, em paralelo à Task 2, escrita da spec)

**Files:** Create `scripts/m123-emporio-balcao-rapido.test.ts`; Modify `package.json`.

- [ ] Seções:
  1. pura: `digitoVerificadorEan` e `normalizarCodigoDeBarras` com `4006381333931` (válido), `4006381333932` (não confere), `96385074` (EAN-8 válido), `036000291452` (UPC-A, vira `0036000291452`), `"  "` (nulo), `12345` e letras (422 de tamanho); `modulosEan` com 95 e 67 módulos, guardas `101`/`01010`/`101`, e os dígitos codificados conferidos contra a tabela L, G e R do padrão EAN (paridade do primeiro dígito); `codigoParaBusca`; `teclaDoEvento` (F2, Ctrl+Enter, Alt+3, Shift+C dá `null`, F5 dá `null`).
  2. apresentação: criar e editar com código; trocar provisório pelo oficial; limpar (nulo); repetido em outra apresentação ativa 409 `BARCODE_IN_USE` nomeando o dono; o mesmo código em apresentação arquivada não bloqueia; desarquivar apresentação com código tomado 409 e segue arquivada; produto arquivado solta o código e desarquivar o produto com código tomado dá 409; Histórico com antes e depois; Vendedor sem a chave 403; outro tenant não vê nem colide.
  3. gerar: começa com "20", 13 dígitos, verificador válido, dois pedidos seguidos diferentes, pula um "20..." já digitado em apresentação ativa; 403 sem a chave.
  4. corrida: duas gravações simultâneas do mesmo código em apresentações diferentes, só uma passa.
  5. catálogo do balcão: `barcode` por apresentação; produto arquivado fora.
  6. configurações: ler com os padrões; salvar teclas e medidas; tecla fora da lista 422 no campo; tecla repetida 422 no campo da segunda; grade A4 que não cabe 422; rolo com 4 colunas 422; medida zero ou negativa 422; sem a chave `conta` 403; Histórico.
- [ ] Vermelha no HEAD da Task 1 (relatar quantas), verde depois da Task 2. Commit (sessão principal).

### Task 4: balcão, apresentação e configurações (`tela-pagina`)

**Files:** `_components/apresentacao-form.tsx` (campo "Código de barras" no `ORDEM`, botão "Gerar código", Enter no campo não envia), `_components/venda-campos.tsx` (Enter na busca: `codigoParaBusca` casando exatamente com `barcode` de uma apresentação entra nela pelo mesmo caminho de `adicionarProduto`; "Nenhum produto com o código X"; a busca parcial também olha o `barcode`), `_components/venda-estado.ts` (`adicionarProduto` aceita a apresentação escolhida; `produtoCasaBusca` com `barcode`), `_components/balcao.tsx` (atalhos e legenda), Create `_components/atalhos-do-balcao.tsx` (hook do listener e a legenda), `vender/page.tsx` (passa as teclas e a legenda das configurações), `configuracoes/page.tsx` e Create `configuracoes/_components/balcao-etiquetas-form.tsx` (seção "Balcão e etiquetas", FormSheet do kit, `ORDEM` com todos os campos do PATCH, "Voltar ao padrão").

- [ ] Atalhos: um listener de `keydown` no balcão; não age com janela ou painel aberto (`[role=dialog]` visível); `preventDefault` só quando a tecla é de uma ação; alvo ausente não faz nada. Produto: foco na busca. Cliente: clica "Escolher cliente" ou, com cliente, "Trocar". Vendedor: foco no campo Vendedor. Pagamento: foco no primeiro botão "+ forma". Fechar: clica no botão principal do rodapé ("Fechar a venda", "Salvar a venda nova" ou "Salvar orçamento"). Legenda só a partir de `md` e com `show_shortcut_legend`.
- [ ] `check`, `tsc`, `lint`; relatar arquivos; commit pela sessão principal.

### Task 5: etiquetas e impressão (`tela-pagina`, em paralelo à Task 4)

**Files:** Create `src/components/emporio/codigo-de-barras.tsx` (SVG a partir de `modulosEan`, número embaixo), `src/app/(dashboard)/emporio/produtos/etiquetas/page.tsx` e `_components/etiquetas-escolha.tsx` (loja das lojas da pessoa com `cadastrar_produto`; formato com o padrão das configurações; lista com busca, "Selecionar todas", cópias, "sem preço" desabilitado, "sem código"; A4 com "Começar na etiqueta nº"; estado vazio "Nenhum produto com preço nesta loja"), `src/app/(impressao)/emporio/imprimir/etiquetas/page.tsx` (lê `loja`, `formato`, `itens=<presentationId>:<copias>,...`, `inicio`; confere no servidor permissão, loja e preço; `@page` com o tamanho do formato; posições em mm pelas configurações; nome em até duas linhas, apresentação, preço, barras; abre o diálogo de impressão do navegador ao carregar, como os outros impressos), link "Etiquetas" na lista de Produtos.

- [ ] `check`, `tsc`, `lint`; relatar arquivos; commit pela sessão principal.

### Task 6: roteiro `emporio-balcao-rapido` (`prova-viva`)

**Files:** Create `scripts/_cenario-emporio-balcao-rapido.ts` (prefixo próprio, `--limpar`, devolve as configurações que mudar) e `scripts/navegador/emporio-balcao-rapido.py`.

- [ ] No navegador: cadastrar código oficial e gerar um interno; repetido recusado embaixo do campo; no balcão, digitar o código + Enter adiciona na apresentação lida, de novo soma 1, com itens já na venda não fecha; código de 12 dígitos; desconhecido avisa; teclas reais (CDP `Input.dispatchKeyEvent`) F2, F4, F8, F9, Ctrl+Enter, e uma tecla trocada nas configurações passando a valer, sem escrever no campo; legenda some a 390 px; etiquetas A4 e rolo com posições medidas em mm e "começar na etiqueta nº"; 390 px sem rolagem horizontal nas telas novas.
- [ ] Provado nos dois sentidos (sabotar, ver falhar, restaurar). Relatar sem commitar.

### Task 7: fechamento (sessão principal)

- [ ] Manual: cadastrar e gerar código, vender com leitor, atalhos, imprimir etiquetas, configurar; figuras só as que a frente mudou.
- [ ] `test:all`, juiz (`prova-juiz`, sonnet), correções provadas nos dois sentidos, handoff, push da branch.
- [ ] Pedir ao usuário, separadas: a migração no Neon (URL Direct) e o merge com push.
