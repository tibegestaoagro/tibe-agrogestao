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
- Branch de trabalho: **`custeio-do-servico-fase-2`**, 1 commit à frente da
  `main` (só o plano; **zero código escrito ainda**).
- **A fase 34.1 (serviço prestado com máquina própria) está NA `main` E EM
  PRODUÇÃO.** Merge `3e31d13..d398dbb` (11 commits), migração
  `20260905100000_servico_prestado` aplicada no Neon, deploy confirmado por
  sondagem única ao `/docs/api`. Detalhe completo em `historico/2026-09.md`.
- **Branches limpas em 02/09:** 13 branches locais já mescladas apagadas
  (`git branch -d`, nenhuma forçada), mais `origin/area-leite-fase-1` apagada
  no remoto (zero commits exclusivos, conferido antes). Sobrou só
  `app-mobile-fundacao` (3 commits não mesclados, fora do escopo desta
  sequência).

### A fase 34.2 (custeio do serviço) tem PLANO ESCRITO, zero código

O plano completo está em
`docs/superpowers/plans/2026-09-02-fase-34-2-custeio-do-servico.md`, commitado
(`4bbd6ba`) na branch `custeio-do-servico-fase-2`. **Nenhuma tarefa foi
executada.** Ao retomar, comece pela Task 1 (schema e migração).

O que a fase entrega: o serviço deixa de ser evento de tiro único. Produção
diária (§19, §20), combustível baixando do estoque (§21, §22, §35), custo do
serviço (§23, §24), resultado gerencial (§25), horímetro alimentando a máquina
(§32, §33), começar/encerrar pelo WhatsApp (§42, prometido pela spec de design
já na 34.1 e não entregue lá) e o resumo mensal (§41).

**Três decisões tomadas com o usuário em 02/09** (registradas no plano, ainda
não passadas para a spec de design; é o passo 3 da Task 10):

1. **O custo mora em `ServiceJobCost`, e o lançamento financeiro dele aponta
   para o CUSTO, nunca para o serviço.** Se apontasse para o serviço, a soma de
   `pago` na ficha incluiria o custo, e a tela diria "recebido R$ 600" num
   serviço em que o cliente não pagou nada. É a trava central da fase (Task 4).
2. **O valor do combustível é digitado, não derivado do estoque**
   (`StockMovement` não guarda custo unitário, e o Módulo 31 está fechado).
3. **O horímetro final atualiza `Machine.hour_meter`, e só anda para a
   frente**: uma leitura fora de ordem não pode fazer a máquina "voltar".

A suíte é a **`m60`** (não `m59`, que já é da 34.1; a spec de design erra o
número porque o contador de suítes descolou do módulo há muito tempo).

⚠️ **A Task 5 do plano mexe em `stock-ledger.ts`, módulo fechado e em
produção.** Rodar `m37` e `m38` depois dela não é opcional, e o plano tem um
passo só para isso.

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

**2. Executar o plano da fase 34.2, tarefa por tarefa, a partir da Task 1.**
`docs/superpowers/plans/2026-09-02-fase-34-2-custeio-do-servico.md`, na branch
`custeio-do-servico-fase-2`. Dez tarefas (schema e migração; produção diária e
horímetro; iniciar/encerrar; custo do serviço; combustível do estoque;
resultado e resumo; rotas; telas; WhatsApp; fechar a rodada), cada uma com
teste antes do código e, na maioria, uma trava para quebrar de propósito antes
de confiar nela. Commit ao fim de cada tarefa, como sempre.

A Task 1 gera uma migração nova (`ServiceJobCost`, `Machine.hour_meter_*` no
`ServiceJob`, `StockMovement.service_job_id`): aplique primeiro no Docker
local, como sempre, e só no Neon quando a fase inteira estiver pronta.

**3. Duas decisões pequenas que continuam esperando:**

- o rótulo "Prestador" no Financeiro (`dividas.md` §2.10), que a 34.1 piorou:
  agora há receita e despesa sob o mesmo nome que já é item de menu;
- a dívida 3.3 (`resolverPasto` devolve o primeiro achado em silêncio) fica
  mais visível depois da Task 9 da 34.2, que cria mais um handler de WhatsApp
  resolvendo ambiguidade do jeito CERTO (pergunta, nunca escolhe). Vale
  reavaliar se ela entra no escopo da 34.2 ou fica para depois.

**Continuam esperando, de rodadas anteriores:** a outra metade da `dividas.md`
§2.8 (a despesa avulsa e os sete destinos de saída), a correção do rebanho
invisível (§2.9), e três decisões de produto do Leite (média diária por dias
corridos; cabeçalho de uma fazenda com armazenamento de todas; fechamento sem
data nascendo "Vencida").

**Depois da 34.2:** pela tabela da spec de design, ela fecha o par de módulos
33 (Mão de Obra) e 34 (Serviços com Máquinas). Não avance sem aprovação
explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
