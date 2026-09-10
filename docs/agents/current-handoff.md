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

- Atualizado em: 2026-09-10.

### A branch `financeiro-fase-1` está aberta, com CATORZE commits, e T01 a T07 feitas

**Nada foi para a `main`.** Suíte **64/64**, `tsc`, `lint`, `check` e
`test:drift` limpos no fim da T07.

⚠️ **TRÊS migrações aplicadas SÓ no banco local**, nunca no Neon:
`20260910120000_pagamento_parcial_e_vinculos` (schema),
`20260910130000_backfill_pagamento_dos_quitados` e
`20260910140000_desativar_categorias_antigas_sem_uso`. O invariante 3 exige
autorização do usuário antes do push, e o `.claude/settings.local.json` desta
máquina libera o `db:deploy` contra o Neon quando ela vier.

| commit | o que |
|---|---|
| `75287a5` | os quatro documentos do cliente, que estavam fora do git |
| `9d71212` | a sequência das quatro áreas e a spec da fase 35.1 |
| `2ead877` | a tarefa de hoje parou de nascer "Atrasada" |
| `e5e0be9` | `m57`: a suíte parou de apodrecer, e a asserção passou a discriminar |
| `aa6fe9a` | handoff e cofre |
| `4d105b8` | **T01** schema: `FinancialPayment`, `PaymentMethod`, os dois vínculos |
| `9b101c6` | **T02** backfill, com o predicado provado nos três casos |
| `68d92c9` | **T03** actions do parcial, e duas guardas que a spec não previa |
| `079153e` | **T04** as três rotas, e o `/docs/api` junto |
| `cc25d3e` | **T05** as 24 origens, e o apagar que deixou de levar dinheiro |
| `00750dc` | pitstop de memória antes do resumo de contexto |
| `9137ba3` | **T06** as 26 categorias, e o tenant antigo passou a recebê-las |
| `88b0663` | **T06** a categoria vem do banco no painel e no WhatsApp |
| `36a3ccd` | handoff da T06 |
| `591729b` | **T07** a tela: fazenda, contato, pagamento parcial, rótulos do §30 |

**Faltam T08 a T10**, todas na spec: a suíte `m62` escrita da spec, os encaixes
de dívida (§2.10 e §3.3) e a validação ao vivo.

### O que a fase 35.1 já decidiu no código, e não deve ser redecidido

- **Valor pago é a SOMA dos `FinancialPayment`**, nunca um campo. "Parcialmente
  paga" nasce derivada em `situacaoDe`. O `status` continua gravado porque é
  máquina de estados, não saldo.
- **Comparação em CENTAVOS**, nunca em float: o dinheiro é `Decimal(14,2)` e
  somar em ponto flutuante erra justo onde a recusa "excede o saldo" decide.
- **`markEntryPaidAction` virou pagamento do SALDO restante.** A assinatura e o
  contrato da rota `/pay` continuam iguais de propósito.
- **`cancelEntryAction` recusa conta que já tem pagamento** (`ENTRY_HAS_PAYMENTS`).
- **Desfazer pagamento APAGA a linha**, em vez de `canceled_at`. O lançamento é
  o compromisso que existiu e nunca some; o pagamento desfeito é quase sempre
  digitação errada. Se um dia precisar de rastro, é `canceled_at` mais filtro em
  toda soma, e é decisão do usuário.
- ⚠️ **`createLinkedEntry` cria o pagamento junto quando nasce `paid`.** Sem
  isso, toda venda e compra nova teria `status: paid` e pago ZERO. Não foi
  previsto na spec, apareceu na T05.
- **Conta pendente PARCIALMENTE paga não é apagada** no cancelamento de
  movimentação, estadia e serviço: vai para o ramo de estorno. Dois pontos de
  `service-jobs.ts` ficaram fora de propósito (ver spec).
- **A lista de categorias vem do BANCO**, no painel e no WhatsApp (decisão do
  usuário na T06). `category-suggestions.ts` deixou de ser lista e virou só o
  palpite por palavra-chave, que o chamador descarta se o nome não existir no
  tenant. Não volte a comparar contra constante: era assim que a categoria
  criada pelo produtor virava "Outros".
- **O provisionamento roda em TODA listagem** e acrescenta o que falta. É o que
  faz tenant antigo receber categoria nova sem migração de dados.
- **Desativar as antigas sem uso é MIGRAÇÃO, não provisionamento** (decisão do
  usuário na T06). No provisionamento, ela desfaria a cada leitura a reativação
  que o produtor tivesse feito na tela de Configurações.
- ⚠️ **O fluxo de caixa soma os `FinancialPayment`, não os lançamentos pagos**
  (T07). Com pagamento parcial os dois deixaram de ser a mesma coisa, e a
  leitura antiga escondia o dinheiro que já entrou até a última parcela. Não
  volte a filtrar por `status: "paid"` ali.
