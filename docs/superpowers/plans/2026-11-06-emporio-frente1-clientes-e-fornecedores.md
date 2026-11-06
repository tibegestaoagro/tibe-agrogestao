# Empório, Frente 1: clientes e fornecedores próprios. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Empório passa a ter clientes e fornecedores em tabelas próprias, separadas de `Contact`, com as telas Clientes e Fornecedores no grupo "Meu Empório", os obrigatórios novos (PF: nome e telefone; PJ: nome, telefone, CNPJ e endereço principal completo), o orçamento aceitando o Consumidor final, a compra de uma propriedade do Dono só com custo, e os dados de produção migrados sem perder o nome de quem deve.

**Architecture:** Dois models novos, `EmporioCustomer` e `EmporioSupplier`. As colunas `contact_id` de `EmporioSale`, `EmporioQuote`, `EmporioCheck` e `EmporioPurchase` dão lugar a `customer_id` e `supplier_id`, e o `FinancialEntry` ganha `emporio_customer_id` e `emporio_supplier_id` (a ponte com o financeiro). A troca é feita em duas migrações: a primeira só acrescenta (Task 2); o código passa para as tabelas novas (Tasks 3 a 5); a segunda copia os dados, reponta, apaga as colunas velhas e tira de Contatos o que era só do Empório (Task 6). A regra do que é obrigatório é uma função pura, usada pelo cadastro e, no plano 3, pelo pedido para entrega.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Postgres 17, Zod 4, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-06-emporio-clientes-fornecedores-romaneio-design.md`, seção "Frente 1: clientes e fornecedores do Empório" (mais a regra "REVISA a entrega 4" da Frente 3, só a parte do orçamento sem entrega). Spec do módulo: `docs/specs/module-39-meu-emporio.md`; as decisões desta frente entram a partir da **Q191**.

## Interfaces que os planos 2 e 3 usam

Os planos 2 (escolha do cliente) e 3 (pedido para entrega e romaneio) dependem destes nomes. Não os mude sem atualizar este bloco.

**Models (`prisma/schema.prisma`):**

| model / coluna | definição |
|---|---|
| `EmporioCustomer` (`db.emporioCustomer`) | `id`, `tenant_id`, `name`, `name_busca` (coluna gerada `nome_de_busca(name)`, como `Contact.name_busca`), `person_kind ContactPersonKind?`, `document String?` (só dígitos no CPF, maiúsculo no CNPJ), `phone`, `state_registration`, `birth_date DateTime? @db.Date`, `responsible_name`, `address_zip`, `address_street`, `address_number`, `address_complement`, `address_district`, `city` (cidade do endereço principal), `address_state`, `delivery_zip`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_district`, `delivery_city`, `delivery_state`, `notes`, `system_key String?` ("consumidor_final"), `archived_at`, `created_at`, `updated_at`. Únicos `[tenant_id, document]` e `[tenant_id, system_key]`; índice `[tenant_id]` |
| `EmporioSupplier` (`db.emporioSupplier`) | `id`, `tenant_id`, `kind EmporioSupplierKind` (`propriedade` \| `externo`), `property_id String?` (FK `Property`, `onDelete: SetNull`), `name` (na propriedade, a cópia do nome dela), `name_busca` (gerada), `person_kind ContactPersonKind?`, `document`, `phone`, `state_registration`, `address_zip`, `address_street`, `address_number`, `address_complement`, `address_district`, `city`, `address_state`, `notes`, `archived_at`, `created_at`, `updated_at`. Únicos `[tenant_id, document]` e `[tenant_id, property_id]`; índice `[tenant_id]` |
| `EmporioSale.customer_id` | `String?`, relação `customer`, `onDelete: Restrict`, índice `[tenant_id, customer_id]` |
| `EmporioQuote.customer_id` | `String` (anulável só entre a Task 2 e a Task 6), relação `customer`, `Restrict`, índice `[tenant_id, customer_id]` |
| `EmporioCheck.customer_id` | `String` (idem), relação `customer`, `Restrict`, índice `[tenant_id, customer_id]` |
| `EmporioPurchase.supplier_id` | `String?`, relação `supplier`, `onDelete: SetNull`, índice `[tenant_id, supplier_id]` |
| `EmporioPurchase.payment_kind` | passa a `EmporioPurchasePaymentKind?`: nulo na compra de propriedade |
| `FinancialEntry.emporio_customer_id` | `String?`, relação `emporio_customer`, `SetNull`, índice. Fiado, cheque e devolução apontam aqui |
| `FinancialEntry.emporio_supplier_id` | `String?`, relação `emporio_supplier`, `SetNull`, índice. Conta a pagar da compra aponta aqui |
| `FinancialEntry.contact_id` | continua, só para a fazenda. Lançamento do Empório nunca o preenche depois deste plano |

As colunas `contact_id` das quatro tabelas do Empório deixam de existir na Task 6.

**Campo na API:** `contact_id` vira `customer_id` em venda, troca, orçamento, fiado e cheque, e `supplier_id` na compra. As views trocam `contact_id`/`contact_name` por `customer_id`/`customer_name` (venda, fiado, cheque) e `supplier_id`/`supplier_name`/`supplier_kind` (compra); `OrcamentoView.contact` vira `OrcamentoView.customer`. A recusa de cliente sai no `field` `customer_id`; a de fornecedor, em `supplier_id`.

**Regra pura (`src/lib/emporio/cliente-cadastro.ts`, Task 1):**

```ts
export type EnderecoDoPedido = {
  zip: string | null; street: string | null; number: string | null; complement: string | null;
  district: string | null; city: string | null; state: string | null;
};
export type ClienteParaConferir = {
  name: string | null; person_kind: "pf" | "pj" | null; phone: string | null; document: string | null;
  address_zip: string | null; address_street: string | null; address_number: string | null;
  address_complement: string | null; address_district: string | null; city: string | null; address_state: string | null;
  delivery_zip?: string | null; delivery_street?: string | null; delivery_number?: string | null;
  delivery_complement?: string | null; delivery_district?: string | null; delivery_city?: string | null; delivery_state?: string | null;
  system_key?: string | null;
};
export type Falta = { field: string; message: string };
export function faltaNoCadastro(c: ClienteParaConferir): Falta | null;      // "completo para o tipo"; Consumidor final: null
export function faltaParaEntrega(c: ClienteParaConferir, endereco: EnderecoDoPedido | null): Falta | null; // "completo para entrega"
export function enderecoCompleto(e: EnderecoDoPedido | null): boolean;     // CEP, rua, número, bairro, cidade, UF
export function enderecoPrincipalDe(c: ClienteParaConferir): EnderecoDoPedido;
export function enderecoDeEntregaDe(c: ClienteParaConferir): EnderecoDoPedido | null; // nulo se os 7 campos de entrega estão vazios
export function ehConsumidorFinal(c: { system_key?: string | null }): boolean;
export function recusaDocumentoRepetido(quem: "cliente" | "fornecedor", r: { name: string; archived: boolean }, documento: string): ActionResult<never>;
```

`faltaParaEntrega` devolve o endereço que falta com `field` `delivery_zip`, `delivery_street`, `delivery_number`, `delivery_district`, `delivery_city` ou `delivery_state`. O plano 3 deve dar esses mesmos nomes às colunas do endereço copiado para o orçamento e a venda, para a recusa cair no campo certo sem tradução. Neste plano a função é testada, mas ninguém a chama.

**Actions (`src/lib/actions/emporio-clientes.ts`, Tasks 3 e 4):**

