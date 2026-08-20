# O worker da rotina diária

Processo que consome a fila e executa a rotina diária (gerar alertas, entregar
alertas pendentes, limpar cadastros abandonados, varrer assinaturas
canceladas).

## Por que ele existe

`generateAllAlerts()` percorre **todos os tenants ativos**. Até 2026-08-20 isso
rodava dentro da requisição da Vercel Cron, com o teto do timeout da função
serverless. O teto não incomoda com a base atual e passa a incomodar
exatamente quando o produto der certo.

## O estado hoje: o worker NÃO está provisionado

O código existe e está testado (`npm run test:m44`), mas **nenhum processo está
rodando**, e a rota continua executando a rotina dentro da própria requisição,
como sempre fez. Nada mudou em produção.

⚠️ **A ordem importa, e inverter quebra em silêncio.** Se `ROTINA_COM_WORKER=1`
for ligada na Vercel antes de o processo estar de pé, a rota passa a só
enfileirar, ninguém consome, e o sistema **para de gerar alerta sem nenhum
erro**. O sintoma apareceria dias depois, quando alguém reparasse que o aviso
de vacina não chegou.

## Como provisionar (Railway, onde o n8n já mora)

1. **Criar um serviço novo** no mesmo projeto do Railway, apontando para este
   repositório (`tibegestaoagro/tibe-agrogestao`), branch `main`.
2. **Comando de start:** `npm run worker`.
3. **Variáveis de ambiente**, as mesmas que a aplicação usa. O worker faz o
   trabalho de verdade, então precisa de tudo que a rotina toca:
   - `DATABASE_URL` (a **Pooled** do Neon, com `-pooler`: aqui é runtime, não
     migração)
   - `REDIS_URL`
   - `EMAIL_PROVIDER` e as credenciais do provedor escolhido
     (`GMAIL_SMTP_USER` e `GMAIL_SMTP_APP_PASSWORD`, ou `RESEND_API_KEY` e
     `RESEND_FROM_EMAIL`)
   - `INTERNAL_API_SECRET` e `CONFIG_ENCRYPTION_KEY` (a entrega por WhatsApp lê
     a configuração cifrada do provider)
   O worker recusa subir sem `DATABASE_URL` ou `REDIS_URL`, com mensagem
   explícita, em vez de falhar no primeiro job.
4. **Conferir que subiu:** o log deve trazer
   `{"level":"info","msg":"worker: ouvindo a fila",...,"route":"tibe-alerts"}`.
5. **Só então** ligar `ROTINA_COM_WORKER=1` na Vercel e fazer redeploy.

## Como confirmar que funcionou

No dia seguinte ao primeiro cron, o log da Vercel deve mostrar
`rotina diaria enfileirada para o worker` e a resposta `{"enqueued": true}`, e
o log do Railway deve mostrar `worker: rotina diaria iniciada` seguido de
`rotina diaria concluida` com a duração.

## Como voltar atrás

Remover `ROTINA_COM_WORKER` da Vercel e fazer redeploy. A rota volta a executar
na própria requisição no mesmo instante, sem depender de o worker estar de pé.
É por isso que o padrão do código é o modo antigo.

## O que o worker NÃO faz

- Não substitui a Vercel Cron: quem dispara continua sendo o cron, que segura o
  lock diário no Redis (`SET NX`) antes de enfileirar. A idempotência de "não
  rodar duas vezes no mesmo dia" não mudou de lugar.
- Não processa o job de histórico. A rota grava um job de bookkeeping mesmo
  quando ela própria executou a rotina; o worker o ignora pelo campo
  `executado_inline`. Sem isso, a rotina rodaria duas vezes e os alertas
  sairiam em dobro.
- Não roda com concorrência maior que 1. A rotina é diária e global: paralelismo
  aqui só criaria corrida.
