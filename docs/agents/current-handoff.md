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
- **A fase 34.2 (custeio do serviço) está NA `main` E EM PRODUÇÃO**, e a
  **validação visual no navegador aconteceu nesta rodada e passou.** Merge
  `d398dbb..37ccc3b`, migração `20260906100000_custeio_do_servico` aplicada no
  Neon antes do push, deploy confirmado por sondagem única ao `/docs/api`.
  Detalhe completo da fase em `historico/2026-09.md` na próxima arquivada.
  ⚠️ O `browser-harness` só conseguiu conectar depois de repetidas tentativas
  (o daemon relatava `FAIL` no `--doctor`, mas um `new_tab` explícito
  funcionou); e a primeira conexão caiu numa aba de OUTRO site
  (`hub.asimov.academy`), a armadilha do navegador compartilhado já registrada
  na memória. Confirmar a URL/título depois de conectar continua obrigatório.
- **A dívida `dividas.md` §2.9 (rebanho invisível do cadastro assistido) está
  NA `main` E EM PRODUÇÃO.** Merge `37ccc3b..72ac4fc`, sem migração (não toca
  schema). ⚠️ **`npm run wa` contra produção ainda não rodou** (a prova que
  falta: hoje só a suíte `m61` provou o caminho).
- Nenhuma branch de trabalho aberta agora. `custeio-do-servico-fase-2` e
  `rebanho-invisivel-cadastro-assistido` já foram apagadas (`git branch -d`,
  ambas mescladas).

### O que a validação visual da fase 34.2 confirmou (`/servicos`, autenticado, dados reais)

Sessão completa no serviço "Subsolagem" (prestado, por hora):

- **Listagem:** o bloco "Serviços com máquinas: setembro de 2026" com os seis
  números do §41, recalculando em tempo real conforme o teste avançava.
- **Ficha do serviço:** a linha de subtítulo com o horímetro
  (`100 → 108 (8 horas)`, depois atualizando a cada lançamento); o cartão
  "Resultado do serviço (§25)" com receita/custo/resultado.
- **Produção diária, os DOIS modos:** quantidade (3 horas lançadas, total
  2.400→2.250 recalculado) e horímetro (108→115, depois 115→120, cada um
  virando `X horas` na tabela e atualizando o subtítulo e o total). `MoneyInput`
  ecoando a unidade nos dois.
- **Custo do serviço:** o `Select` de natureza com as 10 categorias; o ramo
  combustível (Produto, Quantidade, Valor por unidade, SEM "saiu do caixa");
  o ramo comum (Mão de obra, com "saiu do caixa" marcado) submetido de
  verdade, gerando o lançamento (badge "Gerou lançamento") e o custo
  aparecendo no cartão do §25.
- **Botão "Encerrar serviço":** clicado de verdade (`PATCH .../status`, 200),
  o botão sumiu depois (o componente corretamente não mostra nada para
  `concluido`).
- **Zero erro de console e zero issue no overlay do Next**, confirmado com o
  domínio `Runtime`/`Log` do CDP habilitado e um teste positivo (um
  `console.error` manual apareceu no overlay, provando que a captura
  funciona). Três `Runtime.exceptionThrown` apareceram uma vez, não
  reproduziram numa ação idêntica em seguida, e vieram acompanhados de um log
  de PWA (`beforeinstallpromptevent`) alheio ao código: artefato do
  navegador/captura de tela cheia, não defeito.

### Dívida `dividas.md` §2.9 (rebanho invisível do cadastro assistido): na `main`, em produção

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

**2. Rodar `npm run wa`** com um cadastro assistido real (brinco, raça, sexo,
categoria, "sim") contra o agente de produção, e conferir por programa que o
animal aparece no saldo. É a última prova que falta da §2.9: hoje só a suíte
`m61` provou o caminho. A fase 34.2 e a §2.9 já estão as duas em produção e já
tiveram validação no navegador/`curl`.

**3. Duas decisões pequenas que continuam esperando:**

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
