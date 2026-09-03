# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima**,
e voltou a 442 em 02/09. Se ele passar de umas 200, arquive antes de
acrescentar. O de agosto está em `historico/2026-08.md`, o de setembro em
`historico/2026-09.md`.

## Estado atual

- Atualizado em: 2026-09-03.
- Branch de trabalho: **`custeio-do-servico-fase-2`**, 11 commits à frente da
  `main`. **As dez tarefas do plano da fase 34.2 estão implementadas e
  commitadas.** `npm run test:all` (63/63), `npm run check` (15/15), `npx tsc
  --noEmit` e `npm run lint` todos limpos nesta rodada, com o estado final da
  branch.
- **A fase 34.1 (serviço prestado com máquina própria) está NA `main` E EM
  PRODUÇÃO.** Merge `3e31d13..d398dbb`, migração `20260905100000_servico_prestado`
  aplicada no Neon, deploy confirmado por sondagem única ao `/docs/api`.
  Detalhe completo em `historico/2026-09.md`.

### A fase 34.2 (custeio do serviço): implementada, falta migrar em produção e olhar no navegador

Plano em `docs/superpowers/plans/2026-09-02-fase-34-2-custeio-do-servico.md`.
As dez tarefas, uma por commit (`02a6b5d` a `eed8c8e`): schema e migração
(`ServiceJobCost`, `Machine.hour_meter_*`, `StockMovement.service_job_id`);
produção diária do §19/§20 e horímetro do §33; iniciar/encerrar (§42, que a
34.1 tinha prometido e não entregou); o custo do §23/§24 com a trava central
(o lançamento do custo aponta para o CUSTO, nunca para o serviço); o
combustível do §21 baixando o estoque sem duplicar despesa; o resultado do
§25 e o resumo mensal do §41; as três rotas (`POST .../logs`,
`GET`/`POST .../costs`, `PATCH .../status`); as três telas (produção diária,
custo, começar/encerrar) mais a seção de custos e o resumo na listagem; as
cinco conversas do §42 pelo WhatsApp. Suíte `m60`, 8 blocos, todos verdes.

As três decisões tomadas com o usuário em 02/09 (custo aponta para o custo,
nunca para o serviço; valor do combustível é digitado, não derivado; horímetro
só anda para a frente) já estão na spec de design, seção **3.3** de
`docs/superpowers/specs/2026-09-02-mao-de-obra-e-servicos-com-maquinas-design.md`,
como decisões 17 a 19.

**Duas tarefas foram despachadas em paralelo** (telas via `tela-pagina`,
WhatsApp via `servidor-agente`, arquivos disjuntos), cada uma revisada e
commitada separadamente pela sessão principal antes da próxima.

⚠️ **Validação no navegador NÃO aconteceu.** Nem o `browser-harness` nem o
`claude-in-chrome` conseguiram conectar: `chrome://inspect/#remote-debugging`
exige um clique humano nesta máquina, e ninguém clicou nesta rodada. O que
existe no lugar: as 8 blocos da `m60` verdes, e uma bateria de chamadas `curl`
reais contra `next dev` local (autenticado via `_sessao-local.ts`) cobrindo
cada rota nova e a recusa de cada uma, mais o HTML devolvido pelo servidor
conferido por grep (os números aparecem, nenhum "Application error"). Isso
prova o contrato de dados; **não prova o visual**: o toggle
quantidade/horímetro, o `Select` de natureza/produto, a cor do cartão de
resultado, e principalmente o contador de issues do overlay do Next (único
jeito de pegar um `Decimal` vazando para o cliente) continuam sem olho humano.
Antes de considerar a fase pronta para o usuário validar, abra `/servicos` e a
ficha de um serviço prestado no navegador.

⚠️ **Migração `20260906100000_custeio_do_servico` só foi aplicada no Docker
local.** Falta subir no Neon (produção), que é autorização do usuário a cada
vez (invariante 3 e 7).

### 🔴 SEGURANÇA: o repositório está PÚBLICO e o `.env.enc` vazou

Descoberto em 2026-09-02, ao instalar o `gh`. `CLAUDE.md` dizia (e foi
corrigido) que o repositório era privado. Ele é **público**, e nada registrava
essa mudança como deliberada.

**O que vazou:** o `.env.enc` commitado em 24/08 e removido da árvore em 27/08,
2.048 bytes, AES-256-CBC com PBKDF2 e 600 mil iterações. A mensagem daquele
commit descreve o conteúdo (as 22 variáveis, a `DATABASE_URL` de produção, a
`CONFIG_ENCRYPTION_KEY`), o que é um mapa para quem atacar.

