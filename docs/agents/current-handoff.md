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

### Dívida 2.8 (Confinamento) fechada e EM PRODUÇÃO

Spec: [../superpowers/specs/2026-09-14-confinamento-custos-e-saidas.md](../superpowers/specs/2026-09-14-confinamento-custos-e-saidas.md).
Sem migração. Decisões do usuário em 14/09 na spec. Merge e push em 14/09
(`fa9f948`); deploy confirmado pelo status da Vercel e pela rota de custo
listada no `/docs/api` de produção. Branch apagada. As três decisões do Leite
também estão no ar (`7138926`).

- **"Registrar custo" no lote**: despesa no Financeiro ligada ao lote, que entra
  no custo acumulado (`POST /api/v1/confinement/stays/:id/costs`).
- **Encerramento com sete destinos**: pasto, outra fazenda, outro confinamento
  (abre lote novo lá), leilão ou feira (abre a remessa do Módulo 31), venda,
  morte e outro destino (`ajuste` com motivo). Tudo numa transação.
- ⚠️ **A venda de QUALQUER estadia passou a criar negociação** (§19), com
  comprador opcional, e a receita sai dela, não do livro-razão. Achado da
  auditoria: antes a venda do lote não aparecia em Negociações.

**Validado:** `m66` nova (7 seções, provada falhando com o caminho antigo),
`m51` ajustada; suíte inteira; no navegador, custo de R$ 450 levou o lote de
R$ 12 a R$ 462, e um encerramento de 10 cabeças gravou lote novo no Boitel,
remessa de leilão, venda "Frigorifico Teste" em Negociações e o ajuste com
motivo, com o lote em 15.

⚠️ O agente do WhatsApp não ganhou os destinos novos (o classificador segue
congelado); a venda dele continua funcionando, agora como negociação sem
comprador.

### As três decisões pendentes do Leite, EM PRODUÇÃO (`7138926`)

Decididas pelo usuário em 14/09 (as três recomendadas), sem migração:

- **Média diária divide pelos dias COM REGISTRO**, com "N de M dias com
  registro" na tela (campo aditivo `dias_com_registro` no resumo). No banco de
  dev, o acumulado do ano passou de 13,35 para 490 L/dia, "7 de 257 dias".
  Registrado na spec do Módulo 32, §6.4.
- **Bloco de armazenamento com título "Armazenamento de todas as fazendas"**, e
  cada tanque próprio mostra a fazenda dele. Não filtra: o saldo no ponto de
  coleta não guarda de que fazenda o leite saiu.
- **Fechamento a prazo exige data de recebimento** (`VENCIMENTO_OBRIGATORIO`,
  no campo `due_date`), na action e no formulário.

**Validado:** `m52` e `m54` com asserções novas, que reprovam com as regras
antigas; suíte 65/65; na tela, os três pontos lidos no navegador, e a recusa
aparece embaixo do campo.

### Dívida 2.14 fechada e EM PRODUÇÃO

Migração `20260914180000_tarefa_ancora_e_conclusao`: `Task.recurrence_anchor` e
`Task.completed_at`, com backfill (`completed_at` pelo `updated_at` das
concluídas; âncora pela `due_date` das recorrentes). Aplicada no Neon pelo
usuário antes do push; merge e push em 14/09 (`4a0fc0f`). Deploy confirmado
pelo status da Vercel no commit (`success`) e pelo app respondendo no navegador.
Branch apagada. Não validado em produção com sessão (o agente não digita senha).

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

**2. Pedido do usuário em 14/09:** resolver o que resta ANTES de rotacionar as
credenciais. Com a dívida 2.8 no ar, o que sobra em `dividas.md` é de
outra natureza: validação em aparelho (1.1, 1.2), sandbox do Asaas (1.3, precisa
de chave), itens adiados por volume de dado (2.3), conversa com o cliente
(2.4), tokens de cor fora do painel (2.5 a 2.7) e contratos do app (4.1).

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
