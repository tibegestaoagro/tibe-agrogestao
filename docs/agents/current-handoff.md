# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo autorizado.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima.**
Se ele passar de umas 200, arquive antes de acrescentar.

## Estado atual

- Atualizado em: 2026-08-20.
- **Produção: `e719a45` no ar.** Merge `--no-ff` da branch `fundacao`,
  autorizado pelo usuário na conversa, e deploy conferido (ver abaixo). Sem
  migração nesta rodada: `prisma migrate status` contra o Neon respondeu
  "Database schema is up to date!" antes do merge.
- **A rodada de hoje foi a fase 0 do plano de evolução** (diagnóstico completo
  do repositório, entrevista e plano em
  `C:\Users\dilto\.claude\plans\analise-o-projeto-me-elegant-walrus.md`, fora do
  repo). Cinco commits, nesta ordem:
  1. **CI existe** (`.github/workflows/ci.yml`): job estático (check, tsc, lint,
     docs-api, nav, m39, build), job com banco em PR (Postgres **e Redis**
     próprios, tirando três suítes de cima do Redis de produção) e job de drift
     de migração, que mecaniza o invariante 3. Pré-requisito resolvido:
     `scripts/m23-token-auth.test.ts` compila, e `tsc --noEmit` sai zero pela
     primeira vez.
  2. **Suíte `m39`**, que prova que a porta fecha. Achou um vazamento latente:
     prefixo público casava por texto, então `/docsinterno` entrava por causa de
     `/docs`. Passou a casar por segmento.
  3. **Next 16.3.1 + React 19.2.8.** O Next 14 estava sem patch de segurança
     desde 11/12/2025. Feito antes do redesenho de propósito: o codemod
     reescreve as mesmas páginas que a próxima fase vai tocar.
  4. **O middleware virou `src/proxy.ts`** (a convenção antiga foi deprecada
     no 16 e sai no próximo major).
  5. **`next-auth` para a beta.32**, fechando quatro advisories, entre elas a
     que deixava checagem de sessão falhar abrindo.
- **O classificador do n8n já conhece as 4 intenções de estoque**, ensinadas em
  2026-08-18 pelo MCP do n8n. Backup do workflow anterior em `D:\tmp\n8n-backup`.
  Ele segue **congelado** por decisão do usuário: só volta a ser mexido quando o
  sistema estiver revisado, para não retrabalhar a cada mudança.

### As travas de agente, e como passar por elas

`.claude/settings.json` e `.claude/hooks/` são versionados, então valem também
no notebook. Eles **recusam** travessão novo, heredoc com escape, e merge, push
mirando a `main` e deploy.

Quando o usuário autorizar, o caminho é repetir o comando com a marca
`AUTORIZADO_PELO_USUARIO=1` na frente. **Nunca desligue o hook**: a marca existe
justamente para o caminho autorizado não ser desligá-lo, porque hook desligado
não volta sozinho. E a marca só vale para autorização dada NA CONVERSA, nunca
deduzida de uma anterior.

O `/doctor` de 2026-08-18 mudou `permissions.defaultMode` para `"auto"` no
escopo de usuário. Testado: **os hooks continuam bloqueando nesse modo**.

### Como a rodada de hoje foi validada

Não só por compilação, porque aqui isso nunca bastou:

- **36 suítes verdes** contra o Docker local, no Next 16.
- **Navegador real** (`next dev` + browser-harness): login, painel com os
  gráficos, rota com parâmetro dinâmico, e um lançamento financeiro criado de
  verdade (`POST /api/v1/financial-entries` 201, conferido no banco depois).
- **Requisição real** contra o `proxy`: `/dashboard` sem sessão devolve 307 para
  o login, `/api/v1/animals` devolve 401 com o envelope certo, a raiz devolve
  200, e `/docsinterno` devolve 307, provando fora do teste unitário que o
  vazamento de prefixo fechou.
- Duas falhas apareceram e **nenhuma era regressão**, as duas confirmadas lendo
  o Redis em vez de deduzir: `m4` e `m24` pelo lock diário (passaram na
  reexecução) e `m19` pelo contador `signup-send` em 7 contra um teto de 5 por
  hora.

### O deploy, conferido contra produção

- Gate de sessão: `/dashboard`, `/estoque`, `/rebanho` e `/financeiro` devolvem
  307 sem sessão.
- **O vazamento de prefixo fechou em produção:** `/docsinterno` e
  `/planosecreto` devolviam 404 antes do deploy (entravam como públicos e caíam
  em rota inexistente) e agora devolvem 307. Foi a sonda usada para saber que o
  código novo tinha propagado.
- Públicas em 200: `/`, `/planos`, `/faq`, `/docs`, `/docs/api`,
  `/politicas/privacidade` e `/criar-conta`.
- `/api/v1/products`, `/animals` e `/financial-entries` devolvem 401 com o
  envelope `{error:{code,message}}`.
- **O agente continua respondendo:** `npm run wa` conversou com o agente de
  produção e devolveu o saldo do rebanho, exercitando `resolve-contact` e
  `execute-action` no Next 16.
- HSTS já vinha da Vercel. Os demais cabeçalhos de segurança (CSP,
  `X-Frame-Options`, `Referrer-Policy`) continuam ausentes: é item da próxima
  etapa, não regressão.

### A branch `observabilidade` (2026-08-20, NÃO mesclada)

