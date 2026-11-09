---
tipo: design
data: 2026-11-09
modulo: 39 (Meu Empório)
origem: conversa com o Dilton em 2026-11-09, em seis decisões (Q244 a Q249)
---

# Meu Empório: frete na venda, origem e-commerce e editar a venda

A Agromax tem um e-commerce e, enquanto não há integração, lança os pedidos
à mão no balcão do Empório. O cliente paga produto mais frete; o frete é
cotado pela transportadora, vem discriminado no pedido e é repassado inteiro
a ela. Hoje o balcão não tem lugar para o frete, então o lançador soma o
frete ao total da venda de algum jeito, e o faturamento sai inflado.

Pedido do usuário, com urgência: **discriminar o frete dentro da venda sem
ele contar como faturamento**, marcar a venda como pedido do e-commerce, e
**editar as vendas já lançadas** para separar o frete e corrigir itens. Não
há parte fiscal ainda, então a venda pode trocar de número.

A spec do módulo é `docs/specs/module-39-meu-emporio.md`; as decisões
abaixo entram na tabela dela como **Q244 a Q249**.

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| Q244 | **Frete na venda:** campo opcional "Frete cobrado do cliente" (R$, não negativo) no balcão, ao lado do desconto. Gravado em `freight_amount` da venda. **A venda líquida (`net_amount`) segue sendo só os itens menos o desconto, e é ela o faturamento.** O total que o cliente paga é `net_amount + freight_amount`, e os pagamentos fecham com o frete. | O frete é repasse à transportadora, não receita. Faturamento, Resultado, rateio por faturamento, produtos que mais vendem e relatórios de venda leem `net_amount` e ficam certos sem mexer. |
| Q245 | **O recibo da venda continua um lançamento só**, "Vendas do Empório", no valor `net_amount + freight_amount` (é o que entrou na conta). A tela da venda, a lista e o recibo impresso mostram o frete em linha própria ("dos quais frete"). | Separar em dois lançamentos mexeria em caixa, fiado, cartão, cheque e acordo, entregues há dois dias. Decisão do agente, aceita pelo usuário. |
| Q246 | **Conta a pagar "Frete de entrega"** no valor do frete, ligada à venda (`related_module: emporio`, `related_id` da venda), vencendo no dia da venda, pendente, no A pagar do financeiro do Empório. Cancelar a venda cancela a conta não paga; a paga fica (mesma regra da Q99). Categoria reservada. | A Agromax paga a transportadora depois (decisão do agente: o usuário não respondeu; se a plataforma já retém o frete, a conta é marcada paga ou a criação sai). |
| Q247 | **Resultado da Loja:** linha própria "Frete de entrega (repasse)", fora das vendas e fora da margem: frete recebido (soma de `freight_amount` das vendas concluídas do mês) e frete pago (contas "Frete de entrega" do mês, canceladas de fora). **Só a diferença entra no resultado**, depois das fixas. O frete sai do "Vendeu, Pagou" e de `variable_expenses`. | Tratar o frete pago como despesa pura derrubaria o resultado pelo valor do frete, e o cliente reembolsou esse dinheiro. |
| Q248 | **Origem da venda:** enum `EmporioSaleOrigin` (`balcao`, `ecommerce`), padrão `balcao`. Marcada no balcão, filtro `origin` na lista de vendas, visível na venda e no recibo. Só a marca: nenhum relatório novo. | Com a marca gravada, separar o faturamento do e-commerce depois é leitura, não mudança de dado. |
| Q249 | **Editar venda:** "Editar" abre o balcão preenchido com a venda (cliente, itens, frete, origem, entrega, pagamentos). Salvar chama `editarVendaAction`, que **na mesma transação cancela a antiga e registra a nova** pelas regras de `cancelarVendaAction` e `venderAction`. A antiga ganha `replaced_by_sale_id` e `canceled_reason` "Substituída pela venda nº Y"; a nova ganha `replaces_sale_id`. As travas do cancelamento valem (devolução, fiado pago em parte, acordo, etc.: a edição é recusada com o mesmo código). A nova venda mantém `sold_at`, vendedor e cliente da antiga, salvo se o usuário mudar. | A venda é livro-razão: mexer por dentro em estoque, custo, caixa e "Vendeu, Pagou" é onde o dinheiro desencontra. Cancelar e registrar de novo nasce certo pelas regras que já existem. A troca de número não pesa sem nota fiscal. |

## O que não muda

- Nenhum saldo gravado (invariante 2): o frete recebido é soma de
  `freight_amount`, o pago é soma de lançamentos.
- A taxa de cartão (Q88) continua calculada sobre o valor do pagamento, que
  agora inclui o frete: a adquirente cobra sobre o que passou na máquina.
- Comissão e demais regras do "Vendeu, Pagou" (Q97) continuam sobre
  `net_amount` (`v.net`), sem frete.
- Devolução e troca não mexem no frete: devolvem itens.
- O agente do WhatsApp não ganha intenção nova; `venderAction` aceita
  `freight_amount` e `origin` opcionais e o handler segue passando nada.

## Fora deste documento

- Integração com a plataforma do e-commerce (importar pedidos).
- Relatório de faturamento por origem (a marca permite; fica para pedido).
- Nota fiscal.

## Entrega

Uma entrega, branch `emporio-frete-ecommerce`, sem juiz (decisão do
usuário): migração no Docker, action e rota antes de tela, suíte nova
(`test:m102`) mais `test:all`, isolamento, roteiro de navegador nos dois
sentidos, manual, `/docs/api`, dívidas e handoff. Merge, push na `main`,
migração no Neon e deploy só com autorização na conversa.
