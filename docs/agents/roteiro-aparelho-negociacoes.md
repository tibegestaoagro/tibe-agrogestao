# Teste no aparelho: Negociações (Módulo 31, missão 1)

Roteiro pronto para o Dilton rodar do celular, depois do deploy. É o único
pedaço que o banco de provas não cobre: entrega de verdade pela Evolution,
áudio e foto de recibo.

**Antes de começar:** confirme comigo que o deploy foi feito E que a intenção
`registrar_negocio_gado` já está no prompt do classificador. Sem as duas, o
agente responde "não entendi" e o teste não significa nada.

Mande uma mensagem por vez e espere a resposta (leva ~20 a 30 segundos, por
causa do buffer de 12s mais as chamadas de LLM). Se quiser abandonar um bloco
no meio, mande "cancela".

---

## Bloco 1: o exemplo do cliente, inteiro

O §18.1 do documento é a régua desta missão. É esta frase que precisa
funcionar numa tacada.

| # | Mande | Deve responder |
|---|---|---|
| 1.1 | `Comprei 20 bezerros do João por 60 mil para pagar dia 10` | Um resumo com: 20 bezerros, R$ 60.000,00, a fazenda, **Vendedor: João** e **pagamento previsto para 10** do mês corrente |
| 1.2 | `sim` | Confirmação de que registrou, dizendo que os animais entraram no rebanho |
| 1.3 | `Quantos animais eu tenho?` | O saldo com os 20 bezerros somados |

**O que conferir no painel depois:** em Negociações, a linha deve mostrar
"Comprei gado", 20 Bezerro - 0 a 7 meses, R$ 60.000,00, contato João, e
situação **Vencida** (porque dia 10 já passou). Em Financeiro, uma conta a
pagar de R$ 60.000 vencendo dia 10.

**Por que dia 10 fica vencido e não vai para o mês que vem:** decisão sua, de
13/08. Conta do mês corrente é lançada no mês corrente, mesmo atrasada, senão
o atraso some do painel.

---

## Bloco 2: as três travas de conversa

Cada uma destas já falhou em produção no Módulo 30 e custou uma rodada de
teste. São as que mais importam.

| # | Mande | Deve responder |
|---|---|---|
| 2.1 | `Vendi 5 bezerros por 20 mil` | Pede confirmação, mostrando o que vai gravar |
| 2.2 | `cancela` | "Tudo bem, não registrei nada." Nunca a mesma pergunta de novo |
| 2.3 | `Quantos animais eu tenho?` | O MESMO saldo do 1.3: o cancelamento não pode ter mexido em nada |
| 2.4 | `sim` | "Não tenho nenhum negócio esperando confirmação." Um "sim" solto não pode escrever |

---

## Bloco 3: conversa picada, que é como se fala de verdade

O produtor não manda tudo numa frase. O teste é se o assistente não perde o
que já foi dito.

| # | Mande | Deve responder |
|---|---|---|
| 3.1 | `Comprei 10 novilhas` | Pergunta a idade, porque "novilha" serve a mais de uma faixa. **Não pode chutar** |
| 3.2 | `de 13 a 24 meses` | Pergunta o valor, sem ter esquecido as 10 novilhas |
| 3.3 | `45 mil` | Resumo com 10 fêmeas de 13 a 24 meses e R$ 45.000,00 |
| 3.4 | `sim` | Registra |

---

## Bloco 4: parcelamento e custos (§14 e §15)

| # | Mande | Deve responder |
|---|---|---|
| 4.1 | `Vendi 8 bezerros por 32 mil em 4 vezes, com 2 mil de comissão` | Resumo com as 4 parcelas de R$ 8.000, a comissão e o **líquido de R$ 30.000** |
| 4.2 | `sim` | Registra, dizendo que lançou 4 parcelas |

**No painel:** 4 contas a receber vencendo um mês após o outro, mais uma
despesa de R$ 2.000 de comissão. Em "Ainda tenho a receber", os R$ 32.000
devem aparecer.

---

## Bloco 5: o que o sistema NÃO pode deixar passar

| # | Mande | Deve responder |
|---|---|---|
| 5.1 | `Vendi 9999 bezerros por 100 mil` | Recusa dizendo quantos existem de verdade. **Não pode gravar** |
| 5.2 | `Comprei umas vacas` | Pergunta a quantidade e o valor, sem inventar |
| 5.3 | `Comprei 5 bezerros por 10 mil no dia trinta e um de fevereiro` | Pergunta a data de novo em vez de gravar uma data errada calada |

---

## Bloco 6: áudio e foto (o que só o aparelho testa)

| # | Faça | Deve responder |
|---|---|---|
| 6.1 | Mande um **áudio** dizendo "comprei 12 bezerros por 30 mil" | O mesmo resumo de sempre. O Tibé não sabe que veio de voz |
| 6.2 | `sim` | Registra |
| 6.3 | Mande uma **foto de uma nota fiscal** qualquer | Deve extrair valor e categoria e pedir confirmação |

---

## Bloco 7: cancelar no painel, com dinheiro já pago

Este é o único que precisa do navegador, não do WhatsApp. É a decisão que
você aprovou hoje.

1. Em Negociações, registre uma compra **marcando "Sim" em "o pagamento já foi
   feito?"**.
2. Clique em **Cancelar** nessa linha.
3. A tela deve perguntar **"E o dinheiro que já foi pago?"**, com três opções.
4. Escolha **"O dinheiro voltou"** e confirme.
5. **Confira no Financeiro:** a despesa original continua lá, paga, e existe um
   lançamento novo de **devolução**, com a data de hoje.

O ponto: o dinheiro saiu num mês e voltou em outro, e os dois fechamentos
precisam contar a história como ela aconteceu. Apagar a despesa faria os dois
meses fecharem errado.

---

## O que me mandar

Não precisa de print de tudo. Me diga só **onde divergiu** do esperado, com a
frase que você mandou e a resposta que veio. O resto eu confiro sozinho pelo
banco de provas.
