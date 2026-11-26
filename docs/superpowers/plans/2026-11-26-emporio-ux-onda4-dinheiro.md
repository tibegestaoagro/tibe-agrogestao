# Onda 4 da UX do Empório: Dinheiro em menos telas, e as listas longas

> **Para agentes:** execute com a skill `orquestrar-ondas` (subagentes por time, a sessão principal commita) ou `superpowers:subagent-driven-development`. Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:**
- juntar Despesas com A pagar, Posição de caixa com o Caixa e Cobrança com A receber, que ganha abas;
- dar ao Fiado uma lista só, com busca;
- paginar Produtos e Estoque, com o Estoque abrindo em "Precisa repor";
- pôr um padrão só de filtro nas listas;
- redirecionar os endereços que somem.

**Arquitetura:**
- Quase tudo é tela. A única mudança de servidor é aditiva: o fiado por cliente ganha `document` e `oldest_sale_at`, para a busca por CPF e para a coluna "Venda mais antiga" virem da mesma fonte nas duas portas. Nenhuma migração e nenhuma rota nova.
- As regras pequenas vão para um arquivo puro testado pela suíte `m133`: aba vinda da URL, endereço novo de um endereço antigo, busca do fiado, fatia de página e grupo de comissões.
- O endereço antigo vira uma página que só redireciona. A permissão é conferida no destino.

**Stack:** Next.js 16 (App Router), React 19, componentes do Empório, roteiros Python em `scripts/navegador/`.

**Spec:** [2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md), §5.8 (Q394), §5.9 (Q395), §5.11 (Q397), §6 ("O menu entre as ondas"), §8.

## Restrições globais

- Invariantes do `CLAUDE.md`: tenant escopado (1), sem travessão (4), sem heredoc com escape (5), regra de negócio só em `src/lib/actions/` (6), merge e push na `main` só com autorização na conversa (7), suíte verde não é validação (8).
- Ordem de entrega: action, depois tela (T1 antes de T4).
- "Cada junção mantém a permissão de cada parte: quem não via a gerência continua sem ver" (§5.8). Nenhuma action muda de permissão.
- O Caixa continua vendo só a gaveta da loja dele e abrindo e fechando o turno (§5.8).
- "Nenhum link salvo, do manual ou do e-mail, caia em página vazia" (§5.11). `/emporio/caixa` continua sendo o Caixa.
- Kit e tokens (`components/ui/`, `globals.css`) não mudam. Nada em `prisma/`.
- O manual NÃO muda nesta onda (onda 7). O que ficar defasado nele vai para a lista da onda 7, no handoff.
- Nada se escreve na conta Da Mata.
- `npm run check` limpo. Campo do `ORDEM` continua num `<Field error=...>` (conferência 15).

## Decisões de quem constrói (o desenho deixa abertas)

Estas são minhas, como planejador. Vão ao usuário junto com o plano.

1. **Os endereços que ficam:**
   - `/emporio/financeiro` (Hoje), `/emporio/financeiro/pagar`, `/emporio/financeiro/receber` e `/emporio/caixa` ficam;
   - somem `/emporio/despesas`, `/emporio/financeiro/cobranca` e `/emporio/financeiro/caixa`.

   Assim, o menu, o Início e os e-mails já apontam para o lugar certo, e só três endereços precisam redirecionar.
2. **As abas vivem na URL** (`?aba=`), para o link ser compartilhável e o voltar do navegador funcionar:
   - A pagar: `contas` (padrão), `fixas` e `vendeu_pagou`;
   - A receber: `fiado` (padrão), `cheques`, `boletos`, `cartoes` e `vencidos`;
   - Estoque: `repor` (padrão) e `tudo`.
3. **Quem abre A pagar:** o Gestor da loja ou quem cuida do Dinheiro, que são as permissões que as actions de despesa já pedem.
   - O Gestor da loja sem Dinheiro passa a ver "A pagar" no grupo Dinheiro do menu, no lugar de "Despesas".
   - Hoje, A receber e Aprovações continuam só para o Dinheiro.
