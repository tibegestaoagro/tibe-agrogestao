---
tipo: design
data: 2026-11-03
modulo: 39 (Meu Empório)
origem: pedido da Laiza (Agromax) pelo WhatsApp, em 2026-11-03, e entrevista com o Dilton
---

# Meu Empório: cadastro do cliente, nome do produto e menu lateral

Três frentes pedidas pelo cliente depois de usar o Empório em produção. São
independentes entre si e podem ser entregues em qualquer ordem. A primeira é a
maior, porque muda o banco e uma regra da venda.

A spec do módulo é `docs/specs/module-39-meu-emporio.md`. Este documento a
complementa e, em dois pontos, a revisa (Q37 e Q59, ver abaixo). As decisões
novas devem entrar na tabela de decisões da spec, continuando a numeração
(a última hoje é a Q138).

**Fora deste documento, por decisão do usuário:** a busca de produto e de
cliente nas listas de escolha (compra, transferência, cliente na venda). Foi
levantada, e o usuário pediu para deixar quieto por enquanto.

---

## Frente 1: cadastro do cliente

### Por que

A loja quer ter os dados do cliente "para qualquer caso": uma nota fiscal no
futuro, uma entrega programada. Não existe hoje uma emissão de nota nem uma
entrega no Tibé; o pedido é só **guardar os dados**, no momento em que a venda
é fechada. Nada além do formulário e da regra de obrigatoriedade.

### Onde o cliente vive hoje

O cliente do Empório é o `Contact`, o mesmo de Contatos, Leite, Negociações e
Serviços. Ele guarda `name`, `type` (`ContactType`, o papel comercial:
frigorífico, laticínio...), `phone`, `city`, `notes` e `archived_at`. **Decisão
do usuário:** continua um cadastro só, compartilhado. O que se cadastra no
Empório aparece em Contatos, e o contrário.

No balcão, o "Cliente novo"
(`src/app/(dashboard)/emporio/_components/cliente-novo-form.tsx`) abre um
painel dentro da venda e pede nome e telefone, via `POST /api/v1/contacts`.
Hoje o cliente é opcional na venda e obrigatório só no fiado e no cheque
(Q37; `src/lib/actions/emporio-vendas.ts`).

### O que o usuário decidiu

**1. Tipo de cliente primeiro: Pessoa física ou Pessoa jurídica.** O formulário
pergunta o tipo antes de tudo e mostra os campos daquele tipo.

| no balcão do Empório | Pessoa física | Pessoa jurídica |
|---|---|---|
| **obrigatório** | nome, CPF, telefone | nome da empresa, CNPJ, telefone |
| **opcional** | data de nascimento, inscrição estadual, endereço residencial, endereço de entrega | nome do responsável, inscrição estadual, endereço, endereço de entrega |

Os campos vêm literalmente do pedido da Laiza: endereço residencial, endereço
de entrega, inscrição estadual (13 dígitos), CPF, CNPJ, data de nascimento. O
"nome do responsável" na pessoa jurídica é do Dilton.

**2. A venda passa a exigir cliente sempre.** Revisa a Q37: o cliente deixa de
ser opcional nas vendas que não são fiado nem cheque. Vale para a venda
(`venderAction`) e para a troca (`trocarAction`), que gera uma venda.

**3. Cliente fixo "Consumidor final"**, já existente em toda conta com o
Empório, para quem compra e não quer se identificar.

**4. Contato antigo sem CPF/CNPJ não trava a venda.** Escolhido na venda, ele é
aceito, e aparece um aviso "cadastro incompleto" com um botão para completar o
cadastro ali mesmo. A exigência vale para quem é cadastrado daqui para frente.

**5. O mesmo formulário em Contatos, mas lá tudo é opcional.** A tela de
Contatos (`src/components/contatos/contact-form.tsx`) ganha o mesmo seletor de
tipo e os mesmos campos, **sem obrigar nada além do nome**, como hoje. A
obrigatoriedade vale **só quando o cliente é cadastrado ou completado pelo
balcão do Empório**. Isso preserva o §5 do Módulo 31, citado no topo de
`src/lib/actions/contacts.ts` ("não deve exigir CPF, CNPJ..."): uma fazenda sem
Empório continua cadastrando um frigorífico ou um mecânico só pelo nome.

**6. Inscrição estadual: só dígitos, sem tamanho fixo.** Aceita de 8 a 14
dígitos, para valer em qualquer estado (a de MG tem 13, a de SP tem 12), ou a
palavra `ISENTO`. Vale para PF e PJ.

