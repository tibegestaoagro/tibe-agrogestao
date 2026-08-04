# Handoff do Tibé (continuidade entre dispositivos)

Este arquivo é a memória operacional curta e versionada do projeto. O
trabalho acontece em mais de uma máquina (desktop e notebook): não existe
mais coordenação multi-agente (Codex descontinuado, 2026-08-04), só Claude
Code, retomado em dispositivos diferentes conforme o usuário está ou não no
escritório. Leia depois de `CLAUDE.md`.

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
- Última rodada: **auditoria de performance e enxugamento** (`/loop-goal`,
  contrato de missão aprovado pelo usuário antes de executar). Objetivo:
  "código limpo, estrutura enxuta e performática". 6 metas (G1..G6), todas
  batidas, verificadas por comando e por um juiz subagente independente.
  Detalhes na seção abaixo. Antes dela, na mesma sessão: remoção do suporte
  multi-agente (Codex) e do graphify, e a auditoria de arquitetura com o
  skill do Matt Pocock (5 candidatos + 1 bug, commits `9b777ad`..`c5953ef`).
- Produção: nenhuma mudança nesta rodada (só commits locais na `main`,
  sem push). `https://tibe-agrogestao.vercel.app/` segue em `de693bf` +
  `acc89a5` (mobile parte 1); os commits do Módulo 29, da auditoria de
  arquitetura e desta auditoria de performance ainda não foram enviados.
- Banco: nenhuma migração nova nesta rodada.

### Entregue nesta rodada (auditoria de performance, G1..G6)

**Como medir de novo** (`scripts/measure-page-queries.sh`): precisa de
`log_statement='all'` no Postgres local, `next dev` no ar e um cookie de
sessão válido em `/tmp/tibe-sess.txt`. Medir pelo navegador NÃO serve: cada
navegação do Next dispara 2 ou 3 renders (prefetch RSC + documento) e o
número varia entre execuções; por isso o script usa `curl`, que é 1 render.
O `log_statement` foi restaurado para `none` ao fim da rodada.

- **G1/G2, performance** (commit `994e331`): render do `/dashboard` caiu de
  **42 para 31 queries (-26%)**. Três causas distintas, todas medidas:
  a linha do `Tenant` era lida 3x por request (cada consumidor com um
  `select` diferente, por isso memoizar função por função não resolvia:
  precisou unificar em `src/lib/tenant-record.ts`); `TenantProfile` 2x (o
  gate de sessão repetia a query em vez de usar a função que já existia);
  e `getHerdEvolution` fazia 2 queries POR MÊS num laço (12 com 6 meses,
  ~29% do orçamento da página). `test:herd` prova resultado idêntico ao da
  versão antiga em 9 cenários.
- **G3, superfície pública** (commit `5a47d08`): 14 símbolos usados só
  dentro do próprio arquivo perderam o `export`; 2 funções sem consumidor
  algum removidas. `cancelSubscriptionAction` foi MANTIDA e documentada:
  ver "achados abertos" abaixo.
- **G4** (commit `7bc49e4`): `/docs/api` era o maior arquivo autoral do
  projeto (1057 linhas), 1007 delas um array de dados dentro de um
  componente. Dados foram para `endpoints.ts`; a página caiu para 55 linhas.
- **G5** (commit `a32a572`): partia de uma premissa minha ERRADA. Eu tinha
  reportado que `test:m28` "imprime Módulo 27" como bug de numeração; a
  evidência mostrou o contrário: o texto impresso segue a spec e está certo,
  e o `mNN` do nome do arquivo é um contador de suítes que descolou do
  número do módulo por volta do `m25`. Renomear colidiria (`m26` já existe).
  Documentado no `CLAUDE.md` para ninguém mais tratar como bug.
- **G6** (commit `f73a3f2`): `animals.ts` (478 linhas, 4 razões diferentes
  para mudar) virou 5 módulos por sub-domínio, maior com 168 linhas. Os 13
  arquivos que importavam foram apontados para o módulo específico, sem
  barrel de re-export (um barrel preservaria justamente o acoplamento que a
  quebra desfaz).
