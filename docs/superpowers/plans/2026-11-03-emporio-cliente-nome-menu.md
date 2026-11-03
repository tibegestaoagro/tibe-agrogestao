# Empório: cadastro do cliente, nome do produto e menu lateral. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cadastro de cliente PF/PJ com obrigatórios no balcão, venda sempre com cliente (com o "Consumidor final" fixo), nome do produto editável e o Meu Empório como grupo do menu lateral.

**Architecture:** a conferência do cadastro é uma função pura (`src/lib/contatos/cadastro.ts`) usada em dois modos: `livre` (Contatos, tudo opcional menos o nome) e `balcao` (Empório, obrigatórios por tipo). Contatos continua em `src/lib/actions/contacts.ts`; o caminho estrito ganha action e rota próprias do Empório. A regra de quem vê cada tela do Empório vira uma lista única em `src/lib/emporio/paginas.ts`, lida pelo menu e pelos cartões.

**Tech Stack:** Next.js 16, Prisma 7, Postgres 17, Zod 4, suítes `tsx` em `scripts/`.

**Spec:** `docs/superpowers/specs/2026-11-03-emporio-cliente-nome-menu-design.md` (e a do módulo, `docs/specs/module-39-meu-emporio.md`).

## Global Constraints

- Branch de trabalho nova, `emporio-cliente-menu`, criada a partir do `HEAD` atual de `emporio-f6-equipe`. Merge e push na `main` só com autorização na conversa (invariante 7).
- Nunca travessão (U+2014) em código, doc ou commit. Nada de heredoc para escrever arquivo: use Edit/Write.
- Toda query de negócio pelo client escopado. `Contact` já está em `TENANT_SCOPED_MODELS`.
- Migração gerada com a URL do Docker inline (`postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public`), aplicada no local, e no Neon (URL Direct) **antes** do push que levar o schema. Remover do SQL gerado os `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`.
- Suítes rodam com `DATABASE_URL` e `REDIS_URL` locais inline.
- Ordem por frente: action, rota, tela. Regra de negócio só em `src/lib/actions/*`.
- Toda action de escrita em `src/lib/actions/emporio-*.ts` chama `registrarNoHistorico` (conferência 19).
- Cada campo do `ORDEM` de um formulário renderiza `error=` no seu `<Field>` (conferência 15). Nada de `<input type="number">`, cor crua do Tailwind ou recusa do Zod crua.
- Toda rota nova entra em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api`).
- Subagente não commita: a sessão principal commita cada tarefa concluída.
- A busca nas listas de escolha está **fora** deste plano.

## Valores fixados (usados por várias tarefas)

Campos novos de `Contact` (nomes da API = nomes da coluna):

| campo | tipo | observação |
|---|---|---|
| `person_kind` | enum `ContactPersonKind { pf pj }`, nulo | nulo = não informado |
| `document` | `String?` | só dígitos: 11 (CPF) ou 14 (CNPJ). `@@unique([tenant_id, document])` |
| `state_registration` | `String?` | 8 a 14 dígitos, ou `ISENTO` |
| `birth_date` | `DateTime? @db.Date` | só PF |
| `responsible_name` | `String?` | só PJ |
| `address_zip`, `address_street`, `address_number`, `address_complement`, `address_district`, `address_state` | `String?` | o endereço principal. A cidade dele é a coluna `city` que já existe |
| `delivery_zip`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_district`, `delivery_city`, `delivery_state` | `String?` | endereço de entrega |
| `system_key` | `String?` | `"consumidor_final"` no contato fixo. `@@unique([tenant_id, system_key])` |

CEP guardado com 8 dígitos; UF uma das 27 siglas.

Mensagens exatas (as suítes conferem):

