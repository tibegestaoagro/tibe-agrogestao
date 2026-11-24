# Briefing: UX e UI do Meu Empório (ponto de partida da sessão nova)

Data: 2026-11-24. Branch: `ux-emporio`. Ainda não é spec: é o pedido do
usuário e o que já se sabe, para a sessão nova entrevistar, diagnosticar e só
então propor.

## O pedido, nas palavras do usuário (resumo fiel)

- A Agromax e a Central do Milho estão alinhando mudanças novas. O usuário quer
  aproveitar para trabalhar a UX e a UI do painel, **só do Empório**. O resto
  do Tibé não muda.
- Algumas partes estão confusas. Ele não vê muito "AI slop" visual: o problema
  é **usabilidade**, e **sub-módulos que poderiam se agrupar** para facilitar o
  uso do dia a dia.
- **Pensar no Empório como um sistema desconectado do Tibé.** Em breve ele vai
  sair como produto próprio, e o Tibé fica só com uma versão básica, para o
  produtor que quiser vender algo da sua produção.
- Ele quer ser **entrevistado** e passar sugestões de mudança.
- Usar o browser-harness para ver as telas, com as skills de web design e
  conceitos de design.

## Como conduzir (ordem proposta)

1. **Entrevista primeiro, uma pergunta por vez** (`AskUserQuestion`, skills
   `superpowers:brainstorming` ou `grilling`). Pontos a cobrir, no mínimo:
   - quem usa o Empório no dia (caixa, vendedor, gestor da loja, financeiro,
     dono da conta) e o que cada um faz na primeira hora do dia;
   - quais telas ele acha confusas, e por quê, com exemplo real;
   - as mudanças que a Agromax e a Central do Milho estão alinhando agora;
   - o que é "Empório sozinho": marca, menu, entrada, o que sai do Tibé.
2. **Ver as telas** no `next dev` local, no Chrome de testes
   (`npm run navegador`), nunca no Chrome do usuário. Fotografar cada tela por
   papel (gestor e vendedor de caixa, no mínimo). O cenário
   `scripts/_cenario-manual-emporio.ts` limpa a conta do seed e monta a
   demonstração; o roteiro `manual-emporio` já passa por quase todas as telas.
3. **Diagnóstico** com as skills `impeccable` (critique, audit, distill),
   `ui-ux-pro-max` e `web-design-guidelines`: arquitetura de informação,
   agrupamento do menu, fluxos do dia, carga cognitiva, estados vazios.
4. **Proposta** de agrupamento e de mudanças, mostrada ao usuário (página do
   Artifact ou mockup) e aprovada antes de qualquer código. Depois, spec e
   plano em `docs/superpowers/`, como nas frentes anteriores.

## O que já se sabe (fatos, não conclusões)

- O menu lateral vem de `src/lib/emporio/paginas.ts` (`PAGINAS_DO_EMPORIO`):
  **21 itens soltos**, sem grupo, na ordem Início, Vender, Vendas, Orçamentos,
  Fiado, Clientes, Caixa, Financeiro, Produtos, Estoque, Compras, Fornecedores,
  Franqueados, Transferências, Despesas, Resultado, Relatórios, Equipe, Lojas,
  Histórico, Configurações. Cada item tem a permissão que exige (`exige`), e o
  menu e os cartões do Início leem a mesma lista.
- O Financeiro tem mais **7 telas** dentro dele: Aprovações, Caixa, Cobrança,
  Pagar, Projeção, Receber, Relatórios.
- Há nomes repetidos em lugares diferentes: **Caixa** (`/emporio/caixa` e
  `/emporio/financeiro/caixa`) e **Relatórios** (`/emporio/relatorios` e
  `/emporio/financeiro/relatorios`). Conferir na entrevista se isso confunde.
- Telas em `src/app/(dashboard)/emporio/`. Spec do módulo:
  `docs/specs/module-39-meu-emporio.md` (decisões até a Q386). Manual público
  em `/manual`.
- A Agromax usa o Empório em produção na conta Da Mata, todo dia, com duas
  lojas. Mudança de navegação mexe na rotina de gente real: vale combinar a
  transição (por exemplo, o manual e os GIFs precisam acompanhar).

## Entrevista de 24/11 (decisões do usuário)

1. **Estatísticas** no lugar dos dois "Relatórios": junta Relatórios do menu,
   Financeiro > Relatórios, Resultado e Projeção. Para gestor, dono e
   financeiro (o caixa não vê). Abertura por assunto (Vendas, Dinheiro,
   Resultado) com o detalhe a um clique. Dentro dela, uma parte de
   **Relatórios para imprimir**.
2. **Cabeçalho das telas:** sai o "Meu Empório" acima do título. Caminho
   clicável só em tela que fica dentro de outra (`Financeiro > A pagar`). O
   texto de apresentação vira um **(i)**: balão ao passar o mouse; no celular,
   abre no toque e fecha ao tocar fora. Aviso que muda o que a pessoa faz
   continua visível. O (i) pode trazer o link "Ver no manual" para a seção
   certa do `/manual`.
3. **Caixa e balcão:** abrem o caixa e vão direto para Vender. Proposta
   aceita: o caixa entra direto em Vender, e o caixa fechado aparece logo no
   topo da tela, com o botão "Abrir o caixa".
