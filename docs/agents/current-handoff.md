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
- Última rodada: **auditoria de arquitetura** (skill `mattpocock-skills`,
  `/improve-codebase-architecture`), pedida pelo usuário ("nosso app está
  ficando inchado, quero uma revisão de arquivos, engenharia de software e
  verbosidade"). 3 agentes de exploração levantaram fricção real no código;
  relatório HTML com 5 candidatos (não commitado: escrito no temp da
  sessão, não faz parte do repo). Usuário aprovou os 5 e pediu execução em
  ordem de prioridade. Todos os 5 implementados, testados e commitados
  nesta rodada; mais 1 bug real encontrado ao rodar a suíte completa
  (corrigido à parte, fora dos 5 candidatos).
- Produção: nenhuma mudança nesta rodada (só commits locais na `main`,
  sem push). `https://tibe-agrogestao.vercel.app/` segue em `de693bf` +
  `acc89a5` (mobile parte 1); os commits do Módulo 29 e desta auditoria
  ainda não foram enviados.
- Banco: nenhuma migração nova nesta rodada.

### Entregue nesta rodada (auditoria de arquitetura, 5 candidatos + 1 bug)

1. **`TENANT_SCOPED_MODELS` guardrail** (`scripts/tenant-isolation.test.ts`,
   `npm run test:isolation`): compara o Set hand-maintido em
   `src/lib/prisma.ts` contra todo model com `tenant_id` em
   `schema.prisma`. Hoje 100% correto (32/32); o teste existe pra pegar um
   esquecimento futuro na regra de isolamento mais crítica do projeto.
2. **`/docs/api` corrigido e com teste de completude**
   (`scripts/docs-api-completeness.test.ts`, `npm run test:docs-api`):
   o commit do Módulo 29 (mesmo dia) tinha deixado `/api/v1/pastures` e a
   nova exigência de `city` em `POST /api/v1/properties` sem documentar,
   provando que a sincronia manual falha na prática. Corrigido; o teste
   revelou débito bem maior (27 rotas nunca documentadas, listadas
   explicitamente em `KNOWN_UNDOCUMENTED_GAPS` no teste): documentar cada
   uma é trabalho de conteúdo, fora do escopo desta rodada, mas agora
   qualquer rota NOVA sem doc quebra o teste.
3. **`buildNavItems()` extraído de `(dashboard)/layout.tsx`**
   (`src/lib/nav.ts`, `scripts/nav-build.test.ts`, `npm run test:nav`):
   layout.tsx era o arquivo mais editado do projeto (16 de 150 commits),
   misturando gate de sessão/billing com a construção da navegação.
   141 → 90 linhas, sem mudança de comportamento (checado visualmente).
4. **4 contagens compartilhadas entre dashboard web e `resumo` do
   WhatsApp** (`countActiveAnimals`/`countActivePlots`/
   `countServiceClients`/`countCompletedUnbilledOrders` em
   `src/lib/actions/{animals,plots,service-clients,service-orders}.ts`):
   os dois calculavam as mesmas 4 métricas com queries Prisma
   independentes. Sem mudança de comportamento (`test:m3`, `test:m12` e
   checagem visual do dashboard confirmam os mesmos números).
5. **Casos especiais do `whatsapp-router.ts` fechados**: a exclusão de
   `gerar_relatorio` do gate genérico de permissão era redundante (o
   `module: null` em `INTENT_ACCESS` já fazia o gate ser um no-op pra essa
   intenção); comentário agora explica o porquê em vez de esconder atrás
   de uma exclusão. `ajuda.ts` não declara mais `profile` por tópico em
   paralelo a `INTENT_ACCESS`: deriva de lá agora (uma fonte só).
6. **Bug real, achado rodando a suíte completa, fora dos 5 candidatos**:
   `deliverPendingAlertsForTenant` chamava `notify()` sem passar
   `related_id` no canal de email (o mecanismo já existia em
   `sendEmailChannel`/`sendEmail`, só não era usado aqui).
   `NotifyContent.email` ganhou `related_id` opcional; `alert-delivery.ts`
   agora informa o `Alert.id`. `test:m15` (que já cobria essa asserção,
   estava falhando antes da correção) confirma.

Commits (todos locais, `main`, nenhum enviado): `9b777ad` (candidato 1),
`94026d5` (candidato 2), `21adbe4` (candidato 3), `b9dc092` (candidato 4),
`f4430fe` (candidato 5), `b2f8f38` (bug do `related_id`).

Validação: `tsc --noEmit`/`eslint` limpos em cada passo (único erro de tsc
pré-existente e não relacionado é em `scripts/m23-token-auth.test.ts`).
Suíte completa (`test:isolation` até `test:m29`, mais os 3 novos) rodada ao
final: só 2 falhas, ambas em `test:m4`/`test:m24` ("1ª chamada do dia..."),
pré-existentes e sem relação com esta rodada: lock diário em Redis Cloud
compartilhado com produção, já documentado no `CLAUDE.md` como ambiente
que não tem instância local separada. **Também achado, não corrigido**: os
números dos scripts `test:mXX` já estavam com 1 dígito de desvio em
relação ao número do módulo real bem antes desta rodada (`test:m28`
imprime "Módulo 27", `test:m29` imprime "Módulo 28"): não é algo desta
rodada, fora do escopo dos 5 candidatos, mas vale corrigir num momento
dedicado se for mexer nesses scripts de novo.

### Pendências e próximo passo

- Usuário quer **continuar dando funcionalidade ao app mobile**: pausado
  desde o Módulo 29 para (1) a spec de "Minha Fazenda" e (2) esta auditoria
  de arquitetura. Ambos concluídos; próximo passo é retomar o mobile,
  decidindo COM o usuário qual recurso vem a seguir.
- **Pivot de arquitetura ainda não escopado**: o usuário quer que o app
  (não só o WhatsApp) entenda voz/texto/imagem/documento diretamente,
  reduzindo a dependência do WhatsApp como canal primário (cobrança da
  Meta por conversa a partir de outubro). Ainda é só uma ideia, não um
  plano: a recomendação dada foi entrevistar isso via `/grill-with-docs`
  numa sessão NOVA (janela de contexto limpa, decisão grande de arquitetura
  com muita coisa em aberto: onde entra a chamada ao LLM, se substitui ou
  convive com o classificador do N8N, se a pipeline de mídia hoje só do
  WhatsApp é reusada). Nada implementado ainda.
- Módulo 29 (Minha Fazenda): aplicar a migração no Neon de produção só
  quando o usuário aprovar; cadastro de fazenda/pasto por WhatsApp e
  vínculos futuros (Task/FinancialEntry por pasto) ficam pra rodada
  própria (decisão do usuário).
- Decidir com o usuário se/quando reabrir Rebanho, Máquinas e Tarefas
  para o app mobile e `packages/contracts` (decisão deliberada de ficarem
  de fora, documentada em specs de módulo; tecnicamente já dá pra reabrir
  desde o Módulo 25).
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA (web) em Android/iPhone reais; testar iPhone
  real (só Android testado até agora).
- **Achado, não corrigido, fora do escopo** (herdado de rodada anterior): o
  aviso de instalação do PWA sobrepõe o rodapé da sidebar no mobile
  (painel WEB, não o app `apps/mobile`).

## Histórico recente

- 2026-08-04: auditoria de arquitetura (`/improve-codebase-architecture`):
  5 candidatos implementados (guardrail TENANT_SCOPED_MODELS, /docs/api +
  teste de completude, buildNavItems extraído, 4 contagens compartilhadas
  dashboard/WhatsApp, casos especiais do whatsapp-router fechados) + 1 bug
  (`related_id` do EmailLog de alerta). Commits `9b777ad`..`b2f8f38`.
- 2026-08-04: Módulo 29, "Minha Fazenda": `Property.city/district`, model
  `Pasture` novo, tela `/minha-fazenda`, nav reestruturado ("Operação" +
  "Minha Fazenda"). Commit `5bfd207`.
- 2026-08-04: app mobile testado ao vivo num Android físico via Expo Go;
  downgrade de SDK (Expo Go da loja não suportava a versão mais nova ainda,
  achado testando de verdade) e tema claro/escuro com a paleta oficial.
  Commit `f17aedf`.
- 2026-08-04: app mobile: telas de escrita em Financeiro (marcar como
  pago, novo lançamento), nome da fazenda, cores oficiais corrigidas,
  `expo-secure-store` com fallback web, CORS dev-only. Commit `acc89a5`.
- 2026-08-04: push/deploy aprovado pelo usuário: `git push origin main`
  levou as 3 rodadas de layout pra produção de uma vez (Módulo 28 já
  estava lá desde antes).