| situação | code, status, field | mensagem |
|---|---|---|
| balcão sem tipo | `VALIDATION_ERROR`, 422, `person_kind` | `Escolha pessoa física ou jurídica.` |
| balcão sem nome PF / PJ | 422, `name` | `Informe o nome do cliente.` / `Informe o nome da empresa.` |
| balcão sem CPF / CNPJ | 422, `document` | `Informe o CPF.` / `Informe o CNPJ.` |
| balcão sem telefone | 422, `phone` | `Informe o telefone.` |
| documento sem tipo (Contatos) | 422, `person_kind` | `Escolha pessoa física ou jurídica para informar o documento.` |
| CPF inválido | 422, `document` | `CPF inválido. Confira os 11 números.` |
| CNPJ inválido | 422, `document` | `CNPJ inválido. Confira os 14 números.` |
| inscrição | 422, `state_registration` | `Inscrição estadual: use só números (de 8 a 14) ou ISENTO.` |
| CEP | 422, `address_zip` ou `delivery_zip` | `CEP inválido. Use os 8 números.` |
| UF | 422, `address_state` ou `delivery_state` | `Escolha a UF da lista.` |
| nascimento no futuro | 422, `birth_date` | `A data de nascimento não pode ser no futuro.` |
| documento repetido | `DUPLICATE_DOCUMENT`, 409, `document` | `Já existe um contato com esse CPF: <nome>.` (ou `CNPJ`); arquivado acrescenta ` Ele está arquivado: desarquive em Contatos.` |
| mexer no Consumidor final | `VALIDATION_ERROR`, 422 | `O Consumidor final é fixo e não pode ser editado nem arquivado.` |
| venda sem cliente | 422, `contact_id` | `Escolha o cliente da venda. Quem não quer se identificar entra como Consumidor final.` |
| fiado / cheque no Consumidor final | 422, `contact_id` | `Fiado precisa do cliente de verdade, não do Consumidor final.` / `Cheque precisa do cliente de verdade, não do Consumidor final.` |
| nome de produto vazio | 422, `name` | `Informe o nome do produto.` |
| nome de produto repetido | `DUPLICATE_NAME`, 409, `name` | `Já existe um produto chamado "<nome>".` |

## Review Focus

- **Máscara colada:** quem cola `123.456.789-09`, `12.345.678/0001-95`, `38400-000` ou `isento` espera que funcione. A conferência aceita pontuação e caixa baixa e guarda normalizado (teste na Tarefa 2).
- **CPF com todos os dígitos iguais** (`111.111.111-11`) passa no cálculo do dígito e é inválido. A Tarefa 2 o recusa.
- **Edição parcial em Contatos não apaga dado novo:** o `PATCH` de Contatos hoje substitui tudo, e um cliente que só corrige o telefone não pode perder o CPF cadastrado no balcão. Campo novo ausente no corpo = mantém (teste na Tarefa 3).
- **Corrida no "Consumidor final":** duas abas abrindo o balcão ao mesmo tempo numa conta nova não podem criar dois. Garantia por `upsert` na chave única (teste na Tarefa 4).
- **Trocar tipo de PJ para PF no "Completar":** o `responsible_name` some e a data de nascimento passa a valer. O dado do outro tipo é gravado como nulo (teste na Tarefa 2).

---

### Task 1: schema e migração do contato

**Agente:** `servidor-dados`

**Files:**
- Modify: `prisma/schema.prisma` (`model Contact`, por volta da linha 3106; enum novo ao lado de `ContactType`)
- Create: `prisma/migrations/<timestamp>_contato_cadastro_completo/migration.sql`

**Interfaces:**
- Produces: as colunas da tabela "Valores fixados", o enum `ContactPersonKind`, e os dois `@@unique` (`[tenant_id, document]`, `[tenant_id, system_key]`).

