---
tipo: licao
data: 2026-09-17
tags: [notificacao, push, validacao, alertas]
---

# Canal construído não é canal que entrega

O push do Tibé tinha modelo no banco, service worker tratando `push` e
`notificationclick`, chaves VAPID, componente de opt-in montado no layout do
painel, seam de notificação com política por urgência, e suíte verde. Em
produção: **zero inscrições, para cinco usuários, desde que foi construído.**
Nunca entregou uma notificação na vida.

A Fase 6 do agente ia "mudar a política para push primeiro nos críticos". Isso
teria efeito exatamente nenhum: sem inscrição, tudo cai no WhatsApp de qualquer
jeito. A ordem certa era a inversa, e foi a que o usuário escolheu: **provar a
entrega antes de mexer em política.**

## O que a prova achou, e nenhuma suíte acharia

O servidor estava certo o tempo todo. **A TELA é que não deixava ninguém se
inscrever**, por duas portas fechadas ao mesmo tempo:

1. `installInviteMightBeShowing()` escondia o convite de notificação enquanto o
   convite de INSTALAR o PWA não fosse dispensado e `window.__tibeInstallPrompt`
   existisse. O navegador recaptura esse prompt **a cada carregamento**, então a
   condição nunca mudava sozinha: o componente esperava "a próxima montagem"
   para sempre.
2. Um clique em "Agora não" gravava no `localStorage` e o convite **nunca mais
   voltava**, e não existia nenhum outro caminho para ligar notificação.

Some a isso que a página de Configurações onde o controle novo foi colocado
exigia permissão de ESCRITA, enquanto a rota do servidor tinha sido liberada de
propósito para LEITURA, com comentário dizendo que ligar notificação é
preferência pessoal de qualquer papel. **O servidor abriu e a tela fechou**, e
quem ficou de fora foi o operador no curral, que é o público do push.

## A regra

Quando um canal, uma fila ou uma integração existir há tempo e **nunca tiver
sido usado de verdade**, a primeira pergunta não é "a política está certa?", e
sim **"alguém consegue chegar até aqui?"**. Meça a adoção antes de melhorar o
comportamento: zero uso é um número, e ele é a evidência mais barata que existe.

⚠️ E `sent: 1` do servidor não é prova. O `web-push` responder 201 só diz que o
serviço do navegador aceitou a mensagem. A prova foi o usuário dizer que viu na
tela. Ver [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]].

## O defeito que estava armado esperando alguém clicar

O convite aparecia com UMA variável VAPID configurada (a rota servia a chave
pública), e o envio exige TRÊS. Com inscrição viva e configuração incompleta, o
push não era tentado e **o WhatsApp também não**, porque a política perguntava
"existe inscrição?" em vez de "o canal consegue entregar?". O resumo diário
daquele tenant parava de sair, sem erro e sem log.

Produção estava nesse estado, faltando `VAPID_SUBJECT`. A primeira inscrição da
história do projeto nasceu no dia da prova: o defeito estava a um clique de
disparar.

A regra que ficou no código, e vale para qualquer canal futuro:
**canal que não pode entregar conta como INEXISTENTE**, nunca como "tentado e
falhou". E as duas metades (convidar e enviar) passam a ter a mesma condição.
