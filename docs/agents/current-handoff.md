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

- Atualizado em: 2026-08-05
- **Produção: `83b813c` no ar.** Levou rebanho por categoria (brinco opcional)
  e o cancelamento com janela de arquivamento de 60 dias. As 3 migrações
  correspondentes já estão aplicadas no Neon.

### Três branches vivas, nenhuma mesclada

| Branch | Commit | Estado |
|---|---|---|
| `app-mobile-fundacao` | `482bd50` | fundação de UI do app; **defeitos de teste em aparelho já corrigidos, aguardando reteste** |
| `rebanho-livro-razao` | `ed052ff` | **só a spec**, sem código; aguardando sua revisão |
| `cancelamento-com-janela` | `db52dc3` | já mesclada em `main` e no ar; pode ser apagada |

**Ao trocar de branch, os arquivos do app somem do editor.** É esperado: o
trabalho do mobile vive só em `app-mobile-fundacao`.

### EM ANDAMENTO: Módulo 30, fase 1 (branch `rebanho-livro-razao`)

Spec **aprovada pelo usuário** em 2026-08-05. Duas tarefas concluídas:

| # | Tarefa | Commit |
|---|---|---|
| 1 | 12 categorias como constante + apelidos + `test:m32` (26 verificações) | `9f461ae` |
| 2 | Schema `HerdMovement` + migração que converte o rebanho existente | `c1f884c` |
| 3 | Actions do livro-razão (`getPositions` + `recordMovement`) + `test:m33` | `7793df0` |
| 4 | Histórico, cancelamento e as 4 rotas de API | `fdd3870`, **em produção** |
| 5 | Tela `/rebanho` (§11 e §12), validada em navegador | `e9b3587`, **em produção** |
| 6 | Assistente WhatsApp (§13 e §14) | commit desta rodada |

**As 6 tarefas da fase 1 estão concluídas.** Falta a validação do usuário
(combinada para o fim de todas as tarefas, não a cada uma) e a fase 2.

**Tarefa 3 concluída:** `src/lib/actions/herd-ledger.ts`.
`getPositions(db, filtro)` soma as movimentações não canceladas por posição
(lê o histórico inteiro que casa em pelo menos um lado no banco, e faz o
match exato dos 5 eixos em JS); `recordMovement(db, input)` valida a forma
por tipo (entrada só/saída só/transferência dos dois lados/`ajuste` com
exatamente um lado), valida categoria (`isValidCategory`) e propriedade/pasto
existirem no tenant, e grava dentro de `runSerializableTenantTransaction`
(mesmo padrão de `sellBatchAction`): a checagem de saldo e a escrita
precisam ser atômicas, senão duas vendas simultâneas da última cabeça
passariam as duas pelo teste antes de qualquer uma escrever. Mensagem de
saldo insuficiente é a literal do cliente, com o número interpolado:
"Existem apenas N animais nesta categoria. Revise a quantidade informada."
Compra/venda com valor geram `FinancialEntry` via `createLinkedEntry`
(`related_id` = id da movimentação, criada DEPOIS porque a movimentação
precisa existir primeiro); nascimento/morte nunca geram. `db`/`tx` dividem
tipo `HerdLedgerClient = TenantPrismaClient | TenantTransactionClient`
porque a marca de tipo de `TenantPrismaClient` (branded, Onda 4) não
sobrevive a `$transaction`, mas ambos servem os mesmos modelos em runtime.
`npm run test:m33` (novo, 39 verificações, banco local): cadastro inicial,
compra/venda/morte/nascimento, as 3 transferências (pasto/fazenda/categoria)
preservando o total certo em cada caso, ajuste, cancelamento (some do saldo,
continua no histórico), as 6 validações de forma por tipo, categoria/
propriedade inválida recusadas, dono `terceiro` não se mistura com `proprio`
na mesma posição, e isolamento multi-tenant. `test:isolation` e `tsc
--noEmit` seguem limpos (único erro de tsc é o pré-existente e não
relacionado em `scripts/m23-token-auth.test.ts`, já documentado acima).

