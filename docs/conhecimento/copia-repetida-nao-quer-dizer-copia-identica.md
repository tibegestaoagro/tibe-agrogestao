---
tipo: licao
data: 2026-09-02
tags: [refatoracao, whatsapp, redis, divida, mao-de-obra]
origem: 390d0fa
---

# Cópia repetida não quer dizer cópia idêntica: extraia com diff, não de memória

## O que aconteceu

A dívida 3.2 mandava extrair um store genérico das SETE cópias do mecanismo de
pendência do WhatsApp (`herd`, `negotiation`, `stock`, `event`, `barter`,
`leite`, `confinamento`): cerca de 90 linhas de Redis cada uma, com o prefixo de
chave trocado. A nota original dizia, e estava certa, que "nenhum tem lógica
própria além do mapa de atalhos de campo".

**Estava errada em um ponto, e o ponto valia dinheiro.** Ao comparar os sete
antes de escrever a versão única:

```
herd:         aceita numero = NAO
negotiation:  aceita numero = SIM
event:        aceita numero = SIM
barter:       aceita numero = SIM
leite:        aceita numero = SIM
confinamento: aceita numero = SIM
stock:        aceita numero = NAO
```

`aplicarResposta` em `herd` e `stock` recusa um número como resposta do
produtor; nos outros cinco, `typeof bruto === "number"` conta. Cinco contra
dois, num arquivo que ninguém lê inteiro: a extração natural teria uniformizado
no comportamento da maioria, e ninguém notaria.

A diferença virou a opção `aceitaNumero` em
`src/lib/actions/pending-store.ts`, com o porquê escrito, e um caso na suíte
`m56` que reprova se ela sumir.

## Por que importa

**Nenhum teste teria pego.** As suítes dos sete domínios ficaram verdes antes e
depois, porque nenhuma cobria "o classificador mandou número onde o campo é
texto". A uniformização entraria com "0 falhas" em seis suítes e mudaria o
comportamento do agente no curral.

E a mudança seria invisível na revisão: o diff da extração é enorme por
natureza (sete arquivos encolhendo de 90 para 40 linhas), e uma condição a menos
dentro dele não chama atenção de ninguém.

⚠️ **Cinco iguais e dois diferentes é o pior caso possível**, porque a maioria
parece o padrão e a minoria parece descuido. Pode ser descuido mesmo; pode ser
uma correção que alguém fez num defeito real e não propagou. Quem extrai não
tem como saber, e **a diferença entre as duas leituras é uma decisão de
produto**, não de refatoração.

## Como aplicar

- **Antes de extrair N cópias, compare as N.** Um `grep -c` de cada condição
  suspeita, uma linha por arquivo, responde em segundos:

  ```
  for f in herd negotiation event barter leite confinamento stock; do
    grep -c 'typeof bruto === "number"' src/lib/actions/$f-pending.ts
  done
  ```

- **Diferença achada vira OPÇÃO com o valor de hoje, nunca some.** Extração é
  para preservar comportamento; mudar comportamento é outra tarefa, com outro
  teste e outra autorização.
- **Escreva no código que o valor é herdado, não escolhido**, e o que custaria
  mudá-lo. Sem isso, a próxima sessão lê a opção como preferência e a
  "simplifica" de volta.
- **Rode as suítes dos domínios ANTES e anote quais estavam verdes.** Sem a
  anotação, um vermelho pré-existente vira "regressão" e come uma rodada.
- **Confira o que é chave externa, um a um.** Aqui eram os sete prefixos de
  Redis: um prefixo trocado deixaria órfã toda conversa pendente de produtor
  real, e nenhum teste veria, porque teste cria a chave que vai ler.

## Relacionado

- [[trava-so-vale-depois-de-voce-a-ver-falhar]]
- [[teste-que-passa-antes-e-depois-da-correcao-nao-prova-nada]]
- [[escrever-a-licao-nao-impede-repeti-la]]
- [[record-string-e-onde-o-enum-cresce-sem-avisar]]