**O que foi feito:** reescrita de histórico com `git filter-repo` e force-push
em 02/09. Clone novo do GitHub não tem mais o arquivo, e os 471 commits foram
preservados. **Os SHAs de TODA a história mudaram.**

⚠️ **A reescrita NÃO removeu a exposição, e isso foi VERIFICADO, não assumido.**
Depois do force-push, `GET /repos/.../commits/cbe4afba1cc...` e
`GET /repos/.../git/blobs/9eb485a5d359...` continuam respondendo, o segundo com
`size: 2048`. O GitHub guarda objetos inalcançáveis e serve por SHA. Com o
repositório público, esses dois `GET` funcionam sem autenticação.

**O que falta, e é do usuário:**

1. **Rotacionar as 22 variáveis.** É o único caminho que funciona
   independentemente de quem já copiou. Decidido pelo usuário em 02/09.
2. **Fechar o repositório.** Exige a conta `tibegestaoagro`: o `dilton-pleno`
   tem `push` mas não `admin`, e o `gh` devolve 404 na troca de visibilidade.
3. **Pedir ao Suporte do GitHub** a coleta dos objetos órfãos. É o único jeito
   de apagar do servidor deles.

⚠️ **O espelho do histórico antigo está em
`D:\tmp\tibe-backup-pre-rewrite.git`, e ele CONTÉM o `.env.enc`.** Apague
quando a rotação terminar.

⚠️ **O clone da outra máquina quebrou** com a reescrita. Lá, antes de tudo:
`git fetch --all --prune`, depois `git checkout main && git reset --hard
origin/main`. Trabalho não empurrado precisa virar patch antes.


### ⏭️ PRÓXIMO PASSO

**1. Segurança, que é do usuário e vem antes de tudo:** rotacionar as 22
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Não
avançou nesta rodada, e cada commit que sobe é leitura pública.

**2. Validar a fase 34.2 no navegador, autenticado, antes de considerá-la
pronta.** `next dev` contra o banco local (`DATABASE_URL` do Docker,
`REDIS_URL` porta local), cookie de `npx tsx scripts/_sessao-local.ts`. Abrir
`/servicos` e a ficha de um serviço `prestado`: os dois modos do painel de
produção diária, o painel de custo (natureza, o ramo do combustível), os
botões de começar/encerrar, a seção de custos com os badges, o cartão do §25,
o resumo do §41 na listagem, e o contador de issues do overlay do Next. É o
único passo do plano que não foi cumprido.

**3. Migrar `20260906100000_custeio_do_servico` no Neon**, quando o usuário
autorizar (invariantes 3 e 7). Só depois disso a fase pode ir para a `main`.

**4. Os critérios de aceite da fase 34.2 (seção 10 da spec de design)**, pelo
que a suíte e a validação por `curl` já provam: lançar produção dia a dia num
serviço em andamento (§19/§20, `m60` bloco 1), registrar combustível e ver o
estoque baixar (§21/§35, `m60` bloco 5), informar horímetro inicial e final e
ver as horas na máquina (§33, `m60` bloco 2), ver o resultado simples do
serviço (§25, `m60` bloco 6). As intenções da fase respondem pelo handler, com
suíte (`m60` bloco 8), mesmo com o classificador congelado. Falta só a
confirmação visual do passo 2 acima.

**5. Duas decisões pequenas que continuam esperando** (a §2.10 e a §3.3 da
`dividas.md` ganharam nota nova nesta rodada, registrando que a 34.2 tornou as
duas mais visíveis, sem fechar nenhuma):

- o rótulo "Prestador" no Financeiro (`dividas.md` §2.10): agora com uma
  TERCEIRA origem sob o mesmo nome (o custo do serviço que gera despesa);
- a dívida 3.3 (`resolverPasto` devolve o primeiro achado em silêncio): o
  contraste com `resolverServicoEmAndamento` (que resolve o mesmo tipo de
  ambiguidade do jeito certo) ficou mais gritante.

**Continuam esperando, de rodadas anteriores:** a outra metade da `dividas.md`
§2.8 (a despesa avulsa e os sete destinos de saída), a correção do rebanho
invisível (§2.9), e três decisões de produto do Leite (média diária por dias
corridos; cabeçalho de uma fazenda com armazenamento de todas; fechamento sem
data nascendo "Vencida").

**Depois da 34.2 (e da validação no navegador):** pela tabela da spec de
design, ela fecha o par de módulos 33 (Mão de Obra) e 34 (Serviços com
Máquinas). Não avance sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