**Tarefa 4 concluída:** duas actions novas em `herd-ledger.ts` e as 4 rotas.

`listMovements(db, filtro, {limit, offset})` é o histórico do §10.7 (os 9
campos: data, categoria, quantidade, tipo, fazenda, pasto, usuário
responsável, motivo, observação), da mais recente para a mais antiga, com
`created_at` e `id` desempatando para a paginação não trocar linha de página.
Ela **mostra as canceladas por padrão**, ao contrário de `getPositions`, que
as ignora: é por isso que são funções separadas em vez de um parâmetro da
mesma, o §10.8 exige que o registro cancelado continue identificado no
histórico e o saldo exige o contrário. Filtro por categoria/fazenda/pasto
casa nos DOIS lados da movimentação (uma transferência aparece no histórico
da origem e do destino).

`cancelMovement(db, id, motivo)` marca `canceled_at` e nunca apaga. O
bloqueio de saldo negativo vale aqui também e olha para o lado **oposto** ao
de `recordMovement`: cancelar devolve à origem e TIRA do destino, então quem
pode ficar negativo é o destino. Caso real coberto por teste: comprar 10,
vender 8, tentar cancelar a compra. Bloqueia em vez de cancelar em cascata,
de propósito, porque cascata desfaria em silêncio movimentação que o produtor
não pediu para desfazer. **Editar é cancelar e lançar de novo**: não existe
edição no lugar, sobrescrever a linha apagaria o rastro que o §10.8 pede.

**Decisão nova do usuário (2026-08-05), financeiro no cancelamento:**
lançamento **pendente é apagado, pago é estornado** (lançamento contrário,
datado no dia do cancelamento). Erro recém-digitado some limpo; dinheiro que
de fato entrou ou saiu nunca é apagado. **Na prática hoje só o estorno roda**,
porque `recordMovement` cria o lançamento como `paid` (o evento já ocorreu);
o ramo do apagar existe para quando a compra a prazo entrar no contrato.
Quando apaga, `financial_entry_id` da movimentação é zerado para não apontar
para linha inexistente.

Rotas (todas `guard("rebanho", ..., { profile: "fazenda" })`):
`GET /api/v1/herd/positions`, `GET` e `POST /api/v1/herd/movements`,
`POST /api/v1/herd/movements/:id/cancel`. **A escrita é UMA rota para os 9
tipos**, com `movement_type` no corpo, e não uma rota por tipo: a decisão
central do módulo é que mudança de categoria não é caso especial, e nove
rotas finas reintroduziriam no HTTP o caso-a-caso que o modelo de dados
eliminou (a fase 2 viraria mais seis rotas em vez de seis valores de enum).
O Zod valida forma de dado; a regra de negócio fica na action, onde é testada.
Cancelar é POST em sub-rota, não DELETE: o recurso não é removido e a
operação exige o motivo no corpo.

`HERD_SITUATIONS`/`HERD_OWNERS`/`HERD_MOVEMENT_TYPES` são os enums do schema
como lista em runtime (para o Zod e o parse de query), em `herd-ledger.ts` e
não em `categories.ts`, que é puro de propósito. O `satisfies` é o guardrail:
listar valor fora do enum do Prisma para de compilar.

`test:m33` foi de 39 para 71 verificações; `test:docs-api`, `test:isolation`,
`test:m32`, `eslint` e `npm run build` limpos (as 3 rotas aparecem no output
do build). O único erro de `tsc` segue sendo o pré-existente de
`scripts/m23-token-auth.test.ts`.

**Tarefa 5 concluída:** `/rebanho` foi reconstruída sobre o livro-razão.

