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

### Quatro delas não dependem mais de você lembrar

Desde 2026-08-18 há travas mecânicas em `.claude/`, versionadas para valerem
também no notebook:

| invariante | o que impede | onde |
|---|---|---|
| 4 | escrita que introduza travessão | `.claude/hooks/guarda-escrita.mjs` |
| 5 | heredoc que escreva conteúdo com escape | `.claude/hooks/guarda-bash.mjs` |
| 7 | `git merge`, `git push` mirando a `main`, e deploy | `.claude/hooks/guarda-bash.mjs` |
| 1 | model com `tenant_id` fora de `TENANT_SCOPED_MODELS` | `npm run test:isolation` |

As travas recusam a ação e explicam o caminho certo. Se uma delas te bloquear,
**a resposta não é contorná-la**: ou o caminho proposto na mensagem resolve, ou
a regra precisa mudar, e isso é conversa com o usuário.

`npm run check` completa o quadro sem banco: caminho citado que não existe, rota
que não existe mais, `npm run` inexistente, travessão novo, e os dois índices
parciais que o `migrate diff` tenta derrubar.

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

## Status dos módulos

| # | Módulo | Estado |
|---|---|---|
| 0 a 6 | Setup, Rebanho/Lavoura, Prestador, Agente WhatsApp, Financeiro, Painel/Cobrança/Site, Painel da Plataforma | em produção |
| 17, 19 | Agenda com custo; cadastro público verificado | em produção |
| 26 a 29 | Máquinas, Meu Dia, Ajustes financeiros, Minha Fazenda | em produção |
| 30 | Rebanho como livro-razão | fase 1 completa, em produção |
| 31 | Negociações: missão 1 (gado) e missão 2 (estoque) | em produção |
| 31 | Missões 3 (leilão e eventos) e 4 (permuta) | não iniciadas |

Specs em `docs/specs/`. O detalhe de estado e as pendências vivas ficam no
handoff, não aqui.

⚠️ **A numeração de suíte NÃO bate com a de módulo.** `test:mNN` é um contador
de SUÍTES que descolou por volta do `m25`: o Módulo 26 (Máquinas) é testado por
`test:m27`, e o Módulo 30 por `test:m32`. Renumerar colidiria. Ao criar suíte
nova, use o próximo número livre e deixe o texto impresso apontando o módulo
real. `npm run check` reprova suíte em disco sem entrada no `package.json`.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 7 · PostgreSQL 17
(Neon) · NextAuth v5 beta (**duas instâncias**: tenant e plataforma) · Zod ·
Recharts · UI kit shadcn-style feito à mão · Redis Cloud + BullMQ · Asaas ·
nodemailer (Gmail SMTP) + Resend. N8N é infra externa já provisionada
(Railway): orquestra o agente WhatsApp e não roda dentro do Tibé, por isso não
aparece no `package.json`. Cloudflare R2 segue no PRD mas nunca foi necessário.

## Deploy, infra e as armadilhas do ambiente

- **App:** https://tibe-agrogestao.vercel.app (Vercel, deploy automático em push
  na `main`). **Repo:** `tibegestaoagro/tibe-agrogestao`, privado.
- **Banco de produção:** Neon. **Dev local:** Postgres 17 em Docker, container
  `tibe-pg`, porta `55432` (`docker start tibe-pg`).

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

⚠️ **O Redis é compartilhado com produção** (não há instância local). Três
suítes (`m4`, `m19`, `m24`) falham na segunda execução da mesma hora por lock
diário ou limite de envio. Não é regressão: apague a chave no Redis.

⚠️ **Sessão autenticada via `next start` + cookie jar não funciona localmente**:
o Edge Middleware não reconhece a sessão nesse setup. Rotas `/api/v1/*` (Node)
funcionam. Para validar página autenticada, use `next dev` + navegador real.

## Autenticação, roles e permissões

NextAuth v5 (beta), Credentials + bcrypt, dividido por causa do Edge runtime:
`src/lib/auth.config.ts` é a config edge-safe usada por `src/middleware.ts` (e é
lá que fica a lista de rotas públicas); `src/lib/auth.ts` é a instância completa,
Node runtime. `User.email` é **globalmente único**: um email pertence a
exatamente um tenant. O middleware libera `/api/*` da checagem de sessão, para
rota de API sem sessão devolver `401` JSON em vez de redirecionar.

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
  de juiz com a suíte verde não pegaram isso.

Nenhum é erro de cálculo: são erros de **integração com o mundo**. Antes de
reportar um módulo como concluído, valide no navegador real
(`browser-harness`), no aparelho, ou pelo banco de provas (`npm run wa`, que
conversa com o agente de produção e lê a resposta por programa).

## Comandos

```
npm run dev / build / lint
npm run check             # conferência estática do repo, sem banco
npm run db:deploy         # aplica migrações (não-interativo)
npm run db:seed
npm run wa                # banco de provas do agente WhatsApp
npm run test:isolation    # M0 + guardrail TENANT_SCOPED_MODELS
npm run test:docs-api     # /docs/api sincronizado com as rotas reais
```

As suítes por módulo (`test:m1` em diante) estão todas no `package.json`.

A lista completa é o `package.json`, e é ela que vale: `npm run check` reprova
qualquer comando citado na documentação que não exista lá. Credenciais do seed
(dev): `owner@damata.com.br` / `tibe123`.

## Memória local e skills

Além deste arquivo (versionado, visível a qualquer sessão e a qualquer humano),
existe uma memória **local à máquina**, fora do repositório, em
`C:\Users\dilto\.claude\projects\d--Projetos-Web-agrogestao-tibe\memory\`. Ela
guarda preferência do usuário e armadilha de ambiente, **não** estado do
projeto, e não é visível para outras ferramentas. Trate este arquivo como a
fonte que precisa funcionar sozinha.

Issues ficam nas GitHub Issues do repo, via `gh` CLI
([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)), com as labels de
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).