**7. Endereço em campos separados**, nos dois endereços (residencial ou da
empresa, e de entrega): CEP, rua, número, complemento, bairro, cidade e UF.
É o que uma nota fiscal futura exigiria, sem migrar dado depois. O endereço de
entrega pode ficar vazio, e o formulário oferece "o mesmo do outro endereço".

### Regras que decorrem disso (decisões minhas, marcadas para conferência)

- **"Cadastro incompleto"** = contato sem tipo (PF/PJ) ou sem algum obrigatório
  do próprio tipo. É calculado, não gravado.
- **O "Consumidor final" não pode receber fiado nem cheque.** Fiado de anônimo
  não tem de quem cobrar, que é o motivo da Q37. A venda recusa com mensagem
  dizendo para escolher o cliente de verdade.
- **O "Consumidor final" não pode ser editado nem arquivado**, não conta como
  incompleto e é reconhecido por uma marca de sistema, nunca pelo nome (o
  usuário pode ter um contato chamado "Consumidor final" por conta própria).
- **Toda conta com o Empório recebe o seu** pela migração, e uma conta que
  ganhar o Empório depois o recebe na primeira leitura do catálogo da venda (ou
  na ativação do recurso, o que o builder achar mais simples e testável).
- **CPF e CNPJ conferidos pelo dígito verificador**, guardados só com os
  dígitos, exibidos com máscara (`000.000.000-00`, `00.000.000/0000-00`).
- **CPF/CNPJ não se repete dentro da mesma conta, contando os arquivados.** Se
  repetir, a recusa diz qual contato já tem aquele documento, para a pessoa
  escolhê-lo em vez de duplicar; se ele estiver arquivado, a recusa diz isso e
  manda desarquivar em Contatos. Nulo não conflita (o
  `@@unique([tenant_id, documento])` do Prisma já trata nulo como distinto no
  Postgres, então não é índice parcial e não entra na lista de índices que o
  `migrate diff` tenta derrubar).
- **O documento, quando preenchido, é sempre conferido**, também em Contatos:
  ali ele é opcional, mas não pode ser inválido nem repetido.
- **Onde mora a obrigatoriedade:** num caminho do Empório (action e rota
  próprias, ou um modo estrito da validação compartilhada, à escolha do
  builder), usado pelo "Cliente novo" e pelo "Completar cadastro" do balcão. O
  `createContact` / `updateContact` de Contatos fica permissivo. A regra de
  conferência (dígito, repetição, formato da inscrição e do CEP) é uma só, nos
  dois caminhos.
- **Editar um contato em Contatos nunca obriga a completar.** Corrigir só o
  telefone de um contato antigo continua passando. Já o "Completar cadastro"
  do balcão só salva quando o contato fica completo para o tipo escolhido.
- **Criação automática por nome continua só com o nome.**
  `findOrCreateContact` (Negociações, Permuta, Remessa, Serviços, agente do
  WhatsApp) segue criando contato sem documento; esses nascem "incompletos".
- **O "Consumidor final" só aparece onde se escolhe o cliente da venda e da
  troca.** Fica fora da lista de Contatos, do fornecedor da compra, de Leite,
  Negociações, Serviços e do receber fiado, e `findOrCreateContact` nunca casa
  com ele, mesmo que alguém diga "consumidor final" no WhatsApp. A venda feita
  para ele continua aparecendo em Vendas, com o nome "Consumidor final".
- **Vendas antigas sem cliente ficam como estão.** A regra vale para venda
  nova; nada é preenchido retroativamente.
- **`ContactType` não muda.** PF/PJ é um campo novo, separado do papel
  comercial: um frigorífico é PJ, um particular pode ser qualquer um.
- **A escolha do cliente na venda continua sendo a lista atual** (a busca
  ficou fora). Ela passa a listar o "Consumidor final" primeiro.
- **O Cliente novo do balcão** devolve o contato criado já escolhido na venda,
  como hoje.

### Consequências que o builder precisa cuidar

- Migração com campos novos em `Contact` e o "Consumidor final" de cada conta
  com o Empório. Invariante 3: migração no Neon antes do push.
- `npm run seed:demo` e o cenário de demonstração da Da Mata
  (`2bfc872`) precisam do "Consumidor final", e as vendas de demonstração sem
  cliente passam a ser recusadas se forem recriadas.
- Contrato em `/docs/api` (`src/app/(public)/docs/api/endpoints.ts`) para os
  campos novos de contato e para `contact_id` obrigatório na venda.
- Conferência 15 do `npm run check`: cada campo novo do `ORDEM` precisa
  renderizar a própria recusa no `<Field>`.
- O manual do Empório (`/manual`) descreve o cliente como opcional e o Cliente
  novo com dois campos: o texto e os prints dessa parte ficam desatualizados.

---

## Frente 2: editar o nome do produto

