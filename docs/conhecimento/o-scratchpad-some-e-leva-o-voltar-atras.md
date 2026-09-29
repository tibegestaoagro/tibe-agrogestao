---
tipo: armadilha
data: 2026-09-29
tags: [ambiente, n8n, agente, operacao]
---

# O scratchpad some, e leva o voltar atrás junto

## O que aconteceu

Em 18/09/2026 o canário da Fase 7 entrou no fluxo de produção do n8n por dois
scripts guardados no scratchpad da sessão: um que MONTAVA o fluxo novo e um que
APLICAVA, salvando antes uma cópia do fluxo publicado. A volta atrás foi testada
de verdade, e o handoff passou a dizer "voltar atrás é o script do scratchpad".

Em 29/09, na retomada, a pasta tinha sido limpa. Sumiram o montador, o
aplicador e as duas cópias de segurança do fluxo anterior. O handoff continuou
afirmando que o caminho existia por onze dias.

Os arquivos ficavam fora do repositório por um motivo certo: o JSON do fluxo
carrega a chave da instância da Evolution, e o repositório é público.

## Por que importa

O plano de reversão de uma mudança em produção era um arquivo temporário. Se o
canário tivesse dado problema nesse intervalo, a sessão teria seguido a
instrução do handoff e não achado nada.

## Como aplicar

- Scratchpad é para resultado intermediário de UMA sessão. Nada que precise
  sobreviver à sessão mora só lá: nem script, nem cópia de segurança, nem
  instrução de reversão.
- Script sem segredo vai para o repositório. O que carrega segredo (o JSON do
  fluxo) não vai, e então o caminho de volta tem de ser um que não dependa dele:
  no n8n, o histórico de versões do próprio workflow, ou editar o nó do desvio.
- Ao escrever "o caminho é X" no handoff, confira que X sobrevive à sessão.

## Relacionado

- [[deduzir-producao-pela-maquina-local]]
