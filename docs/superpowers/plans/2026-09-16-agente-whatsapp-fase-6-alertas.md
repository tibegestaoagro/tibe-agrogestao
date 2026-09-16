# Agente do WhatsApp, Fase 6: alertas, e o push que nunca entregou nada

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer o push funcionar de verdade (provado em navegador, não em suíte), desarmar o defeito que faz o resumo diário sumir em silêncio assim que alguém se inscrever, e só então mudar a política dos alertas críticos.

**Architecture:** todo o caminho de push já existe (modelo `PushSubscription`, service worker com ouvinte `push`, componente de opt-in montado no layout do painel, chaves VAPID, e o seam único `notify()` com política por urgência). Nada disso é construído nesta fase. O que a fase faz é **provar que entrega** e corrigir a assimetria entre "o convite aparece" e "o envio funciona".

**Tech Stack:** Next.js 16, Web Push (VAPID, `web-push`), service worker em `public/sw.js`, Prisma 7, n8n só como agendador.

**Spec:** `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (decisão 5 da tabela, e a linha 6 da tabela de fases).

## O que a auditoria de 16/09 achou

| o que a spec supõe | estado real |
|---|---|
| "push primeiro nos críticos" | o push **nunca entregou uma notificação**. Produção tem **0 inscrições** para 5 usuários ativos, desde que a Onda 2 construiu tudo |
| o canal está pronto | está: modelo, service worker, opt-in no layout, `notify()` com política por urgência. Só nunca foi usado |
| trocar a política é a tarefa | trocar a política hoje seria **efeito zero**: sem inscrição, tudo cai no WhatsApp de qualquer jeito |

⚠️ **E existe um defeito armado, esperando a primeira pessoa clicar em "Ativar".**

O convite aparece quando **uma** variável está configurada (`getVapidPublicKey()` lê só `VAPID_PUBLIC_KEY`). O envio exige **três** (`configureVapid()` precisa também de `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`). Quando falta qualquer uma:

```ts
// notify/push.ts
if (!configureVapid()) {
  return { attempted: false, ok: false, subscriptions: subscriptions.length, ... };
  //                                    ^^^ a contagem REAL, mesmo sem poder enviar
}

// notify/index.ts, urgência "digest"
const whatsapp = push.subscriptions === 0 ? await sendWhatsappChannel(...) : NOT_ATTEMPTED;
```

Resultado: com uma inscrição viva e a configuração incompleta, **o push não é tentado e o WhatsApp também não**. O resumo diário daquele tenant para de sair, sem erro e sem log de falha. O `.env` local desta máquina está exatamente nesse estado (tem as duas primeiras, não tem `VAPID_SUBJECT`), e o `.env.example` **nem lista** a terceira, então quem configurar seguindo o exemplo reproduz a armadilha.

## Decisões de 16/09/2026

| tema | decisão |
|---|---|
| por onde começar | **provar que o push funciona**, em navegador real, antes de mexer em política de canal. Se estiver quebrado, é melhor descobrir agora do que depois de tirar o WhatsApp dos alertas críticos |
| alerta crítico, depois de provado | **push + email sempre; WhatsApp só para quem NÃO tem push ativo.** É a decisão 5 da spec: corta o ruído de receber o mesmo aviso em três lugares, sem perder a comprovação do email |

## Global Constraints

- **Canal que não pode entregar conta como INEXISTENTE**, nunca como "tentado e falhou". É a regra que desarma o defeito acima, e vale para qualquer canal novo.
- **Nenhuma mudança de política antes da Task 2 passar.** A Task 3 depende de prova de entrega, não de suíte verde.
- O seam `notify()` continua sendo o único lugar que decide canal. Quem notifica descreve conteúdo e urgência, nunca escolhe canal.
- `tenant_id` nunca vem do client; `sendPushToTenant` continua usando o client escopado.
- Nenhuma suíte chama serviço externo: `web-push`, WhatsApp e email são substituídos, como a `m24` já faz.
- Execução de teste sempre com as URLs inline: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"`.
- Ao fim de cada task: `test:m24` (notificações), `test:m4` (alertas), `npm run check` e `npx tsc --noEmit` verdes.
- Nunca travessão (U+2014). Commits em português, `git add` só dos arquivos tocados.

---

### Task 1: o canal que não pode entregar conta como inexistente