Continuação da fase 0, quatro commits, `96218e4` no remoto. **Não foi para
produção**, e leva **duas migrações** que precisam ser aplicadas no Neon antes
do push, pelo invariante 3.

- **Envelope de erro garantido**: `withApi` em 111 arquivos e 145 handlers,
  mais `src/lib/log.ts` (log estruturado, com a regra de privacidade escrita
  no arquivo). Erro conhecido do Prisma vira status de negócio; a mensagem ao
  cliente nunca é a do Prisma. `test:m40` prova as duas bordas e reprova rota
  nova sem wrapper.
- **Cabeçalhos de segurança** em `next.config.mjs`, com CSP em `Report-Only`
  de propósito: o redesenho da fase seguinte muda a superfície de estilo.
- **Integridade no banco** (`test:m41`): FKs dos eixos de posição do
  livro-razão (`Restrict`) e da entrada financeira (`SetNull`, porque
  `cancelMovement` apaga a entrada de propósito), índices nos eixos realmente
  consultados, `updated_at` e autoria em `FinancialEntry`, e `dedup_key` com
  unicidade por DIA no `Alert`.
- **`execute-action` endurecido** (`test:m42`): `REPORT_LINK_SECRET` separado
  do segredo interno, `tenant_id` do corpo conferido contra o dono do
  `user_id` (403 em divergência), e idempotência por `wamid` via
  `AgentRequest`.

⚠️ **Duas coisas precisam de você antes de isto valer inteiro:**
1. **`REPORT_LINK_SECRET` na Vercel.** Sem ela o sistema funciona usando o
   segredo interno como reserva e avisando no log, que é justamente o problema
   que o commit resolve.
2. **O n8n precisa passar `provider_message_id`** (o `wamid` que ele já tem no
   payload) para a idempotência valer. Sem o campo, o comportamento é o antigo.
   É edição de um nó, e entra quando o agente for descongelado.

### Próximo passo

O que resta da fase 0: telemetria com Sentry (falta o DSN), o esquema Zod por
intenção para `parameters` (hoje é `z.record(z.string(), z.unknown())`, o único
caminho de escrita sem validação de domínio), o worker de fila no Railway, o
staging em branch do Neon, e a decisão sobre as duas verdades do rebanho.

Continua pendente, de antes: **teste no aparelho** pelo roteiro em
[roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md), cadastrando antes os
três produtos do bloco 0 em `/estoque`.

### Pendências

O levantamento completo, com evidência e custo de cada item, está em
**[dividas.md](dividas.md)** (2026-08-18). As três que mais pesam:

- **Estoque nunca foi testado no aparelho**, embora esteja em produção. É o
  próximo passo acima.
- **`app-mobile-fundacao` tem 3 commits fora da `main` desde 05/08**, com 5
  defeitos corrigidos e nunca retestados, enquanto a `main` recebeu os Módulos
  30 e 31 inteiros. É a dívida que mais cresce sozinha.
- ~~**Não existe CI.**~~ Resolvido em 2026-08-20 e já na `main`. Falta ligar a
  proteção de branch no GitHub, que é trabalho de interface web, e conferir a
  primeira execução (sem `gh` aqui, quem lê o resultado é o usuário).

Quatro achadas hoje, que não estavam em `dividas.md`:

- **`gh` CLI não existe nesta máquina**, embora `issue-tracker.md` o pressuponha.
  `git push` funciona; abrir issue, PR ou ler resultado de CI, não.
- **Defeito ativo no rebanho:** `whatsapp-flow-bridge.ts` e `POST /api/v1/animals`
  criam lote na categoria "Não classificado", e o saldo lê `HerdMovement`. Quem
  cadastra animal pelo assistente não o vê no rebanho. A recomendação de correção
  está no plano e no documento novo para o cliente.
- **12 calculadoras no ar sem a validação técnica assinada** que o próprio plano
  de ação exige. Cobrança preparada em
  [../cliente/04-decisoes-pendentes.md](../cliente/04-decisoes-pendentes.md),
  junto com o modelo de rebanho, o destino da Lavoura e as cinco decisões de
  canal. **Nada disso foi enviado ainda.**
- **Verificação de negócio na Meta não começou.** Recomendada em 31/07 com o
  aviso de que "se ficar para setembro, chega atrasado". A cobrança da Meta muda
  em 01/10/2026. É o maior risco de calendário aberto, e não depende de código.

## Histórico recente

- **2026-08-20:** fase 0 da evolução, em produção (`e719a45`): CI de verdade, suíte
  de gate de sessão, Next 16 com React 19, middleware renomeado para proxy e
  quatro advisories de auth fechadas. Validado em navegador e por requisição
  real, não só por suíte verde.
- **2026-08-18:** higiene das instruções. `CLAUDE.md` de 1.211 para ~270 linhas,
  com a arqueologia movida para `.claude/rules/*.md` (carregam sozinhas por
  glob); travas de agente versionadas para travessão, heredoc com escape e
  merge/push/deploy; `npm run check`; `CONTRIBUTING.md` apagado.
- **2026-08-18:** missão 2 do Módulo 31 (Estoque) em produção, mais o
  classificador do n8n ensinado. O teste contra produção achou um defeito que
  gravava dinheiro, corrigido no mesmo dia.
- **2026-08-14:** missão 1 do Módulo 31 (Negociações, gado) em produção,
  validada por áudio no aparelho.
- **2026-08-13:** banco de provas do agente (`npm run wa`) em produção: conversa
  com o agente real e lê a resposta por programa, sem depender de print.

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md).
