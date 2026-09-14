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

- Atualizado em: 2026-09-14.

### O Módulo 38 (Meu Dia) está EM PRODUÇÃO: as quatro áreas estão no ar

Merge e push em 14/09 (`6ab68c5..418c145`). A migração
`20260914100000_meu_dia_tarefa` foi aplicada no Neon ANTES do push e conferida
com `migrate status`. Deploy confirmado pelas rotas `/api/v1/meu-dia` e
`/api/v1/tasks/:id/postpone` aparecendo no `/docs/api` de produção, lido no
navegador. A branch `meu-dia` foi apagada, local e remota. Suíte **65/65** (a
`m65` entrou). Spec em
[../superpowers/specs/2026-09-11-modulo-38-meu-dia.md](../superpowers/specs/2026-09-11-modulo-38-meu-dia.md).

⚠️ A migração torna `Task.due_date` opcional e não tem reversão trivial.

**O que a fase entregou:** a tela em Atenção, Hoje, Próximos dias e Sem data,
na ordem do §50; tarefa com data opcional, horário, responsável, prioridade,
fazenda, observação e recorrência rolante; adiar, editar e excluir; o histórico
do dia; o resumo da fazenda; a prévia do `/dashboard` lendo a mesma consulta; e
`consultar_meu_dia`, `consultar_amanha` e `consultar_semana` pelo WhatsApp.

**Os defeitos que só a validação achou, todos corrigidos:**

- a primeira tarefa sem data **estouraria** a listagem e derrubaria a página;
- "Atenção" saía com **110 itens**, 83 vacinas atrasadas, porque a consulta
  desobedecia a spec e porque a reaplicação de vacina não apaga a próxima dose
  antiga (12 já tinham sido reaplicadas);
- a ordem desempatava por horário antes da data;
- sem contato, a conta aparecia como "Pagar Outros".

⚠️ **Um clique em "Amanhã" respondeu 200 sem gravar**, na primeira compilação da
rota no `next dev`. Não reproduziu: a mesma rota pelo `fetch` da sessão real e
pelo botão, já compilada, gravaram. Registrado sem causa, porque não achei uma.

**Três limitações medidas e aceitas**, em `dividas.md` §2.12 a §2.14: o
dashboard conta o rebanho por campo gravado, sua saudação usa a hora UTC, e a
recorrência mensal nos dias 29 a 31 deriva.

**As três decisões do usuário em 11/09:**

- **Só as fontes que já guardam data no banco** (financeiro, tarefas, vacinas,
  serviços agendados, estadias de confinamento, alerta de estoque baixo). As
  outras seis áreas do documento não têm campo de data, e criá-los para encher
  uma tela é a cauda balançando o cachorro.
- **A porta de entrada troca em rodada própria**, depois de a tela ser usada.
- **O WhatsApp consulta e cria, mas não conclui por frase.** Casar texto com
  tarefa erra calado, e o pasto ambíguo já mostrou o preço.

⚠️ **A armadilha da T01, já resolvida na própria T01:** tornar `due_date`
opcional exige mudar `effectiveStatus` junto. Provado em 14/09 removendo a
guarda: sem ela a primeira tarefa sem data faz a listagem ESTOURAR e derruba a
página inteira do Meu Dia, pior do que a spec previa.

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 uma segunda tentativa passou e, na outra vez, quem rodou foi
o usuário. Tente uma vez; se bloquear, dê a ele o comando e o diretório, e
confira com `migrate status` antes do push.

✅ **A validação visual com navegador FUNCIONA nesta máquina** (`browser-harness`),
e foi assim que os Módulos 36 e 37 foram validados. Seis atritos conhecidos:

1. a primeira conexão exige `new_tab(url)` explícito;
2. clique por coordenada não dispara o botão no rodapé do `FormSheet` (use
   `b.click()` por `js`, e no `FormSheet` ache por `button[type=submit]`, porque
   o texto com acento não casa);
3. os ids da árvore de acessibilidade mudam a cada render;
4. ⚠️ **aba em segundo plano PAUSA a animação e imita defeito**: o painel fica
   com `data-state="closed"` sem desmontar e a sobreposição engole todo clique.
   `activate_tab(current_tab())` resolve. Custou duas investigações em 11/09;
5. ⚠️ **o texto passado ao `js(...)` chega com acento corrompido**: case por
   prefixo sem acento, ou monte o caractere com `String.fromCharCode`;
6. a primeira visita a uma rota ainda não compilada estoura o tempo do controle.
   Não é queda: espere e leia de novo, sem renavegar.

⚠️ **Monte cenário de tela com script `tsx`, nunca com `curl`.** O Git Bash
daqui manda acento em Windows-1252, o dado entra torto no banco, e o sintoma
parece defeito de renderização. Modelos prontos: `scripts/_cenario-lista.ts` e
`scripts/_cenario-financeiro-35.ts`.

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

**2. O backfill de `property_id`** (dívida 2.11), que o usuário já autorizou. É
curto, tem migração, e conserta algo que o produtor sente hoje: 274 lançamentos
somem quando ele filtra por fazenda.

**3. Decidir se o Meu Dia vira a porta de entrada** (decisão 38.2), depois de o
usuário usá-lo alguns dias. É decisão de produto, e a troca é uma rodada curta.

**4. As três dívidas pequenas que o Módulo 38 deixou à vista** (`dividas.md`
§2.12 e §2.13): o `/dashboard` contando o rebanho por campo gravado, e a
saudação dele pela hora UTC. A segunda é uma linha.

**As quatro áreas estão no ar. Continuam esperando:** a outra metade da
`dividas.md` §2.8 (a despesa avulsa e os sete destinos de saída), e três
decisões de produto do Leite (média diária por dias corridos; cabeçalho de uma
fazenda com armazenamento de todas; fechamento sem data nascendo "Vencida").

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- ⚠️ **A linha que dizia que o Redis local desta máquina era `tibe-redis-local`
  na porta `6390` estava ERRADA**, conferido em 11/09: o container é
  `tibe-redis` na `56379`, como o `CLAUDE.md` documenta. Confira com `docker ps`
  antes de copiar comando de qualquer um dos dois.
