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
- Última rodada: Módulo 28 (ajustes financeiros e tela inicial
  reformulada), última peça da fila priorizada combinada com o usuário
  antes do app mobile. **Commitado na `main` localmente (`ec2d478`);
  push/deploy ainda não solicitado.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até o Módulo 27
  (Meu Dia) + ajuste do n8n, push `f0d7871`, aprovado e implantado nesta
  mesma rodada de trabalho.
- Banco: nova migração `20260804180000_financial_category_alert_preference`
  aplicada só no Docker local; Neon pendente até a aprovação de deploy
  desta rodada.

### Entregue nesta rodada (Módulo 28: ajustes financeiros e dashboard)

- Spec fechada em `docs/specs/module-28-ajustes-financeiros-e-dashboard.md`
  após entrevista com o usuário. `FinancialCategory` novo, por tenant e por
  tipo (receita/despesa), mesmo padrão de `AnimalCategory` (Módulo 25).
- **Adiar vencimento e cancelar lançamento liberados pra qualquer origem**,
  diferente de editar (que continua restrito a `related_module: geral`):
  risco bem menor, só muda data/status, não descola do dado de origem.
- `AlertPreference` novo: liga/desliga TIPO de alerta por tenant, nunca
  canal (a política do `notify()`, Onda 2, continua intacta). Ausência de
  linha = habilitado (opt-out): nenhum tenant existente perdeu alerta
  nenhum com o deploy desta rodada.
- Dashboard: 4 indicadores novos SOMADOS ao que já existia (próximos
  compromissos, contas vencidas, manutenções próximas, últimos
  lançamentos), sem remover nenhum card atual.
- **Achado na integração**: `"maquinas"` faltava no `MODULE_LABEL` de
  `/financeiro` desde o Módulo 26 (a coluna de módulo ficava em branco pra
  lançamento de máquina). Corrigido.
- `test:m29`: 27 asserções, 0 falhas. Suíte completa (`isolation`, `m1`-
  `m5`, `m12`, `m17`, `m20`-`m22`, `m24`-`m29`) e `npm run build`
  verificados juntos.

### Pendências e próximo passo

- **Push desta rodada (Módulo 28) pra produção**: ainda não solicitado.
- **Fila de ondas priorizada com o usuário em 2026-08-04, completa**:
  Máquinas (feito) → Meu Dia (feito) → ajustes financeiros e dashboard
  (feito, esta rodada) → **próximo: app mobile (telas de escrita)** →
  medir consumo de mensagem por cliente. Depois, sem prazo: reestruturar a
  navegação pro formato do mockup do cliente.
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais.
- `apps/mobile` e `packages/contracts` ainda não cobrem rebanho, máquinas
  nem tarefas (decisão deliberada, mesmo critério das rodadas anteriores):
  a próxima rodada (app mobile, telas de escrita) provavelmente precisa
  reabrir essa decisão.

## Histórico recente

- 2026-08-04: Módulo 28 (ajustes financeiros e tela inicial reformulada)
  implementado. Commit `ec2d478`, push ainda não solicitado.
- 2026-08-04: Módulo 27 (Meu Dia: tarefas e compromissos) integrado e
  implantado em produção, prompt do n8n atualizado (criar_tarefa +
  registrar_lote_animal, que faltava desde a Onda 3). Commit `f0d7871`.
- 2026-08-04: Módulo 26 (máquinas e equipamentos) integrado e implantado
  em produção. Commit `f7aa0b9`.
- 2026-08-04: Onda 4 (GET /api/v1/tenant, correção de /docs/api, branded
  type, paleta oficial do cliente) integrada e implantada em produção.
  Commits `c9e7348`/`5606d62`/`02e901a`.
- 2026-08-03: resumo diário movido da Vercel Cron pro n8n (Schedule
  Trigger, mesmo padrão do lembrete de cadastro abandonado), elimina a
  dúvida sobre limite de cron do plano da Vercel.