`summarizePositions` (`src/lib/herd/summary.ts`) é função **pura** e deriva
tudo que o §11 pede a partir das posições: total geral, fêmeas e machos por
categoria, por fazenda e por pasto. **Nenhuma rota de somatório existe**, e
nenhuma deve existir: somar no banco criaria um segundo caminho para o mesmo
número, que é o que o módulo foi desenhado para evitar. O teste em `test:m32`
usa **os números do exemplo do §12 na íntegra** (117 fêmeas + 58 machos =
175): se aquele bloco quebrar, o resumo deixou de bater com o documento.
`getPeriodTotals` (`herd-ledger.ts`) faz as 4 linhas de "Movimentações do
mês" e recebe `TenantPrismaClient`, não o union `HerdLedgerClient`, porque
`groupBy` tem sobrecargas genéricas demais para o TypeScript resolver sobre
uma união.

**Layout decidido com o usuário:** saldo em cima, e a tabela de lotes que
ocupava a página virou a seção "Animais identificados" no fim, mostrando só
registro que tem brinco, peso ou vacinação. O §4 manda manter esses dados
como anexo opcional e o §6 proíbe duas contagens disputando a mesma tela;
quem trabalha só por categoria nunca vê a tabela. **Categoria zerada aparece
na lista, em cinza**: no exemplo do §12 o produtor lê a lista inteira, e uma
linha faltando confunde mais do que um zero.

`MovementForm` e `MovementCancel` (`src/components/rebanho/`) importam
`@/lib/herd/categories` (puro) e **nunca** `herd-ledger.ts`, que arrastaria
Prisma para o bundle do navegador: mesma armadilha já documentada para
`@/lib/permissions`. A fase 1 sempre envia `situation: "presente"` e
`owner: "proprio"`.

**Validado em navegador real** (`next dev` + banco local, não só suíte):
registrar 4 nascimentos moveu junto o total (270→274), machos (122→126),
Bezerro 0-7 (33→37), nascimentos do mês (0→4), a fazenda (226→230) e o
histórico (235→236), com fêmeas intactas. Cancelar desfez todos esses
números de volta **e manteve as 236 linhas**, com a linha marcada
"Cancelada", o motivo visível e o link de cancelar sumindo dela. É o §10.8
funcionando de ponta a ponta.

**Tarefa 6 concluída:** os 7 diálogos do §13, em
`src/lib/actions/whatsapp-handlers/herd.ts`, com duas intenções novas:
`consultar_rebanho` (§13.1, §13.2) e `registrar_movimentacao_rebanho`
(§13.3 a §13.7). Uma intenção de escrita para os 9 tipos, com
`movement_type` no parâmetro, pelo mesmo motivo da rota única.

**A desambiguação do §14 não criou estado novo.** Termo ambíguo devolve a
pergunta com as faixas candidatas e para; o classificador do n8n reemite a
intenção com todos os parâmetros originais mais a faixa escolhida, lendo o
`recent_history`, igual ao funil do `resumo`. `AgentFlowState` foi descartado
de propósito: é máquina de formulário, um fluxo por usuário, para uma pergunta
só seria peso morto.

**Confirmação é obrigatória em todo registro**, independentemente de valor:
não usa `CONFIRMATION_THRESHOLD`, porque o risco aqui é o saldo do rebanho
ficar errado, não o financeiro. Também **não adivinha a fazenda**: com mais de
uma cadastrada e nenhuma informada, pergunta.

**Achado real do teste, corrigido na origem: plural não resolvia.**
"novilhas", "vacas" e "bezerros" caíam em `unknown`, e os exemplos do próprio
cliente são todos no plural. `resolveCategoryTerm` ganhou uma tentativa extra
tirando o "s" final, **depois** da tentativa direta (o rótulo oficial termina
em "meses" e não pode ser estropiado). Coberto em `test:m32`.

`npm run test:m34` (novo, 24 verificações) percorre os 7 diálogos do documento
um a um, mais: termo ambíguo não vira chute nem na consulta nem no registro,
"não" cancela sem registrar, saldo insuficiente devolve a mensagem literal do
cliente, e nascimento de machos E fêmeas numa mensagem só vira duas
movimentações sob uma confirmação. `test:m3`, `test:m12`, `test:m32`,
`test:m33`, `test:docs-api`, eslint e build limpos.

