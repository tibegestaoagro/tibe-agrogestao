---
paths:
  - "src/lib/actions/whatsapp-*.ts"
  - "src/lib/actions/whatsapp-handlers/**"
  - "src/app/api/internal/whatsapp/**"
  - "scripts/whatsapp-e2e.ts"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     A arquitetura do agente, as intencoes suportadas e o achado que rege a conversa: o classificador do n8n NAO remonta os parametros literalmente. -->

## O agente WhatsApp (Módulo 3)

Arquitetura (PRD §7): **Meta → N8N → Tibé → N8N → Meta**. O Tibé nunca fala
direto com a Meta Cloud API; o N8N é o único intermediário. Por isso:

- **Não existe** `/api/webhooks/whatsapp` no Tibé: seria código morto.
- A classificação de intenção por LLM acontece **dentro do N8N** (a chave de
  API do provedor de LLM fica nas credenciais do N8N, não no `.env` do Tibé).
- `POST /api/internal/whatsapp/resolve-contact`: identifica tenant/usuário
  pelo telefone (único lookup cross-tenant legítimo do sistema). Devolve,
  além do contrato da spec, `meta.first_contact`, `meta.suggested_reply` e
  `meta.recent_history` (extensões aditivas: a spec não definia de onde o
  N8N obteria essas informações).
- `POST /api/internal/whatsapp/execute-action`: roteia as intenções do MVP
  (`src/lib/whatsapp-intents.ts` tem a lista + regra de permissão/perfil por
  intenção) para as mesmas `actions` usadas pela web. Confirmação obrigatória
  acima de R$ 5.000 (`CONFIRMATION_THRESHOLD`) para venda/compra de animal e
  ordens de serviço de alto valor: ver `src/lib/actions/whatsapp-router.ts` e
  `src/lib/actions/confirmation.ts` (interpretação de "sim"/"não" em texto
  livre, usada só dentro dos dois fluxos de confirmação, nunca globalmente).
- **Áudio e recibo por foto/PDF** (spec 2026-07-28): o agente entende áudio
  (transcrito via Whisper **dentro do N8N**, tratado como texto normal a
  partir daí: o Tibé nunca sabe se veio de voz ou digitação) e foto/PDF de
  nota fiscal/recibo (extração por visão, também no N8N, vira a intenção
  `registrar_lancamento_financeiro`). Essa intenção **sempre** pede
  confirmação, independente do valor (não usa `CONFIRMATION_THRESHOLD`: a
  leitura de imagem erra mais que digitação manual). Categoria fora da lista
  fixa de `src/lib/category-suggestions.ts` cai em `"Outros"`. Handler em
  `src/lib/actions/whatsapp-router.ts`, chama `createManualEntryAction`
  (mesma action de `POST /api/v1/financial-entries`). Nó a nó no N8N:
  [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md) §5.
  **`webhookBase64: true` não é confiável pra áudio/imagem na Evolution em
  produção** (descoberto testando com áudio real: o campo simplesmente não
  vem no webhook, mesmo configurado): `POST
  /api/internal/whatsapp/fetch-media` (`src/lib/whatsapp-media.ts`) busca a
  mídia sob demanda via `/chat/getBase64FromMediaMessage` da Evolution, pelo
  `message_id`, chamado pelo N8N antes de transcrever/extrair. Só suporta
  Evolution por enquanto (Meta Cloud API teria outro mecanismo de download,
  não implementado).
- **`ajuda` e `resumo`** (spec 2026-07-28): duas intenções pra deixar o
  agente utilizável por quem tem resistência a tecnologia, sem virar um
  chatbot de conversa aberta. `ajuda` (`topic?`) devolve texto **fixo**
  (tabela `HELP_TEXT` em `whatsapp-router.ts`, nunca gerado pela LLM) de
  como usar um recurso. `resumo` (`scope?`) é um funil de até 2 perguntas
  que termina em dado real (reusa as mesmas queries do `/dashboard`, sem
  action nova); nível 1: `rebanho`/`lavoura`/`prestador`/`financeiro`;
  nível 2, só sob `prestador`: `clientes`/`agendamentos`/
  `ordens_a_faturar`. `contas_a_pagar` e `contas_a_receber` consultam
  `FinancialEntry` pendente em qualquer perfil. Nenhum estado de conversa
  novo: o funil reconstrói onde parou a partir do `recent_history` a cada
  mensagem, mesmo mecanismo já usado pra confirmação sim/não. Se o histórico
  mostra que já perguntou e a resposta não resolveu, o prompt do LLM instrui
  classificar como `ambigua` em vez de perguntar de novo (evita loop).
  `ambigua` também ficou com texto menos robótico.
