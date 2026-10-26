---
tipo: licao
data: 2026-10-19
tags: [validacao, aparelho, roteiro, producao]
---

# O roteiro do aparelho confere a produção antes de sair, ou o primeiro passo testa o vazio

## O que aconteceu

Em 16/10 o roteiro da dívida 5.9 mandava o usuário dizer, de um telefone do
canário, "no leilão vendi 12 por 60 mil e voltaram 8". A resposta foi "você
não tem nenhuma remessa aberta em leilão ou evento agora", e estava certa: a
Da Mata nunca teve remessa. O teste gastou uma rodada no aparelho sem tocar no
código novo. Uma leitura de produção, feita só depois, mostrou o que havia:
23 bezerros e 40 fêmeas de 13 a 24 meses, nenhuma remessa. O roteiro trocado
para a permuta, que usa esse saldo, rodou e achou dois defeitos reais.

Em 26/10 a mesma leitura, feita ANTES, mostrou que a Da Mata não tem nenhum
produto no estoque: o roteiro do estoque começa obrigatoriamente pelo bloco 0
(cadastro no painel).

## Por que importa

O teste no aparelho é o recurso mais caro deste projeto: depende do usuário,
de um telefone do canário e de tempo dele. Um passo que esbarra em dado que não
existe não prova nada e ainda parece defeito. E o tenant do canário é real (a
Da Mata), então o dado de teste não pode ser criado à vontade: abrir uma
remessa só para testar move animais de verdade.

## Como aplicar

Antes de entregar um roteiro de aparelho, leia a produção (leitura é livre):
o que o tenant do canário tem de saldo, cadastro e pedido aberto para a frase
do roteiro funcionar. Um script `scripts/_sonda-*.ts` com `dotenv/config` e só
SELECT, apagado depois. Monte as frases com o que existe (categoria com saldo,
produto cadastrado) e diga ao usuário, antes, quais passos gravam de verdade e
como desfazer.

## Relacionado

- [[deduzir-producao-pela-maquina-local]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[nove-dias-de-canario-acharam-o-que-a-suite-nao-achou]]