- [ ] **Step 1:** criar a branch: `git switch -c emporio-cliente-menu`.
- [ ] **Step 2:** acrescentar os campos e os dois `@@unique` em `Contact`, com comentário `///` citando este design.
- [ ] **Step 3:** gerar o SQL com `migrate diff` (URL do Docker inline, ver Global Constraints), salvar em `migration.sql`, remover os dois `DROP INDEX` conhecidos. Acrescentar no fim o `INSERT` do "Consumidor final" (`name 'Consumidor final'`, `system_key 'consumidor_final'`, `id` de `gen_random_uuid()::text`) para cada tenant com `TenantFeature` `emporio` ligado, com `ON CONFLICT DO NOTHING`. Assim a API de vendas tem o contato desde o primeiro dia; contas que ganharem o Empório depois o recebem pelo `garantirConsumidorFinal` da Tarefa 4.
- [ ] **Step 4:** aplicar no local: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run db:deploy`. Esperado: migração aplicada.
- [ ] **Step 5:** `npx prisma generate`, `npx tsc --noEmit`, `npm run test:isolation` e `npm run check`. Esperado: tudo verde.
- [ ] **Step 6:** commit `Contato: colunas de cadastro PF/PJ, endereços e marca de sistema`.

### Task 2: a conferência do cadastro (função pura)

**Agente:** `servidor-acao`; a seção de teste pode ir em paralelo com `prova-suite`.

**Files:**
- Create: `src/lib/contatos/cadastro.ts`
- Create: `scripts/m90-emporio-cliente.test.ts` (seção 1, sem banco; o arquivo cresce nas Tarefas 3 a 5 e 7)
- Modify: `package.json` (`"test:m90": "tsx scripts/m90-emporio-cliente.test.ts"`)

**Interfaces:**
- Produces:
  - `export type CadastroDoContato = { name?: string | null; person_kind?: "pf" | "pj" | null; document?: string | null; phone?: string | null; state_registration?: string | null; birth_date?: string | null /* YYYY-MM-DD */; responsible_name?: string | null; address_zip?…; address_street?…; address_number?…; address_complement?…; address_district?…; city?…; address_state?…; delivery_zip?…; delivery_street?…; delivery_number?…; delivery_complement?…; delivery_district?…; delivery_city?…; delivery_state?… }` (todos `string | null`, opcionais).
  - `export function conferirCadastro(input: CadastroDoContato, modo: "livre" | "balcao"): { ok: true; dados: CadastroDoContato } | { ok: false; field: string; message: string }`. Devolve os dados normalizados: aparados, vazio vira `null`, documento, CEP e inscrição só com dígitos (ou `ISENTO`), UF em maiúscula, campo do outro tipo como `null`. Só confere os campos **presentes** no objeto (ausente continua ausente em `dados`).
  - `export function cpfValido(digitos: string): boolean`, `export function cnpjValido(digitos: string): boolean`.
  - `export function cadastroIncompleto(c: { name: string; person_kind: string | null; document: string | null; phone: string | null; system_key: string | null }): boolean`: `false` com `system_key`; `true` sem tipo, sem documento ou sem telefone.
  - `export function formatarDocumento(d: string | null): string` (`000.000.000-00` / `00.000.000/0000-00`) e `export function formatarCep(d: string | null): string`.
  - `export const UFS: readonly string[]` (as 27 siglas).
  - `export const CONSUMIDOR_FINAL = { system_key: "consumidor_final", name: "Consumidor final" } as const`.

- [ ] **Step 1: escrever a seção 1 da suíte**, com `check(...)` no padrão de `scripts/m89-emporio-historico.test.ts`:
  - `cpfValido("52998224725") === true`, `cpfValido("11111111111") === false`, `cpfValido("52998224724") === false`;
  - `cnpjValido("11222333000181") === true`, `cnpjValido("11222333000180") === false`;
  - `conferirCadastro({ name: "Zé", person_kind: "pf", document: "529.982.247-25", phone: "34 99999-0000" }, "balcao")` ok, com `dados.document === "52998224725"`;
  - balcão PF sem CPF: `field "document"`, `Informe o CPF.`; PJ sem nome: `Informe o nome da empresa.`; sem tipo: `field "person_kind"`; sem telefone: `field "phone"`;
  - livre só com `{ name: "Frigorífico X" }` ok; livre com documento e sem tipo: `field "person_kind"` com a mensagem fixada;
  - inscrição: `"123.456.789.012"` ok (12 dígitos), `"0623079040081"` ok (13), `"isento"` vira `"ISENTO"`, `"1234567"` recusa;
  - CEP `"38400-000"` vira `"38400000"`; `"3840"` recusa em `address_zip`; UF `"mg"` vira `"MG"`, `"XX"` recusa;
  - PJ com `birth_date` e PF com `responsible_name`: os dois saem `null` em `dados`;
  - nascimento amanhã recusa em `birth_date`;
  - `cadastroIncompleto` nos quatro casos (completo, sem tipo, sem documento, com `system_key`).
- [ ] **Step 2:** `npm run test:m90`. Esperado: FALHA (módulo ausente).
- [ ] **Step 3:** implementar `src/lib/contatos/cadastro.ts` com as mensagens da tabela.
- [ ] **Step 4:** `npm run test:m90` verde; `npm run check` verde (a suíte nova está no `package.json`).
- [ ] **Step 5:** commit `Contato: conferência pura do cadastro PF/PJ`.

### Task 3: Contatos aceita os campos novos, tudo opcional

**Agente:** `servidor-acao`

**Files:**
- Modify: `src/lib/actions/contacts.ts` (`ContactInput`, `ContactView`, `serializar`, `listContacts`, `createContact`, `updateContact`, `setContactArchived`, `getContactDetail`, `findOrCreateContact`; o comentário do §5 passa a dizer que a regra vale fora do Empório)
- Modify: `src/app/api/v1/contacts/route.ts`, `src/app/api/v1/contacts/[id]/route.ts` (schemas Zod)
- Modify: `src/app/(dashboard)/emporio/compras/page.tsx:56`, `src/app/(dashboard)/negociacoes/page.tsx:171` (filtro `system_key: null`)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (entradas de `/api/v1/contacts`)
- Test: `scripts/m90-emporio-cliente.test.ts` (seção 2)

**Interfaces:**
- Consumes: `conferirCadastro`, `CadastroDoContato` (Tarefa 2).
- Produces:
  - `ContactInput = CadastroDoContato & { name: string; type?: ContactType | null; notes?: string | null }`.
  - `ContactView` ganha todos os campos novos (sem `system_key`) e `incomplete: boolean`, `birth_date` como `YYYY-MM-DD`.
  - `export async function documentoRepetido(db: ContactClient, documento: string, selfId: string | null): Promise<{ id: string; name: string; archived: boolean } | null>` e `export function recusaDocumento(r: { name: string; archived: boolean }, documento: string)` (devolve o `fail` 409 da tabela). Usados também pela Tarefa 4.

- [ ] **Step 1: escrever a seção 2** (fixture de tenant como em `m89`):
  - `createContact` só com nome: ok, `incomplete === true`;
  - com PF e CPF válido: grava `document` só com dígitos;
  - com CPF inválido: 422 `document`;
  - segundo contato com o mesmo CPF: 409 `DUPLICATE_DOCUMENT`, mensagem com o nome do primeiro; depois de arquivar o primeiro, a mensagem traz o trecho do arquivado;
  - mesmo CPF em **outro** tenant: ok;
  - `updateContact` com `{ name, phone }` num contato que tem CPF e endereço: CPF e endereço continuam lá;
  - `listContacts` e `findOrCreateContact(db, "consumidor final")` não devolvem o contato com `system_key` (crie um direto no banco para o teste);
  - `updateContact` e `setContactArchived` no contato com `system_key`: 422 com a mensagem fixada.
- [ ] **Step 2:** `npm run test:m90`. Esperado: seção 2 FALHA.
- [ ] **Step 3:** implementar. `updateContact` mantém a semântica atual para `name/type/phone/city/notes` e trata cada campo **novo** como "ausente = mantém, nulo = limpa". Unicidade: consultar `documentoRepetido` antes de gravar e, na corrida, capturar o erro único do Prisma e responder com a mesma recusa.
- [ ] **Step 4:** nas rotas, acrescentar os campos ao Zod como `z.string().trim().nullish()` (e `person_kind` como `z.enum(["pf","pj"]).nullish()`), sem regra de negócio, só repassando. Atualizar `endpoints.ts`.
- [ ] **Step 5:** `npm run test:m90`, `npm run test:docs-api`, `npm run check`, `npx tsc --noEmit`. Esperado: verde.
- [ ] **Step 6:** commit `Contatos: campos PF/PJ opcionais, documento conferido e único`.

### Task 4: cliente do balcão e o Consumidor final

**Agente:** `servidor-acao`

**Files:**
- Create: `src/lib/actions/emporio-clientes.ts`
- Create: `src/app/api/v1/emporio/customers/route.ts` (POST), `src/app/api/v1/emporio/customers/[id]/route.ts` (PATCH)
- Modify: `src/lib/emporio/historico.ts` (`ACOES_DO_HISTORICO`: `"cliente.cadastrar": "Cadastrou um cliente"`, `"cliente.completar": "Completou o cadastro de um cliente"`)
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m90-emporio-cliente.test.ts` (seção 3)