4. **A faixa e o período de A pagar valem para a aba Contas.** As abas Despesas fixas e Vendeu, Pagou são cadastros e não têm período. O botão "Nova conta avulsa" (o da tela Despesas) vai para a aba Contas.
5. **Comissões agrupadas:**
   - contas do "Vendeu, Pagou" com o mesmo nome de regra, a mesma loja e o mesmo vencimento, quando forem duas ou mais, viram uma linha: "Comissão Ana · 12 contas · R$ 84,00";
   - clicar abre as contas, cada uma com o pagar de hoje;
   - a conta sozinha não agrupa;
   - frete, compra, despesa fixa e avulsa nunca agrupam.
6. **A receber com abas:**
   - a faixa (Vencido, Vence hoje, A vencer, Recebido) e o período ficam no topo;
   - o recorte da faixa (`?ver=`) filtra a aba aberta, e o título de cada aba mostra o total do que ela lista naquele recorte, por exemplo "Cheques R$ 1.200,00";
   - "Recebido" troca as abas pela lista dos recebidos, como já faz hoje;
   - a aba Vencidos é a antiga Cobrança (faixa de dias e WhatsApp pronto) e não usa o recorte;
   - o link "Ver os cheques" do Hoje (`?cheques=a_completar`) abre direto na aba Cheques.
7. **Posição de caixa dentro do Caixa:**
   - para quem cuida do Dinheiro, o Caixa ganha no topo a seção "Saldo de cada lugar" (a tabela de hoje, com o total e o filtro de loja), e o extrato abre embaixo dela com `?lugar=`;
   - quem não tem Dinheiro não vê a seção, porque a action dela pede Dinheiro;
   - o resto do Caixa não muda.
8. **A barra de abas do Financeiro sai** de todas as telas, como o desenho manda na onda 4.
   - Os Relatórios do Financeiro (`/emporio/financeiro/relatorios`) ficariam sem caminho até a onda 5. Por isso o grupo Estatísticas ganha, até lá, o item "Relatórios do dinheiro".
   - O título de cada tela ganha o caminho "Dinheiro".
9. **Uma lista de Fiado, duas portas:**
   - o componente `FiadoPorCliente` mostra Cliente (com telefone), Deve (com o selo de vencido), Venda mais antiga, Vencimento, Vendas (os links) e Receber;
   - a busca filtra enquanto se digita: pelo nome, sem acento e sem diferença de maiúscula, ou, com 3 dígitos ou mais, pelos dígitos do CPF ou CNPJ ou do telefone, com ou sem máscara;
   - a permissão de receber e o "só PIX" do Financeiro continuam os de cada porta.
10. **A paginação de Produtos e Estoque é feita na página:** a action já devolve a lista filtrada, e a página corta.
    - O tamanho padrão é 20, com a escolha de 20, 40, 80 ou 100, como em Vendas.
    - Página além do fim cai na última, e trocar um filtro volta à página 1.
    - A action e a rota não mudam.
11. **O padrão de filtro:**
    - componente `BarraDeFiltros`, com a busca à esquerda, os filtros no meio e, numa linha menor embaixo, a ordenação e os itens por página;
    - vale para Vendas, Orçamentos, Clientes, Fornecedores, Franqueados, Compras, Transferências, Produtos e Estoque;
    - nenhum rótulo muda, só o arranjo, para os roteiros continuarem achando os campos.

## Foco da revisão

1. **O Gestor da loja sem Dinheiro:**
   - abre A pagar nas três abas e paga pela gaveta;
   - não vê "Saldo de cada lugar" no Caixa;
   - não vê A receber no menu;
   - `/emporio/financeiro/cobranca` o leva a A receber, que o devolve ao Início, como já faz hoje.

   E o Financeiro sem loja paga só pela conta.
2. **Link antigo com parâmetros:**
   - `/emporio/financeiro/caixa?conta=X&de=2026-11-01&ate=2026-11-20&carimbo=sem` abre o extrato daquela conta, naquele período e com o filtro;
   - `/emporio/financeiro/cobranca?loja=L&faixa=60` abre a aba Vencidos com a loja e a faixa;
   - `/emporio/despesas` abre a aba Despesas fixas.
3. **Recorte e aba juntos:** em A receber, `?ver=vencido&aba=cheques` lista só os cheques vencidos, e o total no título da aba bate com a soma da lista.
4. **Busca do Fiado:**
   - "joao" acha "João";
   - "123.456" acha o CPF 123.456.789-00;
   - "9988" acha o telefone (38) 99988-1122;
   - "12" sozinho não filtra por dígito.
