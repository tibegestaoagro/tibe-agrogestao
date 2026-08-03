# Handoff compartilhado do Tibé

Este arquivo é a memória operacional curta e versionada do projeto. Codex,
Claude Code e qualquer outro agente devem lê-lo depois de `AGENTS.md` ou
`CLAUDE.md`.

## Protocolo de manutenção

- Atualize este arquivo ao encerrar cada módulo ou rodada significativa.
- Registre apenas fatos verificados, nunca planos tratados como concluídos.
- Informe estado, escopo entregue, validações, commit/deploy, pendências e
  próximo passo autorizado.
- Substitua a seção "Estado atual" a cada rodada. Mantenha no histórico apenas
  as cinco rodadas mais recentes, com uma linha por rodada.
- Não salve segredos, credenciais, transcrições da conversa ou detalhes que já
  estejam claros na spec, no código ou no commit.
- Toda tarefa concluída recebe commit automático na branch de trabalho, com o
  handoff incluído no mesmo commit sempre que possível.
- O push da branch de trabalho é permitido. Merge na `main`, push direto para
  a `main` e deploy exigem aprovação explícita do usuário.

## Estado atual

- Atualizado em: 2026-08-03
- Última rodada: Onda 2 (notificação push, resumo diário, esqueleto mobile,
  cadastro guiado mais curto), integrada e implantada em produção
- Estado: concluído, integrado na `main` e implantado em produção
- Commit principal: ver histórico recente abaixo (rodada com múltiplos commits:
  3 merges `--no-ff` + correções de integração)
- Produção: <https://tibe-agrogestao.vercel.app/>
- Banco: migração `20260801200000_push_subscription` aplicada no Neon

### Entregue nesta rodada

- **Onda 2 completa e integrada**: 3 agentes em paralelo (B1 notificação, B2
  mobile, B3 cadastro guiado), briefing em
  `docs/arquitetura/onda-2-briefings.md`. Zero conflito real de merge entre
  as 3 branches, mesmo padrão da Onda 1.
- **B1, seam `notify()`** (`src/lib/notify/`): alertas críticos (os 5
  `AlertType` existentes) tentam push+WhatsApp+email em paralelo, `sent`
  assim que qualquer canal entregar (push é aditivo, não substitui os 2
  canais existentes). Resumo diário novo (cron `daily-digest`, 08h Brasília)
  tenta push primeiro e só cai para WhatsApp quando não há NENHUMA inscrição
  ativa (existência, não sucesso de entrega), nunca por email. Modelo
  `PushSubscription` novo em `TENANT_SCOPED_MODELS`. Corrigiu um bug real de
  `upsert()`: o filtro de tenant injetado pela extension fazia o Postgres
  pular a escrita em silêncio quando o endpoint já pertencia a outro tenant,
  sem erro nenhum; trocado por fluxo explícito find-then-create.
- **B2, esqueleto mobile** (`apps/mobile/`, Expo/React Native, Expo Router):
  standalone nesta onda (sem `packages/contracts`). Autenticação real contra
  `POST /api/v1/auth/token`, refresh token no `expo-secure-store` (nunca
  `AsyncStorage`), coalescência de chamadas concorrentes para não colidir
  com a rotação de uso único do back-end. `tenant_id` nunca aparece no app.
  3 telas de leitura (Início, Rebanho, Financeiro) com dado real. Gap
  conhecido: não existe `GET /api/v1/tenant`, então a tela Início mostra só
  o nome do usuário, não o da fazenda (documentado no README do app).
- **B3, cadastro guiado mais curto** (`src/lib/actions/agent-flows.ts`):
  abertura de cada item passou a pedir os 3 campos numa mensagem só, caindo
  de volta no fluxo campo a campo para resposta parcial. Caminho feliz caiu
  de até 4 mensagens para 2 por animal; confirmação final intacta.
- **Preparo fora do escopo dos agentes**: node `Separar Respostas` do n8n
  corrigido para consolidar respostas de múltiplas intenções numa única
  mensagem (antes: uma por assunto), redução de custo direto pensando na
  cobrança da Meta em 01/10/2026.
