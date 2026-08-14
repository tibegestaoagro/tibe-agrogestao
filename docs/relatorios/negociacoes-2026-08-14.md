# Área Negociações: o que foi entregue

**Tibé (AgroGestão)** &middot; 14 de agosto de 2026 &middot; Pleno Digital

---

## O que muda para quem usa

Antes, quem comprava gado precisava lançar a mesma compra três vezes: os
animais no Rebanho, a despesa no Financeiro e a conta a pagar. Três telas, três
chances de esquecer uma.

Agora o produtor conta o negócio **uma vez**, e o sistema faz o resto.

Pelo WhatsApp, falando:

> **Produtor:** *Comprei 20 bezerros do João por 60 mil para pagar dia 10*
>
> **Tibé:** Comprar 20 bezerros por R$ 60.000,00?
> Fazenda: Da Mata
> Vendedor: João
> Pagamento previsto para 10/08/2026
> Vou somar os animais ao rebanho e lançar no financeiro.
>
> **Produtor:** *Sim*
>
> **Tibé:** ✅ Compra registrada: 20 bezerros por R$ 60.000,00. Os animais já
> estão no rebanho. Registrei como conta a pagar.

Essa conversa acima aconteceu **por áudio, num celular de verdade**, no dia da
entrega. O produtor falou; não digitou.

Pelo painel, a área **Negociações** faz o mesmo com um formulário só, e responde
de cara as duas perguntas que o documento do cliente coloca em primeiro lugar:
**quanto ainda tenho para pagar** e **quanto tenho para receber**.

---

## O que a área faz hoje

- **Comprei gado** e **Vendi gado**, com quantidade, categoria e valor.
- **Parcelamento**: divide em quantas vezes o produtor quiser, com as datas
  calculadas, e recusa quando a soma das parcelas não bate com o valor combinado.
- **Custos adicionais** (frete, comissão, taxa de leilão, carregamento, guia,
  exames): entram como lançamentos próprios, então aparecem no resultado do mês
  e no fluxo de caixa em vez de sumirem dentro do valor.
- **Com quem negociei**: o nome do vendedor ou comprador é cadastrado na hora,
  digitando ou falando, sem exigir CPF, endereço nem dados bancários.
- **Cancelar um negócio**: os animais voltam ao rebanho e as contas em aberto
  saem do financeiro. Se parte dos animais já foi revendida, o cancelamento é
  recusado e o sistema diz quantos restam.
- **Situação de cada negócio**: A pagar, A receber, Vencida, Parcialmente paga,
  Quitada, Recebida ou Cancelada, sempre calculada do que existe, nunca digitada.

---

## As decisões que precisaram ser tomadas

O documento da área foi lido inteiro antes de qualquer linha de código, e cinco
pontos precisavam de decisão antes de programar. Elas estão aqui porque mudam o
que o produtor vê.

### 1. Onde mora a verdade sobre o rebanho e o dinheiro

**A tensão:** o documento pede "registro único", e isso podia significar que a
Negociação passasse a ser a dona dos números.

**A decisão:** a Negociação é um **envelope**. O saldo do rebanho continua sendo
a soma das movimentações, e o dinheiro continua no Financeiro; a negociação
amarra os dois e guarda o que é comercial.

**Por que importa:** "registro único" é uma exigência de **experiência**, não de
armazenamento. Se a Negociação passasse a guardar o próprio número de animais,
existiriam duas verdades sobre o rebanho, e o dia em que elas discordassem
ninguém saberia qual está certa. Do jeito que ficou, a tela de Rebanho e a de
Negociações **não podem** divergir: elas leem a mesma coisa.

### 2. O que acontece quando se cancela um negócio já pago

**A tensão:** cancelar tem que desfazer. Mas o dinheiro já saiu da conta.

**A decisão:** cancelar não bloqueia. A tela pergunta o que aconteceu com o
dinheiro, com três respostas: **continua lançado** (paguei mesmo e não voltou),
**o dinheiro voltou** (lança a devolução com a data de hoje) ou **foi engano**
(o pagamento nunca existiu).

**Por que importa:** cancelar um negócio não des-gasta o dinheiro. Apagar a
despesa faria o mês em que ele saiu fechar como se nada tivesse saído, e o mês
em que voltou como se nada tivesse entrado: dois fechamentos errados em vez de
zero. E resolver isso na mesma tela evita mandar o produtor procurar um botão
em outro lugar.