5. **Grupo de comissões:** pagar uma conta dentro do grupo atualiza o total e a contagem do grupo. Quando sobra uma conta, ela volta a ser linha comum.
6. **Página além do fim:** `/emporio/produtos?pagina=999` mostra a última página, e não uma lista vazia.

---

### T1: o fiado por cliente com documento e venda mais antiga; os links das actions

**Time:** `servidor-acao`. **Depende de:** nada.

**Arquivos:**
- `src/lib/actions/emporio-caixa.ts` (`FiadoClienteView`, `listarFiadoAction` e o montador que `listarContasAReceberAction` também usa; se o montador estiver em `emporio-financeiro.ts`, esse arquivo entra);
- `src/lib/actions/emporio-inicio.ts`, `src/lib/actions/emporio-meu-dia.ts`, `src/lib/actions/emporio-primeiros-passos.ts` e `src/lib/emporio/historico.ts` (só os `href`);
- a suíte que já cobre `listarFiadoAction` (ache com `grep -l listarFiadoAction scripts/*.test.ts`);
- `scripts/m85-emporio-f5.test.ts` e `scripts/m131-emporio-inicio.test.ts`, se esperarem os endereços antigos.

**Interfaces que produz:**
- `FiadoClienteView` ganha `document: string | null` (o CPF ou CNPJ do contato, como gravado) e `oldest_sale_at: string | null` (ISO do `sold_at` mais antigo entre as vendas com valor em aberto do cliente; `null` sem venda ligada).
- As rotas `/api/v1/emporio/receivables` e `/api/v1/emporio/finance/receivables` passam a devolver os dois campos sem mudar nada nelas (extensão aditiva: anotar no comentário do tipo).

**Os `href` novos:**
- conta sem conferir com o banco: `/emporio/caixa?lugar=conta:<id>&carimbo=sem`;
- posição de caixa: `/emporio/caixa`;
- despesa fixa (Meu Dia e Primeiros passos): `/emporio/financeiro/pagar?aba=fixas`;
- histórico de conta: `/emporio/caixa?lugar=conta:<id>`.

- [ ] **Passo 1:** casos novos na suíte do fiado:
  - o cliente com CPF devolve o `document`;
  - o cliente sem documento devolve `null`;
  - com duas vendas em aberto, de 03/11 e 10/11, `oldest_sale_at` começa com `2026-11-03`;
  - venda já quitada não conta para `oldest_sale_at`.

  Rodar e ver falhar.
- [ ] **Passo 2:** implementar. Rodar a suíte, `m85`, `m131`, `tsc` e `test:docs-api`.
- [ ] **Passo 3:** a sessão principal faz o commit.

### T2: as regras puras, o menu e a suíte `m133`

**Time:** `prova-suite` escreve a suíte a partir desta tarefa, antes do código; depois, `tela-pagina` implementa. **Depende de:** nada (corre junto com a T1).

**Arquivos:**
- `src/lib/emporio/dinheiro-telas.ts` (novo, sem React e sem import de servidor; tipos de action só por `import type`);
- `src/lib/emporio/menu.ts` e `src/lib/emporio/paginas.ts`;
- `scripts/m133-emporio-dinheiro.test.ts` (novo) e `package.json` (`test:m133`);
- `scripts/m130-emporio-menu-agrupado.test.ts`, `scripts/m98-emporio-financeiro-casa.test.ts` e `scripts/nav-build.test.ts` (só onde esperam `/emporio/despesas`).

