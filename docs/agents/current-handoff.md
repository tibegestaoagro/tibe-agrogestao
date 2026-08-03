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
- Última rodada: **pausa deliberada no app mobile**, a pedido do usuário,
  pra revisar o layout do painel web usando o mockup do cliente
  (`docs/idVisual/ID-visual-dashboard.jpeg`) como referência. Briefing em
  `docs/design/briefing-novo-layout.md` (leitura do mockup, gap vs. hoje,
  achados técnicos do shadcn neste projeto, decisões fechadas com o
  usuário, fatiamento em fases). **Fase 1 (sidebar + IA de navegação +
  topbar) implementada e validada nesta rodada; ainda não commitada.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até o Módulo 27
  (Meu Dia) + ajuste do n8n, push `f0d7871`. Módulo 28 (`ec2d478`/`39c1a32`)
  e a Fase 1 do layout continuam só locais, push/deploy não solicitado.
- Banco: nova migração `20260804180000_financial_category_alert_preference`
  (Módulo 28) aplicada só no Docker local; Neon pendente até aprovação de
  deploy.

### Entregue nesta rodada (briefing de layout + Fase 1: sidebar e navegação)

- Reabre deliberadamente a reestruturação de navegação, adiada 3 vezes em
  rodadas anteriores (Onda 1 A3/A4, Onda 3 C2/C3): o usuário autorizou
  agora, com o mockup como referência de IA (7 itens agrupados em vez dos
  12 links planos de antes).
- Sidebar (`src/components/layout/sidebar.tsx`, reescrita): fundo
  `tibe.darkest`, ícones lucide, estado ativo em `tibe.primary`, grupos
  "Minha Fazenda" (Rebanho/Máquinas/Lavoura/Prestador/Financeiro/Alertas) e
  "Configurações" (aponta pro hub `/configuracoes` já existente + "Minha
  senha") expansíveis, "Fazenda em Números" e "WhatsApp" desabilitados
  ("em breve": nenhum dos dois tem conteúdo/número real ainda), cartão de
  conta no rodapé (tenant + usuário + atalhos de senha/logout) no lugar do
  texto que antes só existia no header.
- **Decisão deliberada**: "Configurações da conta" na sidebar aponta pro
  hub `/configuracoes` (gated `hasMinRole(role,"ADMIN")`) em vez de repetir
  cada link (Usuários/Assinatura/Categorias/Alertas) com sua própria regra
  de permissão na sidebar, evitando duplicar controle de acesso em dois
  lugares (confirmado que `hasMinRole("ADMIN")` reproduz exatamente o que
  `canAccess("usuarios"/"assinatura")` já fazia).
- Topbar (`dashboard-shell.tsx`): sem busca/sino/seletor de fazenda
  (nenhum dos três existe de verdade hoje: decisão explícita de
  simplificar, não esquecimento); avatar de iniciais no lugar do texto de
  nome/papel.
- Notificações in-app, busca global, avatar de foto e seletor de
  propriedade ficam fora desta rodada: cada uma é decisão de produto
  própria (registrado no briefing).
- Validado com navegador real (login, os 2 grupos expansíveis, navegação
  pra filho de grupo com destaque correto, hub de Configurações, atalhos
  do rodapé, drawer mobile 390×844). `npm run build` limpo. Sem teste
  automatizado novo (mudança é só de camada visual/navegação, sem lógica
  de servidor).
- **Achado não corrigido, fora do escopo desta fase**: o aviso de
  instalação do PWA (`install-invite.tsx`, `fixed inset-x-0 bottom-0
  z-50`) sobrepõe o novo cartão de rodapé da sidebar no mobile. Já
  sobrepunha conteúdo antes; só ficou mais visível agora que o rodapé tem
  conteúdo de verdade. Registrado no briefing, não bloqueia.
- Próximo desta iniciativa: Fase 2 (cards de KPI com o estilo do mockup) e
  Fase 3 (calendário + Meu Dia + calculadoras embutidos no dashboard).

### Pendências e próximo passo

- **Aprovar e commitar a Fase 1 do layout** (ainda não commitada nesta
  rodada). Depois, decidir com o usuário: seguir direto pra Fase 2/3 do
  layout, ou voltar pro app mobile (que está pausado, não cancelado).
- **Push do Módulo 28 e desta Fase 1 pra produção**: ainda não solicitado.
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

- 2026-08-04: briefing de layout (`docs/design/briefing-novo-layout.md`) e
  Fase 1 (sidebar escura + nova IA de navegação + topbar simplificada)
  implementados e validados; commit desta rodada pendente.
- 2026-08-04: Módulo 28 (ajustes financeiros e tela inicial reformulada)
  implementado. Commits `ec2d478`/`39c1a32`, push ainda não solicitado.
- 2026-08-04: Módulo 27 (Meu Dia: tarefas e compromissos) integrado e
  implantado em produção, prompt do n8n atualizado (criar_tarefa +
  registrar_lote_animal, que faltava desde a Onda 3). Commit `f0d7871`.
- 2026-08-04: Módulo 26 (máquinas e equipamentos) integrado e implantado
  em produção. Commit `f7aa0b9`.
- 2026-08-04: Onda 4 (GET /api/v1/tenant, correção de /docs/api, branded
  type, paleta oficial do cliente) integrada e implantada em produção.
  Commits `c9e7348`/`5606d62`/`02e901a`.
