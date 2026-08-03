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

- Atualizado em: 2026-08-04
- Última rodada: Módulo 27 (Meu Dia: tarefas e compromissos), segunda da
  fila priorizada combinada com o usuário. **Commitado na `main`
  localmente (`cc17729` + `35f0bec` do ajuste do n8n); push/deploy ainda
  não solicitado.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até o Módulo 26
  (máquinas e equipamentos), push `f7aa0b9`, aprovado e implantado nesta
  mesma rodada de trabalho.
- Banco: nova migração `20260804140000_task` aplicada só no Docker local;
  Neon pendente até a aprovação de deploy desta rodada.
- **n8n atualizado** (estado vivo, fora do repositório): prompt do
  classificador ganhou `criar_tarefa` e `current_date`, e também
  `registrar_lote_animal` (Módulo 25), que tinha ficado de fora por
  descuido desde 2026-08-03 e só foi notado agora. Ver
  `docs/n8n-whatsapp-workflow.md`.

### Entregue nesta rodada (Módulo 27: Meu Dia)

- Spec fechada em `docs/specs/module-27-meu-dia.md` após entrevista com o
  usuário. Modelo novo `Task`, compartilhado dentro do tenant (não privado
  por usuário; `created_by` é só metadado).
- **"Atrasada" é calculada, nunca gravada** (`status: pending` + `due_date`
  no passado, em `serializeTask`).
- Alerta novo `task_reminder`: mecanismo DIFERENTE dos outros 6 tipos
  (`vaccine_due`/`harvest_near`/`bill_due`/`low_balance`/`trial_ending`/
  `maintenance_due`, que avisam com antecedência): dispara NO DIA marcado,
  batendo com o exemplo literal do cliente. `reminded_at` evita reprocessar.
- Nova intenção WhatsApp `criar_tarefa` ("me lembra de comprar sal na
  quinta"), com confirmação antes de gravar. Concluir/cancelar fica só no
  painel nesta rodada.
- Painel: `/meu-dia` (lista, criação, concluir/cancelar).
- `test:m28`: 28 asserções, 0 falhas. Suíte completa (`isolation`, `m1`-
  `m5`, `m12`, `m17`, `m20`-`m22`, `m24`-`m28`) e `npm run build`
  verificados juntos.
- **Achado na integração**: o mesmo gap já documentado com o Módulo 17
  (feature pronta no código, inalcançável pelo WhatsApp até o prompt do
  n8n ser atualizado manualmente) tinha se repetido com o Módulo 25
  (`registrar_lote_animal`, desde 2026-08-03). Corrigido junto com a
  entrada do Módulo 27.

### Pendências e próximo passo

- **Push desta rodada (Módulo 27) pra produção**: ainda não solicitado.
- **Fila de ondas seguintes, priorizada com o usuário em 2026-08-04**:
  Máquinas (feito) → Meu Dia (feito, esta rodada) → tela inicial
  reformulada + ajustes financeiros (adiar vencimento, cancelar conta,
  categorias personalizadas de receita/despesa, preferências de lembrete)
  → app mobile (telas de escrita) → medir consumo de mensagem por cliente.
  Depois, sem prazo: reestruturar a navegação pro formato do mockup do
  cliente.
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais.
- `apps/mobile` e `packages/contracts` ainda não cobrem rebanho, máquinas
  nem tarefas (decisão deliberada, mesmo critério das rodadas anteriores).

## Histórico recente

- 2026-08-04: Módulo 27 (Meu Dia: tarefas e compromissos) implementado,
  prompt do n8n atualizado (criar_tarefa + registrar_lote_animal, que
  faltava desde a Onda 3). Commits `cc17729`/`35f0bec`, push ainda não
  solicitado.
- 2026-08-04: Módulo 26 (máquinas e equipamentos) integrado e implantado
  em produção. Commit `f7aa0b9`.
- 2026-08-04: Onda 4 (GET /api/v1/tenant, correção de /docs/api, branded
  type, paleta oficial do cliente) integrada e implantada em produção.
  Commits `c9e7348`/`5606d62`/`02e901a`.
- 2026-08-03: resumo diário movido da Vercel Cron pro n8n (Schedule
  Trigger, mesmo padrão do lembrete de cadastro abandonado), elimina a
  dúvida sobre limite de cron do plano da Vercel.
- 2026-08-03: Onda 3 integrada e implantada em produção (Módulo 25 rebanho
  por categoria, Calculadora Pecuária, identidade visual nova). Commit
  `3b7b6cf`.