```ts
export type ClienteInput = CadastroDoContato & { name?: string | null; notes?: string | null };
export type ClienteView = {
  id: string; name: string; person_kind: "pf" | "pj" | null; document: string | null; phone: string | null;
  state_registration: string | null; birth_date: string | null; responsible_name: string | null;
  address_zip: string | null; address_street: string | null; address_number: string | null; address_complement: string | null;
  address_district: string | null; city: string | null; address_state: string | null;
  delivery_zip: string | null; delivery_street: string | null; delivery_number: string | null; delivery_complement: string | null;
  delivery_district: string | null; delivery_city: string | null; delivery_state: string | null;
  notes: string | null; archived: boolean; incomplete: boolean; fixed: boolean;
};
export type ClienteLinha = Pick<ClienteView, "id" | "name" | "person_kind" | "document" | "phone" | "incomplete" | "fixed" | "archived">;
export type ClienteFichaView = ClienteView & {
  resumo: { total_comprado: number; ultima_compra_em: string | null; vendas_ativas: number };
  vendas: { id: string; numero: string; sold_at: string; loja: string; situacao: "ativa" | "cancelada" | "trocada" | "devolvida";
            total: number; formas: string[]; vendedor: string | null;
            itens: { produto: string; apresentacao: string | null; quantity: number; total: number }[] }[];
  orcamentos: { id: string; numero: string; created_at: string; loja: string; valor: number; situacao: "aberto" | "vencido" | "faturado" }[];
};
cadastrarClienteAction(db, ator, input: ClienteInput): Promise<ActionResult<ClienteView>>
editarClienteAction(db, ator, id: string, input: Partial<ClienteInput>): Promise<ActionResult<ClienteView>>
arquivarClienteAction(db, ator, id: string, arquivado: boolean): Promise<ActionResult<ClienteView>>
listarClientesAction(db, ator, f: { q?: string; arquivados?: boolean; pagina?: number; por_pagina?: number }):
  Promise<ActionResult<{ itens: ClienteLinha[]; total: number; pagina: number; por_pagina: number }>>
lerClienteAction(db, ator, id: string): Promise<ActionResult<ClienteFichaView>>
garantirConsumidorFinal(db): Promise<{ id: string; name: string }>   // mesmo nome e assinatura de hoje, sobre a tabela nova
```

**Actions (`src/lib/actions/emporio-fornecedores.ts`, Task 5):**

```ts
export type FornecedorInput = Omit<CadastroDoContato, "birth_date" | "responsible_name" | `delivery_${string}`> & {
  kind?: "propriedade" | "externo"; property_id?: string | null; name?: string | null; notes?: string | null;
};
export type FornecedorView = {
  id: string; kind: "propriedade" | "externo"; property_id: string | null; name: string;
  person_kind: "pf" | "pj" | null; document: string | null; phone: string | null; state_registration: string | null;
  address_zip: string | null; address_street: string | null; address_number: string | null; address_complement: string | null;
  address_district: string | null; city: string | null; address_state: string | null; notes: string | null; archived: boolean;
};
export type FornecedorLinha = Pick<FornecedorView, "id" | "kind" | "name" | "document" | "phone" | "archived">;
cadastrarFornecedorAction(db, ator, input: FornecedorInput): Promise<ActionResult<FornecedorView>>
editarFornecedorAction(db, ator, id: string, input: Partial<FornecedorInput>): Promise<ActionResult<FornecedorView>>
arquivarFornecedorAction(db, ator, id: string, arquivado: boolean): Promise<ActionResult<FornecedorView>>
listarFornecedoresAction(db, ator, f: { q?: string; arquivados?: boolean; pagina?: number; por_pagina?: number }):
  Promise<ActionResult<{ itens: FornecedorLinha[]; total: number; pagina: number; por_pagina: number }>>
lerFornecedorAction(db, ator, id: string): Promise<ActionResult<FornecedorView>>
listarPropriedadesLivresAction(db, ator): Promise<ActionResult<{ id: string; name: string }[]>> // propriedades ativas que ainda não são fornecedor
```

**Rotas (todas por `guardEmporio`):**

| rota | action |
|---|---|
| `GET /api/v1/emporio/customers?q=&archived=1&page=&per_page=` | `listarClientesAction`; `meta: { total, page, per_page }` |
| `POST /api/v1/emporio/customers` | `cadastrarClienteAction` (201) |
| `GET /api/v1/emporio/customers/:id` | `lerClienteAction` |
| `PATCH /api/v1/emporio/customers/:id` | `editarClienteAction` |
| `PATCH /api/v1/emporio/customers/:id/archive` `{ archived }` | `arquivarClienteAction` |
| `GET` / `POST /api/v1/emporio/suppliers` | `listarFornecedoresAction` / `cadastrarFornecedorAction` |
| `GET` / `PATCH /api/v1/emporio/suppliers/:id` | `lerFornecedorAction` / `editarFornecedorAction` |
| `PATCH /api/v1/emporio/suppliers/:id/archive` `{ archived }` | `arquivarFornecedorAction` |
| `GET /api/v1/emporio/suppliers/property-options` | `listarPropriedadesLivresAction` |

O plano 2 acrescenta a busca (`buscarClientesAction`, `buscarFornecedoresAction` e as rotas dela) e troca o filtro por nome da tela Clientes pelo componente de busca. O formulário do cliente (`src/app/(dashboard)/emporio/_components/cliente-form.tsx`, modos `novo` e `completar`) é o que o plano 2 abre pelo botão "Cadastrar novo cliente" e o plano 3 pelo "Completar cadastro".

**Telas:** `/emporio/clientes`, `/emporio/clientes/[id]`, `/emporio/fornecedores`, `/emporio/fornecedores/[id]`. Nos seletores de venda, troca, orçamento e compra continua a lista de seleção (lendo das tabelas novas).

## Global Constraints

- **As oito invariantes do `CLAUDE.md`.** Em especial: nunca travessão (U+2014); nada de heredoc para escrever arquivo (SQL inclusive: use Write/Edit); regra de negócio em `src/lib/actions`, com a rota fina; migração antes do push; todo model com `tenant_id` em `TENANT_SCOPED_MODELS` (`npm run test:isolation`).
- **Banco de produção:** o `.env` aponta para o Neon. Toda suíte, `migrate diff`, `db:deploy` e cenário levam a URL do Docker inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m95`
  **Nada é aplicado no Neon neste plano**, salvo o passo parado da Task 10, com autorização do usuário na conversa.
- **Ordem action, rota, tela.** Toda rota nova ou mudada é documentada em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`), com a troca `contact_id` para `customer_id`/`supplier_id` dita na descrição.
- **Permissão** sai de `src/lib/emporio/papel.ts` (`exigir`, `pode`, `lojasDoAtor` de `emporio-catalogo.ts`):

  | ação | `exigir` |
  |---|---|
  | cadastrar, editar e ler cliente; listar clientes | `vendedor_da_loja` (Vendedor, Caixa, Gestor, Gerente geral, Dono) |
  | arquivar e desarquivar cliente | `gestor_da_loja` |
  | cadastrar e editar fornecedor | `chave:lancar_compra` |
  | ler e listar fornecedor, opções de propriedade | `fora_do_caixa` |
  | arquivar e desarquivar fornecedor | `gestor_da_loja` |

