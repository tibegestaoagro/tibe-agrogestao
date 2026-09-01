# Handoff do Tibé (continuidade entre dispositivos)

Memória operacional **curta** e versionada. O trabalho acontece em duas máquinas
(desktop e notebook), e este arquivo é o que permite pausar numa e retomar na
outra. Leia depois do `CLAUDE.md`.

## Protocolo de manutenção

- Atualize ao encerrar cada rodada significativa.
- Só fatos verificados, nunca plano tratado como concluído.
- Registre: estado, escopo entregue, validações, commit, deploy, pendências e
  próximo passo autorizado.
- **Substitua a seção "Estado atual" a cada rodada.** No histórico, mantenha
  cinco linhas, uma por rodada. O que passar disso vai para
  `docs/agents/historico/`.
- Nada de segredo, credencial, transcrição de conversa ou detalhe que já esteja
  claro na spec, no código ou no commit.
- Merge na `main`, push para a `main` e deploy exigem aprovação explícita do
  usuário, a cada vez. Desde 2026-08-18 isso é uma trava de verdade
  (`.claude/hooks/guarda-bash.mjs`), não só uma frase aqui.

⚠️ **Este arquivo já chegou a 1.316 linhas violando o próprio protocolo acima.**
Se ele passar de umas 200, arquive antes de acrescentar.

## Estado atual

- Atualizado em: 2026-09-02.

### O Confinamento está no ar, e o que dele ainda vale saber

Subiu em 2026-09-01 (`430a1db..1fe1ccf`, 31 commits), com as três migrações
aplicadas no Neon antes do push, depois de um rejulgamento 4/10 e da onda 7 que
fechou oito dos dez achados. O detalhe está nas mensagens dos commits e em
`historico/2026-08.md`; o que sobrevive aqui é só o que ainda muda decisão:

⚠️ **`npm run db:deploy` contra o Neon é recusado pelo classificador de
permissões**, inclusive com `AUTORIZADO_PELO_USUARIO=1`, que só vale para o hook
do repositório. Leitura (`npx prisma migrate status`) passa. **Quem aplica
migração em produção é o usuário, no terminal.** Isso torna o invariante 3 mais
caro: commit que mexe em schema depende de um passo manual antes do push. Não
afrouxe a ordem por causa disso.

⚠️ **Item de menu dentro de grupo pode nascer invisível.** "Confinamento" fica
no grupo "Operação" (`src/lib/nav.ts`), e a pergunta "cadê o Confinamento?"
apareceu no mesmo dia do deploy. Vale para toda frente que criar item ali.

⚠️ **Confirmar deploy é verificação de navegador**, nunca `curl` em laço: 28
chamadas em poucos minutos já dispararam a proteção anti-bot da Vercel neste
projeto.

**Dois olhares de navegador ainda não feitos no Confinamento**, os dois sobre o
que só existe depois do JavaScript: a frase da `ORIGEM_AMBIGUA` embaixo do campo
"Pasto de origem" em `/confinamento`, e o painel "Encerrar" do `/rebanho` com os
três destinos. A cadeia inteira está provada; falta o pixel.

### Escopo que ficou de fora, de propósito

Dois pedidos do documento do cliente que a spec do Confinamento calou, achados
pelo juiz: o §29 (custos por lote) e o §17 (sete destinos de saída, três na
tela). **Não são defeito, são escopo.** Estão em `dividas.md` §2.8, e por
decisão do usuário entram numa **onda 8 própria**.

### O time de agentes tem DEZ, e está na `main` desde 31/08

`servidor-acao`, `servidor-dados`, `servidor-agente`, `tela-pagina`, `tela-kit`,
`prova-suite`, `prova-juiz`, `prova-viva`, `n8n-fluxo`, `explorador`. Mais as
skills `orquestrar-ondas` e `memoria-cofre`, os comandos `/onda`, `/juiz` e
`/lembrar`, e o manual em [como-orquestrar.md](como-orquestrar.md).

⚠️ **`prova-juiz` e `explorador` não registram** (ver
`docs/conhecimento/agente-com-modelo-nao-padrao-pode-nao-registrar.md`). Os três
julgamentos rodaram por `general-purpose` com o contrato do juiz embutido no
prompt, conferidos por `git status` de que não escreveram nada.

⚠️ **Os seis agentes da onda 7 morreram todos no limite de sessão** antes de
terminar, e um deles alcançou escrever no working tree. A onda foi refeita pela
sessão principal, tarefa por tarefa. Lição registrada: **conferir o working tree
depois de agente que morre**, porque o que ele deixou não está verificado.

