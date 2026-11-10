# Empório: editar, cancelar e refazer orçamento (Q285 a Q290)

Pedido do usuário em 10/11/2026: "editar o ORÇAMENTO ou cancelar. No momento
está fechado". Hoje o orçamento se cria, lê, lista, imprime e fatura (Q176 a
Q187), mas não se edita nem se cancela. Decisões do usuário em 10/11/2026.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q285 | **Editar** só orçamento não faturado e não cancelado (aberto ou vencido). Mesmo número. Salvar regrava cliente, vendedor, itens (troca a lista inteira), desconto, observação e entrega, com as mesmas validações da criação (cliente, desconto acima do limite pedindo o gestor, entrega). **Toda edição renova a validade** (`valid_until` = hoje de Brasília + `quote_validity_days`, a regra da Q177) **e atualiza os preços**: o `suggested_price` de cada item passa a ser o preço de hoje, e o formulário abre com o preço de hoje em cada item (quem edita pode dar desconto dentro do limite, como na criação) | decisão do usuário: "editar somente orçamentos em aberto, pode ser os vencidos também, podendo dar um novo prazo de vencimento e atualizando os preços" |
| Q286 | **Orçamento faturado não se edita: gera um novo com a mesma base.** "Novo orçamento a partir deste" abre o formulário do orçamento preenchido com o cliente, os itens e as quantidades do original, com o preço de hoje; salvar cria outro número (`based_on_quote_id` aponta o original, e as duas telas mostram o vínculo). O original não muda. Vale para qualquer orçamento (faturado, cancelado, vencido ou aberto) | decisão do usuário: "orçamentos já faturados somente geram novos orçamentos com a mesma base, para poder editar (adicionar itens ou ajustar as quantidades)" |
| Q287 | **Cancelar** com motivo obrigatório, definitivo: `canceled_at`, `canceled_by_user_id`, `canceled_reason`. Situação derivada nova `cancelado` (precede vencido e aberto; faturado e cancelado não coexistem). O cancelado não se fatura (`QUOTE_CANCELED`, 409, campo `quote_id`), não se edita (`QUOTE_CANCELED`), sai do acompanhamento e aparece no filtro "Cancelados" com motivo, quem e quando; o impresso sai com a marca CANCELADO. Faturado não se cancela (`QUOTE_ALREADY_INVOICED`): cancela-se a venda, que reabre o orçamento (Q182) | decisão do usuário: com motivo, definitivo |
| Q288 | **Quem:** editar, cancelar e criar a partir de outro é de quem cria orçamento (`vendedor_da_loja`, nas lojas do ator), como `salvarOrcamentoAction` | decisão do usuário |
| Q289 | **Corrida:** editar, cancelar e faturar disputam o mesmo orçamento; editar e cancelar rodam em transação serializável com guarda (`sale_id` nulo e `canceled_at` nulo no `updateMany`), e faturar relê o orçamento na transação e recusa o cancelado. Editar não usa chave de operação (é idempotente por natureza: o corpo inteiro regrava o estado) | a venda já faz assim com o orçamento (linha `QUOTE_ALREADY_INVOICED` dentro da transação) |
| Q290 | **Histórico:** `orcamento.editar` (resumo com o que mudou: itens, total, validade) e `orcamento.cancelar` (com o motivo); a criação a partir de outro registra no resumo de `orcamento.salvar` o número de origem | regra do módulo: toda escrita do Empório no Histórico |

## Contrato

- `PATCH /api/v1/emporio/quotes/:id`: mesmo corpo do POST, sem `operation_key`
  e sem `establishment_id` (a loja não muda). Devolve `OrcamentoView`.
  Recusas: `QUOTE_ALREADY_INVOICED` (409), `QUOTE_CANCELED` (409), as da criação.
- `POST /api/v1/emporio/quotes/:id/cancel` `{ reason }`: recusa sem motivo
  (422, campo `reason`), faturado (409), já cancelado (409).
- `POST /api/v1/emporio/quotes` aceita `based_on_quote_id` (opcional; precisa
  ser orçamento visível ao ator, senão 404 no campo `based_on_quote_id`).
- `OrcamentoView` ganha `situacao: "cancelado"`, `canceled_at`,
  `canceled_by: { id, name } | null`, `canceled_reason`, `based_on: { id, number } | null`
  e `derived: { id, number }[]` (os feitos a partir deste).
- `GET /api/v1/emporio/quotes?situacao=cancelado` (o padrão `acompanhamento`
  continua aberto mais vencido; `todos` inclui os cancelados).
- `/docs/api` documenta tudo.

## Modelo

`EmporioQuote` + `canceled_at DateTime?`, `canceled_by_user_id String?`,
`canceled_reason String?`, `based_on_quote_id String?` (relação consigo mesmo,
`onDelete: SetNull`, com índice). Migração aditiva.

## Tela

- Detalhe do orçamento (`/emporio/orcamentos/[id]`): botões "Editar" (aberto
  ou vencido), "Cancelar orçamento" (aberto ou vencido; painel com motivo),
  "Novo orçamento a partir deste" (sempre). Cancelado mostra o selo, o motivo,
  quem e quando. Vínculo "Feito a partir do orçamento nº X" e "Orçamentos
  feitos a partir deste".
- Editar e "a partir deste" abrem o balcão no modo orçamento preenchido (como o
  `?editar=` da venda), com o aviso "Editando o orçamento nº X: a validade e os
  preços serão renovados".
- Lista: filtro "Cancelados" e o selo.

## Fora

Reabrir o cancelado; editar o faturado; histórico de versões do orçamento
(o Histórico guarda o resumo de cada edição).

Suíte: `test:m109`.
