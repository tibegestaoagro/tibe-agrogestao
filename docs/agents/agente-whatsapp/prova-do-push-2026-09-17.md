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

## ⚠️ CORREÇÃO de 18/09: produção TEM a `VAPID_SUBJECT`

**A versão original desta seção afirmava que produção não tinha a
`VAPID_SUBJECT` e por isso não enviava push. Era falso.** O usuário mostrou o
painel da Vercel em 18/09: a variável existe desde 3 de agosto, em Production e
Preview.

**De onde veio o erro:** o `.env` LOCAL não tem a variável, e o usuário tinha
dito que "o env está replicado em produção". Daí deduzi que produção também não
tinha, **sem conferir**. Deduzi um fato de produção a partir da máquina local.

O que continua verdade, e o que muda:

- **O `.env` local não tem** a terceira variável. Por isso o envio desta prova
  precisou dela fornecida na hora: o defeito da Task 1 estava armado **nesta
  máquina**, não em produção.
- **Em produção as três variáveis sempre existiram.** Então o canal de push
  esteve pronto para entregar desde agosto, e o **único** motivo das zero
  inscrições era a tela (as duas portas descritas acima). Isso deixa o
  diagnóstico principal desta prova mais forte, não mais fraco.
- **O defeito da Task 1 continua real no código**: qualquer ambiente com duas das
  três variáveis caía nele, e o `.env.example` nem listava a terceira. Ele só
  não estava armado em produção, como eu tinha afirmado.

## O que isso destrava

Com entrega provada, a Task 3 (alerta crítico vira push mais email, com WhatsApp
só para quem não tem push) passa a fazer sentido. Sem a prova, ela teria trocado
ruído por silêncio.
