---
tipo: design
data: 2026-11-06
modulo: 39 (Meu Empório)
origem: conversa com o Dilton em 2026-11-06, depois de a Agromax passar a usar o Empório em produção
---

# Meu Empório: clientes e fornecedores próprios, escolha do cliente e romaneio

O Dilton quer tratar o Empório como **um sistema separado, com o próprio
ecossistema**, que só se acessa com uma conta do Tibé. Este documento cobre
três frentes, nesta ordem, porque cada uma depende da anterior. **Cada frente
vira um plano próprio**, executado com contexto limpo, para que nenhum
subagente trabalhe com foco espalhado.

1. Clientes e fornecedores do Empório, separados de Contatos do Tibé.
2. A escolha do cliente (e do fornecedor) por dois botões e uma janela de busca.
3. O pedido para entrega e o romaneio.

A spec do módulo é `docs/specs/module-39-meu-emporio.md`. As decisões novas
entram na tabela de decisões dela, continuando a numeração (a última hoje é a
**Q190**). Este documento **revisa** o design de 03/11
(`2026-11-03-emporio-cliente-nome-menu-design.md`, Frente 1) em três pontos,
marcados abaixo.

**Fora deste documento, por decisão do usuário:**

- **O financeiro do Empório.** Vai ser separado do financeiro do Tibé, com uma
  pessoa responsável só pelo financeiro das lojas, sem nada a ver com o Tibé e
  as propriedades. É um plano à parte, com entrevista própria depois desta
  entrega. Até lá, o fiado, o cheque e as contas a pagar da compra continuam
  como estão (lançamentos `FinancialEntry` com `related_module: emporio`), só
  que apontando para o cliente e o fornecedor do Empório (ver Frente 1).
- **Acompanhar a entrega no sistema** (lista do que está a entregar, marcar
  entregue, quem recebeu). Por enquanto o papel assinado basta. É futuro.
- **Baixar o estoque da fazenda** quando o fornecedor é uma propriedade do
  próprio Dono. Quem faz isso é o Dono, no Estoque da fazenda.

⚠️ **Palavra que colide:** "entrega" já existe no Empório como a **entrega do
malote** do turno (`confirmarEntregaAction`, Q188) e como nome das fases do
programa ("entrega 1 a 4"). Neste documento, "pedido para entrega" e
"entrega da mercadoria" são a coisa nova. No código, use um nome que não
confunda com o malote.

---

## Por que

- **Clientes:** o Empório atende cliente de balcão, não faz contato de
  negócio. Hoje o cliente é o `Contact` do Tibé, o mesmo de Contatos, Leite,
  Negociações, Serviços e do agente do WhatsApp. Um cliente da loja aparece
  na lista de contatos de negócio da fazenda, e o contrário.
- **Histórico do cliente:** o Dilton pensa a longo prazo. Os dados de compra
  de cada cliente "fazem diferença em algum momento da empresa".
- **Escolha do cliente:** hoje é uma lista de seleção sem busca. Com o
  cadastro crescendo, achar o cliente fica inviável.
- **Romaneio:** é o documento que assegura que tudo foi entregue certo. Na
  retirada, o balcão separa, confere junto com o cliente e assina. Na entrega,
  a logística leva, confere e colhe a assinatura.

**Sucesso, nas palavras do usuário:** a venda nunca trava porque o cliente não
quer passar os dados; quem entrega tem a lista do que separar e, quando for
entrega, o endereço completo; e o papel assinado prova o que foi entregue.

**O que seria fracasso mesmo funcionando:** um cliente do Empório aparecer em
Contatos do Tibé (ou o contrário); a venda de balcão travar por falta de CPF;
o fiado, o cheque ou a conta a pagar de uma compra pararem de mostrar o nome
de quem deve, depois da migração.

---

## Frente 1: clientes e fornecedores do Empório

### Clientes

**Uma tela "Clientes" no grupo "Meu Empório" do menu** (`src/lib/nav.ts`, e na
lista única de quem vê o quê, do design de 03/11), com lista, busca (a mesma
da Frente 2), cadastro, edição, arquivamento e a ficha do cliente.

- **Tabela própria**, separada de `Contact`. O cliente do Empório não aparece
  em Contatos, Leite, Negociações, Serviços, Máquinas, no agente do WhatsApp
  nem no `findOrCreateContact`. Nenhum contato do Tibé aparece no Empório.
- **Por conta (tenant), compartilhado entre as lojas:** quem comprou na loja A
  já está cadastrado na loja B. Invariante 1: o model entra em
  `TENANT_SCOPED_MODELS`.
