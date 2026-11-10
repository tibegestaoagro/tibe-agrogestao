# AGENTS.md: instruções para o Codex (e qualquer agente que não seja o Claude Code)

Este repositório foi tocado até 10/11/2026 pelo Claude Code, que tinha travas
automáticas em `.claude/hooks/`. **O Codex não roda esses hooks.** Tudo o que
eles impediam está escrito abaixo como regra. Se uma regra daqui parecer
atrapalhar, pare e pergunte ao usuário (Dilton): não contorne.

## Leia antes de qualquer mudança, nesta ordem

1. Este arquivo inteiro.
2. `CLAUDE.md` (as 8 invariantes, o ambiente, os comandos). Vale para você também.
3. `docs/agents/current-handoff.md` (estado de hoje e próximo passo; ele vence o CLAUDE.md quando divergirem).
4. A spec do módulo: `docs/specs/module-39-meu-emporio.md` (Empório, onde está quase todo o trabalho) e a regra da área em `.claude/rules/<area>.md` (leia a da pasta que for mexer: `api.md`, `isolamento.md`, `ui.md`, `financeiro.md`, `convencoes-codigo.md`).

## Proibido sem o usuário pedir NA CONVERSA, a cada vez

- `git merge` na `main`, `git push` para a `main`, qualquer deploy. Trabalhe numa branch (`codex/<assunto>`); push da branch é livre.
- Rodar migração no Neon (produção) ou escrever qualquer dado em produção. Ler produção para conferir é permitido.
- Mexer no n8n (fluxo do agente do WhatsApp, congelado pelo usuário) e nos dados da conta Da Mata (é a conta real da Agromax).
- Apagar branch, reescrever histórico (`rebase -i`, `push --force`, `filter-repo`), desligar teste ou trava, editar `.claude/hooks/`, `scripts/baseline-*.json` para "fazer passar".
- Commitar segredo. **O repositório é PÚBLICO**: `.env`, `.env.local`, tokens, chaves, cookies e dumps nunca entram em commit.

## O ambiente engana: leia isto antes de rodar qualquer comando

- **O `.env` aponta para o banco Neon de PRODUÇÃO.** O `.env.local` aponta para o Postgres local (Docker `tibe-pg`, porta 55432). A Prisma CLI só lê o `.env`: **todo comando Prisma e toda suíte levam a URL local inline**:

  ```
  DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m104
  ```

  Use `127.0.0.1`, nunca `localhost`. Sem a URL inline, a suíte vai para produção (`exigirBancoLocal()` costuma barrar, mas não confie nisso).
- Containers locais: `docker start tibe-pg tibe-redis` (o Docker Desktop cai sozinho; se uma suíte travar, confira `docker ps`).
- Migração nova: altere `prisma/schema.prisma`, gere o SQL com `DATABASE_URL="<local>" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, salve em `prisma/migrations/<AAAAMMDDhhmmss>_<nome>/migration.sql`, **apague as linhas `DROP INDEX` de `WhatsAppProviderConfig_one_active` e `AnimalBatch_tenant_ear_tag_key`** se aparecerem, aplique com `DATABASE_URL="<local>" npm run db:deploy` e rode `npx prisma generate`. Nunca `prisma migrate dev` (interativo). Migração no Neon é do usuário.
- Não teste produção em laço com `curl`: mais de ~20 chamadas disparam o bloqueio anti-bot da Vercel. Uma leitura de `https://tibe-agrogestao.vercel.app/docs/api` confirma deploy.

## As regras do código (as que mais quebram)

1. `tenant_id` nunca vem do cliente: use o client escopado (`getTenantDb()`, `prismaForTenant()`, `scoped(...)`). Model novo com `tenant_id` entra em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts`).
2. Saldo nunca é gravado (estoque, rebanho, caixa, recebíveis): é sempre soma de movimentos.
3. Regra de negócio só em `src/lib/actions/*`. Rotas em `src/app/api/` são finas: Zod, chamar a action, responder `{ data, meta }` ou `{ error: { code, message } }`; recusa do Zod sai por `apiErroDeZod(parsed.error)`; recusa de campo usa o 4º parâmetro de `fail(code, msg, status, field)`.
4. Ordem de entrega: action, depois rota, depois tela. Rota nova ou mudada entra em `src/app/(public)/docs/api/endpoints.ts` (`npm run test:docs-api` confere).
5. Lançamento financeiro só por `createLinkedEntry` (`src/lib/financial.ts`). Toda action de escrita do Empório chama `registrarNoHistorico`.
6. **Nunca use travessão** (o traço longo U+2014) em código, doc ou commit. Use dois pontos, vírgula ou ponto.
7. Telas: componentes do kit (`src/components/ui/`), cores só por token (sem `bg-red-500` e afins), nenhum `<input type="number">`, dinheiro em formato brasileiro, recusa de campo aparece no campo (`error=` no `<Field>`).
8. Mensagens ao usuário em português do Brasil.

## Como provar que terminou (antes de dizer "pronto")

```
npm run check                    # 19 conferências estáticas, sem banco
npx tsc --noEmit
npm run lint
DATABASE_URL="<local>" npm run test:isolation
DATABASE_URL="<local>" REDIS_URL="redis://127.0.0.1:56379" npm run test:<suíte da área>
DATABASE_URL="<local>" REDIS_URL="redis://127.0.0.1:56379" npm run test:all -- --sem-redis   # antes de entregar a branch
npm run build                    # pare o next dev antes
```

- Suíte nova usa o próximo número livre (`test:m107` em diante) e entra no `package.json`.
- Teste que passa antes e depois da correção não prova nada: veja falhar sem a correção.
- `test:m99` reprova entre 21h e meia-noite de Brasília (dívida 2.65): não é regressão.
- Tela mexida: suba `npm run dev -- -p 3000` e confira no navegador. Os roteiros `scripts/navegador/*.py` (`npm run navegador -- <nome>`) usam um Chrome próprio de testes e o browser-harness; se não tiver o harness, valide à mão e diga o que não validou.
- Login local sem digitar senha: `npx tsx scripts/_sessao-local.ts` emite o cookie do owner do seed (`owner@example.com`).

## Git

- Uma branch por pedido, commits pequenos em português (`Empório: o que mudou e por quê`), sem travessão.
- Ao fim de cada pedido, atualize `docs/agents/current-handoff.md` (teto de 200 linhas: estado, branch, commit, testes, próximo passo) e diga ao usuário o que falta autorizar (merge, push na `main`, migração no Neon).
- Dívida que ficar aberta vai para `docs/agents/dividas.md` (próximo número: 2.67).

## Onde está o trabalho (10/11/2026)

- Em produção, na `main`: Empório completo, inclusive o financeiro (Q214 a Q243), frete e e-commerce (Q244 a Q249), cartão (Q250 a Q267), relatórios e exportação (Q268 a Q274), desfazer acordo, aviso por email e recalcular o mês (Q275 a Q277). Decisões numeradas na tabela de `docs/specs/module-39-meu-emporio.md`; specs de cada rodada em `docs/superpowers/specs/2026-11-*`.
- Fila que não depende do usuário: dívida 2.65 (a `scripts/m99-emporio-financeiro-credito.test.ts` calcular "hoje" com o dia de Brasília, como o código) e 2.64 (miúdos de limpeza). O resto das dívidas abertas pede decisão do usuário: pergunte antes.
- Pedido novo do usuário: leia a spec do módulo, devolva um resumo com as dúvidas, e só então codifique. Produto ou arquitetura nova pede pergunta, não suposição.
