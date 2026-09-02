---
tipo: licao
data: 2026-08-31
tags: [processo, teste, qualidade]
origem: docs/agents/current-handoff.md
---

# Teste que passa antes E depois da correção não prova nada

## O que aconteceu

Padrão observado várias vezes neste projeto: um defeito é corrigido, uma suíte é
acrescentada junto, a suíte fica verde, e ninguém percebe que ela **já ficaria
verde com o bug presente**. O teste não cobre o caso que discrimina.

## Por que importa

Um teste que não distingue o estado com bug do estado sem bug é documentação
disfarçada de prova. Ele dá a sensação de cobertura sem a cobertura, o que é
pior que não ter teste nenhum: ninguém volta a olhar para aquele caminho.

**O caso que discrimina costuma ser o da ponta que FALTA**, não o do caminho
feliz que já funcionava. É a entrada vazia, o valor no limite, o campo ausente,
o segundo item, a ordem invertida.

## Como aplicar

Ao escrever teste para um defeito corrigido:

1. **Reverta a correção mentalmente** (ou de verdade, com `git stash`).
2. Rode o teste novo. **Ele tem que reprovar.**
3. Reponha a correção. Ele passa.

É o mesmo raciocínio de [[trava-so-vale-depois-de-voce-a-ver-falhar]], aplicado
ao teste em vez da trava.

E é por isso que, no processo de ondas deste projeto, quem escreve a suíte
**não lê a implementação**: um teste escrito a partir da solução herda as
suposições dela, e a ponta que falta é justamente a que o implementador não
pensou.

## Acrescentado em 2026-09-02: cobre o NÚMERO, não a direção

A fase 33.2 deu um caso concreto do que separa a asserção que discrimina da que
não discrimina, e ele cabe numa regra curta: **afirme o valor exato, nunca "o
número mudou" ou "diminuiu".**

O caso: o custo de um lote de confinamento passou a somar os serviços amarrados
a ele. O teste escrito foi

```ts
check("cancelar o serviço deixa no lote só o que já tinha sido pago",
  custo === 400);
```

e ele reprovou, expondo um defeito real: a consulta filtrava
`canceled_at: null`, então cancelar um serviço fazia **sumir do custo do lote o
dinheiro que já tinha sido pago**. Um tratorista que recebeu R$ 400 e não voltou
custou R$ 400 ao lote, e o filtro apagava isso.

⚠️ **A versão fraca teria passado.** `check("o custo diminui após cancelar",
custoDepois < custoAntes)` fica verde tanto com 400 quanto com 0. A direção
estava certa; o valor é que mentia, e mentia **para menos**, que é a direção que
ninguém audita, porque um número menor parece conservador.

**Como aplicar:** toda vez que a asserção for sobre um valor calculado, escreva
o número que você espera ver e por quê. Se não souber dizer qual é, o teste não
está pronto: você ainda não decidiu qual é o comportamento certo.

## Relacionado

- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[copia-repetida-nao-quer-dizer-copia-identica]]