- **Os campos do design de 03/11 continuam:** tipo (Pessoa física ou Pessoa
  jurídica, escolhido no início do cadastro), nome (ou nome da empresa),
  telefone, CPF/CNPJ, inscrição estadual, data de nascimento (PF), nome do
  responsável (PJ), endereço principal e endereço de entrega, em campos
  separados (CEP, rua, número, complemento, bairro, cidade, UF). Valem as
  mesmas conferências de 03/11: dígito verificador do CPF/CNPJ (com o CNPJ
  alfanumérico da Q143), documento que não se repete na conta (contando os
  arquivados, com a recusa dizendo quem já tem aquele documento), inscrição
  estadual de 8 a 14 dígitos ou `ISENTO`. O campo `type` (`ContactType`, papel
  comercial: frigorífico, laticínio) **não** vem para o cliente do Empório.

**O que é obrigatório (REVISA a Frente 1 de 03/11, item 1):**

| | Pessoa física | Pessoa jurídica |
|---|---|---|
| **sempre** | nome, telefone | nome da empresa, telefone, CNPJ, endereço principal completo |
| **no pedido para entrega** (Frente 3) | + CPF no cadastro, + o endereço escolhido para o pedido completo | + o endereço escolhido para o pedido completo |
| **opcional** | o resto | o resto |

"Endereço completo" = CEP, rua, número, bairro, cidade e UF (complemento
opcional). Decisão minha: na pessoa física, o endereço exigido na entrega é o
**escolhido para o pedido**. Se for "outro endereço" (Frente 3), ele basta, e
o cadastro não precisa ter endereço; o CPF, sim, fica no cadastro. Palavras do usuário: "mantemos somente nome e telefone", e
"empresa sempre precisa dos dados completos, endereço".

**O "Consumidor final" continua** como o cliente padrão de quem não quer
passar nem o mínimo. "Não posso travar uma venda porque um cliente não quer
passar os dados": a venda para ele registra que foi alguém que não quis se
identificar. Continua valendo, agora sobre a tabela nova: cada conta com o
Empório tem o seu, reconhecido por marca de sistema (nunca pelo nome); não pode
ser editado nem arquivado; é recusado no fiado, no cheque e no pedido para
entrega; aparece primeiro na escolha do cliente.

**Histórico de compras na ficha do cliente:** toda venda dele, com data, loja,
número, itens (produto, quantidade, valor), total, forma de pagamento, vendedor
e situação (ativa, cancelada, trocada). Também os orçamentos. **Guardado para
sempre**, inclusive com o cliente arquivado. O histórico é lido das vendas, não
copiado (invariante 2 aplicado ao mesmo raciocínio: nada de total gravado no
cliente). Decisão minha, para conferir: a ficha mostra também o total comprado
e a data da última compra, calculados.

**Quem pode o quê:**

| ação | quem |
|---|---|
| cadastrar, completar e editar | Vendedor, Caixa, Gestor da loja, Gerente geral, Dono (todo papel que vende) |
| arquivar e desarquivar | Gestor da loja, Gerente geral, Dono |

Toda escrita entra no Histórico do Empório (`registrarNoHistorico`,
conferência 19). Decisão minha: CPF/CNPJ e telefone aparecem no histórico como
"informado", como já faz `emporio-clientes.ts` (`mascarar`).

### Fornecedores

**Uma tela "Fornecedores" no grupo "Meu Empório"**, também numa tabela
própria, separada de `Contact`. A Compra (`emporio-compras.ts`) passa a
escolher o fornecedor nela.

**Dois tipos de fornecedor:**

- **Uma propriedade do próprio Dono:** escolhe uma `Property` da conta. Serve
  **só para saber de onde o produto veio**. Não baixa estoque da fazenda nem
  gera lançamento na fazenda. Decisão minha: é um cadastro explícito em
  Fornecedores (nem toda propriedade vira fornecedor sozinha), pode ser
  arquivado como qualquer fornecedor, e guarda uma cópia do nome, para
  continuar legível se a propriedade for arquivada no Tibé. A mesma
  propriedade não vira dois fornecedores na conta.
  **Decisão do usuário (06/11): a compra de uma propriedade do Dono entra só
  com o custo dos produtos, sem conta a pagar.** O custo informado continua
  alimentando o custo médio do estoque; a forma de pagamento não é pedida e
  nenhum `FinancialEntry` é criado para essa compra.