**Files:**
- Modify: `src/lib/notify/push.ts`
- Modify: `src/lib/notify/types.ts`
- Modify: `src/lib/notify/index.ts`
- Modify: `src/app/api/v1/notifications/public-key/route.ts`
- Modify: `.env.example`
- Modify: `scripts/m24-notificacoes.test.ts`

**Interfaces:**
- Produces: `NotifyPushResult` ganha `configurado: boolean`, e `sendPushToTenant` devolve `configurado: false` quando `configureVapid()` falha. `notify()` passa a cair para o WhatsApp quando `!push.configurado || push.subscriptions === 0`.

**A correção de raiz, e é no outro lado:** `getVapidPublicKey()` passa a devolver a chave **só quando as três variáveis existem**. Sem isso, o convite continua aparecendo para um canal desligado, e o produtor concede uma permissão que não serve para nada. As duas metades (convidar e enviar) passam a ter a mesma condição.

- [ ] **Step 1: escrever os dois casos que falham**

Em `scripts/m24-notificacoes.test.ts`:

```ts
// 1. O caso que estava armado: inscrição viva, VAPID incompleta.
//    Hoje: nem push nem WhatsApp. Esperado: WhatsApp entregue.
check(
  "digest com push inscrito mas VAPID incompleta cai para o WhatsApp",
  resultado.whatsapp.attempted === true && resultado.delivered === true,
  JSON.stringify(resultado),
);

// 2. A raiz: sem as três variáveis, a chave pública não é servida,
//    então o convite nem aparece.
check("sem VAPID_SUBJECT a chave publica nao e servida", getVapidPublicKey() === null);
```

Monte o cenário apagando `VAPID_SUBJECT` do ambiente dentro do teste e restaurando depois.

