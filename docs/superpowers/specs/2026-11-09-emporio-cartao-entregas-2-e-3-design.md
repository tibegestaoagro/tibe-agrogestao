---
tipo: design
data: 2026-11-09
modulo: 39 (Meu Empório)
origem: spec das taxas de cartão (entregas 2 e 3 esboçadas), pesquisa de 09/11 e decisão do usuário de seguir sem esperar a Agromax ("vamos seguir as suas recomendações"); decisões Q259 a Q267
---

# Meu Empório: cartão em dia útil, taxa por parcela e antecipação (entregas 2 e 3)

A entrega 1 (Q250 a Q258, em produção desde 09/11) trouxe adquirente,
bandeira, faixa de parcelas e vigência. Faltam três coisas que mexem no
dinheiro: a parcela cai em **dia corrido** (a Stone paga em dia útil), a taxa
fica **uma por venda** (não por parcela do recebível) e a **antecipação** não
existe (o cancelamento hoje devolve tudo, e a Stone não devolve a taxa de
antecipação já paga).

O usuário decidiu seguir **sem esperar as respostas do setor da Agromax**.
Por isso tudo o que depende do contrato da Stone vira **configuração da
adquirente**, com o padrão que a Stone publica (pesquisa de 09/11, relatório
`reports/Taxas de cartão no Empório.md`, fora do git). Quando o setor
responder, ajusta-se a configuração em Configurações, sem código.

