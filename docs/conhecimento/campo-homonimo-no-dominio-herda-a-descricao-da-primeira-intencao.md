---
tipo: armadilha
data: 2026-09-16
tags: [agente-whatsapp, llm, classificacao, schema]
origem: src/lib/agente/prompts.ts
---

# Campo com o mesmo nome em duas intenções ficava com a descrição de uma delas, e o modelo lia a errada

## O que aconteceu

O schema estrito que o modelo recebe na etapa de extração é montado por domínio:
os campos de todas as intenções do domínio viram um objeto só. Quando duas
intenções do mesmo domínio tinham um campo com o **mesmo nome**, a montagem
ficava com a descrição da primeira, e é essa que o modelo lê para preencher.

Dois casos medidos na Fase 3:

- `financeiro.tipo` valia "receita quando o dinheiro entrou", e `gerar_relatorio`
  também tem `tipo` (a área do relatório). Resultado: o relatório voltava **sem
  área em 6 de 6 medições**, com os seis modelos.
- `servicos.quem` valia "quem trabalhou", e as intenções de andamento usam
  `quem` para o **cliente**. As quatro perdiam o cliente.

A correção foi juntar as descrições diferentes, marcando a intenção de cada uma.

## Por que importa

O sintoma é "o modelo não preenche esse campo", que parece limitação do modelo e
some numa tabela de acerto por intenção. A causa é o texto que o próprio código
gerou, e vale para qualquer modelo.

## Como aplicar

- Ao gerar prompt ou schema a partir de um registro, conferir colisão de nome
  entre as entradas juntadas. Se duas descrições diferem, as duas precisam
  aparecer, com o dono de cada uma.
- Campo que o modelo "nunca preenche" merece um olhar no texto que ele recebeu
  antes de virar regra nova no prompt.

## Relacionado

- [[a-etapa-de-dominio-decide-o-que-a-extracao-pode-responder]]
- [[record-string-e-onde-o-enum-cresce-sem-avisar]]
