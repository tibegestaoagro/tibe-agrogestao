---
tipo: armadilha
data: 2026-11-18
tags: [ambiente, next, windows, validacao-viva]
origem: roteiro emporio-cheque-duas-etapas (frente C, 18/11)
---

# O Turbopack entra em laço de recarga no balcão, e o `--webpack` não

## O que aconteceu

Em 18/11/2026, na prova viva da frente C, o `npm run dev` (Turbopack, Next
16.4.3) deixou o `/emporio/vender` num laço de recarga completa: cada carga
disparava um "Compiled in 1ms" e uma nova carga, 2.692 GETs num log. A página
nunca hidratava, então o Select da loja e o "+ Cheque" não respondiam, como se o
balcão estivesse quebrado. Reiniciar o servidor não resolveu. Com
`npx next dev --webpack` o laço sumiu, e todos os roteiros do dia (frentes C, D,
H e a paginação) rodaram assim, verdes.

## Por que importa

O sintoma é de defeito no app (botão que não responde, campo que não abre), e o
roteiro reprova num passo que não tem nada a ver com a mudança. Sem saber disso,
a sessão gasta a rodada caçando um bug de hidratação que não existe.

## Como aplicar

- Roteiro de navegador nesta máquina: `npx next dev --webpack`.
- A primeira subida do `next dev` sai sozinha com um aviso de atualização de
  segurança: **não** rode `next upgrade` (o aviso pede isso); só suba de novo.
- Um `(a || b)` ou `(a; b)` para subir duas vezes deixa o segundo servidor de
  pé quando você mata o primeiro: ao terminar, mate TODO PID que escuta na
  3000 e confira a porta livre.
- A causa do laço não foi investigada (dívida 5.24). O sintoma é o mesmo do laço
  por aba sobrando no Chrome de testes, que fechar as abas resolve (ver a nota
  abaixo); naquele dia a troca para `--webpack` resolveu e fechar as abas não
  foi testado, então pode ser a mesma causa. Antes de trocar de empacotador,
  feche as abas pela porta 9333.

## Relacionado

- [[turbopack-nao-cria-processo-quando-a-maquina-esta-cheia]]
- [[a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador]]
- [[dev-server-servido-com-client-prisma-velho]]