- **Histórico:** toda escrita chama `registrarNoHistorico` na mesma transação (conferência 19). Chaves novas no catálogo `ACOES_DO_HISTORICO` (`src/lib/emporio/historico.ts`): `cliente.editar` "Editou um cliente", `cliente.arquivar` "Arquivou um cliente", `cliente.desarquivar` "Desarquivou um cliente", `fornecedor.cadastrar` "Cadastrou um fornecedor", `fornecedor.editar` "Editou um fornecedor", `fornecedor.arquivar` "Arquivou um fornecedor", `fornecedor.desarquivar` "Desarquivou um fornecedor". `cliente.cadastrar` e `cliente.completar` ficam (as linhas antigas). `target_type` passa a `cliente` e `fornecedor`; `linkDoAlvo` leva `cliente` e `contato` a `/emporio/clientes/<id>` (a migração preserva o id) e `fornecedor` a `/emporio/fornecedores/<id>`. CPF/CNPJ, telefone e nascimento entram nas diferenças como "informado" (`mascarar`, como hoje).
- **Recusa de campo** sai com `field` (4º parâmetro de `fail`) no nome da API; Zod por `apiErroDeZod`; na tela, todo campo do `ORDEM` com `error=` (conferência 15).
- **Suíte nova `test:m95`** (`scripts/m95-emporio-clientes-fornecedores.test.ts`, entrada no `package.json`, texto impresso "M95: Módulo 39 (Meu Empório), Frente 1: clientes e fornecedores"), escrita a partir da spec e vista falhando antes de cada implementação.
- **Limpeza das suítes:** quem apaga por lista de modelos (`limpar()` das m81 a m95) põe `emporioCheck`, `emporioQuote`, `emporioSale`, `emporioPurchase` antes de `emporioCustomer` e `emporioSupplier`, e estes antes de `contact` (as FKs são `Restrict`).
- **Migração local:** `migrate diff` com a URL do Docker inline, SQL salvo à mão, `db:deploy` com a URL inline; tirar do SQL os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`; a coluna `name_busca` é escrita à mão como `GENERATED ALWAYS AS (nome_de_busca("name")) STORED` (o diff não sabe gerá-la; ver `prisma/migrations/20261008120000_busca_sem_acento/migration.sql`).
- **Arquivo novo só conta no `npm run check` depois de `git add -N`.**
- **Subagente não commita:** deixa no working tree e relata os arquivos; a sessão principal commita, uma tarefa por vez.
- **Venda em teste precisa de turno aberto** (`abrirTurnoDeTeste` de `scripts/_emporio-turno.ts`).

### Decisões do usuário que este plano cumpre (06/11)

| pergunta | decisão |
|---|---|
| obrigatórios | PF: nome e telefone. PJ: nome, telefone, CNPJ e endereço principal completo. O resto é opcional |
| o orçamento e o Consumidor final | o orçamento **aceita** o Consumidor final (a exceção da entrega é do plano 3) e deixa de exigir documento da PF |
| compra de uma propriedade do Dono | entra **só com o custo**: sem forma de pagamento e sem `FinancialEntry` |

### Valores fixados por este plano (o que a spec deixou ao builder)

| o quê | valor |
|---|---|
| ids na migração | o cliente e o fornecedor copiados de um `Contact` **ficam com o id do contato**. Repontar vira `customer_id = contact_id`, e o link de Histórico antigo (`target_type` `contato`) abre a ficha certa |
| Consumidor final | um por conta em `EmporioCustomer` (`system_key` "consumidor_final"), criado sob demanda por `garantirConsumidorFinal`; a migração copia o que cada conta já tem |
| ficha do cliente | as vendas e orçamentos das lojas que o ator enxerga (`lojasDoAtor`; Dono e Gerente geral, todas). `total_comprado` = soma do `net_amount` das vendas `concluida`, menos o valor devolvido (soma de `EmporioSaleReturn.amount` delas); `ultima_compra_em` = maior `sold_at` das concluídas; até 100 vendas e 50 orçamentos, os mais novos |
| situação da venda na ficha | `cancelada` (status); senão `trocada` se uma devolução dela tem venda de troca; senão `devolvida` se tem devolução; senão `ativa` |
| lista | `q` filtra `name_busca contains normalizarTermo(q)` (`src/lib/actions/whatsapp-handlers/shared.ts`); sem `arquivados`, só ativos; ordem: Consumidor final primeiro, depois por nome; `por_pagina` padrão 50, máximo 100 |
| edição | chave ausente mantém, `null` limpa (como `completarClienteAction` hoje); o resultado mesclado passa por `conferirCadastro` e `faltaNoCadastro`. Fornecedor de propriedade só muda `notes` (o resto é ignorado) |
| compra de propriedade | `payment` do corpo é **ignorado**: `payment_kind` nulo, nenhum lançamento, nenhuma categoria criada. O custo vai para o estoque como em qualquer compra |
| fornecedor de fora | só `name` obrigatório; documento, quando vem, passa pelas mesmas conferências e não se repete entre fornecedores da conta |
| `conferirCadastro` | perde o modo `"balcao"`: vira `conferirCadastro(input)` (só formato), e quem exige é `faltaNoCadastro` |
| `Contact.system_key` | a coluna fica (sem uso depois da Task 6; registrar como dívida) |
| janela do deploy | a Task 6 apaga colunas que o código antigo lê: migração no Neon e push em sequência, **fora do horário das lojas** (lição do handoff de 05/11) |

### Recusas (código, status, `field`, mensagem exata)

| código | status | field | mensagem |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | `person_kind` | `Escolha pessoa física ou jurídica.` |
| `VALIDATION_ERROR` | 422 | `name` | PF `Informe o nome do cliente.`; PJ `Informe o nome da empresa.`; fornecedor `Informe o nome do fornecedor.` |
| `VALIDATION_ERROR` | 422 | `phone` | `Informe o telefone.` |
| `VALIDATION_ERROR` | 422 | `document` | PJ sem CNPJ: `Informe o CNPJ.` |
| `VALIDATION_ERROR` | 422 | `address_zip` / `address_street` / `address_number` / `address_district` / `city` / `address_state` | `Informe o CEP do endereço principal.` / `Informe a rua do endereço principal.` / `Informe o número do endereço principal.` / `Informe o bairro do endereço principal.` / `Informe a cidade do endereço principal.` / `Escolha a UF do endereço principal.` |
| `VALIDATION_ERROR` | 422 | `customer_id` | entrega com Consumidor final: `Pedido para entrega precisa do cliente de verdade, não do Consumidor final.` |
| `VALIDATION_ERROR` | 422 | `document` | entrega de PF sem CPF: `Para entrega, informe o CPF do cliente.` |
| `VALIDATION_ERROR` | 422 | `delivery_zip` / `delivery_street` / `delivery_number` / `delivery_district` / `delivery_city` / `delivery_state` | `Informe o CEP do endereço de entrega.` / `Informe a rua do endereço de entrega.` / `Informe o número do endereço de entrega.` / `Informe o bairro do endereço de entrega.` / `Informe a cidade do endereço de entrega.` / `Escolha a UF do endereço de entrega.` |
| `DUPLICATE_DOCUMENT` | 409 | `document` | `Já existe um cliente com esse CPF: <nome>.` (ou CNPJ; ou `um fornecedor`), mais ` Ele está arquivado: desarquive em Clientes.` (ou `em Fornecedores.`) quando arquivado |
| `VALIDATION_ERROR` | 422 | sem campo | Consumidor final editado ou arquivado: `O Consumidor final é fixo e não pode ser editado nem arquivado.` |
| `VALIDATION_ERROR` | 422 | sem campo | editar arquivado: `Esse cliente está arquivado: desarquive em Clientes antes de editar.` (fornecedor: `Esse fornecedor está arquivado: desarquive em Fornecedores antes de editar.`) |
| `NOT_FOUND` | 404 | sem campo | `Cliente não encontrado.` / `Fornecedor não encontrado.` |
| `QUOTE_CUSTOMER_REQUIRED` | 422 | `customer_id` | `Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.` |
| `QUOTE_CUSTOMER_INCOMPLETE` | 422 | `customer_id` | `Complete o cadastro do cliente antes de salvar o orçamento. ` + a mensagem de `faltaNoCadastro` |
| `VALIDATION_ERROR` | 422 | `property_id` | `Escolha a propriedade.`; propriedade arquivada: `Essa propriedade está arquivada no Tibé.` |
| `DUPLICATE_PROPERTY_SUPPLIER` | 409 | `property_id` | `Essa propriedade já é fornecedor: <nome>.` |
| `NOT_FOUND` | 404 | `supplier_id` | na compra: `Fornecedor não encontrado.` |
| `VALIDATION_ERROR` | 422 | `supplier_id` | na compra: `Esse fornecedor está arquivado.` |

As recusas de venda que já existem (`Escolha o cliente da venda. Quem não quer se identificar entra como Consumidor final.`, `Escolha um cliente ativo.`, `Fiado precisa do cliente de verdade, não do Consumidor final.`, `Cheque precisa do cliente de verdade, não do Consumidor final.`, `Escolha o cliente.`) mantêm o texto e passam a sair em `customer_id`.

## Review Focus

1. **O cliente migrado com só o nome** (os contatos antigos): a venda continua aceitando; o orçamento recusa com `QUOTE_CUSTOMER_INCOMPLETE`; editar só o telefone de uma PJ sem endereço é recusado no primeiro campo do endereço e nada é gravado. Testes na Task 3.
2. **Dois balcões cadastrando o mesmo CPF ao mesmo tempo:** um 201 e o outro 409 `DUPLICATE_DOCUMENT` com o nome do primeiro (o caminho do P2002). Teste na Task 3, com `Promise.all`.
3. **Trocar o tipo na edição:** PF para PJ sem endereço é recusado em `address_zip`; PJ para PF limpa `responsible_name` e não exige endereço. Teste na Task 3.
4. **O fiado e a conta a pagar depois da migração:** o nome continua na tela de Fiado, no Caixa, no Meu Dia e em `/financeiro`, e receber o fiado pelo `customer_id` (o id antigo do contato) quita a dívida. Conferido na Task 6, na cópia da produção com o cenário de ensaio.
5. **A propriedade arquivada no Tibé:** o fornecedor continua com o nome copiado e a compra antiga o mostra; cadastrar fornecedor de propriedade arquivada é recusado em `property_id`; a compra de propriedade com `payment` a prazo no corpo não cria lançamento. Testes na Task 5.

---

### Task 1: A regra pura do que é obrigatório

**Files:**
- Create: `src/lib/emporio/cliente-cadastro.ts`
- Create: `scripts/m95-emporio-clientes-fornecedores.test.ts` (seção 1, sem banco; esqueleto com `check`, `comBanco` e `limpar` copiados do padrão da `m94`)
- Modify: `package.json` (`"test:m95": "tsx scripts/m95-emporio-clientes-fornecedores.test.ts"`)

**Interfaces:**
- Consumes: `UFS`, `CONSUMIDOR_FINAL` de `src/lib/contatos/cadastro.ts`; `fail`, `ActionResult` de `src/lib/actions/types.ts`.
- Produces: o bloco "Regra pura" do topo, inteiro.

- [ ] **Step 1: Escrever a seção 1 da m95 (falhando).** Casos, com as mensagens exatas da tabela de recusas:
  - PF `{ name: "Zé", person_kind: "pf", phone: "34 99999-0000" }` sem documento nem endereço: `faltaNoCadastro` nulo;
  - PF sem telefone: `{ field: "phone", message: "Informe o telefone." }`; sem tipo: `person_kind`; PF sem nome: `name` "Informe o nome do cliente."; PJ sem nome: "Informe o nome da empresa.";
  - PJ com nome, telefone e sem CNPJ: `document` "Informe o CNPJ.";
  - PJ completa menos o bairro: `address_district`; sem UF: `address_state` "Escolha a UF do endereço principal."; complemento vazio não falta;
  - Consumidor final (`system_key: "consumidor_final"`, sem nada): `faltaNoCadastro` nulo, e `faltaParaEntrega` dá `customer_id` com a frase do Consumidor final;
  - entrega de PF completa sem CPF, endereço completo: `document` "Para entrega, informe o CPF do cliente."; com CPF e endereço sem número: `delivery_number`; com `endereco` nulo: `delivery_zip`;
  - entrega de PJ completa com o endereço principal: nulo; PJ incompleta: a falta do cadastro vem antes da do endereço;
  - `enderecoDeEntregaDe` nulo quando os sete campos de entrega estão vazios; `enderecoPrincipalDe` copia `city` para `city`;
  - `recusaDocumentoRepetido("fornecedor", { name: "Agro X", archived: true }, "11222333000181")`: 409, `field` `document`, "Já existe um fornecedor com esse CNPJ: Agro X. Ele está arquivado: desarquive em Fornecedores."
- [ ] **Step 2:** rodar `test:m95` e ver falhar por falta do módulo.
- [ ] **Step 3:** implementar `cliente-cadastro.ts`. A ordem de conferência é a da tabela: tipo, nome, telefone; na PJ, CNPJ e os seis campos do endereço principal; na entrega, depois do cadastro, o CPF da PF e os seis campos do endereço do pedido. "Vazio" é nulo ou só espaço.
- [ ] **Step 4:** `test:m95`, `npx tsc --noEmit`, `npm run check` (com `git add -N` nos novos): verdes.
- [ ] **Step 5:** relatar os arquivos (a sessão principal commita: `Empório: a regra pura do cadastro do cliente, por tipo e para entrega`).

### Task 2: As tabelas novas (só acréscimo)

**Files:**
- Modify: `prisma/schema.prisma` (models `EmporioCustomer` e `EmporioSupplier`, enum `EmporioSupplierKind`, as colunas novas do bloco de interfaces, `EmporioQuote.contact_id` e `EmporioCheck.contact_id` passam a `String?`, `EmporioPurchase.payment_kind` anulável; relações inversas em `Tenant`, `Property`, `EmporioSale`, `EmporioQuote`, `EmporioCheck`, `EmporioPurchase`, `FinancialEntry`)
- Create: `prisma/migrations/20261106120000_emporio_clientes_fornecedores/migration.sql`
- Modify: `src/lib/prisma.ts` (`TENANT_SCOPED_MODELS`: `EmporioCustomer`, `EmporioSupplier`)
- Test: `scripts/m95-emporio-clientes-fornecedores.test.ts` (seção 2)

**Interfaces:**
- Produces: o bloco "Models" do topo, com `customer_id` ainda anulável em `EmporioQuote` e `EmporioCheck`, e as colunas `contact_id` ainda presentes.

- [ ] **Step 1: seção 2 da m95 (falhando):**
  - `db.emporioCustomer.create` pelo client escopado grava o `tenant_id` do tenant A; o client do tenant B não o acha (`findFirst` nulo);
  - `name_busca` de "João da Ponte" é "joao da ponte";
  - dois clientes com o mesmo `document` na mesma conta: P2002; em contas diferentes: ok; dois Consumidores finais na mesma conta: P2002;
  - dois fornecedores da mesma `property_id`: P2002;
  - `EmporioPurchase` com `payment_kind` nulo grava.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** schema e migração. O SQL é só acréscimo: `CREATE TYPE`, `CREATE TABLE` com `name_busca` gerada à mão, índices e FKs, `ADD COLUMN` anuláveis, `DROP NOT NULL` em `EmporioQuote.contact_id`, `EmporioCheck.contact_id` e `EmporioPurchase.payment_kind`. Nenhum `DROP`. Aplicar no Docker com a URL inline.
- [ ] **Step 4:** `test:m95`, `test:isolation`, `npx tsx scripts/ci-migration-drift.ts` com a URL inline (sem drift), `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: as tabelas de clientes e fornecedores, só acréscimo`).

### Task 3: O cliente do Empório na tabela nova (cadastro, venda, troca, fiado, cheque e orçamento)

A maior tarefa do plano, e quase toda mecânica: tudo o que lia o cliente em `Contact` passa a ler `EmporioCustomer`, e o campo `contact_id` vira `customer_id`. As únicas mudanças de regra são os obrigatórios novos e o orçamento.

**Files:**
- Modify: `src/lib/actions/emporio-clientes.ts` (reescrito sobre `db.emporioCustomer`: `cadastrarClienteAction`, `editarClienteAction` no lugar de `completarClienteAction`, `garantirConsumidorFinal`, `serializarCliente`, `ClienteView`, `ClienteInput`; sem import de `contacts.ts`)
- Modify: `src/lib/contatos/cadastro.ts` (`conferirCadastro(input)` sem o modo; `cadastroIncompleto` fica, porque `serializar` de `contacts.ts` o usa), `src/lib/actions/contacts.ts` (as duas chamadas)
- Modify: `src/lib/actions/emporio-vendas.ts` (`VenderInput.customer_id`, venda, troca, `listarVendas` com `customer_id`, `VendaView.customer_id`/`customer_name`, cheque e lançamentos com `emporio_customer_id`, devolução com `emporio_customer_id: venda.customer_id`)
- Modify: `src/lib/actions/emporio-orcamentos.ts` (`OrcamentoInput.customer_id`, `OrcamentoView.customer`, a regra nova do cliente, a busca da lista por telefone, documento e nome em `EmporioCustomer`)
- Modify: `src/lib/actions/emporio-caixa.ts` (`entradasAbertas` e fiado por `emporio_customer_id`, `FiadoClienteView.customer_id`/`customer_name`, `ReceberFiadoInput.customer_id`, `RecebimentoView.customer_id`, cheques com `customer_id`/`customer_name`)
- Modify: `src/lib/actions/emporio-impressao.ts`, `src/lib/actions/emporio-meu-dia.ts` (só o bloco `emporio_fiado`)
- Modify: `src/lib/financial.ts` (`createLinkedEntry` aceita `emporio_customer_id` e `emporio_supplier_id`), `src/lib/serializers.ts` (`serializeFinancialEntry` devolve os dois, aditivo)
- Modify: `src/lib/emporio/historico.ts` (catálogo e `linkDoAlvo`, ver Global Constraints)
- Modify: `src/lib/emporio/venda-schema.ts` (`customer_id` nos corpos de venda e orçamento)
- Modify: rotas `src/app/api/v1/emporio/customers/route.ts` (GET entra na Task 4), `customers/[id]/route.ts` (GET devolve `ClienteView` por enquanto; a Task 4 troca pela ficha), `sales/route.ts`, `receivables/route.ts`, `receivables/receive/route.ts`, `checks/route.ts`; `src/app/(public)/docs/api/endpoints.ts`
- Modify: telas, só o necessário para o novo campo e a tabela nova: `src/app/(dashboard)/emporio/_components/catalogo-venda.ts`, `venda-estado.ts`, `venda-campos.tsx`, `balcao.tsx`, `balcao-orcamento.tsx`, `trocar-form.tsx`, `receber-fiado-form.tsx`, `cliente-form.tsx` (lê `GET /api/v1/emporio/customers/:id`), `src/app/(dashboard)/emporio/fiado/page.tsx`, `vendas/[id]/page.tsx`, `orcamentos/[id]/page.tsx`, `src/app/(dashboard)/financeiro/page.tsx` (nome: `contact ?? emporio_customer ?? "não informado"`)
- Modify: suítes e scripts que montam cliente do Empório: `scripts/m81` a `m94` (corpo `customer_id`, `db.emporioCustomer.create` no lugar de `db.contact.create` para cliente de venda, asserções `customer_name`, limpeza), `scripts/m90-emporio-cliente.test.ts` (seção 1 sem os casos do modo balcão, que vão para a m95; a seção 2 não muda, porque cria o contato de sistema direto em `Contact`; seções 3 e 4 sobre a tabela nova e a regra nova), `scripts/_cenario-emporio-*.ts`, `scripts/cenario-demonstracao-emporio.ts` (a parte de clientes), `scripts/navegador/manual-emporio.py`, `scripts/navegador/emporio-cliente-menu.py`, `scripts/navegador/emporio-f3a.py`, `scripts/navegador/emporio-orcamento.py` (nome do campo e a frase nova do orçamento). Fornecedor e compra ficam para a Task 5
- Test: `scripts/m95-emporio-clientes-fornecedores.test.ts` (seção 3)

**Interfaces:**
- Consumes: `faltaNoCadastro`, `recusaDocumentoRepetido`, `ehConsumidorFinal` (Task 1); os models da Task 2.
- Produces: `ClienteView`, `ClienteInput`, `cadastrarClienteAction`, `editarClienteAction`, `garantirConsumidorFinal` do topo; `createLinkedEntry(..., { emporio_customer_id?, emporio_supplier_id? })`; as views renomeadas do bloco "Campo na API".

- [ ] **Step 1: seção 3 da m95 (falhando).** Casos:
  - o Vendedor cadastra PF só com nome e telefone pela rota: 201, `incomplete: false`, uma linha `cliente.cadastrar` com `target_type` `cliente`; o Caixa cadastra: 201; quem não tem papel no Empório: 403;
  - PJ sem endereço: 422 `address_zip`; PJ completa com CNPJ alfanumérico: 201, documento em maiúscula;
  - CPF repetido: 409 com "Já existe um cliente com esse CPF: <nome>."; arquivado: a frase com "desarquive em Clientes";
  - **Review Focus 2:** dois `cadastrarClienteAction` em `Promise.all` com o mesmo CPF: um ok, o outro 409 `DUPLICATE_DOCUMENT` em `document`; uma linha só no banco;
  - **Review Focus 1 e 3:** cliente gravado direto com só o nome (como o migrado): `editarClienteAction` com `{ phone }` em PJ sem endereço: 422 `address_zip`, e o telefone não foi gravado; PF para PJ sem endereço: 422 `address_zip`; PJ para PF: ok, `responsible_name` nulo; `null` limpa, ausente mantém; uma linha `cliente.editar` com `document` como "informado";
  - editar o Consumidor final: 422 com a frase fixa; editar arquivado: a frase do arquivado; id de outra conta: 404 "Cliente não encontrado.";
  - `garantirConsumidorFinal` em paralelo: mesmo id e uma linha em `EmporioCustomer`; nenhum `Contact` novo;
  - **separação:** `listContacts` não traz o cliente do Empório; `findOrCreateContact(db, "<nome do cliente>")` cria um `Contact` novo (`criado: true`, id diferente); `garantirConsumidorFinal` não cria `Contact`;
  - venda sem `customer_id`: 422 `customer_id` com a frase de sempre; com o id de um `Contact`: "Escolha um cliente ativo."; com o Consumidor final e dinheiro: 201, `customer_name` "Consumidor final";
  - fiado e cheque para o Consumidor final: 422 `customer_id`; fiado para o cliente migrado só com nome: 201, e o lançamento tem `emporio_customer_id` = cliente e `contact_id` nulo;
  - `listarFiadoAction` traz `customer_id` e `customer_name`; `receberFiadoAction({ customer_id, ... })` quita;
  - **orçamento:** com o Consumidor final: 201; com PF só nome e telefone: 201; com cliente só com nome: `QUOTE_CUSTOMER_INCOMPLETE` "Complete o cadastro do cliente antes de salvar o orçamento. Informe o telefone." (ou a falta do tipo); sem `customer_id`: `QUOTE_CUSTOMER_REQUIRED` com a frase nova; faturar o orçamento do Consumidor final: 201;
  - a devolução de uma venda grava a despesa com `emporio_customer_id` da venda;
  - o papel da venda do cliente traz o nome e o documento formatado; o do Consumidor final, sem cliente;
  - `GET /api/v1/emporio/customers/:id` de outra conta: 404.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** `emporio-clientes.ts`, `cadastro.ts`, `contacts.ts`, `historico.ts`, `financial.ts`, `serializers.ts`.
- [ ] **Step 4:** venda, troca, devolução, cheque, fiado, impressão, Meu Dia (fiado), orçamento e catálogo do balcão.
- [ ] **Step 5:** rotas, `venda-schema.ts`, `endpoints.ts`; telas (troca do nome do campo, `ORDEM` com `customer_id` e `error=`; o `cliente-form` lê a rota nova).
- [ ] **Step 6:** suítes, cenários e roteiros. `grep -rn "contact_id\|db.contact\|prisma.contact" scripts/` não pode sobrar em nada que monte cliente de venda.
- [ ] **Step 7:** `test:m95`, m79 a m94 (uma por uma, com as URLs inline), `test:isolation`, `test:docs-api`, `tsc`, `lint`, `check`: verdes.
- [ ] **Step 8:** relatar os arquivos (commit: `Empório: o cliente sai de Contatos e vai para a tabela do Empório, com os obrigatórios por tipo`).

### Task 4: Lista, ficha com histórico de compras e arquivar

**Files:**
- Modify: `src/lib/actions/emporio-clientes.ts` (`listarClientesAction`, `lerClienteAction`, `arquivarClienteAction`, tipos `ClienteLinha` e `ClienteFichaView`)
- Modify: `src/app/api/v1/emporio/customers/route.ts` (GET), `customers/[id]/route.ts` (GET devolve a ficha)
- Create: `src/app/api/v1/emporio/customers/[id]/archive/route.ts` (PATCH `{ archived: boolean }`, padrão de `src/app/api/v1/contacts/[id]/archive/route.ts`)
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m95-emporio-clientes-fornecedores.test.ts` (seção 4)