- **A tela do Financeiro filtra pela propriedade ATIVA do seletor do topo**,
  como as outras. Lançamento sem fazenda some com o filtro ligado, porque
  `property_id` não teve backfill: a tela conta quantos ficaram de fora e diz
  onde vê-los. Se o produtor reclamar disso, a conversa é sobre backfill, não
  sobre afrouxar o filtro.

**As quatro áreas novas foram decididas em 10/09**, num interrogatório de seis
rodadas: 34 decisões, todas em
[../superpowers/specs/2026-09-10-sequencia-das-quatro-areas.md](../superpowers/specs/2026-09-10-sequencia-das-quatro-areas.md).
Ordem: **Financeiro, Lista de Compra, Calculadora, Meu Dia**. Só a Lista é
módulo novo; as outras três são fases de módulos existentes.

⚠️ **Não redecida o que está lá.** Se uma decisão estiver errada, a conversa é
com o usuário.

### Duas dívidas fechadas e um defeito corrigido nesta rodada

**A §2.9 está PROVADA contra o agente de produção.** `npm run wa` rodou a
conversa inteira pelo webhook real do n8n, no tenant "BANCO DE PROVAS
(automacao Tibe)" (conferido antes de disparar que não é de cliente). O agente
perguntou a categoria, resolveu "bezerro" para "Bezerro - 0 a 7 meses", e o
`HerdMovement` nasceu junto (`saldo_inicial 1 -> bezerro_0_7
presente/proprio`), com o saldo subindo para 41. Era exatamente isso que
faltava. **A dívida pode sair do `dividas.md`.**

Comportamento real observado, que não é defeito: o agente **recusa** os quatro
dados numa mensagem só e conduz campo a campo. O caminho de mensagem única não
passa hoje.

**O defeito da tarefa que nascia "Atrasada" está corrigido** (`2ead877`). A
comparação era por instante; virou por dia, em `src/lib/dia-calendario.ts`.
⚠️ **A comparação é assimétrica de propósito**: o prazo é lido em UTC, o agora
no fuso da fazenda. `due_date` é data de calendário, não instante; converter os
dois lados traz o defeito de volta por outro caminho, e a primeira tentativa
fez exatamente isso.

**A `m57` tinha DOIS defeitos, e nenhum era do produto** (`e5e0be9`). O
primeiro: datas absolutas num teste cuja previsão nasce de `new Date()`,
escrito entre 1 e 4 de setembro e podre desde o dia 5. O segundo, achado só
porque plantei o defeito de propósito: com quinze dias de atraso as duas
âncoras caem no mesmo dia 5, então **a asserção nunca discriminou nada**.
Passou para quarenta dias.

⚠️ **Isso vale para a 35.2 e para o Meu Dia**, que vão reusar aquele padrão
rolante por decisão do usuário (decisões 22 e 25). A ancoragem no vencimento
está certa e agora tem prova de verdade.

### Ambiente, conferido em 10/09

Os containers `tibe-pg` e `tibe-redis` estavam **parados havia sete dias**, o
banco local estava duas migrações atrás e o Prisma Client gerado era anterior
ao último sincronismo (o que fazia o `tsc` acusar cinco erros que não eram do
código). Os três resolvidos.

**Neon está up to date com as 46.** Suíte: **64/64**.

⚠️ **A armadilha do backfill da 35.1 NÃO existe.** A spec manda conferir se há
lançamento `paid` sem `paid_at` antes de migrar. Conferido nos dois bancos:
**zero** no local (260 pagos) e **zero** em produção (7 lançamentos, 0 pagos).
A migração do T02 é segura e não precisa de decisão do usuário.

### O que estava aqui antes desta rodada

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
avançou, e cada commit que sobe é leitura pública.

**2. A fase 35.1 do Financeiro**, que é o trabalho da branch aberta. Spec com
as dez tarefas em
[../superpowers/specs/2026-09-10-modulo-35-financeiro-fase-1.md](../superpowers/specs/2026-09-10-modulo-35-financeiro-fase-1.md).
**T01 a T07 estão feitas.** A próxima é a **T08, a suíte `m62`**, escrita da
spec e **sem ler a implementação** (é trabalho do agente `prova-suite`).

Depois: **T09** os encaixes de dívida §2.10 e §3.3, e **T10** a validação ao
vivo no navegador, que é onde a tela nova da T07 precisa ser aberta de verdade.

⚠️ **As três migrações já existem e estão aplicadas no LOCAL.** Antes do push,
aplicar no Neon com autorização do usuário na hora.

**As duas dívidas pequenas entram DENTRO da 35.1** (T09), porque os arquivos já
serão abertos: o rótulo "Prestador" (`dividas.md` §2.10) e o `resolverPasto`
ambíguo (§3.3, que já tem duas implementações de referência no repositório,
`resolverTrabalhador` e `resolverServicoEmAndamento`).

**Continuam esperando, para depois das quatro áreas:** a outra metade da
`dividas.md` §2.8 (a despesa avulsa e os sete destinos de saída), e três
decisões de produto do Leite (média diária por dias corridos; cabeçalho de uma
fazenda com armazenamento de todas; fechamento sem data nascendo "Vencida").

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
