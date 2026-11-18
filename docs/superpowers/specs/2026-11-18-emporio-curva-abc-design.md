# Empório: curva ABC e paginação dos orçamentos (frente H, Q362 a Q365)

Frente H do plano das ideias do GestãoClick
([2026-11-17-emporio-plano-gestaoclick.md](2026-11-17-emporio-plano-gestaoclick.md),
dívida 2.75), com uma correção pedida junto: a lista de Orçamentos. Spec do
módulo: [../../specs/module-39-meu-emporio.md](../../specs/module-39-meu-emporio.md).

## Por que

- **Curva ABC:** saber o que mais vende e quem mais compra, para decidir onde
  pôr estoque, promoção e atenção. O GestãoClick tem a curva de produtos e a de
  clientes; a ideia veio dos tutoriais dele.
- **Orçamentos:** em 18/11 a Agromax achou que os orçamentos do nº 37 para
  baixo tinham sumido. Não sumiram (o Neon tem os 247, do 1 ao 247, sem
  buraco): a lista mostra no máximo os 200 mais recentes do filtro
  (`listarOrcamentosAction`, `take: 200`) e não avisa que cortou.

## O que existe hoje

- **Relatórios** (`/emporio/relatorios`, `relatorioDeVendasAction` em
  `src/lib/actions/emporio-relatorios.ts`): período de dias de Brasília (até
  366 dias), loja opcional, vendas concluídas menos a nova da troca, total
  líquido descontando o devolvido no período (que vai à venda ORIGINAL). Já
  tem `por_produto` (quantidade e total). Não tem nada por cliente.
- **Lucro:** cada `EmporioSaleItem` guarda `total`, `base_qty`, `unit_cost`
  (custo médio por unidade-base no momento), `cost_estimated` e
  `cost_provisional`. O Resultado (`src/lib/actions/emporio-resultado.ts`) já
  calcula a margem a partir disso.
- **Orçamentos** (`/emporio/orcamentos`): filtros de loja, situação
  (acompanhamento, aberto, vencido, faturado, cancelado, todos) e busca;
  ordem fixa do mais recente para o mais antigo; corte silencioso em 200.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q362 | **Curva ABC de produtos e de clientes**, por loja e período, no Relatórios | Q341 (frente H) |
| Q363 | **Duas medidas com seletor: faturamento e lucro.** Abre em faturamento | decisão do usuário em 18/11 (opção 3) |
| Q364 | **Cortes clássicos:** A até 80% do total acumulado, B até 95%, C o resto | proposta aceita com a Q363 |
| Q365 | **Orçamentos com paginação:** 20, 40, 80 ou 100 por página, números de página, e a ordem do mais recente para o mais antigo ou o contrário | decisão do usuário em 18/11 |

## Abordagem

Uma só faz sentido: **a curva sai da mesma conta do relatório de vendas.** O
período, a loja, as vendas que contam e o desconto do devolvido têm de ser os
mesmos do Relatórios, senão a curva e o "por produto" dariam totais diferentes
para o mesmo período. Uma action nova reaproveita a agregação existente (sem
duplicar a regra) e acrescenta o agrupamento por cliente e o lucro. Calcular
em SQL à parte ou gravar a curva foram descartados: divergiriam do relatório,
e o projeto calcula relatório na leitura.

## Comportamento

### Curva ABC

- No Relatórios, uma seção **"Curva ABC"** com duas abas, **Produtos** e
  **Clientes**, e o seletor **Faturamento | Lucro**; o período e a loja são os
  mesmos filtros da página.
- **Faturamento** de um produto ou cliente: a soma do `total` das linhas de
  venda, a mesma base do "por produto" do relatório (concluídas, menos o
  devolvido no período). **Lucro:** esse faturamento menos o custo da
  mercadoria (`unit_cost` x `base_qty` da linha; o custo devolvido sai junto
  com a devolução). É o **lucro bruto** (venda menos custo), como o usuário
  escolheu; ele **não** desconta despesa variável nem taxa de cartão, que o
  Resultado desconta, então a tela chama a medida de "Lucro (venda menos
  custo)". Custo estimado ou provisório: entra com o custo gravado e marca o
  item com "custo estimado". Linha sem custo (`unit_cost` nulo): entra com
  custo zero e marca "sem custo".
- A lista vem ordenada da maior medida para a menor, com: posição, nome,
  quantidade (só produtos, na unidade-base), número de vendas (só clientes),
  a medida em R$, a participação no total (%) e o **acumulado** (%), e a
  **classe**: A enquanto o acumulado ANTES do item for menor que 80%, B
  enquanto for menor que 95%, C depois (o item que cruza o corte fica na
  classe de cima; minha chamada, para o A nunca ficar vazio).
- No alto, o resumo de cada classe: quantos itens, quanto somam e a
  participação (ex.: "A: 12 produtos, R$ 80.400,00, 80%").
