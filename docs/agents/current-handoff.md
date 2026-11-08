# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional curta e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo.
- Substitua a seção "Estado atual" a cada rodada. Em "Últimas rodadas", mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez (trava em `.claude/hooks/guarda-bash.mjs`).

⚠️ Teto de 200 linhas. Este arquivo já chegou a 1.316 (arquivado em 02/09) e a
904 (arquivado em 07/11). Se passar do teto, arquive antes de acrescentar.
Histórico em `historico/2026-08.md` a `historico/2026-11.md` (o detalhe do
Empório, das fases F0 a F5 até os três planos de 06/11, está no de 11).

## Estado atual

- Atualizado em: 2026-11-08 à noite (as quatro entregas do financeiro do
  Empório prontas nas branches; falta a revisão com o usuário e o deploy).
- `main` em `ed8e37e`, Vercel verde. Nenhuma migração pendente no Neon.
- Branches empilhadas, sem merge: `emporio-financeiro-spec` (spec) →
  `emporio-financeiro-1` → `-2` → `-3` → `-4` (as quatro prontas, em origin).
  Evidências por entrega em [financeiro-emporio-relatorio.md](financeiro-emporio-relatorio.md).

### A missão autônoma do financeiro do Empório (aprovada em 07/11)

Spec: [../superpowers/specs/2026-11-07-emporio-financeiro-design.md](../superpowers/specs/2026-11-07-emporio-financeiro-design.md)
(Q214 a Q237, já na tabela do módulo). Contrato: quatro entregas, uma branch
sobre a outra, cada uma com nove critérios batidos (plano, migração no Docker,
check/tsc/lint/build, suíte nova mais `test:all`, isolamento, roteiro nos dois
sentidos, juiz Opus com seis critérios a 8 ou mais, manual, docs). **Merge,
push na `main`, deploy e migração no Neon são do usuário, na ordem 1, 2, 3,
4, cada um com a migração antes do push, depois de revisar junto.** Nenhuma
autorização disso foi dada.

**Entrega 1 (`emporio-financeiro-1`): pronta.** Papel `financeiro`, ação
`dinheiro`, a casa `/emporio/financeiro` (Hoje, A pagar, A receber, Posição
de caixa com extrato), a conta da compra paga no Empório com `CashMovement`,
o `/financeiro` do Tibé só da fazenda. Migração
`20261107130000_emporio_financeiro_papel`, só no Docker. `test:m98` 244,
roteiro `emporio-financeiro-casa` nos dois sentidos, juiz Opus 8/10 (rodada 2).

**Entrega 2 (`emporio-financeiro-2`): pronta.** Vencimento do fiado, limite,
bloqueio por atraso e por limite, liberação do Gestor, ficha de crédito,
seção Fiado em Configurações, aba Cobrança com o WhatsApp do aparelho.
Migração `20261108120000_emporio_financeiro_credito`, só no Docker.
`test:m99` 197, `test:all` 99/99, roteiro `emporio-financeiro-credito` nos
dois sentidos, juiz Opus 8/10 na rodada 1. Dívidas 2.36 e 2.37; 2.38
confirmada pelo usuário em 08/11 (a liberação é consumida pela primeira venda).

**Entrega 3 (`emporio-financeiro-3`): pronta.** Acordo de fiado em parcelas,
alçada de pagamento com aprovação e aviso pelo WhatsApp, carimbo de
conciliação no extrato. Migração
`20261108180000_emporio_financeiro_acordo_alcada_carimbo` só no Docker.
`test:m100` 248, juiz Opus 8/10 na rodada 2, roteiro `emporio-financeiro-acordo`
nos dois sentidos, manual. Q238 confirmada pelo usuário em 08/11.

