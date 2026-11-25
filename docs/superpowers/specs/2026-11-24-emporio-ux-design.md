# Desenho: UX e UI do Meu Empório (navegação, Início, Vender, Dinheiro, Estatísticas)

Data: 2026-11-24. Branch: `ux-emporio`. Base: o briefing
[2026-11-24-emporio-ux-briefing.md](2026-11-24-emporio-ux-briefing.md), com a
entrevista, o diagnóstico das 45 telas e as aprovações dos mockups. Spec do
módulo: [../../specs/module-39-meu-emporio.md](../../specs/module-39-meu-emporio.md)
(decisões até a Q386). Os números de decisão desta frente começam na **Q387**.

## 1. Intenção e porquê

A Agromax usa o Empório todo dia, em duas lojas. O usuário não vê problema de
aparência: o problema é **usabilidade**. São 21 itens soltos no menu, mais 7
telas escondidas no Financeiro, três pares de telas que mostram a mesma coisa
em dois lugares, nomes repetidos ("Caixa", "Relatórios"), jargão ("carimbo") e
a tela mais usada (Vender) como um formulário comprido em que tudo pesa igual.

O Empório vai sair do Tibé como produto próprio. Esta frente **não** faz a
separação (decisão do usuário: fica para outra frente), mas organiza o Empório
como um sistema que se sustenta sozinho, para a separação depois ser só casca.

Quem usa, e o que cada um precisa (da entrevista):

| papel | rotina | o que precisa da tela |
|---|---|---|
| Caixa e balcão | abre o caixa e vai direto vender; recebe fiado procurando a pessoa pelo nome | Vender curto, estado do caixa visível, Fiado com busca |
| Gestor da loja | abre o sistema só quando precisa de algo | saber na hora o que precisa dele; atalhos |
| Financeiro (Laiza, Cláudia) | contas, recebimentos, conferência com o extrato | o trabalho do dia num lugar; "conferir com o banco" compreensível |
| Dono | acompanha tudo | todos os avisos; números do mês |

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**

- Menu do Empório em grupos, pelo que a pessoa vai fazer.
- Uma tela por assunto: acabar com os três pares repetidos.
- Início que diz o que precisa de quem entra.
- Vender na ordem do balcão.
- Estatísticas: todos os números num lugar, com relatórios para imprimir.
- Um padrão só de cabeçalho, com o texto de apresentação num (i).

**Não objetivos**

- Separar o Empório do Tibé (marca, login, endereço, casca própria).
- Mudar a aparência do Tibé fora do Empório, ou os tokens e primitivos do kit.
- Mudar regra de negócio, salvo o que está escrito aqui como decisão.
- As mudanças que a Agromax e a Central do Milho ainda estão alinhando (entram
  como onda nova quando chegarem).

**Anti-objetivos** (falha mesmo funcionando)

- A Agromax abrir o sistema num dia e não achar uma tela que usava: todo
  endereço antigo leva à tela nova (o manual é refeito na onda 7; até lá, os
  redirecionamentos levam o link antigo à tela nova).
- O caixa perder um caminho que tem hoje (por exemplo, receber fiado no balcão).
- Alguém passar a ver o que não via: cada bloco juntado mantém a permissão que
  tinha.
- Venda com o vendedor errado por preenchimento automático (Q169).

## 3. Restrições

- **Invariantes do `CLAUDE.md`**, em especial: regra de negócio só em
  `src/lib/actions/*` (6), saldo nunca gravado (2), nada de travessão (4),
  merge, push na `main` e deploy só com autorização na conversa, a cada vez
  (7), e teste verde não é validação (8).
- **Escopo de arquivos:** `src/app/(dashboard)/emporio/`, os componentes do
  Empório, `src/lib/emporio/`. Fora disso, só o necessário à navegação: o menu
  lateral (`src/lib/nav.ts`, `src/components/layout/sidebar.tsx`), o topo
  (`src/components/layout/dashboard-shell.tsx`) e a lista do "só da loja"
  (`src/lib/emporio/paginas-do-so-da-loja.ts`).