**Interfaces que produz:**
- `type AbaDoPagar = "contas" | "fixas" | "vendeu_pagou"` e `abaDoPagar(aba?: string): AbaDoPagar`. Valor inválido dá `"contas"`.
- `type AbaDoReceber = "fiado" | "cheques" | "boletos" | "cartoes" | "vencidos"` e `abaDoReceber(aba?: string, cheques?: string): AbaDoReceber`. `cheques === "a_completar"` dá `"cheques"`, e vale mais que `aba`. Valor inválido dá `"fiado"`.
- `type AbaDoEstoque = "repor" | "tudo"` e `abaDoEstoque(aba?: string): AbaDoEstoque`. Valor inválido dá `"repor"`.
- `fatiarPagina<T>(itens: T[], pagina: number, porPagina: number): { linhas: T[]; pagina: number; total: number }`. A página fica entre 1 e a última, e a lista vazia dá a página 1.
- `clienteBateComABusca(c: { customer_name: string; phone: string | null; document: string | null }, termo: string): boolean`. É a decisão 9: termo vazio aceita todos; sem acento e sem caixa no nome; só os dígitos do termo, quando forem 3 ou mais, contra os dígitos do telefone e do documento.
- `type EnderecoAntigo = "/emporio/despesas" | "/emporio/financeiro/cobranca" | "/emporio/financeiro/caixa"` e `enderecoDaTelaNova(antigo: EnderecoAntigo, params: Record<string, string | string[] | undefined>): string`:
  - despesas: `/emporio/financeiro/pagar?aba=fixas`;
  - cobrança: `/emporio/financeiro/receber?aba=vencidos`, levando `loja` e `faixa`;
  - caixa: `/emporio/caixa`, levando `loja`, `lugar`, `de`, `ate` e `carimbo`, com `conta=<id>` virando `lugar=conta:<id>`;
  - parâmetro desconhecido não passa;
  - valor em lista usa o primeiro.
- `type LinhaDoPagar = { tipo: "conta"; conta: ContaAPagarView } | { tipo: "grupo"; chave: string; nome: string; loja: string | null; due_date: string | null; contas: ContaAPagarView[]; total: number }` e `agruparContas(contas: ContaAPagarView[]): LinhaDoPagar[]`:
  - é a decisão 5;
  - o grupo fica na posição da primeira conta dele;
  - o `total` é a soma de `open_amount` em centavos, sem erro de ponto flutuante.
- No `paginas.ts`, a entrada de `/emporio/despesas` vira `{ href: "/emporio/financeiro/pagar", rotulo: "A pagar", exige: ["gestor_da_loja", "dinheiro"] }`.
- No `menu.ts`:
  - `abre()` usa a entrada exata quando ela existe e, só sem ela, cai em `/emporio/financeiro` para as subtelas;
  - o grupo Dinheiro fica Hoje · Caixa · A receber · A pagar · Aprovações;
  - o grupo Estatísticas ganha no fim `{ href: "/emporio/financeiro/relatorios", rotulo: "Relatórios do dinheiro" }`, com um comentário de que sai na onda 5.

- [ ] **Passo 1:** a suíte `m133`, com estes casos e estes valores:
  - `abaDoReceber("cartoes")`, `abaDoReceber("x")`, `abaDoReceber("boletos", "a_completar")`;
  - `fatiarPagina` de 45 itens com a página 3 e 20 por página dá 5 linhas e a página 3; com a página 999, a página 3; com uma lista vazia, a página 1;
  - os quatro exemplos de busca do foco da revisão (item 4), mais `document: null`;
  - os três exemplos de link antigo do foco da revisão (item 2), mais `?x=1` sumindo;
  - `agruparContas`:
    - 3 comissões "Comissão Ana" da mesma loja e vencimento, com 1 frete no meio: dá um grupo de 3 com total 0,30 (de 0,10 cada) e o frete;
    - 1 comissão sozinha não agrupa;
    - a mesma regra em lojas diferentes não agrupa;
  - o menu:
    - o Gestor da loja sem Dinheiro vê A pagar e não vê Despesas, Hoje nem A receber;
    - o Financeiro vê Dinheiro com 5 itens e "Relatórios do dinheiro";
    - o Caixa não muda.

  Rodar e ver falhar.
- [ ] **Passo 2:** implementar. Rodar `m133`, `m130`, `m98`, `test:nav` e `tsc`.
- [ ] **Passo 3:** a sessão principal faz o commit.

### T3: A pagar com abas, e Despesas redirecionando

**Time:** `tela-pagina`. **Depende de:** T2.

**Arquivos:**
- `src/app/(dashboard)/emporio/financeiro/pagar/page.tsx`;
- `src/app/(dashboard)/emporio/despesas/page.tsx` (passa a só redirecionar);
- os novos `_components/despesas-fixas-secao.tsx` e `_components/vendeu-pagou-secao.tsx` (o conteúdo das duas seções de hoje, movido sem mudar texto);
- `_components/contas-a-pagar.tsx` (os grupos);
- o novo `_components/abas-da-tela.tsx`.