**Interfaces:**
- Consumes: `conferirCadastro(…, "balcao")`, `documentoRepetido`, `recusaDocumento`, `ContactView`, `CONSUMIDOR_FINAL`.
- Produces:
  - `export async function cadastrarClienteAction(db: TenantPrismaClient, ator: Ator, input: ContactInput): Promise<ActionResult<ContactView>>`: exige `vendedor_da_loja`; grava e registra `cliente.cadastrar` (`target_type: "contato"`) na mesma transação.
  - `export async function completarClienteAction(db, ator, id: string, input: ContactInput): Promise<ActionResult<ContactView>>`: mesma permissão; mescla o que o contato já tem com o input e confere o resultado em modo `balcao` (então só salva completo); recusa o Consumidor final; registra `cliente.completar` com `diferencas`.
  - `export async function garantirConsumidorFinal(db: TenantPrismaClient): Promise<{ id: string; name: string }>`: `upsert` pela chave única `[tenant_id, system_key]`. O nome não termina em `Action` de propósito: não é escrita do usuário e não vai ao Histórico.
  - Rotas: `POST /api/v1/emporio/customers` (201) e `PATCH /api/v1/emporio/customers/:id` (200), wrappers finos no padrão de `src/app/api/v1/emporio/products/[id]/route.ts` (`guardEmporio`, `respostaDaAction`).

