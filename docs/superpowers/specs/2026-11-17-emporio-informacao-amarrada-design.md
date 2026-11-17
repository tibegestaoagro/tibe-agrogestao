# Empório: informação amarrada (frente A, Q345 a Q348)

Primeira frente do plano de 17/11
([2026-11-17-emporio-plano-gestaoclick.md](2026-11-17-emporio-plano-gestaoclick.md)).
O pedido do cliente, na reunião de 09/11: a informação "amarrada" (abre a
venda, vai ao cliente, vê as vendas dele, volta) e a apresentação "bem
resumida". Nada aqui muda regra de dinheiro: é leitura, link e resumo.

Sem migração.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q345 | **A receber e A pagar mantêm as seções de hoje** e ganham, no topo, uma faixa de cartões de resumo. O clique num cartão filtra a tela (`?ver=`) | decisão do usuário: as ações por instrumento (receber fiado, depositar cheque, antecipar cartão, pagar várias contas) continuam onde estão |
| Q346 | O cartão **Recebido** (A receber) e o **Pago** (A pagar) somam um período escolhido por atalhos (Hoje, Esta semana, Este mês, Mês passado, Escolher), **abrindo em Este mês**, com o % do previsto | decisão do usuário |
| Q347 | **Ficha do cliente:** ficam Total comprado e Última compra; Vendas ativas sai e entram **Em aberto**, **Vencido** e **Recebido**; abaixo, a **lista de recebimentos** do cliente | decisão do usuário; "Em aberto" soma fiado, cheques em carteira e boletos abertos (o cartão de crédito é dívida da adquirente, não do cliente) |
| Q348 | **A compra fica fora:** sem número nem página de detalhe nesta frente | decisão do usuário; entra com o XML da nota (frente G2), que mexe na compra de qualquer jeito |

## 1. Links (sem decisão de produto)

Todo nome de cliente vira link para `/emporio/clientes/[id]`, todo nome de
fornecedor para `/emporio/fornecedores/[id]`, e todo "venda nº X" para
`/emporio/vendas/[id]`, nas telas abaixo (levantamento de 17/11). A impressão
(recibo, romaneio, folha A4, cupom) fica como está.

| tela | o que vira link |
|---|---|
| A receber: Fiado por cliente | o nome do cliente |
| A receber: Cheques em carteira | o nome do cliente; "Ver a venda" vira "Venda nº X" |
| A receber: Boletos | o nome do cliente |
| A receber e Caixa: Cartões a receber | a linha ganha o cliente (link) e **"Venda nº X (2/3)"** (link) no lugar de "Ver a venda" |
| Caixa: Cheques | o cliente; "Ver a venda" vira "Venda nº X" |
| Caixa: Movimentos | a origem com venda mostra "Venda nº X" |
| Extrato do lugar | o cliente e o "venda nº X" da descrição |
| A pagar | o fornecedor, quando a conta tem fornecedor |
| Aprovações | o fornecedor de cada lançamento, quando houver |
| Vendas (lista) | o número e o cliente |
| Venda (detalhe) | o cliente do cabeçalho |
| Orçamentos (lista e detalhe) | o cliente e o "Faturado (venda nº X)" |
| Fiado (página) | o nome do cliente |
| Balcão, resumo depois de salvar | o cliente |
| Relatórios do dinheiro, fiado por cliente | o nome do cliente |
| Resultado, vendas com margem negativa | "Venda nº X" no lugar de "Ver venda" |

Cliente "Consumidor final" (o padrão) não vira link: a ficha dele não diz nada.

As views que não trazem o id para o link ganham o campo (extensão aditiva,
documentada em `/docs/api`): `CartaoAReceberView` ganha `sale_number`,
`customer_id` e `customer_name`; `ExtratoLinhaView` ganha `sale_id` e
`customer_id`; a conta a pagar e o lançamento da aprovação ganham
`supplier_id` quando têm fornecedor.

## 2. A faixa de resumo do A receber (Q345, Q346)

Quatro cartões, sobre o mesmo recorte de loja da tela:

| cartão | soma | o clique |
|---|---|---|
| **Vencido** | fiado com vencimento antes de hoje (o aberto de cada lançamento), cheques em carteira com bom para antes de hoje, boletos abertos vencidos | `?ver=vencido`: as seções mostram só o que está vencido |
| **Vence hoje** | o mesmo com a data igual a hoje, mais as parcelas de cartão que caem hoje | `?ver=hoje` |
| **A vencer** | o mesmo com a data depois de hoje, mais as parcelas de cartão futuras | `?ver=a_vencer` |
| **Recebido** (no período) | fiado recebido, cheques compensados, boletos pagos e parcelas de cartão caídas, no período | `?ver=recebido`: as seções dão lugar à lista "Recebido no período" |

- Cada cartão mostra o total e a quantidade. O Recebido mostra também o **%
  do previsto**: recebido ÷ (recebido + o que vencia no período e segue em
  aberto). Sem nada previsto, o % não aparece.
- Hoje é o dia de Brasília (`hojeEmBrasilia`), como no resto do financeiro.
- No fiado (uma linha por cliente), o filtro mostra o cliente que tem algum
  valor naquele recorte, com o valor do recorte ao lado do total.
