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

### Dívida 2.14 fechada na branch `divida-2-14-recorrencia`, esperando o Neon

Migração `20260914180000_tarefa_ancora_e_conclusao`: `Task.recurrence_anchor` e
`Task.completed_at`, com backfill (`completed_at` pelo `updated_at` das
concluídas; âncora pela `due_date` das recorrentes). **Precisa ir ao Neon ANTES
do push.**

- **A série segue a âncora.** Além do "dia 31 que ficava no 28", a leitura do
  código achou uma deriva que a dívida não registrava: **adiar deslocava a
  série** ("toda segunda" adiada para terça virava "toda terça").
- **Decisão do usuário (14/09):** editar a data no formulário redefine a série;
  adiar ("Amanhã" e WhatsApp) é pontual e mantém a âncora.
- **Histórico do dia lê `completed_at`**; reabrir a tarefa apaga o campo.
- A próxima ocorrência nascia à meia-noite UTC, fora da convenção de data de
  calendário; agora nasce ao meio-dia UTC.

**Validado:** `m65` com os casos novos, que reprovam (8) com o comportamento
antigo; suíte 65/65; no navegador, "Amanhã" numa mensal de 14/09 manteve a
âncora e "Feito" gerou a próxima em **14/10** (antes seria 15/10).

⚠️ **`next dev` aberto antes de uma migração dá 500 no Meu Dia**: o client do
Prisma fica o antigo em memória. Reinicie o servidor depois do `prisma generate`.

### O Meu Dia virou a porta de entrada, e as dívidas 2.11 a 2.13 fecharam

**Tudo de 14/09, na ordem que o usuário autorizou ("todos autorizados"):**

1. **Backfill da fazenda do lançamento** (dívida 2.11): migração
   `20260914140000_backfill_fazenda_do_lancamento`, aplicada no Neon pelo
   usuário antes do push. Só preenche onde a origem sabe a fazenda (negociação,
   lote, talhão, máquina, manutenção, estadia, serviço, trabalhador), com guarda
   de mesmo tenant. Produção tinha 7 nulos; 4 seguem nulos por desenho
   (lançamento avulso sem origem).
2. **Meu Dia é a porta de entrada** (decisão 38.2): primeiro item do menu, e o
   destino do login, do onboarding, do `start_url` do app instalado e do toque
   na notificação push. O `/dashboard` segue no menu como "Painel".
3. **O rebanho do `/dashboard` e do `resumo` do WhatsApp lê o livro-razão**
   (dívida 2.12), trocado num lugar só, `countActiveAnimals`. Medido antes em
   produção: o Painel da Da Mata mostrava **2 cabeças**, e o livro-razão tinha
   **21**.
4. **A saudação do `/dashboard` usa a hora de São Paulo** (dívida 2.13).

**Em produção:** merge e push em 14/09 (`2f383d2..e9b3c35`), sem migração.
Deploy confirmado no navegador pelo `start_url` do manifest de produção, que
passou de `/dashboard` para `/meu-dia`. Suíte **65/65**, `tsc`, `lint` e `check`
limpos. A tela autenticada foi validada no `next dev` (menu, Painel de volta a
200 com fazenda escolhida); em produção não, porque o navegador desta máquina
não tem sessão e o agente não digita senha. **Vale o usuário abrir o Painel com
uma fazenda escolhida e conferir o número de cabeças.**

⚠️ **Defeito achado na validação, corrigido junto:** o `/dashboard` dava **500
com uma fazenda escolhida no seletor**, desde 08/04. O filtro de vacina usava a
relação `animal`, que não existe mais em `AnimalVaccination`; o certo é `batch`.
Nenhuma suíte abria a página com fazenda escolhida.

**Suítes:** `m12` e `m17` cobravam "N animais ativos" com fixture que só cria o
lote. Ganharam o helper `registrarNoLivro` (`scripts/helpers/herd.ts`), que põe
as cabeças no livro com um `saldo_inicial`. Suíte que cobra contagem de rebanho
precisa dele.

⚠️ **Um clique em "Amanhã" do Meu Dia respondeu 200 sem gravar** (Módulo 38),
na primeira compilação da rota no `next dev`. Não reproduziu. Registrado sem
causa, porque não achei uma.

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

**2. Levar a dívida 2.14 a produção:** o usuário roda a migração no Neon,
depois merge e push da branch `divida-2-14-recorrencia`.

**Continuam esperando:** a outra metade da
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