- **Um fornecedor de fora:** nome, telefone, CPF/CNPJ, inscrição estadual e
  endereço. Decisão minha, para conferir: só o nome é obrigatório, e o
  documento, quando preenchido, passa pelas mesmas conferências do cliente
  (sem repetir entre fornecedores da conta).

Decisão minha: as permissões do fornecedor seguem as de registrar compra
(quem compra cadastra, gestor arquiva).

### A migração dos dados que existem

Lido em produção em 06/11, só leitura: quase não há dado. As 5 contas com o
Empório têm cada uma o seu "Consumidor final", e só a conta **Max Dias
Agromax** tem mais: 8 contatos, sendo 1 usado em venda, 4 em compras e 2 fora
do Empório (nenhum usado nos dois lados ao mesmo tempo), e 7 citados em
lançamentos financeiros. A Da Mata, depois da limpeza de 06/11, tem só o
"Consumidor final".

A migração precisa:

- **Criar o "Consumidor final" na tabela nova** para cada conta com o Empório e
  apontar para ele as vendas, orçamentos e trocas que hoje apontam para o
  contato de sistema.
- **Copiar para a tabela de clientes** cada contato usado em venda, troca,
  orçamento ou cheque, e **para a de fornecedores** cada contato usado em
  compra, repontando essas referências.