**Interfaces que produz:**
- `AbasDaTela({ rotulo, abas, atual }: { rotulo: string; abas: { valor: string; rotulo: string; href: string }[]; atual: string })`;
- um `<nav aria-label={rotulo}>` com links e `aria-current="page"` na aba atual, no mesmo estilo da barra do Financeiro de hoje.

A T4 também usa o `AbasDaTela`.

- [ ] **Passo 1:** a página:
  - abre com `veAPagina(papel, "/emporio/financeiro/pagar")`;
  - lê `abaDoPagar`;
  - tira a `FinanceiroAbas`;
  - mostra as abas Contas · Despesas fixas · Vendeu, Pagou;
  - a aba Contas tem a faixa, o período, "Nova conta avulsa" e a lista agrupada por `agruparContas`;
  - as outras abas têm as seções movidas.
- [ ] **Passo 2:** `despesas/page.tsx` vira `redirect(enderecoDaTelaNova("/emporio/despesas", await searchParams))`.
- [ ] **Passo 3:** `tsc`, `lint`, `npm run check`. Abrir no `next dev` como dono e como gestor da loja: as três abas, pagar uma conta de dentro de um grupo e a nova conta avulsa.
- [ ] **Passo 4:** a sessão principal faz o commit.

### T4: A receber com abas, Cobrança dentro, e o Fiado com busca nas duas portas

**Time:** `tela-pagina`. **Depende de:** T1 e T2.

**Arquivos:**
- `src/app/(dashboard)/emporio/financeiro/receber/page.tsx`;
- `src/app/(dashboard)/emporio/financeiro/cobranca/page.tsx` (passa a só redirecionar);
- `_components/financeiro-receber.tsx`;
- `_components/financeiro-cobranca.tsx` (o `router.push` vai para `/emporio/financeiro/receber?aba=vencidos&...`);
- o novo `_components/fiado-por-cliente.tsx` (componente cliente);
- `src/app/(dashboard)/emporio/fiado/page.tsx`.

Esta tarefa usa o `AbasDaTela` da T3, que já está commitado quando ela começa (ver as ondas de despacho).

**Interfaces que produz:**
- `FiadoPorCliente({ clientes, ver, hoje, padraoId, lojas, caixas, usuarioId, soPix, podeReceber, podeMudarData })`;
- `clientes: FiadoClienteView[]`;
- `ver: "vencido" | "hoje" | "a_vencer" | null` (o recorte de hoje do A receber; o Fiado passa `null`).

- [ ] **Passo 1:** o `FiadoPorCliente`:
  - nasce do bloco "Fiado por cliente" de `financeiro-receber.tsx`, mais as colunas Venda mais antiga (`oldest_sale_at`) e Vendas;
  - a busca fica acima da tabela, com o rótulo "Buscar cliente" e o texto de ajuda "Nome, CPF ou telefone";
  - o total em aberto é recalculado sobre o que está filtrado;
  - a busca sem resultado diz "Nenhum cliente com essa busca.".
- [ ] **Passo 2:** a página do Fiado usa o componente e larga a consulta própria das vendas (agora vem `oldest_sale_at`). A página de A receber:
  - lê `abaDoReceber`;
  - mostra as abas com o total no título (decisão 6);
  - mostra uma seção por aba;
  - na aba Vencidos, chama `listarCobrancaAction` e mostra o `FinanceiroCobranca` com o `FaixaFiltro`;
  - tira a `FinanceiroAbas`.
- [ ] **Passo 3:** `cobranca/page.tsx` vira o redirect por `enderecoDaTelaNova`.
- [ ] **Passo 4:** `tsc`, `lint`, `npm run check`. Abrir como dono, como Financeiro (só PIX) e como Caixa (o Fiado).
- [ ] **Passo 5:** a sessão principal faz o commit.

### T5: Posição de caixa dentro do Caixa

**Time:** `tela-pagina`. **Depende de:** T2.

**Arquivos:**
- `src/app/(dashboard)/emporio/caixa/page.tsx`;
- `src/app/(dashboard)/emporio/financeiro/caixa/page.tsx` (passa a só redirecionar);
- o novo `_components/caixa-posicoes.tsx` (componente server);
- `_components/financeiro-extrato.tsx` (`caminho` passa a `/emporio/caixa`).