### 3. "Para pagar dia 10", quando o dia 10 já passou

**A tensão:** se hoje é 13 e o produtor diz "dia 10", ele quer este mês ou o que
vem?

**A decisão:** **sempre o mês corrente**, mesmo já vencido.

**Por que importa:** uma conta com vencimento no dia 10 deste mês, registrada no
dia 13, é uma conta **atrasada**, e o produtor precisa vê-la como atrasada.
Empurrar para o mês seguinte esconderia o atraso e tiraria o lançamento do mês a
que ele pertence, sujando o fechamento dos dois meses.

### 4. Uma frase, duas leituras possíveis

**A tensão:** "comprei 20 bezerros" podia ser uma correção de saldo do rebanho
ou uma compra com dinheiro envolvido. O assistente precisava escolher.

**A decisão:** toda compra e toda venda de gado é um **negócio**. Quando o valor
não vem na frase, o assistente **pergunta**.

**Por que importa:** o documento lista o valor total como informação obrigatória
e diz que a compra gera despesa ou conta a pagar. Registrar 20 cabeças e zero
dinheiro, em silêncio, seria o oposto do pedido. E essa escolha ficou em código,
não na inteligência artificial: o resultado é o mesmo independentemente de como
o assistente entenda a frase.

### 5. O assistente nunca adivinha a categoria

**A tensão:** "novilha" pode ser três faixas de idade diferentes.

**A decisão:** termo ambíguo **interrompe tudo** e vira pergunta.

**Por que importa:** um animal lançado na faixa de idade errada só aparece
meses depois, quando o rebanho não bate. Perguntar custa uma mensagem; adivinhar
custa a confiança no número.

---

## O que foi feito para o número ser confiável

Um negócio mexe em rebanho e dinheiro ao mesmo tempo, então esta entrega passou
por uma revisão fora do comum: **oito rodadas de auditoria independente**, cada
uma feita por um revisor que não tinha participado do desenvolvimento e recebia
apenas o código e o documento do cliente.

Essas rodadas encontraram e corrigiram **seis defeitos que envolviam dinheiro**,
três deles **anteriores a esta entrega** e que já afetavam o sistema:

- O resultado do mês continuava contando lançamentos **cancelados**.
- A consulta de rebanho podia responder "vazio" para quem tem animais, em uma das
  telas do aplicativo.
- Um valor dito como "60 mil" era lido como sessenta reais, e um frete de
  "R$ 2.000" como dois reais.

Todos corrigidos, e cada um deles agora tem um teste automático que impede o
problema de voltar. As verificações desta área passaram de zero para **232**.

---

## O que fica para as próximas etapas

Isto foi a **primeira de quatro entregas** da área. Nada abaixo foi esquecido:
tudo está registrado com a data e o motivo.

| Fica para | O quê |
|---|---|
| Etapa 2 | **Estoque e produtos**: compra, venda, uso, ajuste e estoque mínimo |
| Etapa 3 | **Leilão e feira**: remessa temporária e encerramento com venda parcial |
| Etapa 4 | **Permuta**: troca de animais, produtos, máquina ou dinheiro |

E, dentro da própria área de Negociações, ficaram para a etapa 2:

- Os **filtros da tela** (por período, tipo, fazenda, contato e situação).
- **Peso, arrobas e valor por cabeça**: o documento permite omitir quando o
  produtor informa só o valor total, mas R$/arroba é a língua de quem compra
  gado, então entra como campo opcional.
- **Tela de contatos**, para ver a lista, corrigir um nome e preencher telefone.
  Hoje o contato nasce com o nome, no meio do próprio negócio.
- **Formas de pagamento** (dinheiro, PIX, boleto).

---

## Como começar a usar

**No painel:** menu **Operação → Negociações**, botão *Registrar negócio*.

**Pelo WhatsApp**, falando ou escrevendo, como se fala com uma pessoa:

- *"Comprei 20 bezerros do João por 60 mil para pagar dia 10"*
- *"Vendi 8 bezerros por 32 mil em 4 vezes, com 2 mil de comissão"*
- *"Comprei 10 novilhas"* (o assistente pergunta a idade e o valor)

O assistente **sempre mostra o que vai registrar e espera a confirmação**, de
qualquer valor. E "cancela" cancela em qualquer ponto da conversa.
