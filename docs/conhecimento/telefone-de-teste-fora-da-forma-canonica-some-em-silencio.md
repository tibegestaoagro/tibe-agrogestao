---
tipo: armadilha
data: 2026-10-13
tags: [agente, whatsapp, testes, telefone]
origem: scripts/m68-agente-turno.test.ts, scripts/avaliacao/fazenda.ts
---

# Telefone de teste fora da forma canônica faz o contato sumir, sem erro nenhum

## O que aconteceu

A busca do agente normaliza o telefone com `toBrazilPhoneDigits`
(`src/lib/phone.ts`) antes de procurar, e o cadastro gravado direto pelo
Prisma numa suíte não passa por ela. Quando as duas formas divergem, o usuário
"não está cadastrado", e a resposta é a frase educada de número desconhecido:
não há exceção, só o caminho errado.

Duas vezes:

- **08/10/2026 (E6):** a bancada de avaliação não media conversa desde 18/09.
  O telefone da fixture não estava na forma `55...`, toda conversa caía em
  número desconhecido, e a nota de intenção continuava parecendo saudável.
- **13/10/2026 (E10.3):** a `m68` montava o telefone como `12` mais 9 dígitos
  do relógio. Quando o primeiro desses dígitos era 9, a normalização virava
  `5512...` e não achava o `12...` gravado. Esse dígito muda a cada ~28 horas,
  então a suíte falhava cerca de um dia em cada dez, e passou verde no
  `test:all` de 08/10 por sorte.

## Por que importa

O sintoma não parece defeito de fixture: parece regressão do agente
("primeiro contato não saúda"), e numa suíte que depende do relógio ele some
no dia seguinte, levando junto a vontade de investigar.

## Como aplicar

Telefone de teste nasce **canônico**: `55` + DDD + `9` + 8 dígitos, como o
`phoneDono` da `m68` (`` `55119${String(stamp).slice(-8)}` ``). Nunca derive o
terceiro dígito do relógio. Só o número de quem deve ser desconhecido pode
ficar em qualquer forma.

## Relacionado

- [[nove-dias-de-canario-acharam-o-que-a-suite-nao-achou]]