**Interfaces:**
- Consumes: `ClienteView`, `serializarCliente` (Task 3); `lojasDoAtor`; `formatarNumero` (`src/lib/emporio/numeracao.ts`); `hojeEmBrasilia` (`src/lib/emporio/cartao.ts`).
- Produces: `listarClientesAction`, `lerClienteAction`, `arquivarClienteAction`, `ClienteLinha`, `ClienteFichaView` do topo; as três rotas.

- [ ] **Step 1: seção 4 da m95 (falhando):**
  - a lista traz o Consumidor final primeiro e os outros por nome; `q` "joao" acha "João"; `por_pagina: 2` traz 2 e `total` certo; arquivado só com `arquivados: true`; a rota devolve `meta.total`;
  - o Vendedor arquiva: 403 "Só o gestor da loja pode arquivar um cliente."; o Gestor arquiva e desarquiva: ok, com `cliente.arquivar` e `cliente.desarquivar`; arquivar o Consumidor final: 422 com a frase fixa;
  - venda para cliente arquivado: "Escolha um cliente ativo.";
  - a ficha de um cliente com três vendas (uma concluída, uma cancelada, uma trocada pela troca de sempre) e um orçamento: `situacao` de cada uma certa; itens com produto, apresentação, quantidade e total; `formas`; `vendedor`; `resumo.total_comprado` sem a cancelada e menos o devolvido; `ultima_compra_em` = a concluída mais nova; o orçamento com a situação; o cliente arquivado continua com a ficha inteira;
  - o Vendedor da Loja 1 não vê na ficha a venda da Loja 2; o Dono vê as duas;
  - **isolamento:** a lista do tenant B não traz o cliente de A; ler, editar e arquivar o de A pelo B: 404;
  - **o contrário da separação:** um `Contact` criado em Contatos com o mesmo nome não aparece em `listarClientesAction`, e `lerClienteAction` com o id dele dá 404.
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar as actions, as rotas e `endpoints.ts`. A ficha faz poucas consultas: as vendas com itens, pagamentos, loja e devoluções numa leitura só, os orçamentos noutra, os nomes dos vendedores de uma vez.
- [ ] **Step 4:** `test:m95`, `test:docs-api`, `tsc`, `check`: verdes.
- [ ] **Step 5:** relatar os arquivos (commit: `Empório: a lista e a ficha do cliente, com o histórico de compras`).

