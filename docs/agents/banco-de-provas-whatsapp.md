# Banco de provas do agente WhatsApp

Como exercitar o agente de ponta a ponta sem depender de alguém com o celular
na mão mandando print.

## O problema que isto resolve

Até 2026-08-13, a única forma de saber o que o agente respondeu era abrir o
WhatsApp e olhar. Isso fazia cada rodada de teste depender de uma pessoa
disponível, em blocos, com horas entre uma correção e a verificação seguinte.
Os defeitos de conversa do Módulo 30 (pergunta repetida, "cancela" que não
cancelava, gravação fantasma de 18 animais) todos apareceram assim, e cada um
custou uma ida e volta inteira.

## Como funciona

```
npm run wa diga "..."
        |
        v
  webhook do n8n de PRODUCAO  (/webhook/atendimento)
        |
        v
  o fluxo REAL roda inteiro: buffer de 12s, classificador (gpt-4o-mini,
  temperature 0), execute-action do Tibe, humanizador
        |
        v
  sendWhatsAppMessage  ->  recordOutbound()  ->  Redis
        |
        v
  npm run wa le a resposta e imprime
```

**Não existe cópia do fluxo, e isso é o ponto do desenho.** A alternativa
óbvia (um segundo workflow no n8n que reproduz o classificador) testaria a
cópia, não o sistema: os dois prompts divergiriam na primeira correção, e o
teste passaria enquanto produção quebrava. É a mesma armadilha que o CLAUDE.md
descreve em "teste automatizado verde não é validação".

O gancho é `recordOutbound()` em `src/lib/whatsapp-outbox.ts`, chamado no topo
de `sendWhatsAppMessage()`. Registra **antes** de despachar, de propósito: o
que interessa auditar é o que o Tibé decidiu responder, inclusive quando a
entrega falha. Dado efêmero em Redis (TTL 15 min, 20 mensagens por telefone),
mesma categoria do buffer de fragmentos. O histórico de verdade continua em
`AgentConversationLog`, no Postgres.

## O que ele NÃO cobre

Honestidade sobre o alcance, porque um banco de provas em que se confia demais
é pior que nenhum:

- **Entrega de fato no celular.** O que se lê é o que o Tibé mandou ao
  provider, não o que chegou na tela de alguém.
- **Áudio e foto de recibo.** A mídia é buscada na Evolution pelo `message_id`,
  que não existe numa mensagem simulada.
- **Comportamento do app do WhatsApp** (notificação, formatação, emoji).

Por isso continua valendo a regra do CLAUDE.md: ao menos uma passada no
aparelho de verdade por rodada, antes de dar um módulo por concluído. A
diferença é que agora essa passada confirma um caminho já percorrido dezenas
de vezes, em vez de ser a primeira vez que alguém olha.

## Preparo (uma vez)

```powershell
npm run wa:seed 5511900000001    # cria o tenant "BANCO DE PROVAS", idempotente
# depois ponha no .env:  WA_TEST_PHONE=5511900000001
```

O tenant é próprio, e não a conta de ninguém: as contas de produção são de
pessoas reais da equipe do cliente, e bezerro de teste no rebanho de quem está
validando o sistema destrói a confiança no número que ele está conferindo. O
seed recusa um telefone que já pertença a outro usuário.

O número **não precisa existir no WhatsApp**. A entrega vai falhar na
Evolution, e não faz diferença: a resposta já foi registrada antes disso.

## Uso

```powershell
npm run wa estado                          # quem o telefone identifica + caixa de saida
npm run wa limpa                           # zera conversa, buffer, pendencia e historico
npm run wa diga "Comprei 20 bezerros"      # manda e espera a resposta (ate 120s)
npm run wa roteiro docs/agents/roteiros/negociacao.txt
```

`limpa` entre casos de teste não é opcional: o funil de perguntas do agente
reconstrói onde parou a partir do `recent_history`, então um caso que enxerga a
conversa do anterior deixa de ser reproduzível.

A resposta demora ~20-30s porque o fluxo tem uma espera de 12 segundos (buffer
de mensagens picadas) mais duas chamadas de LLM. Não é lentidão do script.

## Roteiro

Um arquivo `.txt`, uma mensagem por linha; linhas vazias e começadas por `#`
são ignoradas. Cada mensagem só sai depois da resposta da anterior, que é como
uma conversa acontece de verdade.
