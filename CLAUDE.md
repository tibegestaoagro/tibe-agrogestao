# Tibé (AgroGestão): contexto para Claude Code

SaaS multi-tenant de gestão agropecuária (rebanho, lavoura, prestação de
serviço, financeiro) com agente de IA no WhatsApp como canal primário.
Cliente/financiador do MVP: Da Mata Sementes LTDA. Desenvolvido pela Pleno
Digital.

**Leia primeiro:** [docs/tibe-prd.md](docs/tibe-prd.md) (PRD, v1.1) e a spec do
módulo em que for trabalhar, em `docs/specs/`. Este arquivo é o resumo
operacional; o PRD é a fonte de verdade para modelo de dados, contratos e regras
de produto.

**Continuidade entre dispositivos:** depois deste arquivo, leia
[docs/agents/current-handoff.md](docs/agents/current-handoff.md). O trabalho
acontece em duas máquinas (desktop e notebook), e o handoff é o que permite
pausar numa e retomar na outra. Não existe mais coordenação multi-agente (Codex
descontinuado em 2026-08-04): é só Claude Code, em dispositivos diferentes. O
estado registrado nele prevalece sobre notas antigas e sobre este arquivo.

---

## Invariantes: as 8 regras que nunca podem ser quebradas

Se você só ler uma parte deste arquivo, leia esta. Cada linha aqui já foi
violada por engano em alguma sessão, e cada violação custou caro.

