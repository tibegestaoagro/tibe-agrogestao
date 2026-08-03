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
  app mobile). Fase 1 (`3b65490`), Fase 2+3 (`07f5210`, KPIs/gráficos/Meu
  Dia+calendário/"Fazenda em Números" real/dado de demonstração) e seletor
  de propriedade + menu de conta (`de693bf`, seção 12 do briefing)
  **commitadas e com push/deploy aprovados e executados nesta rodada**
  (`git push origin main`, 39c1a32→de693bf). App mobile retomado logo em
  seguida, autorizado pelo usuário.
- Produção: <https://tibe-agrogestao.vercel.app/> deployada com
  `de693bf` (deploy automático da Vercel no push). **Correção de registro**:
  o Módulo 28 (`ec2d478`/`39c1a32`) já estava em produção desde antes desta
  rodada (um handoff anterior registrou "push não solicitado" por engano;
  `git fetch` confirmou `origin/main` já em `39c1a32` antes deste push).
- Banco: `npx prisma migrate status` contra o Neon confirmou **schema já
  em dia** antes deste push (a migração do Módulo 28,
  `20260804180000_financial_category_alert_preference`, já estava aplicada
  em produção). Nenhuma das 3 rodadas de layout mexeu em schema (seletor de
  propriedade é cookie, não coluna).

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

- **Próximo passo autorizado pelo usuário: retomar o app mobile** (telas de
  escrita), pausado desde o início da iniciativa de layout. Usuário avisou
  que vai validar tudo (layout em produção + o que for feito no mobile) no
  dia seguinte: registre o estado real do mobile ao final desta rodada,
  não dê como "pronto" o que não foi testado em navegador/emulador.
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

- 2026-08-04: push/deploy aprovado pelo usuário: `git push origin main`
  levou as 3 rodadas de layout (`3b65490`/`07f5210`/`de693bf`) pra
  produção de uma vez (Módulo 28 já estava lá desde antes). App mobile
  retomado em seguida.
- 2026-08-04: seletor de propriedade no topo (filtra o app inteiro) + menu
  de conta (Perfil/Minha senha/Sair) + página Perfil. Commit `de693bf`.
- 2026-08-04: Fase 2+3 do layout (KPIs, gráficos, Meu Dia+calendário,
  calculadoras, "Fazenda em Números" real) + seed de demonstração de 2
  anos. Commit `07f5210`.
- 2026-08-04: Fase 1 do layout (sidebar escura + nova IA de navegação +
  topbar simplificada) implementada e validada. Commit `3b65490`.
- 2026-08-04: Módulo 28 (ajustes financeiros e tela inicial reformulada)
  implementado e implantado em produção. Commits `ec2d478`/`39c1a32`.