**Entrega 4 (`emporio-financeiro-4`): pronta.** Fluxo projetado em 30/60/90
dias por semana, três relatórios do dinheiro (aba Relatórios), rateio
automático da despesa fixa por faturamento, área e funcionários. Migração
`20261108220000_emporio_financeiro_rateio_automatico` só no Docker.
`test:m101` 239, `test:all` 101/101, juiz Opus 9/10 na rodada 4 (três
rodadas acharam o mês com conta paga sendo recalculado; corrigido e provado),
roteiro `emporio-financeiro-projecao` nos dois sentidos, manual inteiro
verde. Q239 a Q243 a confirmar. Dívidas 2.45 a 2.53.

### ⏭️ Próximo passo

1. Revisar com o usuário o relatório de evidências e as decisões a
   confirmar (Q239 a Q243; 2.38 e Q238 já confirmadas). 2. Com o usuário,
   por entrega e na ordem 1, 2, 3, 4: migração no Neon (URL Direct), merge
   e push na `main` com `AUTORIZADO_PELO_USUARIO=1`, cada um autorizado na
   conversa (cada entrega tem uma migração). 3. Depois do deploy, o cenário
   de demonstração na conta de testes nova (pendência do usuário) e a
   Agromax usando a casa do financeiro.

As pastas `research_notes/` e `reports/` (pesquisa de mercado que embasou a
spec) são ignoradas pelo git de propósito: o repositório é público.

### Empório (Módulo 39): em produção, usado pela Agromax

Spec do módulo: [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(decisões até a Q213). Dívidas do módulo em [dividas.md](dividas.md), de 2.15 a
2.27 e de 5.19 a 5.22. Manual em `/manual`, roteiro `manual-emporio`.

Os três planos de 06/11 (clientes e fornecedores, a escolha, entrega e
romaneio; `test:m95` a `m97`, Q191 a Q213) estão em produção desde 07/11
(detalhe em `historico/2026-11.md`; `emporio-romaneio` precisa de `pypdf`).
As pendências de produto do Empório que esperam o usuário estão em
[pendencias-do-usuario.md](pendencias-do-usuario.md), seção do Empório.

Não ligue recurso nem escreva dado da Da Mata pelo agente: quem faz é o
usuário, pela Plataforma e pelas telas.

### Da Mata é a conta real da Agromax (desde 01/11)

A Agromax usa a conta Da Mata Sementes só para o Empório, com as lojas AGROMAX e
AGROMAX MOC. Em 06/11, autorizado pelo usuário,
`scripts/limpar-demonstracao-conta.ts` apagou em produção 3.688 registros de
demonstração; ficaram 1.556, conferidos antes e depois na mesma transação.
Ficaram de propósito: o Dono, as categorias financeiras, o "Consumidor final" e
o vínculo do WhatsApp do usuário.

⚠️ O cenário de demonstração (`scripts/cenario-demonstracao-emporio.ts`) não
pode mais rodar na Da Mata.

Pendente do usuário:
- email e nome da conta de testes nova (depois, rodar o cenário de
  demonstração nela e mover o vínculo do WhatsApp);
- trocar o email de acesso da Da Mata para o da Agromax;
- os logins da equipe da Agromax.

### 🔴 Segurança: o repositório é público

Todo commit é leitura pública. Fechar exige a conta `tibegestaoagro` (o
`dilton-pleno` tem `push`, não `admin`).

- O `.env.enc` vazou (commit de 24/08, AES-256-CBC); a reescrita de 02/09 com
  `git filter-repo` não removeu a exposição (o GitHub ainda serve os objetos
  por SHA). Falta, e é do usuário: rotacionar as 22 variáveis (adiado em
  27/10), fechar o repositório e pedir ao Suporte do GitHub a coleta dos
  órfãos. Na rotação, o agente guia variável por variável e nunca lê nem
  imprime o valor. ⚠️ O espelho `D:\tmp\tibe-backup-pre-rewrite.git` contém o
  `.env.enc`: apague quando a rotação terminar.
- Alerta do GitGuardian de 06/11 ("Company Email Password exposed", push de
  22:27 UTC): segredo não confirmado; o candidato provável é o par do seed
  `owner@damata.com.br` / `tibe123`, citado na documentação pública (o email
  não existe em produção). Falta o usuário mandar a parte do email que diz o
  arquivo e o commit; proposta: trocar o email do seed por um domínio de
  exemplo. Não repita a comparação de senha contra os hashes de produção.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em canário

Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md),
relatórios em [agente-whatsapp/](agente-whatsapp/), detalhe em
[historico/2026-09.md](historico/2026-09.md).