**Interfaces que produz:**
- `CaixaPosicoes({ db, user, papel, q }: { ...; q: { loja?: string; lugar?: string; de?: string; ate?: string; carimbo?: string } })`;
- carrega o conteúdo da página `financeiro/caixa` de hoje: lojas, resumo, lugar, período, extrato e carimbo.

- [ ] **Passo 1:**
  - `caixa/page.tsx` aceita `loja`, `lugar`, `de`, `ate` e `carimbo` nos `searchParams`;
  - quando `pode(papel, "dinheiro")`, mostra `<CaixaPosicoes>` logo abaixo do cabeçalho, com o título "Saldo de cada lugar";
  - os links da tabela e do período preservam os parâmetros de página do Caixa (`pagina_ent`, `pagina_mov`, `ordem_mov`, `por_pagina_mov`).
- [ ] **Passo 2:** `financeiro/caixa/page.tsx` vira o redirect por `enderecoDaTelaNova`.
- [ ] **Passo 3:** `tsc`, `lint`, `npm run check`. Abrir como Financeiro (vê a seção e o extrato de uma conta, com "Conferir com o banco"), como gestor da loja e como Caixa (não veem a seção).
- [ ] **Passo 4:** a sessão principal faz o commit.

### T6: a barra de abas do Financeiro sai

**Time:** `tela-pagina`. **Depende de:** T3, T4 e T5.

**Arquivos:**
- `_components/financeiro-abas.tsx` (sai o `FinanceiroAbas`; o `enderecoDaAba` fica, se ainda tiver uso; senão, o arquivo sai);
- `src/app/(dashboard)/emporio/financeiro/page.tsx`, `financeiro/aprovacoes/page.tsx`, `financeiro/projecao/page.tsx` e `financeiro/relatorios/page.tsx`;
- `_components/financeiro-hoje.tsx` (os links para posição e cobrança vão aos endereços novos).

- [ ] **Passo 1:** tirar a barra. Cada uma dessas telas fica com `caminho={[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]}` no cabeçalho, menos a Hoje, que é a própria raiz.
- [ ] **Passo 2:** `grep -rn "FinanceiroAbas\|/emporio/financeiro/caixa\|/emporio/financeiro/cobranca\|/emporio/despesas" src`. Fora do manual e das três páginas de redirect, não sobra nada.
- [ ] **Passo 3:** `tsc`, `lint`, `npm run check`, e a sessão principal faz o commit.

### T7: as listas longas e o padrão de filtro

**Time:** `tela-pagina`. **Depende de:** T2.

**Arquivos:**
- o novo `_components/barra-de-filtros.tsx`;
- `produtos/page.tsx` e `estoque/page.tsx`;
- as páginas e os filtros de `vendas` (`vendas-filtro.tsx`), `orcamentos`, `clientes`, `fornecedores`, `franqueados`, `compras` (`compras-filtro.tsx`) e `transferencias` (`transferencias-filtro.tsx`), cada um com o `*-filtro.tsx` que a página importa.

**Interfaces que produz:**
- `BarraDeFiltros({ busca, filtros, ajustes }: { busca?: ReactNode; filtros?: ReactNode; ajustes?: ReactNode })`;
- primeira linha: a busca, com `flex-1`, e os filtros, que quebram linha no celular;
- segunda linha, com `text-sm` e alinhada à direita: os `ajustes` (ordenação e itens por página).

- [ ] **Passo 1:** Produtos:
  - `pagina` e `por_pagina` na URL;
  - `fatiarPagina`;
  - `Paginacao` embaixo e `PaginacaoDaUrl` nos ajustes;
  - os links de arquivados, busca e espécie largam a `pagina`.
- [ ] **Passo 2:** Estoque:
  - `abaDoEstoque`, com as abas Precisa repor (padrão) · Tudo, pelo `AbasDaTela`;
  - cada aba paginada;
  - o filtro de loja de hoje continua.

  Nesta onda o Estoque usa o `AbasDaTela` da T3 e por isso vai na onda de despacho depois dela.
- [ ] **Passo 3:** as outras sete listas passam para a `BarraDeFiltros`, sem mudar rótulo, nome de parâmetro nem comportamento.
- [ ] **Passo 4:** `tsc`, `lint`, `npm run check`. Rodar `emporio-paginacao-listas` e `emporio-caixa-vendas` sem mudar o roteiro.
- [ ] **Passo 5:** a sessão principal faz o commit.

