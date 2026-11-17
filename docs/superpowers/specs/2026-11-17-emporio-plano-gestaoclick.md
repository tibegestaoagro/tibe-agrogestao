# Empório: plano das ideias da reunião de 09/11 e do GestãoClick (Q341 a Q344)

Origem: a reunião de 09/11/2026 com a Central do Milho e a Agromax, em que o
GestãoClick (ERP que a Central do Milho usa) foi mostrado, e os tutoriais do
canal do GestãoClick no YouTube. A gravação, a transcrição, as telas e a
análise completa ficam em `docs/financeiro-reuniao/`, **fora do git** (mostram
nomes de clientes reais) e só no desktop.

O que o cliente pediu, nas palavras dele: a apresentação "bem resumida, bem
simples", com a informação "amarrada" (abre a venda, vai ao cliente, vê as
vendas dele, volta). Não as funções do GestãoClick: "não é nada que tem que ser
espelhado nele".

## Decisões do usuário (17/11/2026)

| # | decisão | por quê |
|---|---|---|
| Q341 | Entram neste ciclo as frentes **A** (informação amarrada), **B** (conferir o cartão), **C** (cheque em duas etapas), **D** (balcão rápido), **G** (importações) e **H** (curva ABC). Ficam fora: **E** (PIX com QR) e **F** (comissão por vendedor, "a Agromax ainda está definindo como vai ser") | escolha do usuário entre as frentes propostas |
| Q342 | **Conferir o cartão manualmente:** a parcela fica "a conferir" até alguém informar o valor que caiu; a diferença vira ajuste de taxa; "atrasada" quando a data prevista passa sem conferência; dá para desfazer | ponte até o extrato da Stone (dívida 2.58); quando ele vier, o mesmo estado passa a ser preenchido sozinho |
| Q343 | **Cheque em duas etapas:** na venda são obrigatórios o valor e o nome, que vem do cliente da venda; uma opção **"cheque de terceiros"** libera digitar outro nome. Número, banco e bom para passam a ser completados pelo financeiro, e o cheque incompleto aparece destacado | proposta da Laiza na reunião: quem vende nem sempre é quem recebe o cheque, e cheques chegam em nome de outras pessoas |
| Q344 | **Comissão por vendedor fica fora** até a Agromax definir a regra | decisão do usuário |

A Q343 é a leitura da resposta do usuário ("valor e nome atrelado à compra e
uma opção de cheque de terceiros") e é confirmada na spec da frente C.

## As frentes, na ordem

| ordem | frente | o que entrega | migração | depende de |
|---|---|---|---|---|
| 1 | **A. Informação amarrada** | cliente e nº da venda viram link em toda lista do Empório; descrição "Venda nº X (1/2)" nas contas; filtro de período único (Hoje, Esta semana, Este mês, Mês passado, Próximo mês, Todo o período, Escolher); cartões que filtram no A receber e no A pagar; ficha do cliente com vencido, a vencer, pago e em aberto, mais a lista de recebimentos | não | nada |
| 2 | **G1. Planilha de produtos e clientes** (fecha a dívida 2.18) | importação com conferência linha a linha antes de gravar | não ou pouca | planilha real exportada do GestãoClick |
| 3 | **B. Conferir o cartão** (Q342) | estados a conferir, conferida e atrasada no Cartões a receber, com o valor real e o ajuste | sim | nada |
| 4 | **C. Cheque em duas etapas** (Q343) | campos opcionais na venda, "cheque de terceiros", completar no financeiro | sim | nada |
| 5 | **D. Balcão rápido** | atalhos de teclado com legenda no rodapé; código de barras por apresentação com leitor; depois etiqueta de prateleira | sim (barras) | nada |
| 6 | **G2. XML da nota do fornecedor** (dívida 2.34) | casar item da nota com produto e apresentação, conversão de unidade, custo | pouca | XML real de fornecedor da Agromax |
| 7 | **H. Curva ABC** | produtos e clientes, por loja e período, no Relatórios | não | nada |

Cada frente tem branch própria, spec curta com as ambiguidades confirmadas,
action, depois rota, depois tela, suíte escrita da spec, roteiro de navegador
provado nos dois sentidos, juiz e merge com autorização do usuário.

## O que não copiar do GestãoClick

Situações financeiras configuráveis, plano de contas e centro de custo livres,
permissão por grupo com cadeado individual, caixa principal único e a venda em
espera que se perde ao trocar de navegador (o orçamento do Tibé faz o papel).

## Pendências fora do código

- O usuário: exportar do GestãoClick a planilha de produtos e a de clientes
  (G1) e conseguir um XML de nota de fornecedor da Agromax (G2).
- A Agromax: cadastrar Stone, Mercado Pago e Cielo com as taxas; mandar o
  arquivo do extrato da Stone (dívida 2.58).
- Decidido na reunião e registrado aqui: o vendedor não vê o líquido do
  cartão; só Financeiro, Gerente geral e Dono (o item que restava da 2.63).