- **Kit e tokens** (`components/ui/`, `globals.css`) são compartilhados: o
  balão do (i) e as abas nascem como componentes do Empório. Se um deles
  precisar ir ao kit, é conversa com o usuário.
- **Nada se escreve na conta Da Mata** pelo agente.
- O `npm run check` e suas catracas valem para todo arquivo tocado (cor crua,
  `<input type="number">`, recusa engolida, `<Field>` sem `error=`, dinheiro
  fora do formato).

## 4. Abordagens consideradas

| abordagem | troca | escolha |
|---|---|---|
| **A. Ondas, cada uma em produção quando pronta**, com o manual e os GIFs atualizados junto | a Agromax se acostuma aos poucos e um defeito aparece cedo; por algumas semanas convivem partes novas e antigas | **escolhida pelo usuário**, executada com subagentes |
| B. Tudo num deploy só, com o manual novo pronto | um só momento de adaptação; semanas sem retorno e uma entrega grande demais para validar no navegador | descartada |
| C. Chave por conta para ligar a versão nova | exige manter as duas versões vivas; com uma cliente só, não compensa | descartada |

Menu: a organização **pelo que a pessoa vai fazer** (Vendas, Estoque, Dinheiro)
venceu a **por tipo de coisa** (Cadastros, Movimento, Financeiro, como o
GestãoClick), porque esta separa o cadastro do uso e recria o vai e volta que a
frente quer tirar. Grupos **que abrem e fecham** venceram títulos de seção com
tudo à vista (22 itens, rolagem no celular).

## 5. O que foi decidido

### 5.1 Menu (Q387)

Dentro de "Meu Empório", no menu lateral do Tibé (o Empório continua sub-menu):

```
Início
Vender                    (destaque: botão verde)
Vendas    ▸  Vendas · Orçamentos · Clientes · Fiado · Franqueados
Estoque   ▸  Produtos · Estoque · Compras · Transferências · Fornecedores
Dinheiro  ▸  Hoje · Caixa · A receber · A pagar · Aprovações
Estatísticas
Ajustes   ▸  Lojas · Equipe · Histórico · Configurações
```

- O grupo da tela atual vem aberto; o menu lembra o que a pessoa deixou aberto.
- Cada item mantém a permissão que tem hoje (`exige` em
  `src/lib/emporio/paginas.ts`). Grupo sem item visível some; grupo com **um**
  item visível aparece solto, sem abrir e fechar.
- O Caixa vê: Vender, Vendas, Clientes, Fiado, Caixa.
- "Estabelecimentos" passa a se chamar **Lojas** em toda tela e texto.
- Mockup aprovado: `menu-inicio.html` (fora do git, ver §8).

### 5.2 Cabeçalho das telas (Q388)

- Sai o "Meu Empório" em cinza acima do título.
- **Caminho clicável** só em tela que fica dentro de outra:
  `Dinheiro › A pagar`.
- O texto de apresentação vira um **(i)** ao lado do título: abre ao passar o
  mouse e ao focar pelo teclado; no celular, abre no toque e fecha ao tocar
  fora; `Esc` fecha. O balão pode ter o link **"Ver no manual"** para a seção
  certa do `/manual`.
