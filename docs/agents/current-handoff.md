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

- Atualizado em: 2026-07-30
- Última rodada: provisionamento do N8N (auditoria) e alerta por WhatsApp direto
- Estado: concluído, integrado na `main` e implantado
- Commits: `8204e9b` (alerta direto) e `31f54c0` (auditoria + docs)
- Banco: nenhuma mudança de schema ou migração

### Entregue

- **Alerta por WhatsApp agora sai direto pelo Tibé** (`sendWhatsAppMessage`), sem
  o salto pelo N8N. Fecha um gap silencioso: `N8N_ALERT_WEBHOOK_URL` nunca foi
  configurada, então o alerta de vencimento **nunca saiu por WhatsApp** desde o
  M4, apenas por email.
- Removidas do `.env.example` as variáveis `N8N_ALERT_WEBHOOK_URL` (sem uso) e
  `N8N_WEBHOOK_SECRET` (código morto: declarada, nunca lida).
- **Prompt do classificador no n8n alinhado ao Módulo 17**: faltavam a intenção
  `registrar_previsao_vacina` e os escopos `contas_a_pagar` e `ordens_a_faturar`.
  O M17 estava em produção no Tibé e **inalcançável pelo WhatsApp**.
- `CLAUDE.md`/`AGENTS.md`: status do M3 corrigido de "não provisionado" para "em
  produção e provisionado", e o do M4 para refletir o envio direto.
- `docs/n8n-whatsapp-workflow.md` ganhou a seção 0 com o estado auditado.

### Estado auditado do N8N (2026-07-30)

- Instância: `https://n8n-production-3d80.up.railway.app` (Railway).
- Workflow "Tibe - Atendimento WhatsApp (Evolution)", id `UAAA96aJFiiFsQCL`,
  **ativo**, 27 nós, apontando para a produção da Vercel.
- Webhook de produção `/webhook/atendimento`, Evolution em `messages.upsert`.
- 20 de 20 execuções do histórico com status `success`.
- Credenciais do n8n vivem na config do MCP (`~/.claude.json`), **não** no
  `.env` do projeto.

### Validações

- `npm run test:m15` e `npm run test:m4`: 0 falhas.
- `npm run build`: sucesso.
- Patch do prompt confirmado relendo o workflow da API (workflow segue ativo,
  27 nós preservados). Backup do JSON original guardado antes do PUT.
- **NÃO verificado:** a mudança dos alertas não tem superfície observável de
  fora e só se manifesta na próxima execução do cron diário. O cron não foi
  disparado à mão porque enviaria alertas reais a tenants reais.
- **NÃO verificado:** o prompt corrigido ponta a ponta. Exige mandar uma
  mensagem real pelo WhatsApp (ex: "quais minhas contas a pagar?").

### Pendências e próximo passo

- **Usuário vai testar em produção** o vocabulário novo pelo WhatsApp.
- Armadilha registrada para qualquer agente: o prompt do classificador é estado
  vivo dentro do n8n, não do repositório. Toda intenção nova exige atualizar o
  nó `Classificar Intenção (OpenAI)`, senão a feature nasce inalcançável.
- Fila acordada com o usuário: adotar shadcn quando forem feitos os ajustes
  visuais da aplicação (adiado de propósito).
- Resend com domínio próprio antes de o projeto ir ao ar (domínio em compra).
- Integração Vercel antiga/duplicada `agrogestao-tibe` falha e deixa o status do
  GitHub vermelho. O projeto oficial `tibe-agrogestao` está saudável. Não
  remover sem autorização.

## Histórico recente

- 2026-07-30: N8N auditado (já estava provisionado e ativo), prompt do
  classificador alinhado ao M17 e alerta por WhatsApp passando a sair direto
  pelo Tibé. Commits `8204e9b` e `31f54c0`.
- 2026-07-30: Módulo 19 (cadastro verificado em 4 etapas) concluído, migrado no
  Neon, integrado na `main` e implantado em produção no commit `db491bd`.
- 2026-07-30: limite de assentos por plano concluído, integrado na `main` e
  implantado em produção no commit `7e52563`.
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