### T8: a prova viva e o fim da onda

**Time:** `prova-viva`. **Depende de:** T6 e T7.

**Arquivos:**
- `scripts/_cenario-emporio-ux-onda4.ts` (novo; prefixo `U4 `);
- `scripts/navegador/emporio-ux-onda4.py` (novo);
- os roteiros que a varredura apontar.

- [ ] **Passo 1: o cenário.**
  - Pessoas: um Gestor da loja sem Dinheiro, um Financeiro e o Dono.
  - Contas: 3 comissões "U4 Comissão Ana" com o mesmo vencimento e uma conta de frete.
  - Clientes no fiado:
    - "U4 João" com CPF 123.456.789-00, telefone (38) 99988-1122 e vendas de 03/11 e 10/11;
    - mais 2 clientes no fiado, um vencido.
  - Também: um cheque e um boleto em aberto, e 45 produtos `U4 Produto NN` com estoque, 5 deles abaixo do mínimo.
- [ ] **Passo 2: o roteiro `emporio-ux-onda4`:**
  - **Gestor da loja:** o menu tem A pagar e não tem Despesas nem A receber. As três abas abrem, e o grupo das comissões mostra "3 contas" e abre. Pagar uma conta do grupo deixa "2 contas". O Caixa não mostra "Saldo de cada lugar".
  - **Financeiro em A receber:**
    - as abas aparecem com o total;
    - `?ver=vencido` mais a aba Cheques lista só os vencidos;
    - a aba Vencidos mostra o João com o WhatsApp.
  - **Financeiro no Caixa:** vê "Saldo de cada lugar", e o extrato de uma conta abre.
  - **Fiado (Vendas › Fiado e a aba Fiado):** "joao", "123.456" e "9988" acham o João; "zzz" mostra "Nenhum cliente com essa busca.".
  - **Endereços antigos:** os três links do foco da revisão (item 2) caem na aba e no filtro certos.
  - **Produtos:** 20 por página, e `?pagina=999` mostra a última.
  - **Estoque:** abre em Precisa repor com os 5.
  - **Celular:** 390 px sem rolagem lateral em A pagar, A receber e Produtos.
- [ ] **Passo 3:** provar nos dois sentidos. Desfazer (a) a permissão de A pagar para o gestor, (b) o `conta=` virando `lugar=` no redirect e (c) a busca por dígitos. Ver o roteiro falhar em cada um, refazer e ver passar.
- [ ] **Passo 4:** fotos de A pagar, A receber, Caixa do Financeiro, Fiado com busca e Estoque, no computador e no celular, fora do git, para o usuário.
- [ ] **Passo 5:** a rotina de fim de onda (`orquestrar-ondas`, seção 3):
  - `npm run textos-defasados`;
  - corrigir os roteiros e as suítes, com a regra "texto mudado de propósito pelos §5.8 e §5.9, senão o defeito é da tela";
  - rodar todos os `emporio-*` com o cenário limpo, em blocos de primeiro plano.

  Pontos já esperados: `emporio-financeiro-casa` (a barra de abas), quem abre `/emporio/despesas` ou a Cobrança direto e quem conta as seções de A receber. O defasado do manual vai para a lista da onda 7.
- [ ] **Passo 6:** juiz (`prova-juiz`) sobre o range da onda, as correções dele e `test:all`.

Para os roteiros, o servidor sobe com `NODE_OPTIONS="--max-old-space-size=4096" npx next dev --disable-source-maps`, e a passada longa vai em blocos de primeiro plano, religando o servidor a cada uns 15 roteiros.

## Ondas de despacho

| onda | tarefas | por quê |
|---|---|---|
| 1 | T1 e T2 | arquivos disjuntos, nenhuma depende da outra |
| 2 | T3 e T5 | dependem só da T2, arquivos disjuntos; a T3 cria o `abas-da-tela.tsx` |
| 3 | T4 e T7 | usam o `AbasDaTela` da T3 (a T4 também usa a T1), arquivos disjuntos |
| 4 | T6 | tira a barra das telas que a T3, a T4 e a T5 já soltaram |
| 5 | T8 | prova o que as anteriores entregaram |