- Aviso que muda o que a pessoa faz continua visível, fora do (i) (exemplo: "O
  recebimento abate das vendas mais antigas primeiro", no Fiado).
- Um componente só, do Empório, usado pelas telas (hoje o cabeçalho está
  copiado à mão em 35 páginas).

### 5.3 Topo da página (Q389)

- **Onda 1:** o seletor "Todas as propriedades" do Tibé **some** nas telas do
  Empório; no resto do Tibé fica igual.
- **Onda 6:** no lugar dele, um seletor **"Loja: Todas ▾"** que vale para todas
  as telas do Empório (aprovado no mockup do Início), substituindo o filtro de
  loja que cada tela tem hoje. Lista só as lojas que a pessoa alcança; quem
  alcança uma só não vê seletor. Vender e Caixa continuam com a loja própria
  da operação (a venda e o turno são sempre de uma loja). Até a onda 6, cada
  tela fica com o filtro local de hoje. Como persiste (cookie ou URL) fica com
  quem constrói. *(Decisão da sessão.)*

### 5.4 Tela sem permissão (Q390)

Toda tela do Empório que o papel não abre volta ao Início do Empório (hoje
Financeiro e Histórico mostram o 404 do Next em inglês; as outras já voltam).

### 5.5 Início (Q391)

- **Caixa:** entrar no Empório leva direto a **Vender**. Vale para o papel
  `caixa` exato (`PapelEmporio` em `src/lib/emporio/papel.ts`): um gestor que
  também opera o caixa tem papel de gestor e cai no Início. *(Decisão da
  sessão.)*
- **Gestor, financeiro e dono**, de cima para baixo:
  1. **"Precisa de você"**: só o que pede ação; sem nenhum, o bloco some. Cada
     aviso com o número, o texto e o link para a tela onde se resolve.
  2. **Quatro números do dia:** vendas hoje, vendas no mês, entra hoje, sai
     hoje.
  3. **Atalhos:** Estatísticas, Produtos, Estoque, Nova compra, A receber
     (cada um só se o papel abre a tela).
- **Avisos e quem vê:**

  | aviso | gestor | financeiro | dono |
  |---|---|---|---|
  | produto zerado ou abaixo do mínimo | sim | | sim |
  | orçamento perto de vencer | sim | | sim |
  | caixa de dia anterior ainda aberto | sim | | sim |
  | fiado vencido | | sim | sim |
  | conta a pagar vencendo hoje ou vencida | | sim | sim |
  | aprovação pendente no Financeiro | | sim | sim |
  | boleto ou cheque vencido sem baixa | | sim | sim |
  | movimento a conferir com o banco | | sim | sim |

  "Gestor" e "financeiro" aqui querem dizer as ações `gestor_da_loja` e
  `dinheiro`: quem tem as duas vê as duas colunas. Todo aviso conta só as
  lojas que a pessoa já alcança hoje (`lojasDoAtor` e o `pode(c, acao,
  loja)` por loja), para qualquer papel. *(Decisão da sessão.)*
- Sai a grade de cartões que repete o menu. Os "Primeiros passos" continuam
  para conta nova, até serem concluídos.
- Mockup aprovado: `menu-inicio.html`.

### 5.6 "Carimbo" vira "Conferir com o banco" (Q392)

Em toda tela: "Carimbar" vira **"Conferir com o banco"**, "Sem carimbo" vira
**"A conferir com o banco"**, "Carimbado em" vira **"Conferido em"**. Leva um
(i) com o link para a seção do manual que explica a conferência (criar a seção
se não existir). Só texto: o comportamento não muda.

### 5.7 Vender (Q393)

Opção **A, duas colunas** no computador (mockup `vender.html`):

- **Esquerda:** busca de produto (o cursor já abre nela) e a lista de itens
  com quantidade, preço, desconto do item e total, editáveis na linha.
- **Direita:** cliente, vendedor, pagamento, **"Mais opções"** (fechado),
  total e "Fechar a venda".
- **"Mais opções"**, recolhido: desconto no total, frete, origem, pedido para
  entrega, franqueado, crédito do franqueado, faturar orçamento salvo. Com algo
  preenchido, o título diz o quê ("Mais opções (frete R$ 30,00)"). Na edição de
  uma venda ou ao faturar um orçamento com esses campos, abre já aberto.
- **Cliente** já vem como **"Consumidor final"**, com "Trocar" (F4). Se a
  pessoa escolhe cheque, boleto ou fiado com o Consumidor final, a tela pede o
  cliente na hora (o servidor já recusa esses três para o Consumidor final; a
  tela só antecipa). Mudança só de tela: o servidor já aceita o Consumidor
  final.
- **Vendedor:** para gestor, vendedor e dono, continua como hoje (a própria
  pessoa). Para o **Caixa**, a regra Q169 continua (escolhe em toda venda, sem
  padrão), mas a escolha vira **botões com os nomes** dos vendedores da loja
  escolhida na venda (a mesma lista de hoje, `vendedoresPorLoja`), um toque,
  ou F8 e o número. **Loja com um vendedor só:** ele já vem
  escolhido, porque não há o que confundir. (Corrige o mockup, que mostrava a
  Caixa como vendedora, o que a Q168 proíbe.)
- **Faixa do caixa** no topo, desde que a tela abre: verde, "Caixa 1 aberto
  desde 08:02 · Loja da Rodovia"; laranja quando fechado, "Dá para montar a
  venda; para fechar, abra o caixa", com o botão "Abrir o caixa" que usa o
  formulário de abertura que o balcão já tem (a venda continua depois).
- Os atalhos de teclado continuam (Alt+1, F4, F8, F9, Ctrl+Enter), mostrados
  junto do que acionam.
- **Celular:** uma coluna, na mesma ordem, com o total e "Fechar a venda"
  presos no rodapé.
- A aba "Orçamento" continua no topo, para quem a vê hoje.

### 5.8 Junções do Dinheiro (Q394)

| hoje | vira |
|---|---|
| Despesas + Financeiro › A pagar | **Dinheiro › A pagar**, abas Contas · Despesas fixas · Vendeu, Pagou. As comissões miúdas de uma mesma origem se agrupam numa linha que abre ao clicar |
| Caixa + Financeiro › Posição de caixa | **Dinheiro › Caixa**. O Caixa continua vendo só a gaveta da loja dele e abrindo e fechando o turno; gestor e financeiro veem também a gerência e as contas, como já é hoje na tela Caixa |
| Financeiro › Cobrança | entra em **Dinheiro › A receber**, que ganha abas: Fiado · Cheques · Boletos · Cartões · Vencidos (a antiga Cobrança), com o total no título de cada aba |
| Fiado | **fica em Vendas**, para o balcão, e ganha **busca** por nome, CPF ou telefone, filtrando enquanto digita |

A aba Fiado de A receber e a tela Vendas › Fiado mostram a mesma lista por
cliente, com o **mesmo componente** (busca, receber, a regra de abater das
vendas mais antigas); a permissão de cada tela continua a dela (o Caixa chega
pelo Vendas, não pelo Dinheiro). É o que o usuário decidiu: duas portas, cada
uma no lugar de quem a usa, uma implementação só. *(Decisão da sessão sobre a
forma; a decisão de manter as duas portas é do usuário.)*
| Financeiro (aba Hoje) | **Dinheiro › Hoje** |

Cada junção mantém a permissão de cada parte: quem não via a gerência continua
sem ver.

### 5.9 Listas longas (Q395)

- Produtos e Estoque ganham a paginação que Vendas e Compras já têm
  (`_components/paginacao*.tsx`).
- Estoque abre em **"Precisa repor"**; "Tudo" é a outra aba.
- Um padrão só de filtro nas listas do Empório: busca à esquerda, filtros no
  meio, ordenação e itens por página numa linha menor.

### 5.10 Estatísticas (Q396)

Junta **Relatórios** (menu), **Financeiro › Relatórios**, **Resultado** e
**Financeiro › Projeção** (mockup `estatisticas.html`).

- **Um filtro só no topo**, para tudo: Hoje · 7 dias · Este mês · Mês passado ·
  Escolher datas, e a loja. O fluxo projetado olha para a frente e ignora o
  período (diz isso no (i) dele).
- **Abas:** Visão geral · Vendas · Dinheiro · Resultado · Relatórios para
  imprimir.
- **Visão geral:** três cartões.
  - Vendas: total do período, comparação com o mesmo período do mês anterior
    (**novo**), barras por dia, produto que mais vendeu, melhor vendedor,
    produtos parados.
  - Dinheiro: em caixa e nas contas agora, a receber, quanto disso vencido, a
    pagar em 30 dias, saldo previsto em 30 dias.
  - Resultado: lucro do período, margem, ponto de equilíbrio, lucro por loja,
    vendas com margem negativa.
- **Vendas, Dinheiro e Resultado:** os blocos que já existem, reunidos:
  - Vendas: curva ABC, por origem, por vendedor, por produto, por loja, PIX por
    conta, produtos parados;
  - Dinheiro: a receber por idade, a pagar por vencimento, posição de caixa,
    fluxo projetado;
  - Resultado: resultado do mês, loja por loja, ponto de equilíbrio,
    acompanhamento do mês, produtos do mês, custo do cartão, margem negativa.
- **Relatórios para imprimir:** cada relatório com "Imprimir ou PDF" e
  "Planilha", por assunto. Os quatro do Dinheiro já existem; os de Vendas e
  Resultado ganham a mesma folha e a mesma planilha (**novo**), no formato das
  que já existem (CSV com `;`, vírgula decimal, data DD/MM/AAAA).
- **Permissão:** o Caixa não vê. Cada aba e cada cartão mantém a permissão do
  bloco de origem: Vendas e Resultado para `gestor_da_loja` ou `dinheiro`;
  Dinheiro para `dinheiro`. A restrição de loja de hoje vale igual na Visão
  geral e nos relatórios para imprimir: quem só alcança algumas lojas
  (`lojasDoAtor`) vê só elas, e "Todas" quer dizer "todas as minhas lojas",
  como já é em Relatórios e Resultado. *(Decisão da sessão.)*

### 5.11 Endereços antigos (Q397)

Todo endereço que deixa de existir **redireciona** para o novo, com a aba
certa (por exemplo, `/emporio/despesas` para A pagar na aba Despesas fixas,
`/emporio/financeiro/cobranca` para A receber na aba Vencidos,
`/emporio/relatorios` e `/emporio/resultado` para Estatísticas). Os endereços
exatos ficam com quem constrói; a regra é que nenhum link salvo, do manual ou
do e-mail, caia em página vazia. `/emporio/caixa` continua sendo o Caixa.

## 6. Ondas de entrega

Cada onda: plano próprio, subagentes por time (ver `orquestrar-ondas`),
validação viva no Chrome de testes, juiz, a varredura de textos defasados
(`npm run textos-defasados`) e merge na `main` **só com autorização do usuário
na conversa**.

**O manual é a última coisa a ajustar** (decisão do usuário, 25/11/2026): as
telas ainda vão mudar muito, então texto, figuras e GIFs são refeitos de uma
vez na onda 7, depois da 6. A onda 1 já atualizou o manual e fica como está.
Nas ondas 2 a 6, o texto do manual que ficar defasado vai para a lista da onda
7, e não é corrigido na hora. Os redirecionamentos do §5.11 continuam
obrigatórios em cada onda, porque é por eles que nenhum link do manual cai em
página vazia nesse meio-tempo.

| onda | conteúdo | depende de |
|---|---|---|
| 1. Navegação | §5.1 menu, §5.2 cabeçalho e (i) em todas as telas, §5.3 seletor some, §5.4 sem permissão, "Lojas", §5.6 conferir com o banco | |
| 2. Início | §5.5 | 1 |
| 3. Vender | §5.7 | 1 |
| 4. Dinheiro e listas | §5.8, §5.9, §5.11 dos endereços que somem nesta onda | 1 |
| 5. Estatísticas | §5.10, §5.11 dos endereços que somem nesta onda | 1 |
| 6. Loja no topo | §5.3, segunda parte | 4 e 5 |
| 7. Manual | texto, figuras e GIFs do `/manual` para as telas novas, com a lista de defasados juntada nas ondas 2 a 6 | 2 a 6 |

As ondas 2 a 5 não dependem umas das outras e podem andar em qualquer ordem
depois da 1.

**O menu entre as ondas.** A onda 1 entrega os grupos apontando para as telas
que existem naquele dia, com os nomes novos onde a tela já é a mesma:

```
Início                    (o atual, até a onda 2)
Vender
Vendas    ▸  Vendas · Orçamentos · Clientes · Fiado · Franqueados
Estoque   ▸  Produtos · Estoque · Compras · Transferências · Fornecedores
Dinheiro  ▸  Hoje · Caixa · A receber · A pagar · Despesas · Aprovações
Estatísticas ▸  Relatórios · Resultado · Projeção
Ajustes   ▸  Lojas · Equipe · Histórico · Configurações
```

"Hoje", "A receber", "A pagar", "Aprovações" e "Projeção" apontam para as
abas que o Financeiro já tem (`/emporio/financeiro/...`). A barra de abas do
Financeiro **continua** até a onda 4, para "Posição de caixa" e "Cobrança"
seguirem alcançáveis sem entrar no menu; ela sai quando as duas forem
juntadas. "Despesas" sai do grupo na onda 4 (vira aba de A pagar). Na
onda 5, "Estatísticas" deixa de ser grupo e vira item. A cada onda, o endereço
que some redireciona (§5.11). *(Decisão da sessão, na revisão do desenho.)*

## 7. O que fica com quem constrói

- Os endereços novos (Estatísticas, abas por parâmetro ou por caminho), desde
  que os antigos redirecionem.
- Como o menu lembra os grupos abertos (cookie ou armazenamento local).
- De onde cada aviso do Início lê. Preferir as leituras que já existem (a aba
  Hoje do Financeiro, "precisam repor", Cobrança). Leitura nova vai em
  `src/lib/actions/` (invariante 6), sem regra de negócio nova.
- A comparação com o mês anterior: uma leitura nova, no mesmo lugar das
  leituras de relatório.
- A forma das abas e do balão do (i), dentro do Empório, com os tokens que
  existem.
- O número de itens por página e o critério de "perto de vencer" do orçamento
  (sugestão: 3 dias, como no mockup).
- Testes: a suíte nova de cada onda segue o próximo número livre (`test:mNN`).

## 8. Validação

- Por onda: os roteiros existentes do Empório que passam pelas telas tocadas
  continuam verdes (vários procuram rótulos e caminhos que vão mudar: ajustar
  junto); roteiro novo provado nos dois sentidos; fotos de cada tela por papel
  (gestor, caixa, dono, financeiro), no computador e no celular.
- Os mockups aprovados estão em
  [mockups/2026-11-24-emporio-ux/](mockups/2026-11-24-emporio-ux/)
  (`menu-inicio.html`, `vender.html`, `estatisticas.html`; abrir no
  navegador). São a referência de hierarquia e posição. Onde divergem deste
  texto, vale o texto: o `vender.html` mostra a Caixa como vendedora, o que a
  §5.7 corrige. Layout fora do que os mockups mostram fica com quem constrói,
  dentro dos tokens; a foto de cada tela vai ao usuário na validação de cada
  onda, antes do merge.

## 9. Fora desta frente, registrado

- ~~O Caixa abre `/emporio/fornecedores` e `/emporio/franqueados` pela URL.~~
  Resolvido em 25/11/2026, com a decisão do usuário: as listas e as fichas
  levam o Caixa ao Início (commit `f52e3723`).
- Separar o Empório do Tibé (casca, marca, entrada): outra frente.
- Os prints que o usuário ainda vai trazer e as mudanças da Agromax e da
  Central do Milho: ondas novas.
