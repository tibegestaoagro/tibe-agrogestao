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

- Atualizado em: 2026-09-02.
- Branch de trabalho: **`mao-de-obra-fase-2`**, 12 commits à frente da `main`.
- **Nada desta fase foi mesclado nem empurrado.** A fase 33.1 já está na `main`.

### A fase 33.1 ESTÁ NA `main` E NO AR; a 33.2 está pronta na branch

**Na `main` e em produção desde 02/09** (`7e30c0c..cc535eb`, 18 commits): a tela
de contatos, a dívida 3.2 paga, e a mão de obra fixa inteira. Migração aplicada
no Neon antes do push, e o deploy confirmado por duas chamadas únicas ao
`/docs/api`. O detalhe está em `historico/2026-09.md`.

**Pronta na branch `mao-de-obra-fase-2`**, 12 commits, nada mesclado: o serviço
contratado (§13 a §32 do Módulo 33).

### O que a fase 33.2 entregou

`ServiceJob` cobre a diária (§13), o empreito (§15) e o serviço por unidade
(§16), nas nove formas de cobrança. Mais `ServiceJobLog`, `WorkerLog` (as
anotações do §12 e §34), o resumo do §30, oito rotas, duas telas e dois
handlers de WhatsApp.

**Quatro decisões novas**, tomadas com o usuário antes do código:

1. **`servicos` é `ModuleKey` próprio, com matriz OPERACIONAL.** O corte:
   OPERADOR registra "vieram 3 homens hoje" e continua sem enxergar quanto o
   vaqueiro ganha por mês. Vale no painel E no WhatsApp.
2. **O §29 (manutenção de máquina) NÃO é `ServiceJob`.** `MachineMaintenance`
   já tem data, descrição e custo, e já gera lançamento. A action **recusa**
   `machine_id` apontando para Máquinas.
3. **O §22 é saldo aberto, não o parcelamento do Módulo 31.** Uma conta a pagar
   pelo total, cada pagamento encolhendo-a, saldo derivado. As parcelas de lá
   recusariam o exemplo literal do documento.
4. **O dinheiro do serviço aponta para o SERVIÇO**, e o lote de confinamento
   soma por junção. `related_id` aponta para uma coisa só, e o §22 exige que o
   serviço saiba quanto dele já foi pago.

### Três coisas que o teste achou antes do código sair da branch

1. **O filtro `canceled_at: null` na junção do confinamento mentia para menos.**
   Cancelar um serviço fazia sumir do custo do lote o dinheiro que JÁ TINHA
   SIDO PAGO. Um tratorista que recebeu R$ 400 e não voltou custou R$ 400 ao
   lote. Só apareceu porque o teste cobrava um número específico (400), não
   "mudou".
2. **Pagar mais que o restante não produz saldo negativo: produz DESPESA
   FANTASMA.** Sem a recusa, R$ 7.000 num serviço de R$ 700 é aceito inteiro, o
   pendente é apagado, e os R$ 6.300 a mais viram despesa com o restante em
   zero.
3. **Responder duas coisas quando uma foi perguntada perde a segunda.** É a
   âncora do pendente funcionando (só o campo perguntado entra), e o preço é
   aceito: perder um campo faz o assistente perguntar de novo, enquanto aceitar
   tudo faz ele gravar o que ninguém confirmou. O teste cobre os dois caminhos.

### O que foi validado no navegador

O §14 sai exato: "3 homens por 4 dias a 150" mostra **4 diárias** e
**R$ 1.800,00**, com a ficha explicando "4 diárias a R$ 150,00 · 3 pessoas". O
§22 também: pagando R$ 500, os quatro números ficam 1.800 / 500 / 1.300 /
02-09, e os dois lançamentos aparecem em `/financeiro`.

⚠️ **Uma coisa que a tela mostrou e virou dívida 2.10:** o lançamento aparece
sob o módulo **"Prestador"**, que também é um item do menu e é outra coisa. A
correção é um rótulo, mas muda o que o Módulo 2 exibe, então é decisão sua.

### Metade da dívida 2.8 §29 fechou

Serviço amarrado a lote chega ao "Custo acumulado" do confinamento. **Continua
faltando** a despesa avulsa lançada em `/financeiro`, que nasce sem
`related_id`: reescrito na `dividas.md`, não apagado.


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

**2. A migração no Neon, também do usuário.**
`20260904100000_servico_contratado` está aplicada só no Docker local. O
invariante 3 vale: ela vai ANTES de qualquer push, porque a Vercel faz deploy
automático e o build não roda migração. `npm run db:deploy` contra produção é
recusado pelo classificador de permissões mesmo com a marca de autorização,
então quem aplica é você, no terminal.

O `DATABASE_URL` do `.env` é a URL **Direct** (sem `-pooler`), então
`npm run db:deploy` roda sem passar URL inline. Confira depois com
`npx prisma migrate status`, que é leitura e passa.

⚠️ **A migração é ADITIVA e não tem nenhum `DROP`**, de nenhum tipo: quatro
tipos novos, uma coluna anulável em `MachineMaintenance`, e três tabelas novas.
Nenhuma linha existente é tocada.

**3. Só então** merge e push da `mao-de-obra-fase-2`, com autorização explícita.

**4. Duas decisões pequenas que a rodada levantou:**

- o rótulo "Prestador" no Financeiro (`dividas.md` §2.10);
- o guard da fase 34.1, quando ela chegar: `prestado` é receita, e a matriz
  pode não ser a mesma de `contratado`.

**Continuam esperando, de rodadas anteriores:** a outra metade da `dividas.md`
§2.8 (a despesa avulsa e os sete destinos de saída), a correção do rebanho
invisível (§2.9), e três decisões de produto do Leite (média diária por dias
corridos; cabeçalho de uma fazenda com armazenamento de todas; fechamento sem
data nascendo "Vencida").

**Depois:** a fase 34.1 (o serviço PRESTADO com máquina própria, que gera
receita) e a 34.2 (lançamento diário, combustível baixando estoque, horímetro).
A spec de design das duas já está escrita e mesclada.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