**Classificador do n8n sincronizado** (`docs/n8n-whatsapp-workflow.md` §4 e
§4.1), incluindo o aviso de que `registrar_lote_animal` é o caminho antigo e
escreve num modelo que o saldo não lê mais.

**Nunca validado com WhatsApp real:** os handlers passaram por teste de action
e build. A validação de ponta a ponta depende de atualizar o prompt do
workflow no n8n (Railway) com o §4.1 e mandar mensagem de um aparelho.

**A troca do §6, resolvida em parte (2026-08-05).** As três rotas
`/api/v1/animal-batches` foram **removidas**: não tinham um consumidor
sequer (nem web, nem mobile, nem `packages/contracts`, nem teste), e o
comentário de `/api/v1/animals` já afirmava desde 2026-08-04 que elas não
existiam. `animal-form.tsx` e `animal-filters.tsx` saíram junto, órfãos
desde que a tarefa 5 reconstruiu a tela.

**O que NÃO foi unificado, e por quê:** um lote criado por
`POST /api/v1/animals` ou pelo assistente ainda **não aparece no saldo** do
livro-razão. Ligar as duas escritas exige traduzir `AnimalCategory.name`
para uma das 12 faixas de idade, e isso não é seguro: medido em produção, a
única categoria ativa é **"Não classificado"**, que `resolveCategoryTerm`
devolve como `unknown`; "Novilha" e "Garrote" dão `ambiguous`. Chutar a
faixa lançaria animais na idade errada, exatamente o que a constante existe
para impedir. A desambiguação é a tarefa 6.

**Decisão do usuário sobre a ordem (2026-08-05):** deployar tudo mesmo com
essa lacuna, porque **ainda não há cliente em produção**. Sem isso a ordem
segura seria segurar a tela até a tarefa 6, já que a tela nova quebra o
vínculo "registrei pelo WhatsApp, apareceu no painel" que funcionava antes.
A validação do usuário acontece ao final de todas as tarefas, não a cada uma.

**Estado do banco local:** a migração do livro-razão já foi aplicada, e o
rebanho existente foi convertido (270 cabeças, 10 das 12 categorias, zero
perda). **Produção não foi tocada.**

**Cuidado ao criar model novo:** `test:isolation` reprovou porque
`HerdMovement` faltava em `TENANT_SCOPED_MODELS`. Todo model com `tenant_id`
precisa entrar lá.

### Janela que fecha

A migração de rebanho é barata **enquanto produção tiver 2 cabeças em "Não
classificado"**. Quando clientes reais cadastrarem rebanho, cada um terá suas
categorias digitadas e converter para a lista fixa vira trabalho de verdade.
Mesma janela que tornou a unificação de 2026-08-04 barata.
- Banco local de dev está no MESMO schema de produção agora: a divergência
  avisada na rodada anterior acabou, a `main` roda contra ele normalmente.
- Rodada anterior: **auditoria de performance e enxugamento** (`/loop-goal`,
  contrato de missão aprovado pelo usuário antes de executar). Objetivo:
  "código limpo, estrutura enxuta e performática". 6 metas (G1..G6), todas
  batidas, verificadas por comando e por um juiz subagente independente.
  Detalhes na seção abaixo. Antes dela, na mesma sessão: remoção do suporte
  multi-agente (Codex) e do graphify, e a auditoria de arquitetura com o
  skill do Matt Pocock (5 candidatos + 1 bug, commits `9b777ad`..`c5953ef`).
  Tudo isso foi para produção em `5e9caa2`, junto com o Módulo 29 e o
  cancelamento de assinatura.

### ⚠️ Incidente evitado no push: código de schema novo sem a migração

O push levou o Módulo 29 (que exige `Property.city`, `Property.district` e
a tabela `Pasture`) para produção **antes** de a migração existir no Neon.
Nesse intervalo, qualquer página logada de fazenda quebraria ao consultar
`Property` ("column does not exist"): Rebanho, Máquinas, Lavoura e o
seletor de propriedade do topo. As páginas públicas continuaram de pé, o
que mascara o problema.