- **Revisão independente** (commits `62fd90c` e `1a2190f`): um subagente sem
  o meu contexto avaliou o diff contra a rubrica do contrato e **reprovou**
  em "comentários explicam o porquê" (7/10). Os 3 achados eram justos e
  foram corrigidos, incluindo um comentário factualmente FALSO (dizia
  "acumular mês a mês" enquanto o código re-varria o array a cada mês: o
  código passou a acumular de verdade, em vez de o comentário ser rebaixado
  para caber no código). O juiz também pegou uma regressão de tipo que eu
  tinha introduzido (`TenantRecord` declarava `status: string` à mão, o que
  fazia `tenant.status === "trial"` perder a checagem contra o enum
  `TenantStatus`) e, na rodada de correção, um defeito NOVO meu: empilhei
  dois blocos `/** */` em `active-property.ts`, e o TypeScript descarta o
  primeiro nesse caso (provado com a API do compilador), sumindo justamente
  o comentário sobre cookie forjado não vazar entre tenants.
  **Veredito final: (a) 9, (b) 9, (c) 8, (d) 9, (e) 9**, todos acima da
  régua de 8 do contrato, sem nenhum bug de correção ou isolamento
  encontrado.
- **Suíte completa: 32/32 verdes** ao final (com a ressalva do `test:m19`
  descrita abaixo, que é limite de envio esgotado, não regressão).

### Limpeza de repositório (mesma rodada)

- `AGENTS.md`, `.codex/`, skill `graphify` e sua saída: removidos (Codex
  descontinuado, só Claude Code agora; graphify rejeitado pelo usuário).
- 20 branches locais e 1 worktree órfão do Codex: removidos depois de
  verificar que **nenhum** tinha commit fora da `main`. Sobrou só `main`.
- **Pendente, precisa da sua aprovação** (apagar branch remota empurra
  alteração pro GitHub): as mesmas branches ainda existem em `origin`.

### Entregue na rodada anterior (auditoria de arquitetura, 5 candidatos + 1 bug)

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

### Armadilhas de teste descobertas nesta sessão (ambiente, não código)

Três suítes falham sozinhas quando rodadas repetidamente na mesma hora,
porque o **Redis é compartilhado com produção** (não existe instância local
separada, ver `CLAUDE.md`). Antes de investigar como bug, cheque isto:

- `test:m4` e `test:m24`: lock diário de alertas/resumo (`SET NX`). Falham
  na 2ª execução do dia com "1ª chamada do dia executa".
- `test:m19`: usa telefone FIXO (`22988887777`) e `signup-send` limita a 5
  envios/hora POR NÚMERO. A 6ª execução na mesma hora quebra com
  "PendingSignup não encontrado", que parece bug de banco e não é.
  Diagnóstico: ler `tibe:login-attempts:signup-send:5522988887777` no
  Redis; some a chave para destravar.

### Pendências e próximo passo

- Usuário quer **continuar dando funcionalidade ao app mobile**: pausado
  desde o Módulo 29 para (1) a spec de "Minha Fazenda", (2) a auditoria de
  arquitetura e (3) a auditoria de performance. As três concluídas; próximo
  passo é retomar o mobile, decidindo COM o usuário qual recurso vem a
  seguir.
- **Achado aberto, decisão de produto**: `cancelSubscriptionAction`
  (`src/lib/actions/billing.ts`) está implementada e funciona (cancela no
  Asaas, registra a transição), mas NENHUMA rota ou botão a chama. Hoje o
  cliente não consegue cancelar a própria assinatura pelo painel, só
  falando com a Pleno. Falta expor, não reescrever.
- **Achado aberto, dívida conhecida**: 27 rotas reais nunca documentadas em
  `/docs/api`, listadas em `KNOWN_UNDOCUMENTED_GAPS`
  (`scripts/docs-api-completeness.test.ts`). Rota nova sem doc já quebra o
  teste; as 27 antigas seguem liberadas até alguém escrever o conteúdo.
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
