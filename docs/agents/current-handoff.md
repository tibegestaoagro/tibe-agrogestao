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
- Última rodada: Módulo 26 (máquinas e equipamentos), primeira da fila
  priorizada de "ondas seguintes" combinada com o usuário. **Commitado na
  `main` localmente (`d042f49`); push/deploy ainda não solicitado.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até a Onda 4
  (limpeza técnica + paleta oficial), push `02e901a`, aprovado e
  implantado nesta mesma rodada de trabalho.
- Banco: nova migração `20260804090000_machine_maintenance` aplicada só no
  Docker local; Neon pendente até a aprovação de deploy desta rodada.

### Entregue nesta rodada (Módulo 26: máquinas e equipamentos)

- Spec fechada em `docs/specs/module-26-maquinas-equipamentos.md` após
  entrevista com o usuário. Modelos novos `Machine`/`MachineMaintenance`,
  com `next_maintenance_at` denormalizado na própria máquina (mesmo padrão
  de `Animal.current_weight` + `AnimalWeightLog`): a manutenção mais
  recente que informa `next_due_at` substitui a previsão anterior.
- Cadastro de máquina com custo de aquisição, e registro de manutenção com
  custo, geram despesa automática (`createLinkedEntry`), a segunda ligada à
  manutenção, não à máquina (várias manutenções na mesma máquina não
  colidem no `related_id`).
- Alerta novo `maintenance_due` (janela de 15 dias, mesmo seam de
  notificação já existente desde o M4/Onda 2: push/WhatsApp/email).
- `ModuleKey`/`RelatedModule` "maquinas" próprios. **Achado só na
  integração**: 5 lugares no código duplicavam manualmente o tipo
  `RelatedModule` em vez de derivar do Prisma (`financial.ts`, `alerts.ts`,
  `financial-reports.ts`, e 2 rotas de filtro de lançamento financeiro),
  todos precisaram de atualização manual pro build passar. `test:m4`
  também precisou de ajuste (DRE soma 5 módulos agora, não mais 4).
- Painel: `/maquinas` (listagem) e `/maquinas/:id` (detalhe + histórico de
  manutenções + registro). Sem intenção no WhatsApp nem cálculo de
  recorrência por intervalo nesta rodada (decisão fechada na spec).
- `test:m27`: 25 asserções, 0 falhas. Suíte completa (`isolation`, `m1`,
  `m2`, `m4`, `m5`, `m17`, `m20`-`m22`, `m24`-`m27`) e `npm run build`
  verificados juntos depois da implementação.

### Pendências e próximo passo

- **Push desta rodada (Módulo 26) pra produção**: ainda não solicitado.
- **Fila de ondas seguintes, priorizada com o usuário em 2026-08-04**:
  Módulo 26 (feito, esta rodada) → Meu Dia → tela inicial reformulada +
  ajustes financeiros (adiar vencimento, cancelar conta, categorias
  personalizadas de receita/despesa, preferências de lembrete) → app
  mobile (telas de escrita) → medir consumo de mensagem por cliente.
  Depois, sem prazo: reestruturar a navegação pro formato do mockup do
  cliente.
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura, prioridade entre
  Máquinas (entregue) e Meu Dia.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais.
- `apps/mobile` e `packages/contracts` ainda não cobrem rebanho nem
  máquinas (decisão deliberada, mesmo critério das duas rodadas).

## Histórico recente

- 2026-08-04: Módulo 26 (máquinas e equipamentos) implementado. Commit
  `d042f49`, push desta rodada ainda não solicitado.
- 2026-08-04: Onda 4 (GET /api/v1/tenant, correção de /docs/api, branded
  type, paleta oficial do cliente) integrada e implantada em produção.
  Commits `c9e7348`/`5606d62`/`02e901a`.
- 2026-08-03: resumo diário movido da Vercel Cron pro n8n (Schedule
  Trigger, mesmo padrão do lembrete de cadastro abandonado), elimina a
  dúvida sobre limite de cron do plano da Vercel.
- 2026-08-03: Onda 3 integrada e implantada em produção (Módulo 25 rebanho
  por categoria, Calculadora Pecuária, identidade visual nova). Commit
  `3b7b6cf`.
- 2026-08-03: Onda 2 integrada (notificação push, resumo diário, esqueleto
  mobile, cadastro guiado mais curto), 3 correções de integração aplicadas,
  deploy em produção.