**O cofre tem 22 notas.** A desta rodada:
`media-de-periodo-precisa-dividir-dia-a-dia`.

### A FASE 1 DO LEITE ESTÁ NA `main`, e a migração no Neon

Empurrada em 2026-09-02 com autorização do usuário, **depois** da migração,
como manda o invariante 3. O Neon está nas **39** e up to date; quem aplicou foi
o usuário, no terminal.

Verde antes do push: `tsc` 0, `lint` 0 erros, `npm run check` **15/15**,
`test:isolation`, `test:docs-api`, `npm run test:m52` (78 asserções) e `npm run
build`. Spec em `docs/specs/module-32-area-leite.md`.

**O que entrou:** três models (`MilkGroup`, `LactationEntry`,
`MilkProduction`), dois enums, dez rotas em `/api/v1/milk/*`, a tela `/leite`
dentro de "Operação", e quatro intenções de WhatsApp roteadas e testadas mas
**não emitidas** pelo classificador, que segue congelado.

⚠️ **São QUATRO intenções, não as três que a spec previa.** O
`ajustar_vacas_em_lactacao` virou `registrar_entrada_lactacao` e
`registrar_saida_lactacao`: "entraram 4" e "sequei 4" carregam o mesmo número e
diferem só no verbo. A spec foi corrigida junto, e o guia do n8n ganhou a seção
4.3, que lista o que existe e não é emitido.

**A validação ao vivo foi com NAVEGADOR de verdade** (extensão do Chrome), a
primeira deste projeto: a recusa apareceu embaixo do campo, registrar duas
ordenhas mudou o painel de 480 para 780, cancelar devolveu 680 e recalculou a
média, e a fazenda sem contagem mostrou traço. O cenário está em
`scripts/_cenario-leite.ts` (idempotente).

⚠️ **Decisão de produto pendente, achada na tela:** a "média diária" divide
pelos dias corridos da janela, então uma fazenda com um registro lê "Acumulado
no ano: 120 L, média diária 0,49 L". Correto pela definição da spec (seção 6.4)
e mesmo assim lê mal. A média POR VACA já diz "6 de 31 dias entraram na conta";
a média diária não diz nada equivalente.

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

### O DEPLOY SAIU, e a pendência 1 da Vercel não mordeu desta vez

Confirmado em 2026-09-02, com duas chamadas únicas (nunca `curl` em laço, que
já disparou a proteção anti-bot neste projeto):

- `/docs/api` lista `/api/v1/milk/*`;
- as quatro rotas (`summary`, `groups`, `lactation`, `production`) devolvem
  `401 UNAUTHORIZED` em **JSON**, não 404 nem HTML.

⚠️ **Isso contradiz a pendência 1 de `pendencias-do-usuario.md`**, que diz que
push de colaborador não vira deploy no plano gratuito. O push saiu pela
credencial do `dilton-pleno` e o deploy aconteceu mesmo assim. Ou o plano subiu,
ou a credencial do Windows mudou: **não foi investigado**, e a pendência
continua escrita como estava. Não conte com nenhuma das duas leituras sem
conferir.

Registrado junto: a identidade local de git que apontava para `tibegestaoagro`,
descrita na pendência como feita em 25/08, **não existe mais** neste
repositório. `git config --local user.name` volta vazio, e os commits saem como
`dilton-pleno`.

### ⏭️ PRÓXIMO PASSO: a segurança primeiro, depois a Fase 2

As três tarefas de segurança da seção acima (rotacionar, fechar o repositório,
pedir a coleta ao Suporte) vêm antes de qualquer código novo: enquanto o
repositório estiver aberto, todo commit é leitura pública.

Depois delas, a **Fase 2** do Leite (§12 a §22: tanque, ponto de coleta, leite
de terceiros), cuja análise estrutural está na **seção 12 da spec**. O ponto sem
paralelo continua sendo o §20: saldo por PROPRIETÁRIO dentro do mesmo tanque.


### Depois do Leite

1. **Onda 8:** os dois pedidos do cliente da `dividas.md` §2.8.
2. **A correção do rebanho invisível**, adiada pelo usuário: `dividas.md` §2.9.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **`.env.example` está modificado e NÃO commitado no desktop**, desde antes de
  31/08. A mudança REMOVE a documentação das duas variáveis do banco de provas
  (`npm run wa`), escrita em 24/08 porque o código as lê. Ficou parada ali,
  esperando decisão do usuário. Ela não viaja: é edição local do desktop.