- **O que acontece com o `Contact` original:** o de sistema ("Consumidor
  final") sai de Contatos. O contato usado só pelo Empório também sai de
  Contatos, para não continuar como contato de negócio. Contato usado também
  fora do Empório fica em Contatos, e a cópia no Empório segue independente.
  Os lançamentos financeiros que apontam para o contato que sai são repontados
  para o cliente ou fornecedor novo (ver a ponte abaixo).
- **Rodar primeiro numa cópia** (o caminho já usado em 06/11:
  `scratchpad/copiar-conta.cjs exportar|importar` para o Docker) e conferir
  antes e depois. Invariante 3: migração no Neon antes do push, com
  autorização do usuário.

### A ponte com o financeiro (até o plano do financeiro)

O fiado (contas a receber), o cheque e as contas a pagar da compra são
`FinancialEntry` que hoje guardam `contact_id`. Até o plano do financeiro,
eles continuam no mesmo lugar e precisam **continuar mostrando o nome** de quem
deve ou de quem recebe, em todo lugar onde aparecem hoje: Caixa > receber
fiado (`emporio-caixa.ts`), a lista de cheques, a tela de Fiado, e as telas do
Financeiro do Tibé que listam esses lançamentos. Como (coluna nova no
lançamento, ou outra forma) fica com o builder; o requisito é não perder o
nome nem o filtro por cliente do fiado.

### Consequências

- `npm run seed:demo`, `scripts/cenario-demonstracao-emporio.ts` e os
  cenários de navegador que criam cliente ou compra precisam usar as tabelas
  novas.
- Contrato em `/docs/api` (`src/app/(public)/docs/api/endpoints.ts`): rotas
  novas de cliente e de fornecedor do Empório, e `contact_id` trocado nas
  rotas de venda, troca, orçamento e compra. Os nomes dos campos ficam com o
  builder; documentar a troca.
- As rotas `/api/v1/contacts` deixam de servir o Empório. O "Cliente novo" do
  balcão (`cliente-novo-form.tsx`) e o `cadastrarClienteAction` passam a criar
  na tabela nova.
- Manual do Empório: as partes que falam do cliente (Contatos, cadastro
  completo exigido no orçamento) ficam desatualizadas.

---

## Frente 2: a escolha do cliente e do fornecedor

O esboço aprovado pelo usuário em 06/11 ("está perfeito") está em
https://claude.ai/artifact/S8YhQHMiGDCi9H3nSGtDFL (privado, do usuário).

**No lugar da lista de seleção, dois botões:** "Escolher cliente" e
"Cadastrar novo cliente".

- **"Escolher cliente" abre uma janela** (painel do kit) com um campo de busca
  e a lista. A busca acha por:
  - **nome**, ignorando acento e maiúscula (`name_busca` / `nome_de_busca`
    já existem para isso em outros models);
  - **CPF/CNPJ**, por qualquer pedaço dos dígitos;
  - **telefone**, por qualquer pedaço dos dígitos, **sem DDD e sem DDI**: os 4
    primeiros, os 4 últimos ou o meio. Palavras do usuário: "pode ser parte
    do número, os 4 primeiros ou os 4 últimos, não precisa ter o DDD e/ou
    DDI".
  - A busca por dígitos começa com **3 dígitos**; com menos, aparece gente
    demais.
- **Cada linha mostra** nome, telefone formatado, documento (ou "sem
  CPF/CNPJ") e a última compra (data e valor), para separar dois clientes de
  nome parecido.
- **O "Consumidor final" fica sempre no topo**, marcado como cliente padrão,
  com o aviso de que não vale para fiado, cheque nem entrega.
- **Rodapé: "Não achou? Cadastrar novo"**, que leva ao cadastro.
- **"Cadastrar novo cliente"** abre o cadastro (tipo primeiro, depois os
  campos do tipo, com os obrigatórios da Frente 1). Ao salvar, o cliente volta
  já escolhido.
- **Escolhido, o cliente aparece num quadro** com nome, telefone e documento,
  e o botão "Trocar".
- **Cadastro incompleto para o que a venda pede** (por exemplo, pedido para
  entrega sem endereço) mostra o aviso e o botão para completar ali mesmo,
  sem sair da venda (o "Completar cadastro" de 03/11).

**Onde vale:** Vender (Venda e Orçamento), Troca e, para o fornecedor, a
Compra, com a mesma janela (busca por nome, documento e telefone; sem
"Consumidor final"; o fornecedor que é propriedade aparece com o nome da
propriedade).

**A busca roda no servidor**, por uma rota que devolve poucos resultados de
cada vez. A lista inteira de clientes não vai para a tela: a Agromax tem
muitas lojas, e o cadastro vai crescer.

---

## Frente 3: pedido para entrega e romaneio

### O fluxo, nas palavras do usuário

1. O vendedor atende e abre um **orçamento**, incluindo os produtos. Pelo
   tamanho do pedido, percebe se é para entrega.
2. O orçamento tem a opção **"Pedido para entrega"**. Marcada, o vendedor é
   obrigado a completar o cadastro do cliente (tabela da Frente 1), ali
   mesmo.
3. Marcada a entrega, abre a escolha do **endereço de entrega**: o do cadastro
   ou outro endereço.
4. O vendedor imprime o orçamento, e o cliente leva o papel ao **caixa**.
5. O caixa **fatura pelo número** do orçamento (entrega 4) e confirma o
   pagamento. Imprime o **cupom de venda** para o cliente e o **romaneio**.
6. **Retirada no balcão:** o romaneio vai para o balcão de entrega, que separa
   os produtos, confere junto com o cliente, e o papel é assinado como
   conferido e entregue.
7. **Entrega:** o romaneio vai só para a logística, que entrega e confere.

### Regras

- **"Pedido para entrega" existe no orçamento e na venda direta**, sem
  orçamento: o caixa também pode marcar e completar os dados ali. Ao faturar
  um orçamento marcado, a venda herda a marca e o endereço; o caixa pode
  completar o que faltar, mas não pode faturar uma entrega com o cadastro
  incompleto.
- **Mudar depois de fechada (decisão minha):** enquanto a venda estiver ativa,
  a marca de entrega e o endereço podem ser mudados pela tela da venda, por
  quem pode faturar (Caixa, Gestor, Gerente geral, Dono), com as mesmas
  exigências de dados, registrado no Histórico do Empório. Não mexe em
  estoque, caixa nem financeiro. O romaneio reimpresso sai com o novo.
- **Ao marcar entrega, os obrigatórios sobem** (tabela da Frente 1). Sem eles,
  o orçamento não salva e a venda não fecha como entrega. O "Consumidor
  final" é recusado no pedido para entrega.
- **O endereço de entrega:** as opções são o endereço principal do cadastro,
  o endereço de entrega do cadastro (se houver) ou outro endereço. **"Outro
  endereço" vale só para aquele pedido:** é guardado no orçamento e na venda,
  e não muda o cadastro do cliente. Decisão minha: o endereço escolhido é
  **copiado** para o pedido no momento da escolha, para o romaneio reimpresso
  depois mostrar o endereço daquele dia, mesmo que o cadastro mude.
- **REVISA a entrega 4 (Q176 a Q187):** hoje o orçamento exige "cliente com
  nome, documento e telefone" (`QUOTE_CUSTOMER_REQUIRED` em
  `emporio-orcamentos.ts`). Passa a exigir só o cliente com os obrigatórios
  da Frente 1, e os de entrega quando marcado. **Decisão do usuário (06/11):
  o orçamento passa a aceitar o "Consumidor final", exceto no pedido para
  entrega**, porque o orçamento é o caminho normal do balcão até o caixa.

### O romaneio

**Sai em toda venda**, com ou sem entrega: é a lista do que separar e
conferir. Oferecido logo depois de fechar a venda, junto com o cupom, e
reimprimível pela tela da venda (`/emporio/vendas/[id]`).

**Conteúdo (decisões minhas, para conferir):**

- Cabeçalho da loja (o mesmo do cupom, das configurações da loja).
- "ROMANEIO", número da venda e, se veio de orçamento, o número dele; data e
  hora; vendedor e caixa.
- **Retirada** ou **Entrega**, bem visível.
- Cliente: nome, telefone e documento. Na entrega, o endereço completo de
  entrega.
- Os produtos: nome, quantidade e unidade (a apresentação vendida), com uma
  caixa de marcar ao lado de cada um para a conferência. **Sem preço.**
- O número de linhas de produto. Decisão minha: sem "volumes", que não existe
  no modelo; nada de campo novo para isso.
- Observações do pedido.
- Linhas para assinar: **separado por**, **conferido por**, **recebido por**
  (nome, documento e assinatura de quem recebe), e data.

**Formato:** os mesmos da venda, `?formato=a4` e `?formato=cupom` (bobina),
como em `src/app/(impressao)/emporio/imprimir/venda/[id]/page.tsx`, numa rota
irmã (`/emporio/imprimir/romaneio/[id]`). Respeita o tamanho da bobina
configurado na loja (58 ou 80 mm).

**Venda cancelada ou trocada:** o romaneio reimpresso mostra a situação em
destaque (como o papel da venda já faz com cancelada), para ninguém separar
mercadoria de venda desfeita.

### Fora da Frente 3

- Acompanhar a entrega no sistema (status, entregue, quem recebeu). Futuro.
- Frete cobrado na entrega e data agendada. Não foram pedidos; ficam fora.

---

## Como entregar

- **Três planos, um por frente, na ordem**: 1, depois 2, depois 3. Cada plano
  com a ordem do CLAUDE.md (action, rota, tela), uma branch por plano, e
  merge na `main` só com autorização do usuário a cada vez.
- A Frente 1 muda o banco: migração no Docker, testes, cópia da produção no
  Docker, e só então o Neon (URL Direct), com autorização.
- Suítes novas com o próximo número livre de `test:mNN`. Cobrir no mínimo:
  - Frente 1: cliente do Empório fora de Contatos e do `findOrCreateContact`
    (e o contrário); obrigatórios por tipo (PF só nome e telefone; PJ com CNPJ
    e endereço); documento repetido entre clientes; arquivar recusado ao
    Vendedor e aceito ao Gestor; "Consumidor final" recusado no fiado, no
    cheque e na entrega; histórico de compras do cliente com venda cancelada e
    trocada; fornecedor propriedade e fornecedor de fora na compra; a
    migração (rodada na cópia e conferida); o fiado e a conta a pagar
    mostrando o nome depois da migração; isolamento entre contas.
  - Frente 2: busca por nome sem acento, por pedaço do CPF, pelos 4 primeiros
    e pelos 4 últimos dígitos do telefone sem DDD; menos de 3 dígitos não
    busca por número; resultado limitado; cliente de outra conta nunca
    aparece.
  - Frente 3: marcar entrega sem os dados recusa; "outro endereço" não muda o
    cadastro; o orçamento marcado passa a marca e o endereço para a venda; o
    romaneio sem preço, com o endereço na entrega e sem endereço na retirada;
    romaneio de venda cancelada com o aviso.
- Validação viva em roteiros de `scripts/navegador/`, nos dois sentidos, para
  cada frente: cadastrar cliente PF só com nome e telefone e vender; achar o
  cliente pelos 4 últimos do telefone; orçar para entrega com outro
  endereço, faturar no caixa e imprimir cupom e romaneio em A4 e na bobina.
  Ver no celular.
- O manual do Empório (`/manual`) ganha as partes de Clientes, Fornecedores e
  romaneio, e as que falam do cliente são revistas.

## O que fica com o builder

- Os nomes dos models, colunas e rotas.
- Como o fiado, o cheque e as contas a pagar continuam mostrando o nome (a
  ponte com o financeiro).
- O desenho exato da janela de escolha e do papel do romaneio, dentro do kit
  e do padrão dos papéis que já existem (`src/components/emporio/impresso/`).
- Se o "Cliente novo" e o "Completar cadastro" usam o mesmo formulário.