**A causa é estrutural, não distração:** a Vercel faz deploy automático em
push na `main`, mas o build **não roda migração** (`build` é só
`next build`, `postinstall` é só `prisma generate`). Ou seja, código e
schema saem dessincronizados por padrão, e nada avisa.

**Regra pra próxima vez:** antes de qualquer push que inclua mudança de
schema, rode `npx prisma migrate status` apontando pro Neon. Se houver
migração pendente, aplique ANTES do push (`npm run db:deploy`, URL Direct
sem `-pooler`), não depois. Detectado e corrigido no mesmo intervalo desta
vez, mas por checagem manual minha, não por nenhuma proteção do processo.

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

### Decisões do cliente/usuário tomadas em 2026-08-04 (não implementadas ainda)

Quatro decisões grandes, registradas assim que foram tomadas. Nenhuma tem
código ainda; cada uma precisa de rodada própria com spec.

1. ~~**Rebanho é POR CATEGORIA, brinco vira opcional.**~~ **FEITO e em
   produção** (`cd8ba4e`): encerrou o maior desalinhamento aberto do projeto.
   Ver a seção "EM PRODUÇÃO" acima.
2. **Cancelamento: acesso até o fim do período pago, depois arquiva o
   tenant por 60 dias.** Muda `getBillingAccess()` (hoje `canceled` vira
   `blocked` na hora) e introduz o arquivamento com janela. **Em aberto:**
   o que acontece DEPOIS dos 60 dias (apagar? bloquear pra sempre?) e se
   isso reusa o arquivamento de tenant que já existe no painel da
   plataforma (`POST /api/platform/tenants/:id/archive`).
3. **"WhatsApp", na fala do cliente, significa ASSISTENTE (voz e
   mensagem), não o canal.** O WhatsApp segue como um canal possível, mas
   o alvo é o produtor usar o assistente DENTRO do nosso app, sem ficar
   refém da Meta. Isso reordena o roadmap: o item mais importante do app
   mobile deixa de ser portar telas do painel e passa a ser o assistente.
4. **As 27 rotas sem documentação são urgentes** (antes estavam como
   dívida aceitável).

### EM PRODUÇÃO: rebanho por categoria (`cd8ba4e`)

Spec: [docs/superpowers/specs/2026-08-04-rebanho-por-categoria-design.md](../superpowers/specs/2026-08-04-rebanho-por-categoria-design.md).
Passos 1 a 5 de 6 concluídos, mesclado na `main` e **no ar**. A branch
`rebanho-por-categoria` foi mesclada com `--no-ff` (conflito só no handoff,
resolvido pela versão da branch).

**Ordem seguida no deploy, e por que ela importa:** esta migração APAGA a
tabela `Animal`, então não existe ordem sem janela de indisponibilidade.
Escolhida (com aprovação do usuário) **migração antes do push**: se a migração
falhasse, bastava não empurrar e produção seguiria íntegra com código e schema
antigos, ambos coerentes. O inverso repetiria o incidente descrito acima.
A janela real foi o build da Vercel: `/planos` e `/login` devolveram 503/500
por volta de 150s e voltaram sozinhos.

**Verificado em produção depois do deploy**, não presumido:
- Retrato do Neon ANTES (`Animal=2, AnimalBatch=0, histórico=0, Tenant=4`) e
  DEPOIS: 2 cabeças em 2 lotes, brincos `081` e `082` preservados, categoria
  "Não classificado" criada, `to_regclass('"Animal"')` devolve nulo.
- A query exata da página `/rebanho`, rodada pelo client escopado tenant a
  tenant: só "Da Mata Sementes LTDA" tem rebanho (2 cabeças); os 3 tenants
  Agromax em trial têm 0, como antes.
- `countActiveAnimals` devolve **2 cabeças** (não 2 lotes) e
  `getHerdEvolution` devolve `jul=2 ago=2`: as duas funções que passaram a
  somar `quantity` em vez de contar linhas.
