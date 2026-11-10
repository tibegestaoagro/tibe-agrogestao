---
tipo: design
data: 2026-11-10
modulo: 39 (Meu Empório)
origem: pedido de Dilton para adicionar contas a pagar avulsas em Despesas
---

# Meu Empório: conta a pagar avulsa

## Objetivo

Em `/emporio/despesas`, a seção Contas a pagar terá o botão `Adicionar conta`.
Ele cadastra uma obrigação avulsa que não nasceu de compra, venda, frete,
despesa fixa ou regra do Vendeu, Pagou. A criação não altera o Resultado da
Loja nesta entrega.

## Campos e comportamento

- Loja obrigatória. O Gestor escolhe uma das lojas vinculadas; Dono, Gerente
  geral e Financeiro podem escolher qualquer loja acessível. Não há conta
  avulsa sem loja.
- Descrição obrigatória, valor positivo em reais e vencimento obrigatório.
- Destinatário opcional: fornecedor cadastrado no Empório ou `Outros` com nome
  livre obrigatório quando essa opção é escolhida. Cliente e crédito na loja
  ficam fora desta entrega.
- Status inicial: `Pendente` ou `Paga`. Para `Paga`, o formulário exige data
  do pagamento e origem do dinheiro. Pela gaveta, exige turno aberto da loja;
  pela conta bancária, usa uma conta acessível. O pagamento cria
  `FinancialPayment` e `CashMovement` com a mesma regra das demais contas.
  Saldo insuficiente é recusado. A alçada de Q227 continua valendo: quando
  requer aprovação, a conta nasce pendente e o pedido de pagamento fica
  pendente; a tela informa isso claramente.
- Uma conta pendente entra na lista, no a pagar por vencimento e na projeção.
  Uma conta paga fica no histórico financeiro, sem aparecer na lista de
  pendentes. O vínculo de fornecedor é gravado em
  `FinancialEntry.emporio_supplier_id`; o nome de `Outros` é texto da conta,
  sem criar fornecedor.
- Corrigir valor, adiar, cancelar e pagar seguem as permissões e recusas das
  contas atuais. A conta paga não pode ter o valor alterado nem ser cancelada
  como pendente. Toda escrita registra o Histórico do Empório.

## Modelo e integração

`FinancialEntry` continua sendo o registro da obrigação. Uma marca explícita
`emporio_manual` (padrão falso) distingue a origem avulsa, inclusive se o
texto ou a categoria mudar. A descrição e o nome livre de `Outros` ganham
campos próprios, anuláveis para os registros antigos. Não há backfill. A
migração é preparada e aplicada somente no Postgres local durante o trabalho;
aplicar no Neon exige autorização específica do usuário.

`createLinkedEntry` cria o lançamento pendente. O caminho de criação paga
reutiliza a execução de pagamento do Empório, dentro de transação
serializável, para não deixar uma conta nova pendente se o pagamento falhar.
Quando a alçada mandar pedir aprovação, criação da conta e do pedido acontecem
na mesma transação. Actions em `src/lib/actions/`; rota fina em
`POST /api/v1/emporio/payables`; formulário usa o kit em `src/components/ui/`.
O GET, a busca por id, a view e os relatórios passam a reconhecer a marca
explícita. A rota nova entra em `/docs/api`.

## Fora do escopo

Não há parcelamento, recorrência, vínculo com venda, saldo de crédito do
cliente, pagamento parcial, alteração do Resultado da Loja ou conta sem loja.
Não se altera o Financeiro da fazenda nem o fluxo do n8n.

## Prova

Suíte com dois tenants e duas lojas: cadastro pendente e pago, fornecedor e
`Outros`, permissão do Gestor, pagamento pela gaveta e conta, saldo
insuficiente, alçada, listagem, correção, adiamento, cancelamento, relatórios
e ausência de efeito no Resultado. Provar os casos críticos nos dois sentidos,
rodar isolamento, `check`, `tsc`, `lint`, suíte completa e build com banco e
Redis locais. Conferir formulário e recusas no navegador local.