### Task 5: Fornecedores e a compra

**Files:**
- Create: `src/lib/actions/emporio-fornecedores.ts`
- Modify: `src/lib/actions/emporio-compras.ts` (`CompraInput.supplier_id`, `payment` opcional e ignorado na compra de propriedade, `CompraView.supplier_id`/`supplier_name`/`supplier_kind`, `payment_kind: string | null`, filtro `supplier_id`, contas a pagar com `emporio_supplier_id`)
- Modify: `src/lib/actions/emporio-meu-dia.ts` (bloco `emporio_pagar`: o nome vem de `emporio_supplier`)
- Modify: `src/app/(dashboard)/financeiro/page.tsx` (o nome ganha `?? emporio_supplier?.name`)
- Create: `src/app/api/v1/emporio/suppliers/route.ts`, `suppliers/[id]/route.ts`, `suppliers/[id]/archive/route.ts`, `suppliers/property-options/route.ts`
- Modify: `src/app/api/v1/emporio/purchases/route.ts` (`supplier_id`, `payment` `.nullish()`), `src/app/(public)/docs/api/endpoints.ts`
- Modify: `src/app/(dashboard)/emporio/_components/compra-form.tsx` e `compras/page.tsx` (só o campo `supplier_id` lendo `EmporioSupplier` e a coluna `supplier_name`; o comportamento novo da tela é da Task 8)
- Modify: `scripts/m79-emporio-f2a.test.ts`, `m80`, `m85`, `m87`, `m89`, `scripts/_cenario-emporio-f5.ts`, `scripts/cenario-demonstracao-emporio.ts` (a parte de fornecedores)
- Test: `scripts/m95-emporio-clientes-fornecedores.test.ts` (seção 5)