- `/docs/api` público já serve o contrato novo (`category_id`, `quantity`,
  `ear_tag`); `/rebanho` sem sessão dá 307 pro login e `/api/v1/animals` dá
  401 JSON.

**Não foi possível validar por navegador logado em produção:** a credencial do
seed (`owner@damata.com.br`) é de DEV e não existe no Neon (o login devolve
`CredentialsSignin`). A validação de tela foi feita no navegador local, com o
mesmo código, antes do merge. Para validar produção logado é preciso uma
credencial real de tenant.

Feito: modelo único `AnimalBatch` com brinco opcional (`Animal` e
`AnimalStatus` removidos, histórico em `batch_id`); migração escrita à mão (a
gerada pelo Prisma apagaria o histórico), validada contra 260 animais e 462
registros de histórico com zero perda; `AnimalMovement.quantity`; actions
consolidadas (`createBatchAction` existia DUAS vezes); rotas; tela de Rebanho
como listagem única; scripts e seed; `test:m30` novo; `/docs/api` atualizado.

Falta decidir o que fazer com as rotas `/api/v1/animal-batches`, que hoje
convivem com `/api/v1/animals` fazendo quase a mesma coisa.

**O passo 6 (`packages/contracts` de rebanho) foi DESACONSELHADO, não
esquecido.** Verificado: o pacote existe com 8 arquivos, mas tem **zero
consumidores**. Nenhum arquivo em `src` ou `apps` importa `@tibe/contracts`,
o `apps/mobile/package.json` nem o declara como dependência, e não há import
por caminho relativo. Um contrato de tipos só rende quando duas pontas
precisam concordar; com uma ponta só, ele vira mais uma cópia do schema para
manter em sincronia, sem nada conferindo se está certa. O contrato de rebanho
deve nascer junto com a tela de Rebanho do mobile, não antes dela.

**Três armadilhas de método descobertas aqui, que valem para o projeto todo:**

1. O comando que eu usava para contar erros de `tsc`
   (`grep -oP "^[^(]+\.tsx?"`) EXCLUÍA silenciosamente arquivos em pastas com
   parênteses (`(dashboard)`, `(public)`). Use
   `grep -oP "^\S+?\.tsx?(?=\(\d+,\d+\))"`.
2. `test:docs-api` verifica PRESENÇA da rota, não veracidade do conteúdo:
   ficou verde com a documentação descrevendo o contrato antigo.
3. Apagar tenant deixou de limpar por cascata (`AnimalBatch` referencia
   `AnimalCategory` com `Restrict`, correto no domínio). Sem
   `deleteTestTenants` (novo, em `scripts/helpers/herd.ts`), cada teste
   abortado deixa tenant órfão que quebra a execução seguinte com documento
   duplicado.

### Pendências e próximo passo

- Usuário quer **continuar dando funcionalidade ao app mobile**: pausado
  desde o Módulo 29 para (1) a spec de "Minha Fazenda", (2) a auditoria de
  arquitetura e (3) a auditoria de performance. As três concluídas; próximo
  passo é retomar o mobile, decidindo COM o usuário qual recurso vem a
  seguir.
- **Decisão de produto pendente (cancelamento)**: o botão foi entregue
  (`POST /api/v1/billing/cancel` + bloco no fim de
  `/configuracoes/assinatura`), expondo o comportamento que já existia.
  Falta decidir se cancelar deve BLOQUEAR na hora (é o que acontece hoje:
  `getBillingAccess()` devolve `blocked` para assinatura cancelada) ou dar
  carência até `next_due_date`. A tela avisa da consequência antes de
  confirmar, então não pega ninguém de surpresa, mas bloquear quem já pagou
  o mês é uma escolha, não uma obviedade.
- **Nunca testado contra o Asaas real**: o fluxo de cancelamento foi
  validado só no caminho de erro (sem `ASAAS_API_KEY`, devolve 503 tratado
  e não deixa a assinatura em estado parcial). O caminho de sucesso depende
  de uma chave de sandbox que este ambiente nunca teve, igual ao resto da
  integração desde o Módulo 5.