- [ ] **Step 1: escrever a seção 3:**
  - vendedor cadastra PF completo: 201 pela rota com Bearer (`withBearer`, como em `m89`), e 1 linha `cliente.cadastrar` no Histórico;
  - PF sem CPF pela action: 422 `document`; PJ sem CNPJ: 422 `document`;
  - usuário sem papel no Empório: `FORBIDDEN`;
  - completar um contato antigo (só nome) mandando tipo, CPF e telefone: ok, `incomplete === false`, linha `cliente.completar`;
  - completar mandando só o telefone num contato sem CPF: 422 `document`;
  - `garantirConsumidorFinal` chamado duas vezes em `Promise.all`: devolve o mesmo id e há 1 só contato com `system_key` no tenant.
- [ ] **Step 2:** rodar; seção 3 FALHA.
- [ ] **Step 3:** implementar action e rotas; atualizar `endpoints.ts`.
- [ ] **Step 4:** `npm run test:m90`, `npm run test:docs-api`, `npm run check` (conferência 19). Esperado: verde.
- [ ] **Step 5:** commit `Empório: cadastro e complemento de cliente no balcão, e o Consumidor final`.

### Task 5: a venda exige cliente

**Agente:** `servidor-acao`

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (`prepararVenda`, por volta das linhas 443 a 450 e 595 a 612; vale para `venderAction` e `trocarAction`)
- Modify: `src/app/(dashboard)/emporio/_components/catalogo-venda.ts` (contatos com flags e o Consumidor final primeiro)
- Modify: `src/app/(public)/docs/api/endpoints.ts` (descrição do POST de vendas: `contact_id` obrigatório)
- Modify (fixtures que vendem sem cliente): `scripts/m81-emporio-f3a.test.ts`, `m82`, `m83`, `m84`, `m85`, `m87`, `m89`, `scripts/_cenario-emporio-f3b.ts`, `_cenario-emporio-f4a.ts`, `_cenario-emporio-f4b.ts`, `_cenario-emporio-f5.ts`, `_cenario-emporio-f6b.ts`, `scripts/cenario-demonstracao-emporio.ts`
- Test: `scripts/m90-emporio-cliente.test.ts` (seção 4)

**Interfaces:**
- Consumes: `garantirConsumidorFinal`, `cadastroIncompleto`.
- Produces: `carregarCatalogoDeVenda(...)` passa a devolver `contatos: { id: string; name: string; incomplete: boolean; consumidor_final: boolean }[]`, com o Consumidor final em primeiro e os demais por nome (sem `system_key` de outros tipos, se um dia houver).

- [ ] **Step 1: escrever a seção 4:**
  - `venderAction` sem `contact_id`: 422 `contact_id` com a mensagem fixada; o mesmo para `trocarAction`;
  - venda em dinheiro para o Consumidor final: ok;
  - fiado e cheque para o Consumidor final: 422 `contact_id` com as mensagens fixadas;
  - venda para contato antigo só com nome: ok;
  - `carregarCatalogoDeVenda` numa conta sem Consumidor final: cria e o devolve em primeiro, com `consumidor_final: true`; o contato só com nome vem `incomplete: true`.
