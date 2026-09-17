# A prova do push, 17/09/2026

Fase 6, Task 2. Feita com o usuário no navegador, porque o `endpoint` de uma
inscrição é emitido pelo serviço de push do navegador e não dá para simular.

## O resultado

**O push funciona de ponta a ponta.** Uma notificação foi disparada pelo caminho
real do código (`sendPushToTenant`) e apareceu na tela do usuário, confirmada
por ele.

```
inscricoes de push: 1
  Owner Da Mata | tenant: Da Mata Sementes LTDA | servico: fcm.googleapis.com

resultado: {"attempted":true,"ok":true,"subscriptions":1,"sent":1,"failed":0,"configurado":true}
```

É a **primeira inscrição de push da história do projeto**, e a primeira
notificação entregue. Até aqui o canal inteiro (banco, service worker, VAPID,
componente de opt-in, seam de notificação) existia, passava no `tsc`, tinha
suíte, e nunca tinha entregado nada.

⚠️ **`sent: 1` não era a prova.** O `web-push` responder 201 só diz que o
serviço do navegador aceitou a mensagem. A prova foi o usuário dizer que viu.

## Por que ninguém tinha se inscrito: eram DUAS portas fechadas

O diagnóstico saiu do console do navegador dele:

```
suporte: true
permissao: "default"        <- nunca tinha decidido, dava para perguntar
dispensado: "1"             <- o convite de notificação já tinha sido dispensado
promptInstalar: true        <- o convite de INSTALAR o app segurava a fila
chave: "servida"            <- o servidor estava certo
serviceWorker: "activated"  <- o service worker estava certo
```

O servidor e o service worker nunca foram o problema. O que impedia era a tela:

1. **`installInviteMightBeShowing()`** (`notification-opt-in.tsx`) esconde o
   convite de notificação enquanto o convite de instalar o PWA não tiver sido
   dispensado E o navegador tiver disparado `beforeinstallprompt`. O prompt é
   capturado **a cada carregamento**, então a condição nunca muda sozinha: o
   convite de notificação "espera a próxima montagem" para sempre.
2. **`isDismissed()`**: um clique em "Agora não", ou no X, grava
   `tibe.push.convite-dispensado` no `localStorage` e o convite **nunca mais
   volta**.

E some as duas com o fato de que **o convite é o único caminho para ligar
notificação**: não existe nada em Configurações. Quem dispensou uma vez perdeu
o recurso para sempre, sem saber que perdeu.

Destravado na mão, para a prova acontecer:

```js
localStorage.removeItem('tibe.push.convite-dispensado');
localStorage.setItem('tibe.pwa.convite-dispensado', '1');
location.reload();
```

## O que a prova achou de quebrado em PRODUÇÃO

⚠️ **Produção não tem `VAPID_SUBJECT`**, e por isso **não consegue enviar push
nenhum**. O envio desta prova saiu da máquina local, com a variável fornecida na
hora; o `.env` local não a tem, e o usuário confirmou que o ambiente está
replicado em produção.

Ou seja: sem essa variável, a inscrição que acabou de nascer não receberia nada,
e (no código anterior à Task 1) o resumo diário daquele tenant teria parado de
sair pelo WhatsApp também, em silêncio. É exatamente o defeito que a Task 1
desarmou, e ele estava armado de verdade, não em tese.

**Ação do usuário:** definir `VAPID_SUBJECT` na Vercel. É um `mailto:` ou uma
URL de contato exigida pelo protocolo VAPID, não é segredo. Sem ela, nada de
push em produção.

## O que isso destrava

Com entrega provada, a Task 3 (alerta crítico vira push mais email, com WhatsApp
só para quem não tem push) passa a fazer sentido. Sem a prova, ela teria trocado
ruído por silêncio.
