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
- Última rodada: Onda 4 (limpeza técnica: `GET /api/v1/tenant`, correção de
  `/docs/api`, branded type no client escopado, paleta oficial do cliente).
  **Commitado na `main` localmente; push/deploy desta rodada específica
  ainda não solicitado.**
- Produção: <https://tibe-agrogestao.vercel.app/> reflete até a Onda 3 +
  ajuste do resumo diário pro n8n (push anterior, `eb6b73c`).
- Onda 3 (Módulo 25, Calculadora, design) e o ajuste do resumo diário pro
  n8n: integrados, testados e **já em produção** (rodadas anteriores).

### Entregue nesta rodada (Onda 4)

- **`GET /api/v1/tenant`** (aditivo): destrava o app mobile mostrar o nome
  da fazenda. Leitura liberada pra qualquer papel (reusa a permissão
  `alertas`, mesmo critério já usado pelo seam de notificação da Onda 2).
- **Corrigidas as 5 divergências reais entre `/docs/api` e o comportamento
  das rotas**, mapeadas desde a Onda 1 (agente A2) e nunca corrigidas até
  agora: PATCH de role/active documentado devolvendo campo a mais do que
  devolve de verdade; `POST /signup/verify` só documentava um dos dois
  ramos de resposta; rotas de recuperação de senha ausentes da
  documentação; campos `utm_*` de `/signup/start` não documentados; nota
  geral sobre `meta` sempre presente mesmo quando o exemplo abrevia.
- **Branded type em `TenantPrismaClient`**: o client base sem escopo era
  estruturalmente idêntico ao escopado (extensão do Prisma não muda o tipo,
  só o comportamento em runtime), então passar o client errado num lugar
  que espera o escopado não dava erro de compilação. Agora dá: só
  `prismaForTenant()` produz o tipo. Build e suíte completa passaram sem
  precisar tocar em nenhum caller existente (prova de que todo mundo já
  usava o caminho certo).
- **Paleta da identidade visual corrigida pros hex oficiais do cliente**
  (`docs/idVisual/paleta-de cores.png`, enviada depois da Onda 3): a
  estimativa por pixel do C3 tinha primary/dark/light diferentes do
  pretendido (primary mais saturado que o oliva real, light com tingimento
  verde em vez do creme neutro oficial). Corrigido em `tailwind.config.ts`
  (token novo `tibe.darkest`, a paleta oficial trouxe 2 verdes escuros bem
  próximos, os dois preservados) e ícones do PWA regenerados
  (`scripts/pwa-icons.mjs`) com as cores certas.
- Commits: `c9e7348` (itens de código) e `5606d62` (correção de paleta).

### Pendências e próximo passo

- **Push desta rodada (Onda 4) pra produção**: ainda não solicitado ao
  usuário.
- **Confirmar com a Agromax** o modelo de rebanho por categoria do C1
  (ainda sem confirmação formal, seguido por decisão do usuário de não
  esperar mais). A paleta de cores já foi corrigida com valor oficial nesta
  rodada, deixou de ser pendência.
- **Fila de ondas seguintes, já priorizada com o usuário** (2026-08-04):
  Onda 5 (Máquinas e equipamentos) → Onda 6 (Meu Dia) → Onda 7 (tela inicial
  reformulada + ajustes financeiros: adiar vencimento, cancelar conta,
  categorias personalizadas de receita/despesa, preferências de lembrete) →
  Onda 8 (app mobile: telas de escrita) → Onda 9 (medir consumo de mensagem
  por cliente). Depois, sem prazo: reestruturar a navegação pro formato do
  mockup do cliente.
- Confirmações ainda pendentes da Agromax: destino da Lavoura, prioridade
  entre Máquinas e Meu Dia (Calculadora já entregue).
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA e o app mobile (Expo) em Android/iPhone reais.
- `apps/mobile` e `packages/contracts` ainda não cobrem rebanho (decisão
  deliberada da Onda 3, registrada no briefing).

## Histórico recente

- 2026-08-03: resumo diário movido da Vercel Cron pro n8n (Schedule Trigger,
  mesmo padrão do lembrete de cadastro abandonado), elimina a dúvida sobre
  limite de cron do plano da Vercel. `daily-digest` agora autentica por
  `INTERNAL_API_SECRET`, não mais `CRON_SECRET`.
- 2026-08-04: Onda 4 (GET /api/v1/tenant, correção de /docs/api, branded
  type, paleta oficial do cliente). Commits `c9e7348`/`5606d62`, push desta
  rodada ainda não solicitado.
- 2026-08-03: resumo diário movido pro n8n (Schedule Trigger), elimina a
  dúvida sobre limite de cron do plano da Vercel.
- 2026-08-03: Onda 3 integrada e implantada em produção (Módulo 25 rebanho
  por categoria, Calculadora Pecuária, identidade visual nova). Commit
  `3b7b6cf`.
- 2026-08-03: Onda 2 integrada (notificação push, resumo diário, esqueleto
  mobile, cadastro guiado mais curto), 3 correções de integração aplicadas,
  deploy em produção.
- 2026-08-01: Onda 1 integrada, middleware corrigido (authorized() nao era
  chamado ha meses), varredura completa de travessao. Commit `e1c9e2d`,
  deploy verificado em producao.
