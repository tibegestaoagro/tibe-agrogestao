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
- **A fase 34.2 (custeio do serviço) está NA `main` E EM PRODUÇÃO.** Merge
  `d398dbb..37ccc3b` (as dez tarefas do plano, `02a6b5d`..`eed8c8e`), migração
  `20260906100000_custeio_do_servico` aplicada no Neon antes do push (invariante
  3), deploy confirmado por sondagem única ao `/docs/api` (as três rotas novas
  aparecem). Detalhe completo da fase em `historico/2026-09.md` na próxima
  arquivada.
  ⚠️ **A validação visual no navegador continua pendente**: `browser-harness` e
  `claude-in-chrome` não conseguem conectar nesta máquina
  (`chrome://inspect/#remote-debugging` pede um clique humano que ainda não
  aconteceu). O contrato de dados foi provado por `curl` real contra `next dev`
  local; o visual (toggle quantidade/horímetro, `Select`, cores, contador de
  issues do overlay do Next) não foi olhado por ninguém ainda.
- Branch de trabalho: **`rebanho-invisivel-cadastro-assistido`**, ainda não
  commitada nesta rodada (ver abaixo). Não confundir com a antiga
  `custeio-do-servico-fase-2`, já mesclada e descartável (`git branch -d`).

### Dívida `dividas.md` §2.9 (rebanho invisível do cadastro assistido): implementada, aguardando commit

Spec: `docs/superpowers/specs/2026-08-31-rebanho-invisivel-do-cadastro-assistido.md`.
O defeito: quem cadastra animal pelo assistente do WhatsApp (`commitAnimals` em
`whatsapp-flow-bridge.ts`) tinha o lote criado, mas SEM `HerdMovement`, porque a
categoria caía sempre em "Não classificado", que `resolveCategoryTerm` nunca
traduz para as 12 do livro-razão. Sem erro, sem aviso, o animal não aparecia no
saldo.

**A correção:** o fluxo assistido ganhou uma 4ª pergunta, categoria (as 12 do
livro-razão, resolvida por `resolveCategoryTerm`; ambíguo ou desconhecido
repergunta, nunca chuta). `commitAnimals` passou a chamar `createBatchAction`
(a mesma action da rota web, invariante 6) em vez de `db.animalBatch.create()`
direto, com a categoria resolvida traduzida para uma linha de `AnimalCategory`
com o rótulo exato, o que faz `createBatchAction` gravar o `HerdMovement`
sozinho. Falha por item (ex.: brinco repetido) grava o motivo em log
estruturado e não derruba os outros itens do lote.

⚠️ **Achado que não estava no plano da spec:** o campo categoria, por viver na
mesma lista `FLOWS.cadastrar_animal.fields` usada por `maybeStartAnimalFlow`
para decidir se abre o modo assistido, estava fazendo TODO cadastro completo
(brinco+raça+sexo, sem categoria, que é sempre o caso hoje porque o
classificador não pergunta isso) cair no modo assistido em vez do caminho
direto de uma mensagem só. Corrigido com um novo campo `triggersFlow: false`
em `FlowField`, que separa "campo que o fluxo pergunta" de "campo cuja
ausência sozinha abre o fluxo". Pego pela suíte `m3` (regressão real, não
hipotética) antes do commit.

**Suítes:** `m21` (máquina de estados) e `m22` (rota `execute-action` real)
atualizadas para o 4º campo, ambas verdes. `m61`, nova, prova pela ponte
(`whatsapp-flow-bridge.ts`) as quatro coisas que a spec pede: `AnimalBatch` E
`HerdMovement` nascem juntos; `getPositions` enxerga o saldo; categoria
ambígua/desconhecida repergunta sem gravar; falha num item não derruba o
lote. A trava central (fazer `categoriaDoLivroRazao` sempre devolver "Não
classificado") foi quebrada de propósito e reproduziu o defeito original
exato ("lote criado sem entrar no saldo"); devolvida. `npm run test:all`:
64/64. `npm run check`, `tsc`, `lint`: limpos.

⚠️ **`npm run wa` (banco de provas contra produção) ainda NÃO rodou**, porque
o fluxo em produção hoje é o código ANTIGO: só faz sentido depois do merge e
deploy. Rodar depois de subir, com um cadastro assistido real.

**Fora desta rodada, por decisão da própria spec (adiado, não descartado):**
escolher a propriedade quando há mais de uma ativa; migrar os lotes já criados
invisíveis (levantamento próprio); unificar `AnimalCategory` com as 12
constantes.

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

**2. Commitar e fechar a rodada da §2.9** na branch
`rebanho-invisivel-cadastro-assistido`: `git add` dos seis arquivos tocados
(`agent-flows.ts`, `whatsapp-flow-bridge.ts`, `m21`, `m22`, `m61` novo,
`package.json`) mais `docs/agents/dividas.md` (item removido) e este handoff.
Depois, merge/push para a `main` quando o usuário autorizar (não toca em
schema, então não há migração antes desta vez).

**3. Depois do deploy, rodar `npm run wa`** com um cadastro assistido real
(brinco, raça, sexo, categoria, "sim"), e conferir por programa que o animal
aparece no saldo. É a prova que falta: hoje só a suíte provou.

**4. Validar a fase 34.2 no navegador**, ainda pendente da rodada anterior:
`next dev` contra o banco local, cookie de `npx tsx scripts/_sessao-local.ts`.
Abrir `/servicos` e a ficha de um serviço `prestado`: os dois modos do painel
de produção diária, o painel de custo (natureza, o ramo do combustível), os
botões de começar/encerrar, a seção de custos com os badges, o cartão do §25,
o resumo do §41 na listagem, e o contador de issues do overlay do Next.

**5. Duas decisões pequenas que continuam esperando:**

- o rótulo "Prestador" no Financeiro (`dividas.md` §2.10): três origens
  diferentes sob o mesmo nome (despesa do contratado, receita do prestado,
  despesa do custo do serviço);
- a dívida 3.3 (`resolverPasto` devolve o primeiro achado em silêncio): agora
  com DUAS implementações de referência no próprio repositório
  (`resolverTrabalhador` em `mao-de-obra.ts`, `resolverServicoEmAndamento` em
  `whatsapp-handlers/servico.ts`) fazendo o mesmo tipo de ambiguidade do jeito
  certo. O padrão está provado; falta só aplicar em `resolverPasto`.

**Continuam esperando, de rodadas anteriores:** a outra metade da `dividas.md`
§2.8 (a despesa avulsa e os sete destinos de saída), e três decisões de
produto do Leite (média diária por dias corridos; cabeçalho de uma fazenda com
armazenamento de todas; fechamento sem data nascendo "Vencida").

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