**Interfaces:**
- Consumes: `conferirCadastro`, `recusaDocumentoRepetido` (Tasks 1 e 3); `createLinkedEntry` com `emporio_supplier_id` (Task 3).
- Produces: o bloco "Actions (emporio-fornecedores.ts)" do topo e as quatro rotas de fornecedor.

- [ ] **Step 1: seção 5 da m95 (falhando):**
  - fornecedor de fora só com nome: 201, `fornecedor.cadastrar`; sem nome: 422 `name` "Informe o nome do fornecedor."; CNPJ inválido: 422 `document`; CNPJ repetido entre fornecedores: 409 com "um fornecedor"; o mesmo CNPJ num cliente não conflita;
  - fornecedor de propriedade: `name` = nome da propriedade (o do corpo é ignorado); sem `property_id`: 422 "Escolha a propriedade."; propriedade de outra conta: 404 em `property_id`; propriedade arquivada: 422 "Essa propriedade está arquivada no Tibé."; a mesma propriedade de novo: 409 `DUPLICATE_PROPERTY_SUPPLIER`;
  - `listarPropriedadesLivresAction` não traz a que já é fornecedor nem a arquivada;
  - **Review Focus 5:** arquivar a propriedade depois: o fornecedor e a compra antiga continuam com o nome;
  - editar o de propriedade com `{ name: "Outro", notes: "x" }`: só `notes` muda;
  - o Vendedor sem a chave `lancar_compra` cadastra: 403; com a chave: 201; arquivar pelo Vendedor: 403; pelo Gestor: ok; o Caixa lista: 403;
  - **compra de propriedade** recebida, com `payment: { kind: "a_prazo", due_date }` no corpo: 201, `payment_kind` nulo, nenhum `FinancialEntry` com `related_id` da compra, o `StockMovement` de entrada com o custo informado; cancelar essa compra: ok;
  - compra de fornecedor de fora a prazo: o lançamento tem `emporio_supplier_id` e `contact_id` nulo; compra sem fornecedor e sem `payment`: 422 `payment` (como hoje);
  - compra com fornecedor arquivado: 422 `supplier_id`; de outra conta: 404 `supplier_id`;
  - **isolamento:** listar, ler, editar e arquivar o fornecedor de A pelo B: vazio ou 404;
  - o item `emporio_pagar` do Meu Dia mostra "Pagar <nome do fornecedor> (<loja>)".
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** `emporio-fornecedores.ts`, as rotas, `endpoints.ts`.
- [ ] **Step 4:** a compra, o Meu Dia, `/financeiro`, a troca mínima da tela de compra, suítes e cenários (`grep -rn "contact_id" scripts/` não pode sobrar em compra).
- [ ] **Step 5:** `test:m95`, m79, m80, m85, m87, m89, `test:isolation`, `test:docs-api`, `tsc`, `lint`, `check`: verdes.
- [ ] **Step 6:** relatar os arquivos (commit: `Empório: fornecedores próprios, e a compra de propriedade do Dono só com o custo`).

### Task 6: A migração dos dados e a saída de Contatos

**Files:**
- Modify: `prisma/schema.prisma` (saem `contact_id` de `EmporioSale`, `EmporioQuote`, `EmporioCheck` e `EmporioPurchase` e as relações `emporio_*` de `Contact`; `EmporioQuote.customer_id` e `EmporioCheck.customer_id` viram `String`)
- Create: `prisma/migrations/20261106180000_emporio_clientes_saem_de_contatos/migration.sql`
- Create: `scripts/conferir-clientes-emporio.ts` (só leitura, SQL cru, `import "./_env-local"`; imprime o host do banco sem a senha)
- Create: `scripts/sql/ensaio-clientes-emporio.sql` (o cenário de ensaio no formato antigo, ids fixos com prefixo `ensaio_cli_`)
- Modify: `package.json` se o projeto pedir entrada para script novo (conferir pelo `npm run check`)

**Interfaces:**
- Consumes: o schema da Task 2; o código das Tasks 3 a 5 (nada mais lê `contact_id` dessas tabelas).
- Produces: o schema final do bloco de interfaces.

