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
- Última rodada: continuação da iniciativa de layout (pausa deliberada no
  app mobile, ainda pausado). Fase 1 (sidebar + IA de navegação + topbar)
  **commitada** (`3b65490`). Nesta rodada: correções pedidas pelo usuário
  sobre a Fase 1 (faltava laranja, "Fazenda em Números" é área de
  inteligência, não placeholder) + Fase 2/3 do layout tratadas juntas
  (KPIs, gráficos, Meu Dia+calendário, calculadoras, "Fazenda em Números"
  real) + dado de demonstração de 2 anos pra validar visualmente. Ver
  `docs/design/briefing-novo-layout.md` (seções 10 e 11). **Implementado e
  validado; ainda não commitado.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até o Módulo 27
  (Meu Dia) + ajuste do n8n, push `f0d7871`. Módulo 28 (`ec2d478`/`39c1a32`),
  a Fase 1 (`3b65490`) e a Fase 2/3 do layout continuam só locais,
  push/deploy não solicitado.
- Banco: nova migração `20260804180000_financial_category_alert_preference`
  (Módulo 28) aplicada só no Docker local; Neon pendente até aprovação de
  deploy. Nenhuma migração nova nesta rodada de layout.

### Entregue nesta rodada (Fase 2+3 do layout + dado de demonstração)

- **`scripts/seed-demo-data.ts`** (`npm run seed:demo`, recusa rodar fora
  do Docker local): ~2 anos de histórico simulado pro tenant Da Mata
  Sementes (Property "Fazenda Boa Vista", mesmo nome do mockup): ~230
  animais ativos, vendas/mortes, pesagens, vacinações, 5 máquinas com
  manutenções, 3 talhões com 2 anos de ciclos, 6 clientes/30 ordens de
  serviço, ~85 tarefas, 24 meses de financeiro recorrente. Todo lançamento
  ligado segue exatamente o formato de `createLinkedEntry` das actions
  reais (mesma categoria/`related_module`/mapeamento due_date-paid_at),
  pra não ensinar convenção divergente da que o app usa de verdade.
- **Dashboard redesenhado** (`(dashboard)/dashboard/page.tsx`): 4 KPIs
  hero verde/laranja no estilo do mockup, indicadores secundários mantidos,
  gráfico "Evolução do rebanho" (`getHerdEvolution()`, novo em
  `animals.ts`: reconstrói por diferença, sem snapshot gravado, mesmo
  espírito de status computado já usado em `Task`/`FinancialEntry`),
  gráfico "Receitas x despesas" com legenda de totais+saldo, painel Meu
  Dia + calendário do mês (marcador só em item **pendente**), grade
  "Calculadora Pecuária" embutida.
- **"Fazenda em Números" virou link real** (`/relatorios`): esclarecido
  pelo usuário como área de inteligência que centraliza relatórios, não
  mais "em breve". Reusa `getDre`/`getCashFlow`/`getHerdEvolution` já
  existentes, sem cálculo novo: resultado do mês por módulo, 2 gráficos de
  12 meses, produtividade da lavoura, faturamento do prestador. "WhatsApp"
  segue "em breve" (nenhum número de contato configurado em lugar nenhum
  do código ainda).
- **2 consolidações de duplicação encontradas no caminho**: catálogo das
  12 calculadoras (antes só dentro de `/calculadoras/page.tsx`, agora
  `src/lib/calculadoras/catalog.ts`, reusado também no dashboard);
  `MODULE_LABEL` (antes duplicado em `financeiro/page.tsx` e
  `generate-financial-pdf.ts`, e as duas cópias já tinham divergido: a do
  PDF estava sem `"maquinas"`, bug real e silencioso ali). Consolidado em
  `src/lib/related-modules.ts`.
- **Marca real na sidebar**: logo do Tibé simplificado em SVG inline
  (`docs/idVisual/id-visual-marca.jpeg`), ilustração do rodapé ganhou
  árvores além das colinas.
- Validado com navegador real, sessão logada, dado semeado: dashboard,
  `/relatorios`, `/calculadoras`, `/financeiro`, mobile (390×844). `npm run
  build` limpo e suíte ampla (`isolation`, `m1`-`m5`, `m17`, `m25`-`m29`)
  sem regressão.
- **Achado, não corrigido, fora do escopo**: o aviso de instalação do PWA
  (`install-invite.tsx`) sobrepõe o rodapé da sidebar no mobile (já
  sobrepunha conteúdo antes, mais visível agora). Registrado no briefing.

### Pendências e próximo passo

- **Aprovar e commitar a Fase 2/3 do layout** (implementada e validada
  nesta rodada, ainda não commitada). Depois, decidir com o usuário: mais
  alguma correção de fidelidade visual, ou voltar pro app mobile (pausado,
  não cancelado).
- **Push do Módulo 28 e do layout (Fase 1+2+3) pra produção**: ainda não
  solicitado.
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais.
- `apps/mobile` e `packages/contracts` ainda não cobrem rebanho, máquinas
  nem tarefas (decisão deliberada, mesmo critério das rodadas anteriores):
  a rodada de app mobile (retomada depois do layout) provavelmente precisa
  reabrir essa decisão.

## Histórico recente

- 2026-08-04: Fase 2+3 do layout (KPIs, gráficos, Meu Dia+calendário,
  calculadoras, "Fazenda em Números" real) + seed de demonstração de 2
  anos; commit desta rodada pendente.
- 2026-08-04: Fase 1 do layout (sidebar escura + nova IA de navegação +
  topbar simplificada) implementada e validada. Commit `3b65490`.
- 2026-08-04: Módulo 28 (ajustes financeiros e tela inicial reformulada)
  implementado. Commits `ec2d478`/`39c1a32`, push ainda não solicitado.
- 2026-08-04: Módulo 27 (Meu Dia: tarefas e compromissos) integrado e
  implantado em produção, prompt do n8n atualizado (criar_tarefa +
  registrar_lote_animal, que faltava desde a Onda 3). Commit `f0d7871`.
- 2026-08-04: Módulo 26 (máquinas e equipamentos) integrado e implantado
  em produção. Commit `f7aa0b9`.