- **Agenda com custo (M17)**: o `resumo` lista agendamentos, vacinas e
  colheitas reais com suas datas e, quando o modelo fornece valor, o custo. A
  intenção `registrar_previsao_vacina` persiste uma despesa pendente em
  `FinancialEntry`, com `related_module: geral` e `related_id` sintético
  `"{animal_id}:{vaccine_id}"`, então o alerta `bill_due` mantém a promessa de
  lembrete. Repetir a previsão atualiza a mesma linha. Ao registrar a aplicação
  com custo real, a previsão é conciliada e quitada em vez de gerar uma segunda
  despesa. Se a data for reagendada, o alerta pendente antigo é descartado e o
  cron rearma `bill_due` quando a nova data entra na janela, preservando alertas
  já enviados ou dispensados para auditoria.
- `gerar_relatorio` (tipo `financeiro`) devolve um `report_url` de verdade
  (link assinado, ver `.claude/rules/financeiro.md`); tipos `rebanho|lavoura|prestador`
  ainda respondem "não disponível": não há gerador de PDF para eles.
- Guia completo para montar o workflow no N8N (nó a nó, incluindo o suporte a
  áudio e recibo por foto/PDF): [docs/n8n-whatsapp-workflow.md](docs/n8n-whatsapp-workflow.md).
  Inclui a seção de envio de alertas (Módulo 4) via `N8N_ALERT_WEBHOOK_URL`.
- **`execute-action` endurecido (2026-08-20).** Três garantias novas nessa
  rota, que é por onde o agente escreve dinheiro, rebanho e estoque:
  1. **O `tenant_id` do corpo não é mais autoridade.** Ele é conferido contra o
     tenant do dono do `user_id` (que é cuid globalmente único), e divergência
     devolve 403. O segredo continua sendo a autenticação, mas deixou de ser a
     autorização.
  2. **Idempotência por `provider_message_id`** (o `wamid`), guardada em
     `AgentRequest` junto com a resposta: replay devolve o que foi respondido
     antes, sem reexecutar e sem duplicar a conversa. **O n8n ainda não manda
     esse campo**, e enquanto não mandar o log avisa a cada chamada. Passar
     adiante é edição de um nó.
  3. A chave é o `wamid`, **nunca** o id de execução do n8n: retry manual cria
     execução nova, e a chave mudaria junto sem impedir nada.
- **Número e data se leem com os parsers, nunca com `Number()` ou `new Date()`**
  (`parsers.ts`, `numero-br.ts`). O classificador manda o mesmo campo ora como
  número, ora como texto: `1200` e `"1200"`, `"dia 10"` e `"10/08/2026"`. E
  `new Date` cru não falha nesses casos, **acerta errado em silêncio**:
  `new Date("dia 10")` devolve outubro de 2001, e `new Date("10/12/2026")`
  devolve 12 de outubro, porque o JavaScript lê no formato americano. Era o que
  o handler de tarefas fazia até 2026-08-20.
- ⚠️ **O classificador NÃO remonta os parâmetros literalmente** (achado de
  2026-08-18, testando o agente de produção pelo `npm run wa`). Ele reconstrói
  os campos a partir da confirmação que o **próprio assistente imprimiu**, não
  da frase do produtor: `"dia 10"` volta como `"10/08/2026"`, um campo ausente
  volta preenchido, `1200` volta como `"1200"`. Quem comparar os parâmetros de
  uma volta com os da anterior vai ler **toda recusa como correção**, e foi
  assim que "não, deixa pra lá" gravou uma compra de R$ 1.200 no estoque.
  **A regra em vigor é a do handler de gado: recusa cancela, ponto.** Se um dia
  isso for reaberto, a decisão precisa ser ancorada no TEXTO que o produtor
  digitou (`message_text`), nunca em comparar campos remontados. O relato
  completo, com a tabela de campos, está em
  [docs/agents/historico/2026-08.md](../../docs/agents/historico/2026-08.md).
- **Envio de mensagem agora é do Tibé** (spec 2026-07-11, desvio deliberado da
  regra "N8N é o único intermediário", aprovado pelo usuário): o N8N chama
  `POST /api/internal/whatsapp/send-message` e o Tibé entrega pelo provider
  ATIVO em `WhatsAppProviderConfig` (Evolution API não-oficial OU Meta Cloud
  API: configurável em `/plataforma/configuracoes/whatsapp`, só master_admin,
  credenciais AES-256-GCM com `CONFIG_ENCRYPTION_KEY`). O RECEBIMENTO continua
  no N8N (payloads de entrada diferem por provider; segue não existindo
  `/api/webhooks/whatsapp`). Despacho em `src/lib/whatsapp-send.ts`.
