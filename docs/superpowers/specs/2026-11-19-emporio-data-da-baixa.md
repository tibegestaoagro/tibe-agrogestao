# Empório: a data da baixa espelha o extrato do banco (Q370 a Q373)

Origem: reunião de 19/11/2026 com a Laiza (Agromax) e a Cláudia, financeiro da
Da Mata (gravação fora do git, em `docs/financeiro-19112026/`). A Cláudia usa
hoje outro ERP, em que todo recebimento vira conta a receber e ela dá baixa
em cada um escolhendo a data, para o extrato do sistema bater com o do banco
("se o dinheiro caiu hoje e o faturamento só sai amanhã, na baixa eu ponho a
data de ontem"). A Laiza disse que não começa a faturar pelo Tibé enquanto o
financeiro não lidar com isso.

## O que o Tibé faz hoje

| baixa | data gravada | valor |
|---|---|---|
| PIX ou transferência da venda | a da venda (a tela usa agora) | o da venda |
| fiado recebido | agora | o digitado (parcial vale) |
| boleto pago (`pagarBoletoAction`) | passada aceita, futura recusada | o do boleto, fixo |
| cheque depositado e compensado | agora | o do cheque |
| parcela do cartão | `effective_on` pela regra de dia útil | conferida pelo Financeiro |

O saldo da conta (`saldosDasContas`) soma todos os movimentos, sem olhar a
data; só a parcela do cartão é filtrada por `effective_on <= hoje`.

## Decisões do usuário (19/11/2026)

| # | decisão | por quê |
|---|---|---|
| Q370 | A data da baixa pode ser **retroativa e futura** | "no final de semana as minhas liquidações caem na segunda-feira" |
| Q371 | Até **31 dias** para trás. Mudam a data só **Financeiro, Gerente geral e Dono**; Vendedor e Caixa seguem com a data de hoje | erro de digitação não joga a baixa para meses atrás; a venda do balcão continua amarrada |
| Q372 | O PIX e a transferência da venda **continuam caindo na conta na hora**; o Financeiro **corrige a data da linha no extrato**, com Histórico | sugestão da Laiza; a venda não muda |
| Q373 | Boleto pago com atraso ou desconto: digita-se **o valor pago**; o boleto guarda o original e a diferença vira **Juros recebidos** ou **Desconto concedido** | "é o valor pago, só"; o relatório não perde quanto entrou de juros |

Leitura do coordenador, a confirmar: o limite para a frente também é de 31
dias, simétrico ao de trás.

## As frentes, na ordem

1. **O saldo respeita a data.** O saldo da conta passa a somar só os movimentos
   com data até hoje (Brasília). Movimento com data futura aparece no extrato
   como "Agendado", fora do saldo corrido, e entra na Projeção na semana dele;
   quando a data chega, entra no saldo sozinho (o saldo nunca é gravado). Toda
   leitura de saldo da conta segue a mesma regra (posição de caixa, extrato,
   checagem de saldo do pagamento, relatórios). A gaveta e a gerência não
   recebem data futura nem retroativa: dinheiro em espécie é sempre de hoje.
   Primeiro, porque as frentes 2 e 3 dependem dela.
2. **Data da baixa nas telas de receber.** Campo "Data em que caiu" (padrão hoje,
   de hoje menos 31 a hoje mais 31 dias) no fiado recebido em conta, no boleto
   pago, no cheque depositado e no compensado. Só aparece e só é aceito para
   Financeiro, Gerente geral e Dono; para os outros o servidor recusa data
   diferente de hoje. A recusa fora da janela diz a janela.
3. **Corrigir a data de uma linha da conta no extrato.** Ação "Corrigir a data"
   na linha de movimento da conta (não na gaveta, não na parcela do cartão), só
   sem carimbo, dentro da mesma janela, para os mesmos papéis. Histórico
   `financeiro.data_corrigida` com a data antiga e a nova. Cobre o PIX da venda
   que caiu em outro dia (Q372).
4. **Boleto com valor pago.** `pagarBoletoAction` aceita o valor pago (maior que
   zero). A entrada na conta é o valor pago; a diferença vira Juros recebidos
   (a mais) ou Desconto concedido (a menos) no Resultado, e o boleto mostra o
   original e o pago. **Pede migração** (valor pago no boleto): aplicar no Neon
   antes do push.

Cada frente: action, rota, tela, suíte escrita desta spec, roteiro de navegador
visto falhar, juiz e merge com autorização do usuário.

## Fora desta frente

- A data em que a parcela do cartão caiu de fato (a conferência confirma o
  valor; a data segue a regra de dia útil).
- A baixa parcial de boleto que gera outro título com o resto ("foi parcelado
  R$ X no título N", visto na tela do outro ERP e não discutido).
- Juros no fiado (Q218 segue valendo: sem juros).
- O PIX da venda nascer "a confirmar" (descartado na Q372).

## Validação com o cliente

Depois do deploy, a Laiza e a Cláudia simulam uma venda com PIX que caiu na
véspera, um boleto pago com juros e um cheque compensado, conferem o extrato
contra o do banco e mandam print com áudio do que não bater (combinado na
reunião).
