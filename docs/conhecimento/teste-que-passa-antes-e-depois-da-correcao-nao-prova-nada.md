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

## Relacionado

- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