- [ ] **Step 2:** rodar; seção 4 FALHA.
- [ ] **Step 3:** implementar em `prepararVenda`. Ler `system_key` junto no `findFirst` do contato.
- [ ] **Step 4:** nas fixturas listadas, fazer o wrapper local de venda mandar `contact_id` do `garantirConsumidorFinal(db)` quando o teste não passa um. Onde um teste afirmava que vender sem cliente passa (procurar em `m81`), trocar a expectativa para a recusa nova, com comentário citando este design.
- [ ] **Step 5:** `npm run test:all -- --sem-redis` com as URLs locais inline. Esperado: tudo verde; reportar qualquer vermelho com a saída.
- [ ] **Step 6:** commit `Empório: a venda exige cliente; Consumidor final sem fiado nem cheque`.

### Task 6: as telas do cadastro

**Agente:** `tela-pagina`

**Files:**
- Create: `src/components/contatos/campos-do-cadastro.tsx`: os campos PF/PJ e os dois endereços, sem estado próprio de envio; recebe valores, `onChange`, `erros`, `idDe`, `limparCampo` e `obrigatorios: boolean`.
- Create: `src/app/(dashboard)/emporio/_components/cliente-form.tsx` (substitui `cliente-novo-form.tsx`, que é apagado): `modo: "novo" | "completar"`; no completar, busca `GET /api/v1/contacts/:id` para preencher e envia `PATCH /api/v1/emporio/customers/:id`; no novo, `POST /api/v1/emporio/customers`.
- Modify: `src/app/(dashboard)/emporio/_components/venda-campos.tsx` (campo Cliente), `venda-estado.ts` (validação local), `balcao.tsx`, `trocar-form.tsx` (tipo dos contatos)
- Modify: `src/components/contatos/contact-form.tsx` (usa `campos-do-cadastro` com `obrigatorios={false}`; o comentário de cabeçalho deixa de dizer que a lista não cresce)
- Modify: `src/app/(dashboard)/contatos/page.tsx` e `contatos/[id]/page.tsx` (selo "Cadastro incompleto" e os dados novos na ficha, com `formatarDocumento`/`formatarCep`)

**Interfaces:**
- Consumes: rotas das Tarefas 3 e 4; `UFS`, `formatarDocumento`, `formatarCep`; o novo tipo de `contatos` da Tarefa 5.

