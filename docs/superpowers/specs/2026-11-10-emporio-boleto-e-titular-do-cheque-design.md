# Empório: boleto na venda e titular do cheque (Q278 a Q284)

Pedido da Agromax em 10/11/2026, com fotos do balcão: "acrescentar a forma de
pagamento boleto" e "um campo nome do cliente, para saber em nome de quem é o
cheque". Decisões do usuário em 10/11/2026 (as quatro recomendações aceitas).

O Tibé não emite boleto: o boleto é gerado fora (no banco) e só registrado
aqui. Não há integração bancária, retorno CNAB nem tarifa.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q278 | **Boleto é forma de pagamento da venda, como o cheque.** "+ Boleto" no balcão; uma ou mais linhas na mesma venda, cada uma com valor, vencimento (obrigatório, não antes do dia da venda) e número (opcional). Exige cliente de verdade (não o Consumidor final). Na venda: um `FinancialPayment` (`method: "boleto"`) no lançamento da venda, um `EmporioSalePayment` (`kind: "boleto"`) e um `EmporioBoleto` `aberto`. Não mexe no caixa: o boleto é o próprio a receber | decisão do usuário: "como o cheque", parcelas com vencimento |
| Q279 | **Baixa ("Boleto pago"):** quem marca cheque como compensado (`exigirUma(["gestor_da_loja", "dinheiro"])`) escolhe a conta bancária e a data do pagamento (não futura, padrão hoje). Grava `CashMovement` de entrada na conta (origem nova `boleto_pago`, `boleto_id`, `sale_id`), e o boleto passa a `pago`. Aparece no extrato da conta com cliente e número da venda | o dinheiro só existe na conta quando o banco paga |
| Q280 | **Vencido e não pago fica `aberto`**, mostrado como "Vencido" (calculado: `due_on` antes de hoje em Brasília). Conta no bloqueio do cliente por atraso (`estadoDeCredito`, os dias de atraso pelo `due_on`) e no relatório de a receber por idade. **"Mandar para o fiado"** (mesmo papel da baixa, motivo obrigatório) faz o que o cheque devolvido faz: o `FinancialPayment` sai, o lançamento volta a pendente e a dívida aparece no fiado; com a venda absorvida por acordo, vira parcela extra do acordo vencendo hoje. Status `no_fiado` | decisão do usuário: fica vencido até alguém decidir |
| Q281 | **Cancelar a venda:** boleto `aberto` vira `cancelado` (o pagamento sai com o cancelamento, como o do cheque recebido); boleto `pago` recusa o cancelamento (409, "Essa venda tem boleto já pago: não dá para cancelar."). A edição de venda (Q249) é cancelar mais vender, então segue igual. Na devolução parcial o boleto conta como pago no teto, como cheque e cartão | mesmo desenho do cheque (Q94) |
| Q282 | **Onde aparece:** a lista de boletos fica junto da de cheques (a receber do Financeiro e caixa), com filtro por situação (abertos, vencidos, pagos, no fiado); fluxo projetado pelo `due_on`; relatório de a receber por idade; relatório do turno e de vendas por forma ("Boleto"); impresso A4 e cupom ("Boleto, vence dd/mm/aaaa, nº X"); detalhe da venda | onde o cheque já aparece, o boleto aparece também |
| Q283 | **Tarifa do banco por boleto: fora por enquanto.** Quem quiser lança como despesa comum da loja. Dívida 2.69 | decisão do usuário |
| Q284 | **Cheque ganha o titular** (`EmporioCheck.holder_name`, obrigatório): "Em nome de" no formulário, já preenchido com o nome do cliente da venda e editável (cheque de terceiro). A migração preenche os cheques antigos com o nome do cliente. Aparece na lista de cheques, no detalhe da venda e no impresso | pedido da Agromax: saber em nome de quem é o cheque |

## Contrato

- Venda (`POST /api/v1/emporio/sales`, e a edição `.../:id/replace`):
  pagamento `{ kind: "boleto", amount, boleto: { due_on: "AAAA-MM-DD", number?: string } }`;
  cheque passa a exigir `cheque.holder_name` (texto, até 120). Recusas no
  campo `payments` (como as do cheque) e `customer_id` para o Consumidor final.
- `GET /api/v1/emporio/boletos?status=aberto|vencido|pago|no_fiado&loja=`:
  lista com `id, sale_id, sale_number, customer_id, customer_name,
  establishment_id, establishment_name, number, due_on, amount, status,
  overdue (bool), bank_account_id, bank_account_name, paid_on, sent_to_fiado_at, reason`.
- `POST /api/v1/emporio/boletos/:id/pay` `{ bank_account_id, paid_on? }`.
- `POST /api/v1/emporio/boletos/:id/to-fiado` `{ reason }`.
- `ChequeView` ganha `holder_name`. `/docs/api` documenta tudo.
- Histórico: `boleto.pagar`, `boleto.fiado` (e o cancelamento da venda registra o boleto cancelado no resumo, como o cheque).

## Modelo

- `EmporioPaymentKind` + `boleto`; `CashMovementOrigin` + `boleto_pago`.
- `EmporioBoletoStatus { aberto pago no_fiado cancelado }`.
- `EmporioBoleto`: `tenant_id`, `sale_id`, `sale_payment_id` (único), `customer_id`,
  `establishment_id`, `number?`, `due_on` (Date), `amount`, `status`,
  `financial_payment_id?`, `bank_account_id?`, `paid_on?` (Date), `paid_at?`,
  `sent_to_fiado_at?`, `fiado_reason?`, `updated_by_user_id?`, carimbos. Em
  `TENANT_SCOPED_MODELS`. `CashMovement.boleto_id?`.
- `EmporioCheck.holder_name String` (backfill pelo nome do cliente).

## Fora

Emissão do boleto, retorno bancário, conciliação automática, tarifa (2.69),
o agente do WhatsApp (classificador congelado).

Suíte: `test:m108`.