O SQL da migração, nesta ordem (dados escritos à mão, DDL a partir do `migrate diff`). Todo passo de dados é idempotente, porque o banco de dev já tem linhas no formato novo:
1. **Consumidor final:** para cada `Contact` com `system_key = 'consumidor_final'`, um `EmporioCustomer` com o mesmo id, nome e `system_key`; conflito (a conta já tem o seu na tabela nova): não insere.
2. **Clientes:** copia, com o mesmo id, todo `Contact` sem `system_key` citado em `EmporioSale.contact_id`, `EmporioQuote.contact_id` ou `EmporioCheck.contact_id`, ou alvo (`target_id`, `target_type = 'contato'`) de `EmporioAuditLog` com `action` `cliente.cadastrar` ou `cliente.completar`. Colunas: todas as do cadastro, `notes`, `archived_at`, `created_at`.
3. **Fornecedores:** copia, com o mesmo id e `kind = 'externo'`, todo `Contact` citado em `EmporioPurchase.contact_id`.
4. **Repontar** onde o campo novo está nulo: `customer_id` nas vendas, orçamentos e cheques (o contato de sistema vai para o Consumidor final da conta na tabela nova, pelo `system_key`); `supplier_id` nas compras.
5. **Ponte com o financeiro:** lançamento `related_module = 'emporio'` com `contact_id`: se `related_id` é uma compra, `emporio_supplier_id`; senão, `emporio_customer_id` (com o mesmo mapeamento do Consumidor final); e então `contact_id = NULL` nesses.
6. `SET NOT NULL` em `EmporioQuote.customer_id` e `EmporioCheck.customer_id`; `DROP` das FKs, índices e colunas `contact_id` das quatro tabelas.
7. **Saem de Contatos:** o `Contact` de sistema, e todo contato copiado no passo 2 ou 3 que não aparece em `Negotiation`, `MilkMovement` (`buyer_id`, `from_owner_id`, `to_owner_id`), `MilkCharge.owner_id`, `ServiceJob`, `MachineMaintenance` nem `FinancialEntry.contact_id`. Antes de escrever, conferir no schema (`references: [id]` apontando para `Contact`) que essa é a lista inteira de quem aponta para `Contact`.

O cenário de ensaio (`ensaio-clientes-emporio.sql`), numa conta "Ensaio Clientes Empório" com o Empório ligado e uma loja, em `INSERT` simples com as colunas obrigatórias de cada tabela: o contato de sistema com uma venda em dinheiro; "Ensaio Fiado" (PF) com venda fiada e lançamento pendente com `contact_id`, um orçamento e um cheque; "Ensaio Fornecedor" (PJ) com compra a prazo e conta a pagar com `contact_id`; "Ensaio Ambos" com uma venda e uma compra; "Ensaio Fazenda" com uma venda e um lançamento `geral` com `contact_id`; "Ensaio Balcão" só com a linha `cliente.cadastrar` no Histórico; "Ensaio Contatos" sem uso nenhum.

O conferidor: `npx tsx scripts/conferir-clientes-emporio.ts antes --saida <arquivo>` e `... depois --antes <arquivo> [--ensaio]`. O arquivo vai para o scratchpad e guarda só contagens por `tenant_id`. `depois` sai com código 1 se alguma conferência falhar:
- nenhum `Contact` com `system_key = 'consumidor_final'`; nenhum lançamento do Empório com `contact_id`;
- por conta: clientes = contatos de venda, orçamento e cheque + os do Histórico + o Consumidor final (contagem do `antes`); fornecedores = contatos de compra; vendas sem cliente iguais às de antes; a soma do fiado em aberto igual à de antes; todo lançamento de fiado em aberto com nome de cliente;
- com `--ensaio`: 5 clientes e 2 fornecedores na conta de ensaio; ficam em Contatos só "Ensaio Fazenda" e "Ensaio Contatos"; o lançamento de fiado com `emporio_customer_id` = "Ensaio Fiado"; a conta a pagar com `emporio_supplier_id` = "Ensaio Fornecedor"; o lançamento `geral` ainda com `contact_id` = "Ensaio Fazenda"; o orçamento e o cheque com `customer_id` = "Ensaio Fiado"; os ids iguais aos dos contatos.

- [ ] **Step 1:** escrever o conferidor e o cenário de ensaio.
- [ ] **Step 2: a cópia da produção no Docker (leitura de produção é livre).** Criar o banco `tibe_ensaio` no container (`docker exec tibe-pg createdb -U tibe tibe_ensaio`) e despejar a produção nele com `pg_dump --no-owner --no-privileges` pela URL **Direct** do Neon (a do `.env` sem `-pooler`), lida numa variável de shell, nunca impressa nem gravada em arquivo. O `copiar-conta.cjs` de 06/11 vivia no scratchpad e não é versionado: não conte com ele.
- [ ] **Step 3:** `npx prisma migrate status` com `DATABASE_URL` do `tibe_ensaio` inline: a lista de pendentes deve ser só as duas migrações deste plano. Se houver outra, parar e relatar (a produção está atrás do `main`).
- [ ] **Step 4:** carregar o cenário de ensaio no `tibe_ensaio` (`docker exec -i tibe-pg psql -U tibe -d tibe_ensaio < scripts/sql/ensaio-clientes-emporio.sql`) e rodar `conferir antes`.
- [ ] **Step 5:** schema e migração (diff com a URL do `tibe_dev`, dados à mão, nesta ordem). Aplicar primeiro no `tibe_ensaio` (`db:deploy` com a URL dele inline) e rodar `conferir depois --ensaio`: verde. Se falhar, corrigir o SQL, recriar o `tibe_ensaio` (Step 2) e repetir.
- [ ] **Step 6:** aplicar no `tibe_dev` e rodar `conferir depois` contra ele (sem `--ensaio`): verde.
- [ ] **Step 7:** **ver o ensaio na tela (Review Focus 4).** `next dev` com o `DATABASE_URL` do `tibe_ensaio` inline e a sessão do dono da conta Max Dias Agromax (`emitirCookieTenant` de `scripts/_sessao-cookie.ts`, sem senha): abrir `/emporio/fiado`, o Caixa > receber fiado, `/emporio/compras`, `/financeiro` (área Empório) e `/contatos`. O nome de quem deve aparece; Contatos não tem o Consumidor final nem os contatos só do Empório; os 2 contatos de fora continuam. Registrar o que viu no relato.
- [ ] **Step 8:** `npx tsx scripts/ci-migration-drift.ts` (URL do `tibe_dev`), m79 a m95, `test:isolation`, `tsc`, `check`: verdes.
- [ ] **Step 9:** relatar os arquivos e as contagens antes e depois do ensaio (commit: `Empório: a migração dos clientes e fornecedores, e o que era só do Empório sai de Contatos`).

### Task 7: As telas de Clientes e o menu

**Files:**
- Create: `src/app/(dashboard)/emporio/clientes/page.tsx` (lista: nome, telefone, documento formatado ou "sem CPF/CNPJ", pílula "Cadastro incompleto", "Cliente padrão" no Consumidor final, "Arquivado"; filtro por nome e "mostrar arquivados" na URL; paginação; botão "Novo cliente" com o `ClienteForm` em modo `novo`)
- Create: `src/app/(dashboard)/emporio/clientes/[id]/page.tsx` (ficha: dados, endereços, "Editar" com o `ClienteForm` em modo `completar`, "Arquivar"/"Desarquivar" para quem pode, total comprado, última compra, a tabela de vendas com link para `/emporio/vendas/<id>` e os itens, os orçamentos com link)
- Create: `src/app/(dashboard)/emporio/clientes/_components/clientes-filtro.tsx`, `src/app/(dashboard)/emporio/clientes/_components/cliente-arquivar-botao.tsx` (ação sem formulário: avisa por `useAviso()`)
- Modify: `src/components/contatos/campos-do-cadastro.tsx` (com `obrigatorios`, o CNPJ e os seis campos do endereço principal ficam `required` só na PJ; o CPF deixa de ser `required`)
- Modify: `src/app/(dashboard)/emporio/_components/cliente-form.tsx` (texto do topo e cobrança no cliente iguais à regra nova; o servidor continua decidindo)
- Modify: `src/lib/emporio/paginas.ts` ("Clientes" depois de "Fiado", `exige: "vendedor_da_loja"`; "Fornecedores" depois de "Compras", `exige: "fora_do_caixa"`; a página de Fornecedores é da Task 8), `scripts/nav-build.test.ts`
- Modify: `src/lib/emporio/paginas-do-so-da-loja.ts` (tirar `"/contatos"` de `PERMITIDAS`: decisão da sessão principal, 06/11, porque a equipe do Empório é separada do Tibé (Q190) e o cliente dela agora mora em `/emporio/clientes`; o teste que cobre `paginaPermitidaAoSoDaLoja` passa a provar `/contatos` fechado e `/emporio/clientes` aberto, nos dois sentidos)