- [ ] **Step 1:** formulário: primeiro um seletor "Pessoa física / Pessoa jurídica" (dois botões de opção do kit); depois os campos do tipo, com os rótulos `Nome` ou `Nome da empresa`, `CPF` ou `CNPJ`, `Telefone`, `Data de nascimento` (PF), `Nome do responsável` (PJ), `Inscrição estadual`, o bloco `Endereço` (PF: "Endereço residencial"; PJ: "Endereço da empresa") e o bloco `Endereço de entrega` com o botão "Usar o mesmo endereço". CPF, CNPJ, CEP e telefone usam `inputMode="numeric"` com máscara de exibição. UF num `Select` com `UFS`. Todos os campos entram no `ORDEM` com `error=` no `<Field>`.
- [ ] **Step 2:** venda: o campo Cliente fica `required`, sem a opção "Sem cliente" e sem o hint "Opcional, menos no fiado."; sem pré-seleção. Validação local: `Escolha o cliente da venda.` Contato escolhido com `incomplete` mostra, abaixo do campo, o aviso "Cadastro incompleto" e o botão "Completar cadastro" (abre `ClienteForm` em `completar`); ao salvar, o aviso some. Consumidor final escolhido com fiado ou cheque: a validação local dá a mesma frase do servidor.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npm run check`. Esperado: verde (atenção às conferências 7, 10, 15 e 16).
- [ ] **Step 4: validar no navegador** (`npm run dev` e o Chrome de testes, nunca o do usuário): cadastrar PF e PJ no balcão, ver a recusa de CPF inválido no próprio campo, vender para o Consumidor final, escolher um contato antigo e completar o cadastro, editar um contato em Contatos mexendo só no telefone e conferir que o CPF continua lá. Testar em largura de celular.
- [ ] **Step 5:** commit `Empório e Contatos: formulário PF/PJ, aviso de cadastro incompleto`.

### Task 7: editar o nome do produto

**Agentes:** `servidor-acao` (Steps 1 a 5), `tela-pagina` (Step 6)

**Files:**
- Modify: `src/lib/actions/emporio-catalogo.ts` (`EditarProdutoEmporioInput`, `editarProdutoEmporioAction`, `ROTULOS_PRODUTO`)
- Modify: `src/app/api/v1/emporio/products/[id]/route.ts` (`editarSchema` ganha `name: z.string().nullish()`)
- Create: `src/app/(dashboard)/emporio/_components/nome-produto-form.tsx`
- Modify: `src/app/(dashboard)/emporio/produtos/[id]/page.tsx` (botão "Editar nome" ao lado do `<h1>`, só com `podeEscrever`)
- Modify: `src/app/(public)/docs/api/endpoints.ts`
- Test: `scripts/m90-emporio-cliente.test.ts` (seção 5)

**Interfaces:**
- Produces: `EditarProdutoEmporioInput.name?: string`; `ROTULOS_PRODUTO.name = "Nome"`.

- [ ] **Step 1: escrever a seção 5:** renomear `"Arame 500"` para `"Arame Farpado 500 m"` grava em `Product.name` e o `lerProdutoEmporioAction` devolve o novo; uma linha `produto.editar` com `changes` contendo `{ campo: "Nome", antes: "Arame 500", depois: "Arame Farpado 500 m" }`; renomear para o nome de outro produto (com caixa diferente): 409 `DUPLICATE_NAME` com a mensagem fixada; nome em branco: 422 `name`; vendedor sem a chave `cadastrar_produto`: `FORBIDDEN`; uma venda feita antes mostra o nome novo em `lerVendaAction`.
- [ ] **Step 2:** rodar; seção 5 FALHA.
- [ ] **Step 3:** implementar na action: conferir vazio e repetido (`product.findFirst` com `mode: "insensitive"` e `NOT: { id: atual.product_id }`) antes da transação; gravar `name` no mesmo `tx.product.update` da marca; incluir `name` nos dois lados do `diferencas`; o `summary` usa o nome novo. Capturar o erro único na corrida com a mesma recusa.
- [ ] **Step 4:** rota e `endpoints.ts`.
- [ ] **Step 5:** `npm run test:m90`, `npm run test:docs-api`, `npm run check`. Verde.
- [ ] **Step 6:** tela: `FormSheet` com um campo `Nome` (no `ORDEM`, com `error=`), título "Editar nome", envia `PATCH` só com `{ name }` e faz `router.refresh()`. Validar no navegador: renomear, ver a recusa de nome repetido no campo, e o nome novo em Vendas e no Estoque da fazenda.
- [ ] **Step 7:** commit `Empório: nome do produto editável`.

### Task 8: o menu lateral do Empório

**Agentes:** `servidor-acao` para a lista pura e o `nav.ts`; `tela-pagina` para a sidebar e o início

**Files:**
- Create: `src/lib/emporio/paginas.ts`
- Modify: `src/lib/nav.ts` (`buildNavItems` e `montarItens`)
- Modify: `src/components/layout/sidebar.tsx` (`NavChild` ganha `exact?: boolean`; filho com `exact` só acende na rota exata)
- Modify: `src/app/(dashboard)/layout.tsx` (passa as páginas visíveis)
- Modify: `src/app/(dashboard)/emporio/page.tsx` (os cartões condicionais usam a lista)
- Test: `scripts/nav-build.test.ts` (`npm run test:nav`)

**Interfaces:**
- Consumes: `pode`, `PapelContexto`, `AcaoEmporio` de `src/lib/emporio/papel.ts`.
- Produces:
  - `export const PAGINAS_DO_EMPORIO: readonly { href: string; rotulo: string; exige: AcaoEmporio | null }[]`, nesta ordem: `/emporio` "Início" (null), `/emporio/vender` "Vender" (`vendedor_da_loja`), `/emporio/vendas` "Vendas", `/emporio/fiado` "Fiado", `/emporio/caixa` "Caixa", `/emporio/produtos` "Produtos", `/emporio/estoque` "Estoque", `/emporio/compras` "Compras", `/emporio/transferencias` "Transferências" (esses null), `/emporio/despesas` "Despesas" (`gestor_da_loja`), `/emporio/resultado` "Resultado" (`gestor_da_loja`), `/emporio/equipe` "Equipe" (`conta`), `/emporio/estabelecimentos` "Lojas" (null), `/emporio/historico` "Histórico" (`gestor_da_loja`).
  - `export function paginasVisiveis(c: PapelContexto): { href: string; rotulo: string }[]` e `export function veAPagina(c: PapelContexto, href: string): boolean`.
  - `buildNavItems` troca `veHistoricoDoEmporio` por `paginasDoEmporio: { href: string; rotulo: string }[]` (vazio quando não há Empório). O link de topo "Histórico" sai; "Meu Empório" vira `{ kind: "group", label: "Meu Empório", icon: "emporio", show: hasEmporio, children }`, com `exact: true` no Início.

- [ ] **Step 1: escrever os casos no `nav-build.test.ts`:** com as páginas de um dono, o grupo "Meu Empório" tem os 14 filhos na ordem acima e não há link de topo `/emporio/historico`; com as de um vendedor (via `paginasVisiveis` de um `PapelContexto` montado à mão), não há Despesas, Resultado, Equipe nem Histórico; com `soDaLoja: true`, o grupo continua lá; sem Empório, o grupo não aparece. Mais um caso para `paginasVisiveis` de um gestor (vê Histórico, não vê Equipe).
- [ ] **Step 2:** `npm run test:nav`. Esperado: FALHA.
- [ ] **Step 3:** implementar `paginas.ts` e o `nav.ts`; o layout calcula `paginasVisiveis(papelEmporio)` (só quando `hasEmporio`).
- [ ] **Step 4:** sidebar com `exact`; o início troca `podeVender`, `ehGestor` e `podeVerEquipe` **dos cartões** por `veAPagina(papel, href)` (o `ehGestor` dos primeiros passos fica como está).
- [ ] **Step 5:** `npm run test:nav`, `npx tsc --noEmit`, `npm run lint`, `npm run check`. Verde.
- [ ] **Step 6: validar no navegador** com o dono e com um vendedor (sessões por `scripts/_sessao-cookie.ts`): o grupo abre sozinho dentro do Empório, só o item atual acende (Início não acende em `/emporio/vendas`), e o vendedor não vê o que o cartão não mostra. Testar no celular.
- [ ] **Step 7:** commit `Menu: Meu Empório como grupo, com as telas que o papel permite`.

### Task 9: roteiro de navegador, spec e handoff

**Agente:** `prova-viva` para o roteiro; a sessão principal para os documentos

**Files:**
- Create: `scripts/navegador/emporio-cliente-menu.py` (no padrão dos roteiros existentes e de `_lib.py`)
- Modify: `docs/specs/module-39-meu-emporio.md` (decisões novas Q139 em diante: PF/PJ e obrigatórios no balcão, venda sempre com cliente revisando a Q37, Consumidor final, nome editável, menu revisando a Q59; o modelo de dados do §4 com os campos novos)
- Modify: `docs/agents/current-handoff.md`

- [ ] **Step 1:** roteiro que cadastra PF no balcão, vende para o Consumidor final, completa um contato antigo, renomeia um produto e confere o menu de dono e de vendedor. Provar nos dois sentidos: ele precisa reprovar com o campo Cliente voltando a ser opcional e passar com a correção.
- [ ] **Step 2:** `npm run navegador -- emporio-cliente-menu`. Esperado: saída 0.
- [ ] **Step 3:** atualizar a spec e o handoff. O handoff registra as pendências: migração no Neon antes do push, o cenário de demonstração da Da Mata a recriar com cliente nas vendas, e os prints e o texto do manual (venda e menu) desatualizados.
- [ ] **Step 4:** `npm run check` e commit `Empório: roteiro de navegador, spec e handoff do cadastro do cliente e do menu`.
- [ ] **Step 5:** relatar ao usuário o que passou e o que faltou, e **pedir** autorização para o push na `main` (precedido da migração no Neon). Nada de merge sem ela.