4. **Gestor:** abre o sistema só quando precisa. O Início vira: avisos que
   pedem ação (somem se não houver), números de hoje, atalhos (Estatísticas,
   Produtos, Estoque e afins). Avisos aceitos: produto zerado ou abaixo do
   mínimo; fiado vencido; conta a pagar vencendo ou vencida; aprovação
   pendente; orçamento perto de vencer; caixa de ontem aberto; boleto ou
   cheque vencido sem baixa. Por papel: gestor vê estoque, orçamento e caixa;
   financeiro vê fiado, contas, aprovações, boletos e a conferência com o
   banco; dono vê todos.
5. **"Carimbo" vira "Conferir com o banco"** ("Sem carimbo" vira "A conferir
   com o banco"). Laiza e Cláudia vão usar com constância. Leva um (i) com o
   link para o manual.
6. **Menu pelo que a pessoa vai fazer (opção A):** Início · Vender (em
   destaque) · Vendas (Vendas, Orçamentos, Clientes, Fiado, Franqueados) ·
   Estoque (Produtos, Estoque, Compras, Transferências, Fornecedores) ·
   Dinheiro (Hoje, Caixa, A receber, A pagar, Aprovações) · Estatísticas ·
   Ajustes (Lojas, Equipe, Histórico, Configurações).
7. **Telas repetidas:** Despesas entra em Dinheiro > A pagar (abas Contas,
   Despesas fixas, Vendeu, Pagou). Caixa e Posição de caixa viram Dinheiro >
   Caixa (o caixa segue vendo a gaveta da loja dele). Fiado fica em Vendas,
   para o balcão, e ganha **busca** (o caixa procura pela pessoa); Cobrança
   entra em Dinheiro > A receber, para o financeiro.
8. **Empório separado do Tibé: fica para depois** (opção B). O Empório segue
   como sub-menu do Tibé nesta frente; casca, marca e entrada próprias serão
   planejadas noutra frente.
9. **Grupos do menu abrem e fecham** (terceiro nível, dentro de "Meu
   Empório"): o grupo da tela atual vem aberto e o menu lembra o que a pessoa
   deixou aberto.
10. A Agromax e a Central do Milho ainda estão alinhando mudanças; o usuário
   passa depois. O usuário tem mais telas confusas para mostrar.

## Diagnóstico de 24/11 (fotos de 45 telas, gestor, caixa e dono)

Nota de Nielsen 20/40. Detector do Impeccable: zero achados. Achados
conferidos no código:

1. Vender: formulário único com 14+ campos de peso igual; opcionais sempre
   abertos. Proposta: produto, itens, cliente, pagamento; resto em "Mais
   opções" recolhido.
2. O campo Caixa em Vender só aparece no fechamento (`balcao.tsx`,
   `mostrarCaixa`).
3. O seletor "Todas as propriedades" do Tibé aparece em toda tela do Empório.
4. Produtos e Estoque sem paginação (101 linhas); A pagar com 159 comissões
   miúdas.
5. Sem permissão: umas telas voltam ao Início (`redirect`), Financeiro e
   Histórico dão o 404 do Next em inglês (`notFound`). Cabeçalho copiado à mão
   em 35 telas, filtros de padrões diferentes.
6. A receber empilha 4 tabelas (Fiado, Cheques, Boletos, Cartões).

Decisões do usuário sobre o diagnóstico (24/11):

- Vender: o cliente vem preenchido com "Consumidor final" e o vendedor com
  quem está logado (mudança de regra autorizada pelo usuário).
- O seletor "Todas as propriedades" some dentro do Empório (topo compartilhado,
  mudança mínima); no resto do Tibé fica igual.
- A proposta visual começa por Menu + Início (com o cabeçalho e o (i)).

- **Mockup do Menu + Início aprovado em 24/11** (`menu-inicio.html`, fora do
  git): grupos que abrem e fecham, Vender como botão verde, Início com "Precisa
  de você" (avisos com o papel que vê), quatro números do dia (vendas hoje,
  vendas no mês, entra hoje, sai hoje) e atalhos; menu do caixa com 5 itens;
  tela interna com caminho clicável, (i) e abas. O mockup mostrava "Loja:
  Todas" no lugar do seletor de propriedades (a confirmar: a decisão anterior
  era só esconder).

- **Vender: opção A aprovada em 24/11** (`vender.html`): duas colunas no
  computador (busca e itens à esquerda; cliente, vendedor, pagamento, "Mais
  opções" recolhido, total e Fechar à direita), faixa do caixa no topo (verde
  aberto, laranja fechado com "Abrir o caixa"); celular em uma coluna com total
  e Fechar presos no rodapé.

- **Estatísticas aprovada em 24/11** (`estatisticas.html`): um filtro só
  (atalhos de período e loja); abas Visão geral, Vendas, Dinheiro, Resultado e
  Relatórios para imprimir. Visão geral com três cartões (Vendas, Dinheiro,
  Resultado). Novo: comparação com o mês anterior e folha de impressão e
  planilha para os relatórios de Vendas e Resultado (hoje só os 4 do Dinheiro
  têm).

Fotos e roteiro descartável fora do git (`scripts/navegador/ux-tour-emporio.py`,
não versionado).

## Limites desta frente

- Só o Empório. Nada fora de `src/app/(dashboard)/emporio/`, dos componentes
  do Empório e de `src/lib/emporio/`, salvo o necessário para a navegação dele.
- Regra de negócio não muda nesta frente sem perguntar: é UX e UI.
- Kit e tokens (`components/ui/`, `globals.css`) são compartilhados com o
  Tibé: mudar ali afeta o resto. Se precisar, é conversa com o usuário.
- Nada se escreve na conta Da Mata. Merge, push na `main` e deploy, só com
  autorização na conversa, a cada vez.