- **Item com medida zero ou negativa** (tudo devolvido, ou lucro negativo):
  fica no fim, na classe C, e não entra na soma que define os cortes (minha
  chamada: o negativo bagunçaria o acumulado). Com o total zero ou negativo,
  a tela mostra a lista sem classes e o aviso "Sem vendas positivas no
  período".
- **Clientes:** o **Consumidor final** fica fora da curva (ele junta todo
  mundo que não se identificou e seria sempre o primeiro); a tela mostra o
  quanto ele somou numa linha à parte, abaixo do resumo. Minha chamada.
- Quem vê: quem já vê o Relatórios, com as mesmas lojas. A medida **lucro**
  só para quem vê o custo hoje no Resultado (mesma permissão); sem ela, o
  seletor não aparece.
- Celular: a tabela rola dentro do cartão, sem rolagem horizontal da página.

### Orçamentos (Q365)

- Seletor **"Por página": 20, 40, 80, 100** (padrão 20) e **"Ordem": Mais
  recentes primeiro | Mais antigos primeiro** (padrão o primeiro), junto dos
  filtros que já existem.
- Embaixo da lista: "Mostrando 21 a 40 de 230" e os itens de paginação:
  Anterior, os números (com reticências quando são muitos: 1 ... 4 5 6 ... 12)
  e Próxima.
- Tudo na URL (`pagina`, `por_pagina`, `ordem`), junto de `loja`, `situacao`
  e `q`: dá para voltar e compartilhar. Mudar filtro, busca, ordem ou
  tamanho volta à página 1. Página além da última mostra a última.
- O servidor conta e pagina (`skip`/`take` com `count` sob o mesmo filtro);
  some o corte silencioso em 200. Ordem pelo número do orçamento.
- O contrato do GET da lista ganha `page`, `per_page`, `order` (`desc`|`asc`)
  e devolve em `meta` o `total`, `page` e `per_page` (extensão aditiva; o
  `limit` antigo continua aceito para não quebrar quem o use).

## Respostas da revisão (18/11)

Chamadas minhas, a partir das perguntas do revisor:

1. **Lucro é o bruto** (faturamento menos custo da mercadoria), como o usuário
   escolheu, e não a margem do Resultado (que também desconta despesa variável
   e taxa de cartão). O nome na tela deixa isso claro.
2. **A base das duas curvas é a soma do `total` das linhas** (sem frete nem
   crédito do franqueado, que não são venda de produto), para produtos e
   clientes somarem o mesmo. A venda nova da troca entra na receita (como no
   "por produto"), mas não conta no "número de vendas" do cliente (como na
   contagem do relatório).
3. **Venda sem cliente (`customer_id` nulo, legado) vai junto do Consumidor
   final** na linha à parte ("Consumidor final e vendas sem cliente"). O
   Consumidor final é o cliente fixo do sistema.
4. **O servidor recusa `measure=lucro` com 403** para quem não vê o Resultado;
   o faturamento segue a permissão e as lojas do Relatórios.
5. **Rota:** `GET /api/v1/emporio/reports/abc` (ao lado de `reports/sales`),
   com `from`, `to`, `establishment_id?`, `kind` (`products`|`customers`) e
   `measure` (`revenue`|`profit`); entra no `/docs/api`.
6. **Orçamentos:** todos os filtros de situação já são `where` no Prisma, então
   `count` e `skip`/`take` batem. Ordem por `number` (sequencial por conta).
   Com `page` e `limit` juntos, vale `page`.

## Fora do escopo

- Exportar a curva (CSV ou impresso).
- Curva por fornecedor, por categoria ou por vendedor.
- Cortes configuráveis.
- Paginação nas outras listas do Empório (Vendas e as demais): vira dívida,
  com a conferência de qual delas também corta em silêncio.

## Anti-objetivos

- Curva com total diferente do "por produto" do mesmo período e loja.
- Chamar de "lucro" um número que pareça o do Resultado sem ser: o nome da
  medida diz "venda menos custo".
- Orçamento que existe e a tela não deixa achar.

## Riscos que a validação precisa cobrir

- Devolução de uma venda de antes do período, dentro do período: desconta do
  produto e do cliente da venda original.
- Produto vendido em duas lojas: com loja escolhida, só a dela; sem loja, a
  soma.
- Empate na medida: ordem estável (por nome).
- Paginação com 230 orçamentos: a última página, a página 1 em ordem
  crescente começando no nº 1, e a busca por número achando um orçamento
  antigo.

## Validação

Suíte escrita da spec (curva batendo com o relatório e com o Resultado,
classes nos cortes, Consumidor final fora, paginação), roteiro de navegador
provado nos dois sentidos, juiz, manual (Relatórios e Orçamentos) e merge com
autorização.
