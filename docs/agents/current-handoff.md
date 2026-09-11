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

- Atualizado em: 2026-09-11.

### O Módulo 36 (Lista de Compra) está PRONTO na branch `lista-de-compra`

Doze commits, as **onze tarefas da spec feitas**, suíte **63/63** (a `m63`
entrou), `tsc`, `lint`, `check` e `test:drift` limpos. Spec em
[../superpowers/specs/2026-09-11-modulo-36-lista-de-compra.md](../superpowers/specs/2026-09-11-modulo-36-lista-de-compra.md).

⚠️ **UMA migração aplicada só no banco local**, nunca no Neon:
`20260911100000_lista_de_compra` (cria `ShoppingItem` e três enums, tudo
aditivo). O invariante 3 exige que ela vá ao Neon **antes** do push.

O que o módulo faz: o produtor anota o que precisa comprar, pelo painel ou pelo
WhatsApp, e **anotar não é comprar** (§3): nada mexe em estoque nem em
financeiro até ele confirmar a compra, e aí quem registra é Negociações.

**Decisões que não devem ser redecididas:**

- **Não existe entidade "lista"**: a lista é a consulta dos pendentes.
- **Item sem produto não vira compra sozinho.** A negociação exige um `Product`
  porque é ele que tem saldo e unidade; "comprar arame" é anotação legítima e
  vira compra quando o produtor disser qual produto é. Vale no painel e no
  WhatsApp.
- **Concluir o item entra na MESMA transação da compra**, por um gancho
  opcional em `createProductNegotiation`. Fora dela existiria a janela em que a
  compra já entrou e o item continua na lista, e o produtor compra de novo.
- **A duplicata AVISA, nunca recusa de verdade** (§19.7), e a comparação é
  larga de propósito.
- **As categorias são as de PRODUTO**, agora 25: as 15 do Estoque mais as 10 do
  §6. O provisionamento acrescenta o que falta e **nunca ressuscita arquivada**.
- ⚠️ **O classificador do n8n NÃO emite as quatro intenções da lista**, como as
  do evento e da permuta desde o Módulo 31.
- ⚠️ **Unidade de produto fora do vocabulário não pode barrar o item.** Achado
  ao vivo: um produto com `kg` em vez de `quilograma` fazia o botão do alerta
  recusar calado.

### A fase 35.1 do Financeiro está EM PRODUÇÃO

Merge e push em 11/09 (`310d707..799096c`, 23 commits), com as **três migrações
aplicadas no Neon antes do push** e o deploy confirmado pelas duas rotas de
pagamento aparecendo no `/docs/api` público. A branch `financeiro-fase-1` foi
apagada. Suíte **65/65**, `tsc`, `lint` e `check` limpos.

O que subiu: pagamento e recebimento parcial como soma de `FinancialPayment`,
os vínculos de fazenda e contato no lançamento, forma de pagamento, as 26
categorias do §21 vindas do banco no painel e no WhatsApp, a tela com o
vocabulário do §30 e o filtro por fazenda do §32, a suíte `m62` escrita da spec,
e as dívidas 2.10 (rótulo "Serviço") e 3.3 (pasto ambíguo) fechadas. O relato
por tarefa está em `historico/2026-09.md` e nas mensagens dos commits.

⚠️ **O roteiro de tela NÃO foi rodado.** O servidor foi validado por requisição
autenticada, mas o que vive no JavaScript do painel (o painel de pagamento, o
foco no campo da recusa, o seletor de categoria por tipo, a largura de celular)
segue sem prova. Dez passos em
[roteiro-tela-financeiro-35.md](roteiro-tela-financeiro-35.md), com o cenário
montado por `scripts/_cenario-financeiro-35.ts`. O usuário autorizou o merge
sabendo disso.

⚠️ **`npm run wa` contra o agente de produção também não rodou.** Agora faz
sentido: o código está no ar. O que vale provar é a categoria vinda do banco
("comprei diesel" deve cair em "Combustíveis", não em "Outros") e o pasto
ambíguo perguntando em vez de escolher o primeiro.

### O que a fase 35.1 decidiu no código, e não deve ser redecidido

- **Valor pago é a SOMA dos `FinancialPayment`**, nunca um campo. "Parcialmente
  paga" nasce derivada em `situacaoDe`. O `status` continua gravado porque é
  máquina de estados, não saldo.
- **Comparação em CENTAVOS**, nunca em float.
- **`markEntryPaidAction` é pagamento do SALDO restante**, e o contrato da rota
  `/pay` continua igual de propósito.
- **`cancelEntryAction` recusa conta que já tem pagamento** (`ENTRY_HAS_PAYMENTS`),
  e **desfazer pagamento APAGA a linha**, em vez de marcar cancelado.
- ⚠️ **`createLinkedEntry` cria o pagamento junto quando nasce `paid`.** Sem
  isso, toda venda e compra nova teria `status: paid` e pago ZERO.
- **Conta pendente PARCIALMENTE paga não é apagada** no cancelamento de
  movimentação, estadia e serviço: vai para o ramo de estorno.
- **A lista de categorias vem do BANCO**, no painel e no WhatsApp.
  `category-suggestions.ts` é só o palpite por palavra-chave, descartado quando
  o nome não existe no tenant. O provisionamento roda em TODA listagem e
  acrescenta o que falta; desativar as antigas sem uso foi MIGRAÇÃO, não
  provisionamento.
- ⚠️ **O fluxo de caixa soma os `FinancialPayment`, não os lançamentos pagos.**
  Não volte a filtrar por `status: "paid"` ali.
- **A tela do Financeiro filtra pela propriedade ATIVA do seletor do topo.**
  Lançamento sem fazenda some com o filtro ligado, porque `property_id` não teve
  backfill: a tela conta quantos ficaram de fora. Isso é a dívida 2.11.

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 a segunda tentativa passou. Se bloquear de novo, o caminho é
o usuário rodar o comando no terminal dele.

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

**2. Subir o Módulo 36**, que está pronto e mesclado na `main` local. Falta,
nesta ordem: a migração `20260911100000_lista_de_compra` no Neon, e o push
autorizado na conversa.

**3. Duas provas que ficaram devendo da 35.1**, e agora são possíveis: o
roteiro de tela no navegador e o `npm run wa` contra o agente de produção.

**4. Depois, a Calculadora (Módulo 37)**, terceira das quatro áreas, seguida do
Meu Dia (38). O `ShoppingPurpose` já nasceu compartilhado com a Calculadora,
como a decisão 32 pede.

⚠️ **O backfill de `property_id` está autorizado** e é a dívida 2.11. Migração
por origem, fora da 35.1.

Depois da Lista de Compra: **Calculadora** (Módulo 37) e **Meu Dia** (38), nessa
ordem. O Meu Dia é por último porque é camada de leitura e consome os outros.

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