Comportamento:
- O Caixa abre Clientes e cadastra; não vê "Arquivar". O Vendedor idem.
- Página server, dados por `getTenantDb()` chamando `listarClientesAction` e `lerClienteAction` (sem consulta própria). A 390 px, sem rolagem horizontal da página.

- [ ] **Step 1:** atualizar `scripts/nav-build.test.ts` para os dois itens novos e ver falhar.
- [ ] **Step 2:** implementar.
- [ ] **Step 3:** o teste do menu, `tsc`, `lint`, `check`: verdes; no `next dev`, cadastrar uma PF só com nome e telefone, ver a recusa da PJ sem endereço embaixo do CEP, abrir a ficha e arquivar como Gestor.
- [ ] **Step 4:** relatar os arquivos (commit: `Empório: as telas de Clientes, com a ficha e o histórico de compras`).

### Task 8: As telas de Fornecedores e a compra de propriedade

**Files:**
- Create: `src/app/(dashboard)/emporio/fornecedores/page.tsx` (lista: nome, "Propriedade" ou "De fora", documento, telefone, arquivado; filtro por nome; "Novo fornecedor")
- Create: `src/app/(dashboard)/emporio/fornecedores/[id]/page.tsx` (dados, "Editar", "Arquivar"/"Desarquivar", as últimas 20 compras dele por `listarComprasAction({ supplier_id, limit: 20 })`)
- Create: `src/app/(dashboard)/emporio/_components/fornecedor-form.tsx` (tipo primeiro: "Propriedade do dono" mostra só a escolha da propriedade, de `GET /api/v1/emporio/suppliers/property-options`, e a observação; "Fornecedor de fora" mostra nome, tipo de pessoa, documento, telefone, inscrição estadual, endereço e observação. Campo que some não é cobrado)
- Modify: `src/app/(dashboard)/emporio/_components/compra-form.tsx` (o seletor mostra "<nome> (propriedade)" no fornecedor de propriedade; escolhido um, somem as formas de pagamento e aparece "Compra de propriedade do dono: entra só o custo, sem conta a pagar."; o `payment` não é enviado e não é cobrado; a dica "Vem dos Contatos." vira "Cadastre em Fornecedores.")
- Modify: `src/app/(dashboard)/emporio/compras/page.tsx` (coluna Fornecedor com o nome; forma de pagamento "Só custo (propriedade)" quando `payment_kind` é nulo)

- [ ] **Step 1:** implementar. Sem teste automático novo (padrão das telas deste módulo); a prova é o roteiro da Task 9.
- [ ] **Step 2:** `tsc`, `lint`, `check`: verdes; no `next dev`, cadastrar um fornecedor de propriedade e lançar uma compra dele sem forma de pagamento.
- [ ] **Step 3:** relatar os arquivos (commit: `Empório: as telas de Fornecedores e a compra de propriedade sem forma de pagamento`).

### Task 9: Cenário, roteiro no navegador, manual, spec, dívidas e handoff

**Files:**
- Modify: `scripts/cenario-demonstracao-emporio.ts` (os clientes da demonstração nascem pelas actions do Empório, um deles PF só com nome e telefone; um fornecedor de propriedade com uma compra só de custo; a limpeza apaga `EmporioCustomer` e `EmporioSupplier` da demonstração)
- Modify: `scripts/seed-demo-data.ts` só se o `npm run seed:demo` falhar por causa do `EmporioSupplier` (a FK com `Property` é `SetNull`, então não deve)
- Create: `scripts/_cenario-emporio-clientes.ts`, `scripts/navegador/emporio-clientes.py`
- Modify: `scripts/navegador/manual-emporio.py` (duas figuras: a lista de Clientes e a de Fornecedores, no padrão das outras)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-consulta.tsx` (as perguntas do cadastro incompleto e do orçamento com a regra nova), `partes-tarefa-1.tsx` (o fornecedor vem de Fornecedores), `partes-tarefa-3.tsx` (as frases novas do orçamento), e as partes novas "Clientes" e "Fornecedores" onde ficam as partes por tarefa (`conteudos.tsx`, `indice.ts`)
- Modify: `docs/specs/module-39-meu-emporio.md` (Q191 em diante), `docs/agents/dividas.md`, `docs/agents/current-handoff.md`

Roteiro `emporio-clientes` (Dono, Gestor, Vendedor e Caixa de uma loja; uma propriedade da conta):
1. O Vendedor abre Clientes, cadastra uma PF só com nome e telefone, e vende para ela no balcão (escolhendo na lista); a venda aparece na ficha.
2. Tenta uma PJ sem endereço e vê a recusa embaixo do CEP.
3. Salva um orçamento com o Consumidor final: salva.
4. O Caixa abre Clientes e não vê "Arquivar"; o Gestor arquiva o cliente e ele some do seletor do balcão.
5. O Dono abre `/contatos` e não vê o cliente nem o Consumidor final.
6. O Gestor cadastra um fornecedor de propriedade, lança uma compra dele e não vê forma de pagamento; a compra aparece em Compras com "Só custo (propriedade)", e `/financeiro` não ganha lançamento.
7. Uma venda fiada para o cliente: a tela de Fiado mostra o nome.
8. A 390 px: Clientes, a ficha e Fornecedores sem rolagem horizontal.

Decisões para a spec (uma linha cada, no formato da tabela): Q191 tabelas próprias e ids preservados na migração; Q192 obrigatórios por tipo e a função de entrega para o plano 3; Q193 o orçamento aceita o Consumidor final e exige só os obrigatórios do tipo (revisa Q176 e a recusa `QUOTE_CUSTOMER_REQUIRED`); Q194 compra de propriedade só com custo, `payment` ignorado; Q195 a ponte com o financeiro (`emporio_customer_id`, `emporio_supplier_id`); Q196 os campos da API renomeados; Q197 quem pode o quê e a ficha pelas lojas que o ator vê; Q198 o que sai de Contatos e a janela do deploy.

Dívidas a registrar (em `docs/agents/dividas.md`, seção nova "5.20"): `Contact.system_key` sem uso; a busca de clientes por telefone e documento é do plano 2.

- [ ] **Step 1:** cenário de demonstração, `npm run seed:demo` (URL inline) sem erro, e o cenário do Empório rodado no `tibe_dev`.
- [ ] **Step 2:** cenário e roteiro `emporio-clientes`; com o `next dev` de pé, `npm run navegador -- emporio-clientes`: verde.
- [ ] **Step 3:** prova nos dois sentidos: fazer a compra de propriedade voltar a criar lançamento (desfazer o "ignorar" na action), ver o passo 6 reprovar, restaurar, ver passar.
- [ ] **Step 4:** rodar de novo `emporio-cliente-menu`, `emporio-orcamento`, `emporio-f3a` e `manual-emporio`: verdes.
- [ ] **Step 5:** manual, spec, dívidas e handoff (as duas migrações `20261106120000` e `20261106180000` **não** estão no Neon; ordem do deploy: migração fora do horário das lojas, depois merge e push).
- [ ] **Step 6:** `check`, `tsc`, `lint`: verdes; relatar os arquivos (commit: `Empório: roteiro, manual e decisões dos clientes e fornecedores`).

### Task 10: Ensaio final na cópia fresca e o passo parado do Neon

**Files:** nenhum.

- [ ] **Step 1:** repetir os Steps 2 a 5 e 7 da Task 6 com uma cópia nova da produção (`tibe_ensaio` recriado), sem o cenário de ensaio: `conferir depois` verde e as telas da Max Dias Agromax com os nomes.
- [ ] **Step 2:** `npm run test:all -- --sem-redis` com as URLs inline: relatar o resumo.
- [ ] **Step 3:** relatar ao usuário: as contagens antes e depois na cópia, o que sai de Contatos por conta, e a ordem do deploy (migração no Neon pela URL Direct, fora do horário das lojas, `migrate status` em dia, e só então merge e push).
- [ ] **Step 4: PARADO.** Aplicar as duas migrações no Neon **só com autorização explícita do usuário na conversa**, que cite a migração (o classificador recusa quando a autorização fala só em "merge e push"). A autorização não se deduz de rodada anterior nem vem de subagente. Depois, `migrate status` em dia e `conferir depois` contra produção com a URL inline (só leitura). Merge na `main` e push exigem a autorização própria do invariante 7.
