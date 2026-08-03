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
- Última rodada: Onda 3 (Módulo 25 rebanho por categoria, Calculadora
  Pecuária, identidade visual nova), integrada localmente na `main`.
  **Push/deploy ainda não feitos: aguardando aprovação explícita do usuário
  nesta mesma rodada.**
- Estado: integrado localmente, testado, build limpo. Não empurrado pra
  `origin/main` nem aplicado no Neon ainda.
- Produção: <https://tibe-agrogestao.vercel.app/> (ainda reflete a Onda 2,
  não esta rodada)
- Banco: migração `20260803142620_animal_category_batch` aplicada só no
  Docker local; Neon pendente até a aprovação de deploy.
- VAPID configurado pelo usuário na Vercel e no `.env` local nesta rodada
  (pendência da Onda 2, resolvida).

### Entregue nesta rodada

- **Onda 3 completa, integrada localmente**: 3 agentes em paralelo (C1
  rebanho por categoria, C2 calculadora, C3 design), briefing em
  `docs/arquitetura/onda-3-briefings.md`. Único conflito de merge foi o
  trivial esperado em `package.json` (`test:m25` vs `test:m26`, mesma
  linha), resolvido mantendo as duas.
- **C1, Módulo 25 (rebanho por categoria e quantidade)**: spec fechada em
  `docs/specs/module-25-rebanho-por-categoria.md` após entrevista com o
  usuário (decisão de seguir sem confirmação formal da Agromax). Modelos
  novos `AnimalCategory`/`AnimalBatch`, paralelos ao `Animal` individual
  (intocado, `test:m1`/`test:m17` seguem 0 falhas). Cada aquisição gera um
  lote novo; venda decrementa FIFO entre lotes da mesma categoria (mais
  antigo primeiro), valor rateado proporcionalmente com ajuste no último
  lote para não haver drift de arredondamento. Nova intenção WhatsApp
  `registrar_lote_animal` vira o caminho padrão de cadastro; o cadastro
  assistido individual (Onda 2) continua existindo como opção. `/rebanho`
  unificado (lotes + individuais numa tabela só). `test:m25`: 43 asserções,
  0 falhas.
- **C2, Calculadora Pecuária** (`src/lib/calculadoras/`, sem persistência):
  as 12 ferramentas do documento do cliente entregues (cerca, pastagem,
  lotação, sal mineral, ração, água, cocho, adubação, calagem, mão de obra,
  máquinas e combustível, compra/venda de gado em simulação isolada). Cada
  fórmula documentada com fonte (majoritariamente Embrapa) e nível de
  confiança em comentário; 3 marcadas como confiança MÉDIA (água, calagem,
  mão de obra) e sinalizadas para revisão técnica antes de uso real com
  clientes. `test:m26`: 0 falhas.
- **C3, identidade visual nova**: paleta extraída por pixel de
  `docs/idVisual/` (não confirmada formalmente pela Agromax ainda,
  documentado em comentário no `tailwind.config.ts`), laranja como cor de
  ação nova (`tibe.accent`). Interface de todos os componentes de
  `src/components/ui/` preservada (nenhuma prop/variante existente mudou,
  só estilo interno); `variant="accent"` do `Button` é aditivo, não usado
  em nenhuma página ainda.
- **Migração e build verificados juntos** após os 3 merges: `test:isolation`,
  `m1`, `m2`, `m4`, `m17`, `m20`, `m21`, `m22`, `m24`, `m25`, `m26` e
  `npm run build`, todos 0 falhas/limpos, rodados por quem integrou (não só
  confiando no relatório de cada agente).

### Pendências e próximo passo

- **Decisão imediata: aprovar push pra `origin/main` + aplicar migração no
  Neon + deploy.** Tudo pronto e verificado localmente, só falta a
  aprovação (protocolo do projeto).
- **Confirmar com a Agromax** os hex extraídos pelo C3 (paleta) e o modelo
  de rebanho por categoria do C1 (ainda sem confirmação formal, seguido por
  decisão do usuário de não esperar mais).
- **Ícones do PWA** ainda usam a paleta antiga: C3 mudou só
  `tailwind.config.ts`/`src/components/ui/`, não regenerou os PNGs de
  `public/icons/`.
- Confirmações ainda pendentes da Agromax: destino da Lavoura, prioridade
  entre Calculadora/Máquinas/Meu Dia (Calculadora já entregue nesta rodada,
  os outros dois não).
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais.
- Rota `GET /api/v1/tenant` (aditiva, Onda 2): destravaria o app mobile
  mostrar o nome da fazenda na tela Início, não só o nome do usuário.
- `apps/mobile` e `packages/contracts` ainda não cobrem rebanho (C1 não
  tocou nenhum dos dois, decisão deliberada registrada no briefing).

## Histórico recente

- 2026-08-03: resumo diário movido da Vercel Cron pro n8n (Schedule Trigger,
  mesmo padrão do lembrete de cadastro abandonado), elimina a dúvida sobre
  limite de cron do plano da Vercel. `daily-digest` agora autentica por
  `INTERNAL_API_SECRET`, não mais `CRON_SECRET`.
- 2026-08-03: Onda 3 integrada localmente (Módulo 25 rebanho por categoria,
  Calculadora Pecuária, identidade visual nova). Push/deploy pendente de
  aprovação.
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
- 2026-07-29: protocolo de memória compartilhada integrado na `main` e
  implantado, incluindo commit automático por tarefa e aprovação obrigatória
  para merge/deploy.
- 2026-07-29: Módulo 17 concluído, integrado na `main` e implantado em
  produção no commit `b3c72cc`.