- **3 correções encontradas só na integração** (nenhum agente isolado
  conseguiria pegar sozinho): 17 travessões (U+2014) em comentários do app
  mobile (regra do briefing não seguida pelo B2, corrigido); `tsconfig.json`
  raiz sem excluir `apps/`, quebrando `next build` ao tentar typecheckar o
  app mobile junto (`apps` adicionado ao `exclude`); `test:m24` dependia de
  ausência de credencial real no `.env` (Gmail já configurado na máquina
  principal, diferente do worktree isolado do agente), tornado
  determinístico.

### Lições registradas nesta rodada

- **Rodar o mesmo teste de lock de cron (Redis compartilhado, sem instância
  local) duas vezes no mesmo dia, em processos diferentes, produz falha
  correta mas enganosa** ("já rodou hoje"): não é regressão, é o
  comportamento certo do lock reagindo a uma execução anterior real.
  Confirmar sempre inspecionando a chave no Redis antes de investigar código.
- **Testes que dependem da AUSÊNCIA de uma credencial real no `.env` são
  frágeis**: passam no worktree isolado do agente (que nunca teve a
  credencial) e falham na máquina principal (que já tem, porque o recurso
  já está em produção). Corrigido zerando a credencial e injetando valores
  descartáveis dentro do próprio teste, mesmo espírito do servidor fake já
  usado para o WhatsApp.
- **Regra de "nunca usar travessão" precisa ser reforçada por verificação
  pós-entrega, não só por instrução no briefing**: o agente B2 recebeu a
  regra explícita e mesmo assim escreveu 17 ocorrências em comentários.

### Pendências e próximo passo

- **Configurar as 3 variáveis VAPID na Vercel** (`VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`): sem isso o canal de push fica
  indisponível em produção (falha graciosa, não quebra nada, só não envia
  push até estar configurado). Gerar com `npx web-push generate-vapid-keys`.
- **Confirmar se o plano da Vercel comporta o 2º cron** (`daily-digest`,
  além do `generate-alerts` já existente): não verificável de dentro de um
  agente/sessão sem acesso ao painel da Vercel.
- **Onda 3** (não iniciada): C1 rebanho por categoria (dono exclusivo do
  schema), C2 calculadora pecuária, C3 sistema de design (`docs/idVisual/`).
- Confirmações ainda pendentes da Agromax (documento
  `docs/cliente/01-entendimento-do-produto.md`): modelo de rebanho (categoria
  x individual), destino da Lavoura, prioridade entre Calculadora/Máquinas/
  Meu Dia.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais:
  não verificável a partir do ambiente de desenvolvimento.
- Arte definitiva dos ícones do PWA (atuais são provisórios com a paleta
  antiga); identidade nova em `docs/idVisual/` entra na Onda 3.
- Rota `GET /api/v1/tenant` (aditiva): destravaria o app mobile mostrar o
  nome da fazenda na tela Início, não só o nome do usuário.

## Histórico recente

- 2026-08-03: Onda 2 integrada (notificação push, resumo diário, esqueleto
  mobile, cadastro guiado mais curto), 3 correções de integração aplicadas,
  deploy em produção.
- 2026-08-01: Onda 1 integrada, middleware corrigido (authorized() nao era
  chamado ha meses), varredura completa de travessao. Commit `e1c9e2d`,
  deploy verificado em producao.
- 2026-07-31: análise dos documentos do cliente, plano de arquitetura por
  contrato e disparo da Onda 1 de agentes.
- 2026-07-30: N8N auditado (já estava provisionado e ativo), prompt do
  classificador alinhado ao M17 e alerta por WhatsApp passando a sair direto
  pelo Tibé. Commits `8204e9b` e `31f54c0`.
- 2026-07-30: Módulo 19 (cadastro verificado em 4 etapas) concluído, migrado no
  Neon, integrado na `main` e implantado em produção no commit `db491bd`.
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