1. **`tenant_id` nunca vem do client.** Toda query de negócio usa o client
   escopado (`getTenantDb()` / `prismaForTenant()`), nunca filtro manual. Todo
   model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS`, e
   `npm run test:isolation` reprova se esquecer.
2. **O saldo nunca é gravado**, nem no rebanho (Módulo 30) nem no estoque
   (Módulo 31): é sempre a soma das movimentações. Se você se pegar escrevendo
   um campo de quantidade, pare.
3. **Migração ANTES do push**, sempre que o commit mexer em schema. A Vercel faz
   deploy automático e o build **não** roda migração: código e schema saem
   dessincronizados por padrão e nada avisa. Confira com
   `npx prisma migrate status` apontando pro Neon.
4. **Nunca use travessão** (o traço longo, U+2014) em código, documentação ou
   mensagem de commit. Use dois pontos, vírgula, parênteses ou ponto final.
5. **Nunca escreva conteúdo com escape (regex, quebra de linha, tabulação) por
   heredoc no shell:** este ambiente corrompe a sequência silenciosamente, e o
   sintoma parece bug de regra de negócio. Use as ferramentas Edit/Write.
6. **Regra de negócio vive em `src/lib/actions/*`**, nunca no route handler. As
   rotas são wrappers finos; o agente WhatsApp chama as mesmas actions.
7. **Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
   usuário, a cada vez.** Commit e push de branch de trabalho são livres.
8. **Teste automatizado verde não é validação.** Vários defeitos reais deste
   projeto só apareceram em navegador, aparelho ou contra o classificador de
   verdade, com `tsc`, `lint` e a suíte inteira limpos.

### Cinco delas não dependem mais de você lembrar

Travas mecânicas em `.claude/` (desde 2026-08-18) e no CI (desde 2026-08-20),
versionadas para valerem também no notebook:

| invariante | o que impede | onde |
|---|---|---|
| 4 | escrita que introduza travessão | `.claude/hooks/guarda-escrita.mjs` |
| 5 | heredoc que escreva conteúdo com escape | `.claude/hooks/guarda-bash.mjs` |
| 7 | `git merge`, `git push` mirando a `main`, e deploy | `.claude/hooks/guarda-bash.mjs` |
| 1 | model com `tenant_id` fora de `TENANT_SCOPED_MODELS` | `npm run test:isolation` |
| 3 | schema mudado sem migração correspondente | `npm run test:drift`, no CI |

As travas recusam a ação e explicam o caminho certo. Se uma delas te bloquear,
**a resposta não é contorná-la**: ou o caminho proposto na mensagem resolve, ou
a regra precisa mudar, e isso é conversa com o usuário.

Quando o usuário autorizar merge, push na `main` ou deploy, o caminho é repetir
o comando com a marca `AUTORIZADO_PELO_USUARIO=1` na frente. **Nunca desligue o
hook**: a marca existe justamente para o caminho autorizado não ser desligá-lo,
porque hook desligado não volta sozinho. E ela só vale para autorização dada NA
CONVERSA, nunca deduzida de uma anterior. `permissions.defaultMode` está em
`"auto"` no escopo de usuário desde 2026-08-18, e foi testado: **os hooks
continuam bloqueando nesse modo**.

`npm run check` completa o quadro sem banco, em **15 conferências**: caminho
citado que não existe, rota que não existe mais, `npm run` inexistente,
travessão novo, os dois índices parciais que o `migrate diff` tenta derrubar,
contraste de par de token, `<input type="number">` novo, cor crua do Tailwind,
rótulo de movimentação do rebanho, recusa do servidor engolida, painel de
escrita fora do kit, recusa do Zod devolvida crua, cofre de conhecimento com
link quebrado, elemento cujo fundo repete o do container que o envolve, e
campo do `ORDEM` cujo `<Field>` não renderiza a própria recusa.

⚠️ **A 10 e a 15 parecem a mesma e não são.** A 10 pergunta se o ARQUIVO trata
a recusa em algum lugar, e foi por isso que ela aprovou oito campos mudos de
uma vez na tela do Confinamento. A 15 pergunta campo por campo, porque
`aplicarErroDoServidor` só usa o rodapé quando o campo NÃO está no `ORDEM`:
campo listado sem `error=` no `<Field>` engole a mensagem inteira.

As de 8 a 12 e a 15 andam por **linha de base que só encolhe** (`scripts/baseline-*.json`):
o que já existia fica listado, e o que nasce novo é reprovado. É o padrão de
catraca deste projeto: nunca mutirão, sempre catraca.

**O CI (`.github/workflows/ci.yml`) roda em todo push**, e é o que faz uma
edição feita à mão, no editor, passar pelas mesmas conferências que os hooks
aplicam ao agente. Três jobs: estático (sem banco), com banco em PR (Postgres
**e Redis próprios**, o que tirou três suítes de cima do Redis de produção) e
drift de migração. Falta ligar a proteção de branch no GitHub, que é trabalho
de interface: ver
[docs/agents/pendencias-do-usuario.md](docs/agents/pendencias-do-usuario.md).

## Retomando depois de um resumo de contexto

Sessões longas passam por resumo automático, e o detalhe literal se perde. O que
sobrevive é o que está em arquivo. Ao retomar, nesta ordem:

1. Este arquivo (invariantes + a seção da área em que for mexer).
2. [docs/agents/current-handoff.md](docs/agents/current-handoff.md): estado
   operacional, branches vivas e o próximo passo exato. **Se divergir daqui, o
   handoff vence**, porque é atualizado a cada rodada.
3. `git log --oneline -15` e a spec do módulo em `docs/specs/`.

Não confie na memória local do Claude Code para estado: ela é invisível para
outras ferramentas e envelhece sem aviso. Ela serve para preferência do usuário
e armadilha de ambiente, não para "onde o projeto está".

## Como este projeto é conduzido

Um módulo de cada vez, seguindo a fase do contrato. O usuário (Dilton) segue
este protocolo com qualquer agente:

1. **Antes de codificar**, leia a spec inteira e devolva um resumo curto
   confirmando o objetivo e **toda ambiguidade encontrada**. Nunca assuma em
   silêncio: pergunte, com `AskUserQuestion` para decisões de produto ou
   arquitetura que a spec não resolve.
2. **Implemente task por task**, na ordem da spec, e **siga os contratos de API
   literalmente**. Extensão aditiva (campo novo que não quebra nada) é
   aceitável se documentada; produto ou arquitetura novos exigem perguntar.
3. **Ordem de entrega: action, depois ROTA, só então TELA.** Tela sem rota atrás
   não conta como entregue.
4. **Ao final do módulo**, rode os critérios de aceitação e reporte o que passou
   e o que faltou *antes* de o usuário validar à mão.
5. **Não avance para o próximo módulo sem aprovação explícita.**
6. **Toda tarefa concluída recebe commit automático** na branch de trabalho, sem
   nova autorização. Só escopo concluído e validado; nunca marque trabalho
   parcial como concluído.
7. **Ao encerrar uma rodada**, atualize `docs/agents/current-handoff.md` antes da
   resposta final. Só fatos verificados: estado, escopo, testes, commit, deploy,
   pendências e próximo passo. Curto, sem copiar a conversa.

## Onde as coisas ficam, e o que carrega sozinho

O detalhe de cada área **não está mais neste arquivo**. Ele vive em
`.claude/rules/*.md`, e o Claude Code carrega a regra certa sozinho quando você
lê um arquivo daquela área. O que você não abrir não ocupa contexto.

| área | regra | dispara ao ler |
|---|---|---|
| Isolamento multi-tenant | `isolamento.md` | `src/lib/actions/`, `src/app/api/`, `schema.prisma` |
| Contrato de API, actions, serialização | `api.md` | `src/app/api/`, `src/lib/actions/` |
| Agente WhatsApp | `whatsapp.md` | handlers e `api/internal/whatsapp/` |
| Financeiro, alertas, email | `financeiro.md` | `financial*`, `alert*`, `email-*` |
| Cobrança Asaas e cancelamento | `billing.md` | `asaas.ts`, `billing-access.ts`, webhook |
| Cadastro verificado e senha | `cadastro-e-senha.md` | `signup/`, `password-reset/` |
| Rebanho e Minha Fazenda | `rebanho-e-fazenda.md` | `lib/herd/`, `herd*`, `properties.ts` |
| Painel da Plataforma | `plataforma.md` | `app/plataforma/`, `lib/platform/` |
| Site público e usuários | `site-publico.md` | `app/(public)/` |
| UI e componentes | `ui.md` | `src/components/`, `app/(dashboard)/` |
| Convenções de código | `convencoes-codigo.md` | qualquer `.ts` ou `.tsx` |

**Isso não é arquivamento.** Se você precisa da regra de isolamento, abra
qualquer action e ela chega junto. Se precisa dela sem abrir nada, leia
`.claude/rules/isolamento.md` direto.

## O time de agentes: três times, e quem chamar

Trabalho delegável vai para o especialista, não para um agente genérico. As
definições estão em `.claude/agents/`, e cada uma **aponta** para a regra da
área em vez de copiá-la.

| agente | quando usar | modelo |
|---|---|---|
| `servidor-acao` | action e rota: regra de negócio, contrato de API | sonnet |
| `servidor-dados` | `schema.prisma` e migração | sonnet |
| `servidor-agente` | handlers do WhatsApp e rotas internas | sonnet |
| `tela-pagina` | página, formulário, componente de feature | sonnet |
| `tela-kit` | primitivo de `components/ui/` e token de `globals.css` | sonnet |
| `prova-suite` | suíte escrita **da spec**, trava, catraca, CI | sonnet |
| `prova-juiz` | julgamento independente de um range de commits | opus |
| `prova-viva` | validação contra o mundo: navegador, aparelho, `npm run wa` | sonnet |
| `n8n-fluxo` | o n8n **fora** do Tibé: workflow, intenção, prompt de nó | sonnet |
| `explorador` | achar onde está X, quem chama Y | haiku |

O protocolo de despacho em paralelo (campos `Arquivos:` e `Depende-de:`,
formação de onda, quem commita) está na skill `orquestrar-ondas`. O manual de
operação, escrito para o usuário, está em
[docs/agents/como-orquestrar.md](docs/agents/como-orquestrar.md).

⚠️ **Subagente não commita.** Ele deixa a mudança no working tree e relata os
arquivos tocados; a sessão principal commita, uma tarefa por vez, capturando o
`HEAD` fresco antes de cada uma. Isso não afrouxa a regra 6: o commit continua
automático, só muda quem o faz. E **nenhum subagente recebe a autorização do
invariante 7**.

⚠️ **Os agentes globais em `~/.claude/agents/` (`especialista-css`,
`especialista-js` e afins) são de outro projeto e de outro stack** (SASS
indentada, Vue/Nuxt). Aqui eles orientam errado. Não os despache neste
repositório.

## O cofre de conhecimento

`docs/conhecimento/` guarda o que foi **aprendido**: uma nota por lição, com
`tipo`, `data`, `tags` e `[[wikilink]]`. **Ele nunca carrega em contexto**: você
busca e lê só a nota que interessa.

```
grep -ril "<termo>" docs/conhecimento/
```

Ele existe porque o handoff tem teto de 200 linhas, e a lição aprendida era
resumida destrutivamente a cada rodada. **Não é lugar de estado** (isso é o
handoff) **nem de dívida** (isso é o `dividas.md`). Para escrever, use a skill
`memoria-cofre` ou o comando `/lembrar`. A **conferência 13** do `npm run check`
reprova `[[wikilink]]` quebrado e frontmatter inválido.

Para navegar como grafo, abra a pasta **`docs/`** no Obsidian: os arquivos que
já existem viram vault sem migrar nada, e o agente não depende do app estar
aberto.

## Status dos módulos

| # | Módulo | Estado |
|---|---|---|
| 0 a 6 | Setup, Rebanho/Lavoura, Prestador, Agente WhatsApp, Financeiro, Painel/Cobrança/Site, Painel da Plataforma | em produção |
| 17, 19 | Agenda com custo; cadastro público verificado | em produção |
| 26 a 29 | Máquinas, Meu Dia, Ajustes financeiros, Minha Fazenda | em produção |
| 30 | Rebanho como livro-razão | fases 1 e 2 completas, em produção |
| 31 | Negociações: as **quatro** missões (gado, estoque, leilão/evento, permuta) | em produção, **módulo fechado** |
| - | Identidade e sistema de design: as cinco frentes | em produção desde 2026-08-31 |

⚠️ **O agente do WhatsApp ainda NÃO emite as intenções das missões 3 e 4**
(`registrar_remessa_evento`, `encerrar_remessa_evento`, `registrar_permuta`).
Os handlers existem e são testados; o classificador do n8n está congelado por
decisão do usuário até o sistema estar revisado.

Specs em `docs/specs/`. O detalhe de estado e as pendências vivas ficam no
handoff, não aqui.

⚠️ **A numeração de suíte NÃO bate com a de módulo.** `test:mNN` é um contador
de SUÍTES que descolou por volta do `m25`: o Módulo 26 (Máquinas) é testado por
`test:m27`, e o Módulo 30 por `test:m32`. Renumerar colidiria. Ao criar suíte
nova, use o próximo número livre e deixe o texto impresso apontando o módulo
real. `npm run check` reprova suíte em disco sem entrada no `package.json`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Prisma 7 ·
PostgreSQL 17 (Neon) · NextAuth v5 beta (**duas instâncias**: tenant e
plataforma) · Zod 4 ·
Recharts · UI kit shadcn-style feito à mão · Redis Cloud + BullMQ · Asaas ·
nodemailer (Gmail SMTP) + Resend. N8N é infra externa já provisionada
(Railway): orquestra o agente WhatsApp e não roda dentro do Tibé, por isso não
aparece no `package.json`. Cloudflare R2 segue no PRD mas nunca foi necessário.

## Deploy, infra e as armadilhas do ambiente

- **App:** https://tibe-agrogestao.vercel.app (Vercel, deploy automático em push
  na `main`). **Repo:** `tibegestaoagro/tibe-agrogestao`, privado.
- **Banco de produção:** Neon. **Dev local:** Postgres 17 em Docker, container
  `tibe-pg`, porta `55432` (`docker start tibe-pg`).

⚠️ **O Docker Desktop cai sozinho neste ambiente**, e o sintoma é
`DatabaseNotReachable` numa tela que funcionava. Suba
(`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), espere
com `until docker ps > /dev/null 2>&1; do sleep 5; done`, e reinicie os dois
containers. O `next dev` também morre quando um `npm run build` roda em
paralelo: confira a porta antes de culpar o código.

⚠️ **`npm run seed:demo` precisa conhecer TODA tabela que referencia
`Property`.** `wipeDemoData` ficou sem `HerdMovement`, `HerdStay`,
`StockMovement` e `Negotiation` quando os Módulos 30 e 31 chegaram, e as quatro
apontam para `Property` com `onDelete: Restrict` (deliberado: "saíram 20 da
Fazenda A" perde o sentido se a origem sumir). O seed morria em chave
estrangeira, e `test:herd` passou a falhar por falta de fixture. Corrigido em
2026-08-31; **tabela nova que referencie `Property` entra naquela lista**.

⚠️ **O `.env` aponta para o Neon de PRODUÇÃO.** Antes de rodar migração, seed ou
teste local, passe a URL do Docker inline, sem editar o `.env`:

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m1
```

Use `127.0.0.1`, não `localhost`, que não resolve neste ambiente. E **nunca**
`$env:VAR=` dentro do Bash: não faz efeito, o `.env` prevalece, e o teste vai
para produção. `exigirBancoLocal()` (`scripts/_banco-local.ts`) reprova as
suítes nesse caso, mas a trava só existe porque o acidente já aconteceu.

⚠️ **`prisma migrate dev` é interativo e falha em automação.** O fluxo daqui:

```
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# salvar o SQL em prisma/migrations/<timestamp>_nome/migration.sql
npm run db:deploy
```

Aplique primeiro no Docker local, rode os testes, e só então no Neon (URL
**Direct**, sem `-pooler`; a Pooled é a de runtime).

⚠️ **Dois índices parciais não são representáveis no `schema.prisma`**, então
todo `migrate diff` sugere um `DROP INDEX` deles como se fosse drift:
`WhatsAppProviderConfig_one_active` (no máximo 1 provider ativo) e
`AnimalBatch_tenant_ear_tag_key` (brinco único por tenant quando preenchido).
**Não aplique esses drops**; remova a linha do SQL gerado. `npm run check`
confere que os dois continuam criados.

⚠️ **O `.env` aponta para o Redis de PRODUÇÃO**, como faz com o banco. Três
suítes (`m4`, `m19`, `m24`) leem o lock diário (`tibe:alerts:generated:<data>`
e `tibe:digest:generated:<data>`, chaves globais, não por tenant) e falham
quando a rodada de produção do dia já passou. Não é regressão.

A saída limpa é um Redis local, provada em 2026-08-24 (as três verdes, sem
tocar em produção). Uma vez por máquina:

```
docker run -d --name tibe-redis -p 56379:6379 redis:7-alpine
```

Depois, passe as duas URLs inline, como já se faz com o banco:

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m4
```

Apagar a chave em produção também funciona, mas é o último recurso: a de
`digest` guarda o resumo diário de clientes reais contra envio em duplicata.

⚠️ **Sessão autenticada via `next start` + cookie jar não funciona localmente**:
o Edge Middleware não reconhece a sessão nesse setup. Rotas `/api/v1/*` (Node)
funcionam. Para validar página autenticada, use `next dev` + navegador real.

## Autenticação, roles e permissões

NextAuth v5 (beta), Credentials + bcrypt, dividido por causa do Edge runtime:
`src/lib/auth.config.ts` é a config edge-safe usada por `src/proxy.ts` (e é
lá que fica a lista de rotas públicas); `src/lib/auth.ts` é a instância completa,
Node runtime. `User.email` é **globalmente único**: um email pertence a
exatamente um tenant. O middleware libera `/api/*` da checagem de sessão, para
rota de API sem sessão devolver `401` JSON em vez de redirecionar.

⚠️ **O middleware é `src/proxy.ts`, e `middleware.ts` não existe neste
projeto**: o Next 16 renomeou o arquivo. Procurar por `middleware.ts` não
devolve nada, e o engano custa uma rodada.

Enum `UserRole`: `OWNER | ADMIN | OPERADOR | VISUALIZADOR`. Hierarquia e matriz
de acesso em `src/lib/permissions.ts` (espelha o PRD §5.2). `canAccess`/
`canWrite` recebem a role direta, então funcionam fora de contexto HTTP: é assim
que o agente WhatsApp valida permissão sem cookie.

## Validação ao vivo: por que a suíte verde não basta

Este projeto tem dezenas de suítes automatizadas, `tsc` e `lint` limpos e build
passando. Ainda assim, **os defeitos mais graves só apareceram em uso real**:

- o formulário de máquina do app **não abria sem sinal**, tornando a fila
  offline inútil justo no curral (achado com modo avião num Android);
- `Tenant.archived_at` **não fazia nada**: nenhum ponto de auth, sessão ou
  billing lia o campo, embora a interface mostrasse "Arquivado";
- o middleware **não bloqueava nada** por sessão de tenant havia meses;
- no estoque, **"não, deixa pra lá" gravava a compra recusada**, porque o
  classificador do n8n não remonta os parâmetros literalmente, e cinco rodadas
  de juiz com a suíte verde não pegaram isso;
- as **71 rotas devolviam a recusa do Zod em inglês** e sem dizer o campo, então
  quem cadastrava máquina com custo negativo lia "Too small: expected number to
  be >=0" no rodapé do painel (2026-08-31);
- uma **pílula invisível**: o alias `tibe.light` virou o próprio fundo da
  página, e o gate de contraste aprovava, porque o texto continuava legível.

Nenhum é erro de cálculo: são erros de **integração com o mundo**. Antes de
reportar um módulo como concluído, valide no navegador real, no aparelho, ou
pelo banco de provas (`npm run wa`, que conversa com o agente de produção e lê
a resposta por programa).

**A ordem que funciona:** quebre a trava de propósito, rode a suíte, e **abra a
tela**. Em três frentes seguidas os piores defeitos só apareceram na terceira
etapa. Reservar tempo para ela é parte da estimativa, não sobra.

⚠️ **Trava só vale depois de você a ver FALHAR.** Uma trava nova nasceu com uma
regex que aceitava a palavra `toast` solta, e a palavra aparece no `import`:
todo arquivo que apenas importava passava. Provar nos dois sentidos é regra.
Pelo mesmo motivo, **teste que passa antes E depois da correção não prova
nada**: o caso que discrimina costuma ser o da ponta que FALTA.

### Como validar tela autenticada, sem digitar senha

Dois scripts, os dois travados por `exigirBancoLocal()`:

```
npx tsx scripts/_sessao-local.ts     # emite o cookie de sessao do owner do seed
npx tsx scripts/_cenario-onda2.ts    # monta cenarios de recusa no banco de dev
```

O primeiro assina o cookie do NextAuth com o segredo que o próprio app usa,
como o `signIn` faria depois de conferir o bcrypt: ponha o valor em
`document.cookie` no `next dev` e a sessão vale. Existe porque o outro caminho
seria digitar senha no formulário, e **este agente não digita senha em campo
nenhum, em ambiente nenhum**.

⚠️ **Sessão via `next start` + cookie jar continua não funcionando** (o Edge
Middleware não a reconhece nesse setup). Use `next dev` + navegador real.

### Confirmar deploy

`/docs/api` é público e lista as rotas reais: se a rota nova aparece lá, o
commit subiu. **Mas isso só serve para frente que cria rota.** Numa frente só
de interface, a impressão digital é um token do `globals.css`, lido no
navegador com `getComputedStyle(document.documentElement)`.

⚠️ **Não sonde produção em laço com `curl`.** 28 chamadas em poucos minutos
dispararam a proteção anti-bot da Vercel (`X-Vercel-Mitigated: challenge`), e
todas as rotas públicas passaram a devolver `403` para o cliente. Não era
queda, navegador real resolve sozinho, e a mitigação **não é para ser
contornada**. Confirmar deploy é verificação de navegador.

## Comandos

```
npm run dev / build / lint
npm run check             # conferência estática do repo, sem banco
npm run db:deploy         # aplica migrações (não-interativo)
npm run db:seed
npm run wa                # banco de provas do agente WhatsApp
npm run test:isolation    # M0 + guardrail TENANT_SCOPED_MODELS
npm run test:docs-api     # /docs/api sincronizado com as rotas reais
npm run test:all          # a suíte INTEIRA, uma por vez, com resumo no fim
npm run worker            # consome a fila da rotina diária (roda fora da Vercel)
```

As suítes por módulo (`test:m1` em diante) estão todas no `package.json`.

`npm run test:all` fecha a dívida de que "a suíte completa nunca roda de uma
vez". Ele **não para na primeira falha** (parar esconderia as outras) e
**recusa rodar contra produção**, porque as suítes criam e apagam tenants.
Leva alguns minutos. `npm run test:all -- --sem-redis` pula as três que
dependem do Redis compartilhado e falham na segunda execução da mesma hora.

A lista completa é o `package.json`, e é ela que vale: `npm run check` reprova
qualquer comando citado na documentação que não exista lá. Credenciais do seed
(dev): `owner@damata.com.br` / `tibe123`.

## Memória local e skills

Além deste arquivo (versionado, visível a qualquer sessão e a qualquer humano),
existe uma memória **local à máquina**, fora do repositório, em
`~/.claude/projects/<pasta-do-projeto>/memory/`. O trecho do meio é derivado do
caminho onde o projeto está clonado, então **muda de máquina para máquina**:
citar um caminho absoluto aqui envelhece na primeira vez que o projeto se move,
como já aconteceu. Essa memória guarda preferência do usuário e armadilha de
ambiente, **não** estado do projeto, e não é visível para outras ferramentas.
Trate este arquivo como a fonte que precisa funcionar sozinha.

Issues ficam nas GitHub Issues do repo, via `gh` CLI
([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)), com as labels de
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).