- **O desktop tem pouca memória para este projeto** (relato do usuário em
  01/09), e o Turbopack morre lá quando outro projeto está rodando teste. Ver
  `docs/conhecimento/turbopack-nao-cria-processo-quando-a-maquina-esta-cheia.md`.

⚠️ **`ponytail` está ativo** (modo `full`), com 3 hooks globais, e o
`ponytail-subagent` propaga para os agentes despachados.

---

- **2026-09-02:** Fase 1 da Área Leite **no ar na `main`**, com a migração
  aplicada no Neon antes do push. Quatro decisões que o documento do
  cliente não resolvia foram levadas ao usuário ANTES da primeira linha de
  código: lote leiteiro é model novo e não `AnimalBatch`; contagem por fazenda,
  lote é rótulo; cada registro de produção é uma linha com turno; e nada é
  editado, cancela e registra de novo. Implementar mudou uma coisa da spec, e a
  spec foi corrigida junto: são QUATRO intenções de WhatsApp, não três, porque
  "entraram 4" e "sequei 4" só diferem no verbo. A validação ao vivo foi feita
  com NAVEGADOR de verdade pela primeira vez neste projeto (extensão do Chrome),
  e mostrou a recusa embaixo do campo, o registro de duas ordenhas mudando o
  painel, o cancelamento recalculando a média, e o traço na fazenda sem
  contagem. Achado que só a tela deu: a "média diária" divide pelos dias
  corridos, e "0,49 L" no acumulado do ano está certo pela definição e lê mal.

- **2026-09-01:** **Confinamento no ar** (`430a1db..1fe1ccf`, 31 commits), com
  as três migrações aplicadas no Neon ANTES do push. A terceira reclassifica o
  dinheiro de boitel já gravado de `rebanho` para `confinamento`, fechando a
  divisão histórica que o T20 tinha deixado registrada. Descoberto no caminho:
  `npm run db:deploy` contra produção é recusado pelo classificador de
  permissões, e a marca `AUTORIZADO_PELO_USUARIO=1` não vale para ele; quem
  rodou foi o usuário, no terminal. **A validação ao vivo foi feita no mesmo
  dia**, contra `next dev` com cookie de sessão: os cinco casos do juiz passaram
  no app de verdade, e o que só existe depois do JavaScript ficou provado por
  cadeia, não por pixel (o `browser-harness` não está instalado). Documento da
  Área Leite lido inteiro, com as três decisões de produto tomadas.

- **2026-08-31:** Confinamento (fase 3 do Módulo 30) rejulgado e corrigido. O
  juiz independente deu **4/10** com dez achados, e a onda 7 fechou oito deles
  em seis commits. Os quatro que importam: a conta a pagar do confinamento
  sobrevivia ao cancelamento; a tela oferecia uma forma de cobrança que a rota
  recusava; o `/rebanho` abria um painel de encerramento sem nenhum campo; e
  oito campos engoliam a recusa do servidor por completo. A causa comum dos
  três últimos era `Record<string, ...>` em mapa com chave de enum, que não
  quebra o `tsc` quando o enum cresce. Conferência 15 nova, e o handoff
  arquivado depois de 487 linhas.

- **2026-08-31:** time de agentes, fase 1, na branch `time-de-agentes` (3
  commits). O achado que orientou o desenho: este projeto já tinha inventado
  metade do protocolo (agentes A1/A2/A3 com "Escopo exclusivo" e "Proibido
  tocar", em `docs/arquitetura/onda-1-briefings.md`, e o juiz subagente com
  rubrica) e perdeu tudo junto com o Codex em 04/08. Voltou com as duas peças
  que faltavam: committer único e formação de onda por regra. De quebra, a
  stack passou a dizer Next 16, que é a versão real desde sempre.
- **2026-08-31:** frente 5 (rollout do design system) pronta na branch
  `frente-5-design-system`. O painel inteiro no kit e em token semântico, com
  duas travas novas no `check` (recusa engolida, painel fora do kit) e uma
  terceira depois da validação (recusa do Zod crua). A validação ao vivo achou
  o Zod falando inglês em 71 rotas, a recusa caindo no rodapé em vez do campo,
  o `seed:demo` quebrado desde o Módulo 30 e a pílula invisível do
  `bg-tibe-light`. Nenhum deles aparecia em suíte.

O detalhe de tudo isso, na íntegra e sem reescrita, está em
[historico/2026-08.md](historico/2026-08.md), que também guarda as 358 linhas
arquivadas deste arquivo em 31/08.