- Parcela de cartão não "vence": até a frente B (conferir o cartão), o filtro
  Vencido mostra a seção de cartões vazia com a frase "Parcela de cartão cai
  sozinha na data; a conferência vem na próxima etapa." Texto final na tela.
- O dinheiro e o PIX recebidos no ato da venda **não** entram no Recebido do
  A receber: nunca foram "a receber". Ficam no extrato.
- O cartão ativo fica destacado, e "Ver tudo" tira o filtro.

**Recebido no período** (lista): data, cliente (link), venda nº (link, quando
houver), forma (Fiado, Cheque, Boleto, Cartão), loja e valor. Ordem: mais
recente primeiro.

## 3. A faixa de resumo do A pagar (Q345, Q346)

| cartão | soma | o clique |
|---|---|---|
| **Vencida** | contas pendentes com vencimento antes de hoje | `?ver=vencida` |
| **Vence hoje** | vencimento hoje | `?ver=hoje` |
| **A vencer** | vencimento depois de hoje e as sem vencimento (com a contagem das sem vencimento à parte, como já faz a projeção) | `?ver=a_vencer` |
| **Pago** (no período) | o que foi pago no período | `?ver=pago`: a lista dá lugar a "Pago no período" |

O Pago tem o mesmo % do previsto do Recebido. **Pago no período** (lista):
data, conta, fornecedor (link, quando houver), origem, de onde saiu (gaveta
ou conta) e valor.

## 4. O seletor de período

Um componente só (`PeriodoFiltro`), com os atalhos Hoje, Esta semana (domingo a
sábado), Este mês, Mês passado e Escolher (abre `de` e `ate`). Ele grava `de`
e `ate` na URL.

Entra no A receber e no A pagar (para o Recebido e o Pago) e **substitui** os
campos de data soltos do Extrato, dos Relatórios do dinheiro e do Histórico,
que passam a ter os mesmos atalhos. O período que cada tela já aceitava não
muda de sentido.

## 5. Ficha do cliente (Q347)

Cartões: Total comprado, Última compra, **Em aberto**, **Vencido** e
**Recebido**.

- **Em aberto:** fiado aberto (com as parcelas de acordo), cheques em carteira
  (recebido ou depositado) e boletos abertos.
- **Vencido:** a parte do Em aberto com data antes de hoje.
- **Recebido:** tudo o que o cliente já pagou: os pagamentos da venda em
  dinheiro, PIX e cartão (na data da venda), os recebimentos de fiado, os
  boletos pagos e os cheques compensados. Cheque em carteira ainda não conta;
  cheque devolvido não conta. Venda cancelada não conta; devolução em dinheiro
  abate.
- Cada cartão respeita as lojas que quem olha enxerga, como a ficha já faz.

**Recebimentos** (lista abaixo das vendas): data, venda nº (link, quando
houver), forma, loja, valor e, no cheque, a situação. Mais recente primeiro,
com "Ver mais" depois de 20.

## 6. Contratos

| rota | o que muda |
|---|---|
| `GET /api/v1/emporio/finance/receivables` | aceita `de` e `ate`; devolve `summary` (`overdue`, `due_today`, `upcoming`, `received` com `total`, `count` e, no `received`, `expected_pct`) e `received_items` (a lista do período). Os itens das seções ganham os campos de link da seção 1 |
| `GET /api/v1/emporio/payables/summary` (nova; a `payables` devolve uma lista e fica como está) | aceita `establishment_id`, `de` e `ate`; devolve `summary` com `overdue`, `due_today`, `upcoming` (com `undated_count`) e `paid`, e `paid_items` |
| `GET /api/v1/emporio/customers/:id` | o `resumo` ganha `em_aberto`, `vencido` e `recebido`; `vendas_ativas` continua no contrato (a tela deixa de mostrar) |
| `GET /api/v1/emporio/customers/:id/receipts` (nova) | a lista de recebimentos do cliente, paginada (`before` por data) |

A regra mora nas actions de `src/lib/actions/emporio-*`; as rotas são finas. A
permissão é a de hoje: quem lê o A receber e o A pagar (`dinheiro`) e quem lê a
ficha do cliente.

## 7. Provas

- Suíte `test:m120`, escrita desta spec: os quatro recortes do A receber e do
  A pagar com datas de ontem, hoje e amanhã (fiado, cheque, boleto, cartão);
  Recebido e Pago dentro e fora do período; o % do previsto e o caso sem
  previsto; a ficha (Em aberto, Vencido e Recebido com cheque em carteira,
  compensado e devolvido, venda cancelada e devolução em dinheiro); os campos
  de link; isolamento entre contas e entre lojas.
- Roteiro de navegador `emporio-informacao-amarrada`, provado nos dois
  sentidos: clicar em cada cartão e ver o filtro; trocar o período; ir da linha
  do cartão a receber à venda e da venda ao cliente; a ficha com os cartões e a
  lista; 390 px.

## Fora

Página e número da compra (Q348); lista única de parcelas (opção recusada na
Q345); exportar o Recebido e o Pago em planilha; o painel de abertura do
Empório com gráficos (pode vir depois, reaproveitando esta faixa).