- [ ] **Step 2: rodar e ver FALHAR**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m24
```
Expected: FAIL nos dois, o primeiro mostrando `whatsapp.attempted === false`, que é o resumo diário sumindo.

- [ ] **Step 3: corrigir os três pontos**

`configurado` no resultado, a condição do fallback em `notify()`, e `getVapidPublicKey()` exigindo as três.

- [ ] **Step 4: `.env.example` ganha a terceira variável**

Com uma linha dizendo para que serve (`mailto:` ou URL de contato exigido pelo protocolo VAPID) e **avisando que as três andam juntas**: com duas, o convite aparece e nada é entregue.

- [ ] **Step 5: rodar tudo e commitar**

---

### Task 2: provar que o push entrega, em navegador de verdade

**Files:**
- Create: `docs/agents/agente-whatsapp/roteiro-do-push.md` (escrito PARA O USUÁRIO)

**Por que é uma task, e não um detalhe:** este projeto tem uma lista de defeitos que passaram por `tsc`, `lint` e suíte inteira e só apareceram no mundo (o `Tenant.archived_at` que não fazia nada, o middleware que não bloqueava nada, o formulário que não abria sem sinal). O push está exatamente nessa categoria hoje: **tudo verde, nunca entregou nada.**

⚠️ **Esta task precisa do usuário**, porque exige um navegador de verdade aceitando uma permissão de verdade. Não dá para simular: o `endpoint` de uma inscrição é emitido pelo serviço de push do navegador.

- [ ] **Step 1: escrever o roteiro para o usuário**

Uma página curta: abrir o painel em produção, esperar o convite no rodapé, clicar em "Ativar", aceitar a permissão do navegador. E o que fazer se o convite NÃO aparecer (é o resultado mais provável de dar informação: significa que alguma das três condições do componente não bate).

- [ ] **Step 2: conferir a inscrição no banco**

Depois que ele avisar, contar `PushSubscription` em produção. Zero significa que o caminho de inscrição está quebrado, e aí a fase vira consertar isso.

- [ ] **Step 3: disparar um push real e confirmar que chegou**

Pelo caminho de produção (o job de alertas, ou o resumo diário chamado à mão). **A confirmação é o usuário dizer que a notificação apareceu no aparelho**, não o `sent > 0` do servidor: o `web-push` responder 201 só prova que o serviço do navegador aceitou a mensagem.

- [ ] **Step 4: registrar o resultado**

Em `docs/agents/agente-whatsapp/`, com o que funcionou e o que não funcionou. **Se não entregou, a Task 3 não acontece**: vira uma task de conserto, e a política dos críticos fica como está.

---

### Task 3: alerta crítico passa a ser push + email, com WhatsApp só sem push

**Files:**
- Modify: `src/lib/notify/index.ts`
- Modify: `scripts/m24-notificacoes.test.ts`

⚠️ **Só comece se a Task 2 provou entrega.** Tirar o WhatsApp do alerta crítico apoiado num canal não provado troca ruído por silêncio, e silêncio em "vacina vence amanhã" é o defeito caro.

- [ ] **Step 1: os casos que discriminam**

1. tenant COM push configurado e inscrito: WhatsApp **não** é tentado, email é;
2. tenant sem inscrição: WhatsApp é tentado, como hoje;
3. tenant com inscrição e VAPID incompleta: WhatsApp é tentado (é a regra da Task 1 valendo também para crítico);
4. o alerta só é `sent` se algum canal entregou, como já era.

- [ ] **Step 2: rodar e ver falhar**
- [ ] **Step 3: implementar, rodar `m24` e `m4`, commitar**

---

### Task 4: o lembrete de cadastro abandonado não passa pelo seam

**Files:**
- Modify: `src/app/api/internal/whatsapp/pending-flows/route.ts`
- Modify: `scripts/m24-notificacoes.test.ts`

**O achado:** a rota chama `sendWhatsAppMessage` **direto**, sem passar por `notify()`. Ou seja, a política de canal não vale para ela: quem tem push recebe o lembrete por WhatsApp de qualquer jeito, e quem não tem WhatsApp não recebe nada.

Os dois fluxos do n8n (`Lembrete de cadastro abandonado`, a cada 15 minutos, e `Resumo diario`, 8h) são só agendadores de dois nós: gatilho e uma chamada HTTP. **Nada a mudar no n8n nesta fase.**

- [ ] **Step 1: decidir a urgência, e escrever por quê**

Lembrete de cadastro abandonado não é crítico (não é dinheiro nem prazo) nem é resumo diário. A escolha honesta é `digest`: push quando existe, WhatsApp quando não. Se você discordar ao implementar, registre o porquê em vez de inventar uma urgência nova.

- [ ] **Step 2: caso que falha, correção, suítes, commit**

---

### Task 5: revisão do conteúdo do resumo diário

**Files:**
- Modify: `src/app/api/internal/jobs/daily-digest/build-digest.ts`
- Modify: `scripts/m24-notificacoes.test.ts`

**O que revisar, concretamente:** o corpo é montado das mesmas consultas do `resumo.ts` (saldo, alertas pendentes, vacinas de 7 dias, contas a pagar e a receber). Duas perguntas a responder com o conteúdo na mão:

1. **Dia sem nada acontecendo vira notificação?** Se todas as consultas voltam vazias, mandar "nada para hoje" todo dia é o caminho mais rápido para a pessoa desligar a notificação. O resumo deveria silenciar quando não há nada.
2. **O texto do push cabe numa notificação?** Título e corpo aparecem truncados no sistema operacional; o corpo longo é para o WhatsApp, não para o push.

- [ ] **Step 1: ler o conteúdo gerado num tenant com dados e num tenant vazio**
- [ ] **Step 2: casos que falham para o que você decidir mudar**
- [ ] **Step 3: implementar, rodar, commitar**

---

### Task 6: fechar a fase

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (seção "Fase 6: decisões de 16/09/2026")
- Modify: `docs/agents/current-handoff.md`
- Modify: `docs/agents/dividas.md`

- [ ] **Step 1: registrar as decisões e o que a auditoria achou**
- [ ] **Step 2: `npm run check`**
- [ ] **Step 3: commit**

---

## Critério de pronto da fase

1. O defeito armado está desarmado, com teste que falha antes: inscrição viva com VAPID incompleta **não** engole o resumo diário.
2. O convite só aparece quando o envio pode acontecer.
3. **Uma notificação de verdade chegou num aparelho de verdade**, confirmada pelo usuário, ou a fase registra que o push não entrega e por quê.
4. A política dos críticos só mudou se a 3 aconteceu.
5. O lembrete de cadastro passa pelo seam, ou está escrito por que não passa.

**Não é escopo:** construir canal novo, mexer nos fluxos do n8n (são agendadores de dois nós), e a Fase 7 (trocar o fluxo de produção do agente).