- ~~27 rotas sem documentação~~ **QUITADO** (commit `1200630`, em produção):
  eram 28 na conta final. `KNOWN_UNDOCUMENTED_GAPS` está VAZIO em
  `scripts/docs-api-completeness.test.ts`, ou seja, hoje qualquer rota nova
  sem documentação quebra `npm run test:docs-api`, sem exceção liberada.
  `/docs/api` documenta 134 rotas. **Ressalva que continua valendo:** o teste
  verifica PRESENÇA da rota, não veracidade do conteúdo.
- **Pivot de arquitetura ainda não escopado**: o usuário quer que o app
  (não só o WhatsApp) entenda voz/texto/imagem/documento diretamente,
  reduzindo a dependência do WhatsApp como canal primário (cobrança da
  Meta por conversa a partir de outubro). Ainda é só uma ideia, não um
  plano: a recomendação dada foi entrevistar isso via `/grill-with-docs`
  numa sessão NOVA (janela de contexto limpa, decisão grande de arquitetura
  com muita coisa em aberto: onde entra a chamada ao LLM, se substitui ou
  convive com o classificador do N8N, se a pipeline de mídia hoje só do
  WhatsApp é reusada). Nada implementado ainda.
- Módulo 29 (Minha Fazenda): migração já aplicada em produção. Falta o
  cadastro de fazenda/pasto pelo WhatsApp (seção 10 do documento do
  cliente) e os vínculos futuros (Task/FinancialEntry por pasto), que
  ficaram pra rodada própria por decisão do usuário.
- Decidir com o usuário se/quando reabrir Rebanho, Máquinas e Tarefas
  para o app mobile e `packages/contracts` (decisão deliberada de ficarem
  de fora, documentada em specs de módulo; tecnicamente já dá pra reabrir
  desde o Módulo 25).
- Confirmação ainda pendente da Agromax: destino da Lavoura. (O modelo de
  rebanho por categoria deixou de ser dúvida: foi confirmado pelo cliente e
  já está em produção.)
- **Próximo passo autorizado e não iniciado:** retomar o app mobile pelo
  assistente, que a decisão 3 promoveu a item mais importante do roadmap.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA (web) em Android/iPhone reais; testar iPhone
  real (só Android testado até agora).
- **Achado, não corrigido, fora do escopo** (herdado de rodada anterior): o
  aviso de instalação do PWA sobrepõe o rodapé da sidebar no mobile
  (painel WEB, não o app `apps/mobile`).

## Histórico recente

- 2026-08-05: **spec do Módulo 30** (rebanho como livro-razão), a partir de 2
  documentos do cliente. Saldo passa a ser derivado das movimentações; posição
  = categoria x fazenda x pasto x situação x dono; 12 categorias viram
  constante de código. Sem código ainda. Commit `ed052ff`.
- 2026-08-05: **fundação de UI do app mobile** (`482bd50`): 5 abas com o Tibé
  central, primitivos, fila de escrita offline, Máquinas, biometria, e a tela
  de Rebanho refeita (estava quebrada contra o back-end novo). **5 defeitos
  achados só testando com modo avião num Android real**, nenhum pego por tsc,
  lint ou expo-doctor: o formulário não abria sem sinal, o Financeiro não
  usava a fila, "Network request failed" vazava em inglês, a faixa de
  pendências não aparecia em 2 telas, e o cache exigia um gesto que ninguém
  faz. Todos corrigidos; **falta reteste em aparelho**.
- 2026-08-05: **cancelamento com janela de 60 dias em produção** (`83b813c`).
  Descoberto no caminho que `Tenant.archived_at` não fazia nada: nenhum ponto
  de auth, sessão ou billing lia o campo.
- 2026-08-04: **rebanho por categoria em produção** (`cd8ba4e`): modelo único
  `AnimalBatch` com brinco opcional, `Animal` removido, migração escrita à mão
  aplicada no Neon antes do push, dado preservado (2 cabeças, brincos 081/082).
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
