# Empório: crédito do franqueado e valores de terceiros na venda (Q300 a Q309)

Reunião com a Agromax em 11/11/2026 (gravação fora do repositório, que é
público). Decisões do usuário em 11/11/2026, depois do plano.

## O que o cliente pediu

- **Franqueado:** "não entra como faturamento, para não gerar um falso lucro,
  mas também não pode entrar no custo, para não gerar um falso custo". "Não
  entra como comissão, não entra como nada." "É crédito. Esse é um crédito do
  cara que depois ele vai vir buscar." Cadastro próprio, "igual vendedor,
  fornecedor", e histórico de quanto acumulou e de quando e como foi pago
  ("você recebeu, está aqui, eu te paguei no dia tal").
- **Frete:** "não pode entrar como faturamento" nem como custo; "senão nos
  relatórios vai bagunçar". A Laíza precisa enxergá-lo no financeiro para
  liquidar.
- **Desconto:** "não pode entrar no faturamento".
- **Impostos:** o usuário vai ver com o contador. Primeiro o controle simples.

## Como está hoje (11/11/2026)

- Frete (Q244 a Q247): fora da venda líquida e do Resultado da Loja; vira conta
  a pagar "Frete de entrega". Mas o recebimento da venda é um lançamento só
  (itens mais frete, Q245), e o Financeiro geral soma esse lançamento como
  receita (`financial-reports.ts`); a conta do frete entra como despesa.
- Franquia: só pela regra do "Vendeu, Pagou" por apresentação (Q292), que gera
  despesa na margem, como comissão. A Agromax ainda não criou a regra.
- Desconto: a venda líquida já é itens menos desconto (Q27).

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q300 | **Cadastro de franqueado** numa aba própria do Empório, ao lado de Fornecedores, simples: **obrigatórios só nome e telefone**; documento e observação opcionais; ativo. Da conta (todas as lojas). Quem edita é quem edita fornecedor | decisão do usuário: não misturar com quem vende para a Agromax, e formulário curto |
| Q301 | **Na venda:** "Franqueado" e "Crédito do franqueado (R$)", opcionais, **digitados** pelo vendedor. Um franqueado por venda | decisão do usuário |
| Q302 | **O crédito é cobrado A MAIS do cliente, como o frete:** o total pago é itens menos desconto, mais frete, mais crédito do franqueado. A venda líquida (o faturamento) não muda | decisão do usuário |
| Q303 | **Fora de tudo o que é resultado:** o crédito não entra no faturamento, no custo, na margem, no "Vendeu, Pagou" nem no rateio. **É interno:** aparece nas telas da venda e do orçamento e nos relatórios, discriminado, mas nunca no que vai para o cliente | pedido do cliente |
| Q308 | **Impresso para o cliente** (orçamento A4, venda A4, cupom e o que mais sair para ele com preço): o crédito some e é **rateado nos itens pelo valor**, para o papel somar o que o cliente paga (produtos de 60 e 40 com crédito de 10 saem a 66 e 44). Os centavos que sobrarem do rateio vão para o último item, para a soma fechar exata | decisão do usuário: "só sairia como valor de produto" |
| Q309 | **O orçamento também leva franqueado e crédito** (opcionais, digitados), o impresso do orçamento já sai rateado, e ao faturar a venda nasce com os dois; editar o orçamento edita os dois | decisão do usuário: o cliente paga o que foi orçado |
| Q304 | **Conta corrente do franqueado:** extrato com os créditos (venda, data, valor) e os pagamentos; saldo = créditos menos pagamentos, **calculado, nunca gravado**. "Pagar crédito" registra valor (até o saldo), data, forma e de onde sai (gaveta do turno ou conta bancária, como o pagamento de compra) e entra no Histórico | invariante 2; o "eu não recebi" se responde pelo extrato |
| Q305 | **Cancelar ou editar a venda** cancela o crédito dela. Crédito já incluído num pagamento não volta sozinho: o saldo do franqueado fica negativo e a tela mostra | o mesmo princípio do frete pago (Q99) |
| Q306 | **Frete mantém a conta a pagar por venda** (o fluxo da Laíza), mas **sai da receita e da despesa no Financeiro geral**. O mesmo vale para o crédito do franqueado: entra e sai do caixa, fora de receita e despesa | decisão do usuário |
| Q307 | **Desconto:** nenhuma regra nova. Conferir tela por tela (Resultado, relatórios, Financeiro geral) que o faturamento é o líquido; se a Agromax mostrar um lugar onde o desconto entra, corrigir ali | já é a regra desde a Q27 |

## Pontos técnicos a resolver na implementação

- **Como tirar o terceiro da receita do Financeiro geral sem quebrar caixa,
  fiado, cartão e acordo.** Caminho preferido: o recebimento da venda continua
  um lançamento só (Q245), e as leituras de receita do Financeiro descontam a
  parte de terceiro das vendas do Empório; o pagamento do frete e do crédito do
  franqueado fica fora da despesa. Separar em dois lançamentos fica como
  alternativa, se a leitura não fechar.
- O crédito do franqueado é parte do total que os pagamentos da venda precisam
  fechar, como o frete.

## Fora

Impostos e nota fiscal (o usuário vê com o contador); cálculo automático do
crédito por regra; o agente do WhatsApp; mais de um franqueado por venda.