- O fluxo de produção do n8n (`UAAA96aJFiiFsQCL`) é híbrido desde 18/09: o nó
  `Agente Novo?` manda quatro telefones (o usuário e Lucas, Max e Laíza
  Agromax) para a rota de turno; o resto segue no `execute-action`. O canário
  fica com esses quatro até o usuário reabrir o assunto (29/09).
- Ler, guardar e mudar a lista: `scripts/n8n-workflow.ts` (escrita só com
  `--confirmar`, cópia antes em `~/.tibe/n8n-copias/`; quem roda é o usuário).
  ⚠️ O JSON do fluxo nunca entra no repositório: carrega a chave da Evolution.
- Ler o canário: `npx tsx scripts/observar-canario.ts [dias]` (só leitura).
- Faltam os passos 9 e 10 do [roteiro](agente-whatsapp/roteiro-do-chip.md) e
  validar no celular três correções de 29/09 (compra a prazo pergunta se já
  pagou; "próximos 100 dias" diz a data; "30 machos" vai à confirmação).
- As intenções das missões 3 e 4 seguem congeladas no classificador.

### Outras pendências do usuário

- Trocar o nome do cadastro "Owner Da Mata" em Ajustes (saudação sem nome).
- O roteiro do estoque no aparelho, a partir do bloco 0:
  [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md).
- A lista geral: [pendencias-do-usuario.md](pendencias-do-usuario.md).

### Ambiente

- Os containers `tibe-pg` e `tibe-redis` caem sozinhos. Se uma suíte travar sem
  mensagem, rode `docker ps` antes de culpar o código.
- `npm run test:all` repetido no mesmo dia reprova a `m19` pelo lock do Redis.
  Rode `docker exec tibe-redis redis-cli FLUSHALL` (Redis local) e ela passa.
- `npx prisma migrate deploy` contra o Neon pode ser recusado pelo
  classificador mesmo com autorização. Tente uma vez; se bloquear, dê ao
  usuário o comando e confira com `migrate status` antes do push.
- Dois clones (`C:` e `D:`) e o worktree `D:/Projetos/tibe-wt2` (dev server
  na 3003; a 3002 ficou presa a um processo morto; `tibe-wt3` sobrou
  incompleto). O agente só mata `next dev` que ele subiu; depois do kill,
  apague `.next`. Roteiro com `TIBE_BASE="http://localhost:3003"` (nunca
  `127.0.0.1`: o cookie é de `localhost`); não suponha a conta vazia.
- Roteiro preso em recarga é aba sobrando no Chrome de testes (cofre:
  `a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`). O
  `manual-emporio` regrava todos os PNGs: restaure os que não mudaram.
- No notebook: `node -v` precisa ser 24.22.1 ou mais; o
  `.claude/settings.local.json` não vai para o git, então lá a migração em
  produção volta a ser recusada pelo classificador.

## Últimas rodadas

- 08/11 (noite): entrega 4 pronta em `emporio-financeiro-4` (juiz 9/10 na
  rodada 4); as quatro entregas do financeiro esperam a revisão e o deploy.
- 08/11: entrega 3 pronta em `emporio-financeiro-3` (juiz 8/10 na rodada 2,
  roteiro e manual à tarde).
- 08/11: entregas 1 e 2 prontas em `emporio-financeiro-1` e `-2` (juiz 8/10).
- 07/11: pesquisa de mercado, entrevista em 24 decisões e spec do financeiro
  do Empório, revisada por builder (branch `emporio-financeiro-spec`).
- 07/11: planos 1 a 3 do Empório (clientes, fornecedores, escolha, entrega e
  romaneio) em produção, `c3b2606`; handoff arquivado em `historico/2026-11.md`.
