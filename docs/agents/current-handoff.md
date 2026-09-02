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
- Branch de trabalho: **`servico-prestado-fase-1`**, 8 commits à frente da
  `main`.
- **Nada desta fase foi mesclado nem empurrado.** As fases 33.1 e 33.2 já estão
  na `main` e em produção; o detalhe delas foi para `historico/2026-09.md`.

### A fase 34.1 está pronta na branch, e não subiu

O serviço **PRESTADO** com máquina própria: a fazenda faz o serviço para outra
pessoa e o dinheiro ENTRA. Escopo entregue, do §13 ao §42 do documento de
Máquinas.

**Quatro bifurcações abertas em `service-jobs.ts`**, todas lidas da `direction`
e nunca recebidas por parâmetro:

| o que muda | `contratado` | `prestado` |
|---|---|---|
| sinal do lançamento | `expense` | `income` |
| categoria | Serviço terceirizado | Serviço prestado |
| `machine_id` | RECUSADO (é `MachineMaintenance`) | OBRIGATÓRIO (§17) |
| cliente | opcional (§14: "vieram 3 homens") | obrigatório (§17) |

Mais: o `status` passou a vir da DATA (§18), então serviço marcado para o futuro
nasce `agendado` e entra na agenda do §39. Isso vale para as DUAS direções.

**O que entrou junto:** o histórico da máquina (§32, somado **por unidade**), a
agenda (§39), os serviços na ficha do contato (§37, nas duas direções), duas
rotas, as telas, e a intenção `registrar_servico_prestado` no WhatsApp.

⚠️ **O classificador do n8n continua congelado** e não emite a intenção nova.
Ela é roteada e testada, como as outras nove que esperam a mesma coisa.

### Três coisas que só a validação viva achou

1. **A tela `/servicos` passava `Decimal` para um Client Component** desde a
   fase 33.2. `tsc`, `lint`, `check` e as suítes verdes; a página renderizava; o
   único sinal era o contador de issues do overlay do Next. Corrigido com
   `select`. Virou [[decimal-do-prisma-so-quebra-no-console-do-navegador]] no
   cofre.
2. **A `m58` escrevia no Redis de PRODUÇÃO toda vez que rodava.** Ela conversa
   com o handler, o handler guarda a pendência no Redis, e nada conferia o
   alvo. Ganhou `exigirRedisLocal()`, a mesma trava da `m56`.
3. **A dívida 2.10 PIOROU**, e está reescrita: agora existe RECEITA sob o rótulo
   "Prestador", ao lado da despesa. O mesmo nome cobre três coisas diferentes.

### O que foi conferido no navegador

Com `next dev` contra o Docker local, tudo pelo caminho real (rota e
formulário): o §13 (25 hectares a 180 dá **R$ 4.500**), o §27 (recebe 3.000 de
8.000, ficam **5.000**), o §18 (serviço de daqui a 3 dias nasce **Agendado** e
aparece em "Próximos"), o §32 (a ficha da máquina diz **"4 horas · 20 diárias ·
25 hectares"**, sem somar tudo), o §37 (um contato com serviço e NENHUM negócio
abre normalmente) e o §28 (as cinco linhas em `/financeiro` são **Receita**, e o
DRE do mês mostra `servico` com receita 13.100 e despesa 1.800 lado a lado).

As três recusas do formulário aparecem sob os campos certos, e o foco vai para
o primeiro do `ORDEM`.

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
`20260905100000_servico_prestado` está aplicada só no Docker local. O
invariante 3 vale: ela vai ANTES de qualquer push, porque a Vercel faz deploy
automático e o build não roda migração. `npm run db:deploy` contra produção é
recusado pelo classificador de permissões mesmo com a marca de autorização,
então quem aplica é você, no terminal.

O `DATABASE_URL` do `.env` é a URL **Direct** (sem `-pooler`), então
`npm run db:deploy` roda sem passar URL inline. Confira depois com
`npx prisma migrate status`, que é leitura e passa.

⚠️ **A migração é ADITIVA e não tem nenhum `DROP`**, de nenhum tipo: quatro
colunas anuláveis em `ServiceJob`, dois índices e uma chave estrangeira.
Nenhuma linha existente é tocada, e nenhum serviço já registrado muda de
comportamento.

**3. Só então** merge e push da `servico-prestado-fase-1`, com autorização
explícita.

**4. Uma decisão pequena, agora mais urgente:** o rótulo "Prestador" no
Financeiro (`dividas.md` §2.10). A 34.1 pôs RECEITA sob ele, então o mesmo
nome cobre o item de menu, a despesa e a receita.

O guard da 34.1 deixou de ser dúvida: `prestado` e `contratado` usam a MESMA
matriz `servicos`. Quem registra o serviço vê o valor dele nas duas direções, e
separar viraria uma tela que mostra metade das linhas.

**Continuam esperando, de rodadas anteriores:** a outra metade da `dividas.md`
§2.8 (a despesa avulsa e os sete destinos de saída), a correção do rebanho
invisível (§2.9), e três decisões de produto do Leite (média diária por dias
corridos; cabeçalho de uma fazenda com armazenamento de todas; fechamento sem
data nascendo "Vencida").

**Depois:** a fase 34.2 (lançamento diário de trabalho, combustível baixando o
estoque, horímetro). A spec de design dela já está escrita e mesclada.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
