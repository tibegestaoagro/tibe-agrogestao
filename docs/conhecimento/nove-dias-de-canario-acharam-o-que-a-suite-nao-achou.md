---
tipo: licao
data: 2026-09-29
tags: [agente, whatsapp, validacao, canario]
origem: 6213f5b
---

# Nove dias de canário acharam o que a suíte não achou

## O que aconteceu

A Fase 7 do agente pôs quatro telefones reais (o usuário e três contas
internas) na rota de turno, em produção, em 18/09/2026. Todo o programa até ali
tinha passado por avaliação de 337 casos, homologação por subagentes, revisão
independente a cada fase e a suíte inteira verde.

Em 29/09, lendo as conversas reais e uma rodada de roteiro no celular do
usuário, saíram seis defeitos, todos corrigidos no mesmo dia:

1. "quanto temos a pagar nos próximos 100 dias" respondia "nenhuma conta" com
   R$ 90 mil vencendo na janela (a consulta parava no fim do mês);
2. a resposta ecoava a categoria da mensagem ANTERIOR;
3. "bezerros de 8 a 12 meses" era recusado, e o produtor levou oito tentativas
   para lançar um saldo inicial;
4. "bom dia" respondia "Não entendi";
5. compra sem prazo nascia como conta vencendo hoje;
6. o contato nascia com o nome "do João".

O segundo estava escrito como dívida desde 16/09, com a causa exata, sem nunca
ter sido visto acontecer. E a primeira correção do quarto falhou na primeira
mensagem real ("Oi, bom dia"), porque comparava a frase inteira contra uma
lista fechada.

## Por que importa

Nenhum dos seis gravou dado que o produtor não pediu, e por isso nenhum
reprovaria um roteiro que só olha gravação indevida. Mas três deles (1, 5 e 6)
deixavam dinheiro ou cadastro errado em silêncio, e dois (3 e 4) tornavam o
agente inútil para quem não sabe o vocabulário do sistema.

## Como aplicar

- Canário com gente real vem ANTES de promover, não depois. Nove dias de quatro
  pessoas acharam mais que três fases de avaliação sintética.
- Leia a conversa inteira, entrada E saída. A saída é gravada por outra parte
  do código e a primeira versão do `observar-canario.ts` só mostrava a entrada.
- Critério de aprovação que só olha "gravou o que não devia" deixa passar
  resposta errada sobre dinheiro. Leia também o que o agente AFIRMOU.
- Correção de conversa se prova com a frase real que falhou, não com a lista
  que você imaginou.

## Relacionado

- [[a-divida-descreve-o-sintoma-e-a-auditoria-acha-o-irmao]]
- [[a-data-dita-vence-a-palavra-que-quita]]