### Por que

Hoje o nome do produto não pode ser corrigido depois de criado
(`editarProdutoEmporioAction`, `src/lib/actions/emporio-catalogo.ts`, não aceita
`name`). Um erro de digitação fica para sempre.

### O que foi combinado

- Um botão de editar **ao lado do nome, no topo da tela do produto**
  (`src/app/(dashboard)/emporio/produtos/[id]/page.tsx`), que abre um painel do
  kit com um campo só.
- O nome fica em `Product.name`, compartilhado com o Estoque da fazenda: **o
  nome novo vale no Tibé inteiro**.
- **Não pode repetir** o nome de outro produto da conta (`@@unique([tenant_id,
  name])` já existe no banco). A recusa é em português e diz que já existe um
  produto com esse nome.
- **Fica no Histórico do Empório** (`registrarNoHistorico`, conferência 19), com
  o nome anterior e o novo.
- **As vendas antigas passam a mostrar o nome novo**, porque o item da venda
  aponta para o produto e não guarda cópia do nome. Para corrigir digitação, é
  o esperado.
- Permissão: a mesma de editar o produto (`chave:cadastrar_produto`).

---

## Frente 3: o menu lateral do Empório

### Por que

O Empório tem 13 telas e hoje só se chega a elas pelos cartões da página
inicial (`src/app/(dashboard)/emporio/page.tsx`). Quem está em Caixa e quer ir
para Vender precisa voltar ao início. O cliente quer o mesmo comportamento de
"Operação": um grupo no menu que abre e mostra as telas.

Revisa a **Q59** da spec ("sem item novo no menu", porque o menu da conta mista
já era longo). Agora o grupo fechado resolve a mesma preocupação.

### O que foi combinado

"Meu Empório" vira um grupo (`kind: "group"` em `src/lib/nav.ts`), nesta ordem:

1. Início (`/emporio`, a página de cartões, que continua existindo)
2. Vender
3. Vendas
4. Fiado
5. Caixa
6. Produtos
7. Estoque
8. Compras
9. Transferências
10. Despesas
11. Resultado
12. Equipe
13. Lojas
14. Histórico

- **O menu mostra exatamente o que a pessoa pode abrir, como os cartões já
  fazem** (confirmado pelo usuário). Hoje os cartões decidem pelo papel do
  Empório (`papelDoEmporio` e `pode(papel, ...)`): Vender para
  `vendedor_da_loja`, Equipe para `conta`, Resultado, Despesas e Histórico para
  `gestor_da_loja`.
- **Decisão minha:** a regra de quem vê o quê passa a viver **numa lista só**,
  lida pelo menu e pelos cartões, para os dois não divergirem.
- O **"Histórico" de primeiro nível sai** do menu e entra no grupo.
- O grupo **vem aberto** quando a tela atual é do Empório, com o item atual
  marcado. No celular, funciona como Operação funciona hoje.
- Quem é "só da loja" (`src/lib/emporio/paginas-do-so-da-loja.ts`) continua
  vendo o grupo: `/emporio` e tudo abaixo já é permitido a ele.

### Consequências

- O layout passa a precisar do papel do Empório para montar o menu. Hoje ele
  só recebe `hasEmporio` e `veHistoricoDoEmporio`.
- Os prints do manual que mostram o menu lateral (o manual do Empório tem 26,
  `ddbc34b`) mostram o menu antigo.

---

## Como entregar

- Ordem de cada frente: action, rota, tela (CLAUDE.md).
- Suíte nova com o próximo número livre de `test:mNN`, cobrindo: obrigatórios
  por tipo no balcão, os mesmos campos opcionais em Contatos, dígito
  verificador, documento repetido (inclusive com arquivado), inscrição
  estadual com 12, 13 e `ISENTO`, venda sem cliente recusada,
  "Consumidor final" fora de Contatos e do `findOrCreateContact`,
  "Consumidor final" recusado no fiado e no cheque, contato antigo aceito na
  venda, renomear com nome repetido, renomear registrado no Histórico, e a lista
  única de páginas do menu conforme o papel.
- Validação viva num roteiro de `scripts/navegador/`: cadastrar PF e PJ no
  balcão, vender para o Consumidor final, escolher um contato antigo e ver o
  aviso, renomear um produto, e percorrer o menu com o owner e com um vendedor.

## O que fica com o builder

- Os nomes das colunas novas e se o documento fica em uma coluna (com o tipo
  dizendo se é CPF ou CNPJ) ou em duas.
- A forma da marca de sistema do "Consumidor final".
- Como o aviso de cadastro incompleto aparece no balcão e na lista de Contatos.
- O desenho do botão de editar nome, dentro do kit.