Este documento entra na tabela de `docs/specs/module-39-meu-emporio.md` como
**Q259 a Q267** e fecha, na mesma branch, as dívidas 2.56, 2.57 e quatro
dívidas técnicas (2.37, 2.43, 2.51, 2.59).

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| Q259 | **Calendário de dias úteis bancários nacional:** 1/1, Carnaval (segunda e terça), Sexta-feira Santa, 21/4, 1/5, Corpus Christi, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12; os móveis calculados pela Páscoa. Feriado estadual e municipal ficam fora (dívida). Função pura, sem banco. | É o calendário em que adquirente e banco liquidam; sem ele a projeção marca dinheiro em domingo. |
| Q260 | **Data da parcela:** a 1ª em `sold_at + days` (da linha de taxa), as seguintes a cada 30 dias corridos, como hoje; **depois**, a regra de dia útil da adquirente: `proximo_dia_util` (padrão; cai no sábado, domingo ou feriado vai ao dia útil seguinte) ou `dias_corridos` (como hoje). | É o que a Stone publica (débito em 1 dia útil, crédito 30/60/90); a regra fica configurável porque a pesquisa não confirmou o fim de semana. |
| Q261 | **O recebível ganha `fee_amount`** (a taxa da transação da parcela: bruto menos líquido, gravada) e **`effective_on` e `effective_net`**: a data e o líquido que de fato caem na conta. Nascem iguais a `expected_on` e `net_amount`; só a antecipação os muda. **Todo leitor** de "já caiu" e "a receber" (saldo da conta, a receber do cartão, extrato, projeção, relatórios do dinheiro, carimbo de conciliação, cancelamento) passa a ler os efetivos. A migração preenche os três nos recebíveis existentes. | Uma troca de coluna em cada leitor, em vez de "se antecipada então" espalhado em dez lugares; o previsto original fica guardado para a conciliação. Não é saldo gravado (invariante 2): é o fato de quando e quanto a parcela caiu. |
| Q262 | **Antecipação pontual** (`CardAnticipation`): quem cuida do dinheiro escolhe parcelas **futuras, não antecipadas, não canceladas, da mesma conta bancária** no a receber do cartão, informa a data da operação e o **líquido que a adquirente pagou**. Custo = soma dos líquidos efetivos das parcelas menos o recebido (zero ou mais, menor que a soma), rateado pelas parcelas na proporção do líquido (centavos; o resto na última). Cada parcela ganha `effective_on` = data da operação, `effective_net` = líquido menos a sua parte, `anticipation_fee` e `anticipation_id`. O custo vira despesa **"Antecipação de recebíveis"**, paga na data da operação, uma por loja das parcelas, por `createLinkedEntry`. **Desfazer** é permitido enquanto nenhuma parcela da operação foi carimbada na conciliação: as parcelas voltam ao previsto e a despesa é cancelada. Permissão: `dinheiro` ou `gestor_da_loja` das lojas das parcelas. | É o que a Agromax faz hoje (resposta 2 do usuário); informar o líquido recebido evita adivinhar a fórmula da Stone, que não é publicada; desfazer cobre o erro de digitação. |
| Q263 | **Antecipação automática por configuração da adquirente:** `auto_anticipation_enabled`, `auto_anticipation_pct_month` (% ao mês), `auto_anticipation_business_days` (em quantos dias úteis cai, padrão 1) e `auto_anticipation_since` (data a partir da qual vale). Venda **no crédito** (à vista ou parcelado; débito não) com `sold_at` a partir de `since` nasce antecipada: cada parcela com `effective_on` = dia da venda mais N dias úteis e custo **estimado** = líquido × pct / 100 × (dias corridos entre `effective_on` e `expected_on`) / 30 (simples, pro rata); a despesa "Antecipação de recebíveis" nasce paga com a venda. Mudar a configuração vale só para vendas futuras (o custo fica gravado na parcela). | Resposta 2 do usuário: se a Agromax ligar a automática, a troca é por configuração; na Stone a automática só vale para vendas depois de ativada; a fórmula exata não é publicada, então a estimativa é marcada como tal e a conciliação (entrega 4) corrige. |
| Q264 | **Cancelamento coerente com a Stone:** parâmetro da adquirente `refunds_mdr_on_cancel` (padrão sim): sim, a despesa "Taxas de cartão" da venda é cancelada, como hoje; não, ela fica. **O custo de antecipação nunca volta:** a despesa "Antecipação de recebíveis" fica. Parcela que já caiu (pela data efetiva, antecipada ou não) é estornada pelo **`effective_net`**; parcela futura não antecipada é cancelada como hoje. | Fonte da pesquisa (Stone, como cancelar venda): a taxa de transação volta, a de antecipação não. |
| Q265 | **Resultado da Loja:** linha **"Antecipação de recebíveis"** fora da margem (despesa financeira), depois das fixas e do frete: `result = margin - losses - fixed_expenses + freight.difference - anticipation_costs`. A taxa da transação continua em "Vendeu, Pagou" (dentro da margem). | Separação recomendada pela adquirente e pela contabilidade gerencial: a taxa da venda é custo de vender, a antecipação é custo de dinheiro. |
| Q266 | **Telas:** Configurações, adquirente ganha "Regra de dia útil", "Devolve a taxa no cancelamento" e o bloco "Antecipação automática" (ligada, % ao mês, dias úteis, a partir de). Financeiro, a receber do cartão: marcar parcelas e "Antecipar" (data, líquido recebido; mostra custo em R$ e o % efetivo ao mês); parcelas antecipadas mostram a data efetiva e "antecipada em"; a operação tem "Desfazer". Balcão: a prévia do cartão mostra a data efetiva e o líquido estimado quando a automática vale. | Tudo o que é contrato fica editável por quem cuida do dinheiro. |
| Q267 | **Dívidas técnicas fechadas junto:** 2.37 (a checagem de atraso e limite do fiado roda de novo dentro da transação serializável da venda, para duas vendas simultâneas não furarem o limite); 2.43 (os pedidos decididos são filtrados e paginados no banco); 2.51 (o a pagar por vencimento avisa na tela quando o teto corta e o teto acompanha o da lista, 5.000); 2.59 (sobreposição de taxa checada em transação serializável; edição e arquivamento da adquirente numa transação; o detalhe da venda mostra a taxa fixa; CHECK no banco para a faixa de parcelas; a recusa de adquirente aparece mesmo com uma só adquirente). | São riscos de dinheiro ou de tela que existem hoje e não dependem de ninguém. |

## O que não muda

- A taxa da transação (MDR) continua uma despesa "Taxas de cartão" por venda,
  paga, ligada à venda; `fee_amount` da parcela é a parte dela, para listar e
  conciliar.
- A resolução da taxa (Q252) e o snapshot na venda (Q254) seguem iguais.
- Nada é recalculado nas vendas antigas: as parcelas existentes ganham
  `fee_amount` e os efetivos iguais aos previstos, e continuam caindo nas datas
  em que foram gravadas (sem reaplicar o dia útil).
- O agente do WhatsApp não vende no cartão.

## Fora deste documento

- Entrega 4 (extrato da Stone e conciliação automática): depende de arquivo
  real.
- Feriado estadual e municipal; antecipação com fórmula composta; antecipação
  automática parcial (só algumas bandeiras).
- Indicador de custo efetivo do cartão (fica como dívida).

## Entrega

Uma branch, `emporio-cartao-2-3-dividas`: migração no Docker (com o
preenchimento dos recebíveis existentes), action e rota antes de tela, suíte
nova (`test:m104`) mais `test:all`, isolamento, roteiro de navegador nos dois
sentidos, manual, `/docs/api`, dívidas e handoff. Implementação e revisão em
Sonnet, sem juiz (preferência do usuário). Merge, push na `main`, migração no
Neon e deploy só com autorização na conversa.
