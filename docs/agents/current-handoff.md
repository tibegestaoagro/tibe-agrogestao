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
  app mobile, ainda pausado). Fase 1 (`3b65490`) e Fase 2+3 (`07f5210`,
  KPIs/gráficos/Meu Dia+calendário/"Fazenda em Números" real/dado de
  demonstração) **commitadas**. Nesta rodada: seletor de propriedade no
  topo (filtra o app inteiro, decisão do usuário) e menu de conta
  (Perfil/Minha senha/Sair). Ver `docs/design/briefing-novo-layout.md`
  seção 12. **Implementado e validado; ainda não commitado.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até o Módulo 27
  (Meu Dia) + ajuste do n8n, push `f0d7871`. Módulo 28 (`ec2d478`/`39c1a32`)
  e as 3 rodadas do layout (`3b65490`/`07f5210`/esta) continuam só locais,
  push/deploy não solicitado.
- Banco: nova migração `20260804180000_financial_category_alert_preference`
  (Módulo 28) aplicada só no Docker local; Neon pendente até aprovação de
  deploy. Nenhuma migração nova nas rodadas de layout (seletor de
  propriedade é cookie, não schema).

### Entregue nesta rodada (seletor de propriedade + menu de conta)

- **Propriedade ativa filtra o app inteiro** (`src/lib/active-property.ts`,
  cookie `tibe_active_property_id`, não campo no banco): decisão do usuário
  entre 2 opções apresentadas (leve: só mostra/troca; completo: filtra
  tudo). Escolheu completo. `POST /api/v1/tenant/active-property` troca.
  Aplicado em Rebanho (parâmetro de URL explícito continua vencendo),
  Máquinas e Lavoura (ganharam filtro que não tinham, com aviso "Filtrado
  por: X"), Dashboard e "Fazenda em Números" (KPIs/gráficos de
  rebanho/talhões/máquinas/vacinas/calendário). Financeiro/Prestador ficam
  de fora: `FinancialEntry`/`ServiceOrder` não têm `property_id` no schema.
- **Menu de conta no topo** (`user-menu.tsx`): avatar + nome + chevron →
  Perfil, Minha senha, Sair. Os atalhos já existentes no rodapé da sidebar
  (Fase 1) continuam, fiel ao mockup (coexistem, não é redundância por
  descuido).
- **Página "Perfil" nova** (`/configuracoes/perfil`): só o nome é editável
  (`updateOwnNameAction`, `auth-self.ts`); email fica de fora de propósito
  (identificador de login globalmente único, trocar exigiria
  reverificação).
- **Dropdown escrito à mão** (`src/components/ui/use-dropdown.ts`, hook
  compartilhado entre o seletor de propriedade e o menu de conta): não o
  Radix DropdownMenu do shadcn, mesmo motivo da Fase 1 (classes
  `oklch(...)` incompatíveis com este projeto).
- **Seed de demonstração ganhou uma 2ª propriedade** ("Sítio Recanto",
  ~20% do rebanho/máquinas/lavoura): sem ela não dava pra validar o filtro
  de verdade.
- Validado com navegador real: troca de propriedade filtrando
  Dashboard/Máquinas de verdade (rebanho 232→44 cabeças, talhões 3→1,
  manutenções 2→1, financeiro inalterado como esperado), menu de conta,
  edição de nome. `npm run build` limpo e suíte ampla (`isolation`,
  `m1`-`m5`, `m17`, `m19`, `m25`-`m29`) sem regressão.
- **Achado, não corrigido, fora do escopo** (herdado da rodada anterior): o
  aviso de instalação do PWA sobrepõe o rodapé da sidebar no mobile.

### Pendências e próximo passo

- **Aprovar e commitar esta rodada** (seletor de propriedade + menu de
  conta, implementada e validada, ainda não commitada). Depois, decidir
  com o usuário: mais alguma correção de fidelidade visual, ou voltar pro
  app mobile (pausado, não cancelado).
- **Push do Módulo 28 e das 3 rodadas do layout pra produção**: ainda não
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

- 2026-08-04: seletor de propriedade no topo (filtra o app inteiro) + menu
  de conta (Perfil/Minha senha/Sair) + página Perfil; commit desta rodada
  pendente.
- 2026-08-04: Fase 2+3 do layout (KPIs, gráficos, Meu Dia+calendário,
  calculadoras, "Fazenda em Números" real) + seed de demonstração de 2
  anos. Commit `07f5210`.
- 2026-08-04: Fase 1 do layout (sidebar escura + nova IA de navegação +
  topbar simplificada) implementada e validada. Commit `3b65490`.
- 2026-08-04: Módulo 28 (ajustes financeiros e tela inicial reformulada)
  implementado. Commits `ec2d478`/`39c1a32`, push ainda não solicitado.
- 2026-08-04: Módulo 27 (Meu Dia: tarefas e compromissos) integrado e
  implantado em produção, prompt do n8n atualizado (criar_tarefa +
  registrar_lote_animal, que faltava desde a Onda 3). Commit `f0d7871`.
