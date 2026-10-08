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

- Atualizado em: 2026-10-07.

### Programa de dívidas (desde 07/10): E0 a E5 em produção

⚠️ **Regra do Codex desde 07/10 (o limite de uso dele chegou a 90%):**
`adversarial-review` sempre com `--model gpt-5.6-terra` (intermediário; o
esforço padrão dele já é `medium`, e o comando não aceita `--effort`); **no
máximo 2 rodadas por etapa** (a primeira já pedindo só o bloqueante, a
segunda só para confirmar); o que sobrar vira dívida registrada; **etapa só
visual não passa pelo Codex** (quem pega defeito ali é o navegador). Não
editar `~/.codex/config.toml`: ele vale para todo o Codex do usuário. Até
aqui foram 16 rodadas em quatro etapas, sem modelo fixado.

**E4 (2.5, 2.6, 2.7, tokens) em produção** (`64d3030`, 07/10), conferida no
site público (token `--texto-marca`, títulos, chips de `/docs`, login). Falta o
usuário olhar o painel logado. Dívida nova: 2.8.

**E3** (`91241ba`, Redis com limite e push por pessoa; tela de push não
validada, o service worker só registra em produção; dívida nova 5.10), **E2**
(`8a88b29`, 5.8; o agente não foi exercitado em conversa real, falta cenário
de confinamento no BANCO DE PROVAS; dívida nova 5.9), **E1** (`cafcb6a`, dívida
nova 3.3) e **E0** (`b4a5c77`) em produção, com deploy conferido.

O usuário aprovou em 07/10 um programa para fechar as dívidas de
[dividas.md](dividas.md) em etapas E0 a E11, uma branch por etapa, cada uma com
revisão adversarial do Codex e validação viva antes do merge. **O plano inteiro,
com as decisões do usuário, está em
`C:\Users\dilto\.claude\plans\ok-agora-com-esse-vivid-petal.md`** (fora do
repositório: no notebook ele não existe, e as decisões ficam resumidas aqui).
Decisões: 3.2 arquivado BLOQUEIA (vence o selo interno, preservando a janela
de leitura do cancelamento); 2.6 token novo `--texto-marca`/`--borda-marca`;
2.7 contorno nos chips de `/docs`; 5.5 frase com verbo + quantidade +
categoria substitui o pedido; 5.2 `contact_id` direto, negociação como
complemento; 2.3 entram os quatro itens; entram também unaccent, rebase do app
mobile, contratos e pasto com avaliação. Fora: 1.1, 1.3, 2.4.

**E0 (mod `guarda-contexto`):** ver a seção do mod no `CLAUDE.md`. **Ainda não
provado ao vivo:** o resumo terminar e a retomada sair (em headless o resumo
não concluiu). A primeira sessão interativa que passar de 90% é a prova.

### Agente do WhatsApp: Fases 1 a 6 em produção, Fase 7 em CANÁRIO

Spec
[../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md](../superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md)
(uma seção de decisões por fase), planos em `docs/superpowers/plans/`,
relatórios em [agente-whatsapp/](agente-whatsapp/), detalhe das fases em
[historico/2026-09.md](historico/2026-09.md). Modelo `gpt-5.6-luna`, esforço
`low`; gasto do programa US$ 5,56 de US$ 30.

**O fluxo de produção do n8n é HÍBRIDO desde 18/09.** `UAAA96aJFiiFsQCL` (42
nós) tem o desvio `Agente Novo?` logo depois de `Consolidar Mensagem`: quatro
telefones (o usuário, que é o Owner da **Da Mata**, tenant real, e Lucas, Max e
Laíza Agromax) vão para a rota de turno; todo o resto segue no `execute-action`,
intocado. As intenções novas só existem para quem está na lista.

- **A lista mora na expressão do nó `Agente Novo?`**, no próprio n8n. É ali que
  se põe a Da Mata inteira, ou se esvazia para desligar o canário.
- **Ler, guardar, aplicar e mexer na lista: `scripts/n8n-workflow.ts`**
  (29/09, recriado no repositório depois que os de 18/09 sumiram com o
  scratchpad; lição `o-scratchpad-some-e-leva-o-voltar-atras`). Toda escrita
  mostra o que muda, só grava com `--confirmar`, e salva antes uma cópia em
  `~/.tibe/n8n-copias/` (fora do repositório: o JSON tem a chave da Evolution).
  Voltar atrás = `aplicar <cópia> --confirmar`, ou `canario --ninguem`.
  Escrita e volta provadas na cópia de homologação (inativa); o passo de
  **publicar** (n8n 2.x: salvar deixa em rascunho) só roda em fluxo ativo e
  ainda não foi exercitado: o script confere e avisa se ficar rascunho. Não
  existe cópia do fluxo de produção anterior a 18/09 (sumiu): antes da
  primeira escrita, `salvar`.
- ⚠️ **O classificador bloqueia escrita no n8n de produção e escrita
  destrutiva no banco de produção**, mesmo com autorização: quem roda é o
  usuário, como na migração do Neon. Leitura é livre.
- ⚠️ **O JSON do fluxo nunca entra no repositório**: carrega a chave da
  instância da Evolution.
- **Ler o canário:** `npx tsx scripts/observar-canario.ts [dias]` (conversa
  inteira, entrada e saída, só leitura, contra produção). Para ver quais nós
  rodaram (áudio, buffer), a API de execuções do n8n; o script que fazia isso
  morava no scratchpad.

O detalhe de 29/09 (seis defeitos do canário, roteiro do aparelho com passos
1 a 7 aprovados, dívidas 5.3 e 5.6 fechadas) foi para
[historico/2026-09.md](historico/2026-09.md). Faltam os passos 9 e 10 do
roteiro (foto de recibo e o "não" final).

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 uma segunda tentativa passou e, na outra vez, quem rodou foi
o usuário. Tente uma vez; se bloquear, dê a ele o comando e o diretório, e
confira com `migrate status` antes do push.

✅ **A validação com navegador (`browser-harness`) funciona.** Os seis atritos
que imitam defeito (aba oculta, leitura cedo, acento no `js()`) estão no cofre:
`a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador`. Cenário de tela se
monta com script `tsx` (`scripts/_cenario-lista.ts`), nunca com `curl`.

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

**0. Programa de dívidas: E5 em produção** (`4acd0e6`, 08/10, Vercel
`success`). Validação viva pelo `npm run wa` (telefone fora do canário,
`execute-action`): "quantas novilhas eu tenho?" perguntou a idade, e "13 a 24
meses" respondeu o total (antes perguntaria o sexo). O negócio com dois itens
NÃO foi exercitado pela rota de turno: o n8n partiu a frase em duas chamadas
(dívida nova 5.11), e a cópia `--homologacao` está desligada no n8n. Fecha 5.0b (negócio com vários itens pergunta item por
item; candidata limpa ao resolver), 5.5 (verbo + quantidade + categoria na
pergunta de categoria substitui os animais guardados), 5.0c (brinco exige
dígito, no `parse` do campo), 5.7 (consulta do rebanho com pendente curto,
`consulta-pending.ts`) e as suítes `m17` e `m58` sem data fixa (`m17` vista
falhando e passando às 01h UTC). `test:all` 75/75 e as suítes da área verdes.
Codex: 2 rodadas (teto), as duas sobre a consulta herdar a fazenda; a regra
final é "herda só quem responde: termo que sozinho não fecha, ou que fecha
numa das candidatas". Teto aceito: "fêmeas de 15 meses" depois de "não
reconheci jumento" numa fazenda responde o rebanho inteiro. Pelo `execute-action`, quem decide
para onde vai a resposta é o classificador do n8n (no teste ao vivo ele a
mandou à consulta). Esta atualização mora na branch `pos-e5`, que entra na
`main` junto com a E6. Próxima: E6 (pasto + avaliação). Pendente do usuário: olhar o painel logado
(E4), conferir a tela de push (E3), e decidir se monta o cenário de
confinamento no tenant BANCO DE PROVAS (E2).

**1. Segurança, que é do usuário e vem antes de tudo:** rotacionar as 22
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Não
avançou, e cada commit que sobe é leitura pública.

**2. Do usuário, pequeno:** trocar o nome do cadastro "Owner Da Mata" em
Ajustes, que é por isso que a saudação sai sem nome.

**3. Fechar a Fase 7, quando o usuário quiser:** passos 9 e 10 do
[roteiro](agente-whatsapp/roteiro-do-chip.md). **Decidido em 29/09: o canário
fica com os 4 telefones de hoje**; ampliar a lista não está no plano até o
usuário reabrir o assunto. Quando reabrir: Da Mata inteira, depois "todos" e
desligar o `execute-action`. As duas trocas de lista são
`npx tsx scripts/n8n-workflow.ts canario <telefones...> --confirmar` e
`... canario --todos --confirmar`, rodadas pelo USUÁRIO (escrita no n8n de
produção). Antes da primeira, `... salvar`.

**4. Validar no celular as correções de 29/09** que ainda não foram exercitadas
em conversa real: "comprei 10 sacas de sal do Zé por 200" tem que perguntar se
já pagou; "quanto tenho a pagar nos próximos 100 dias" tem que dizer até que
data olhou; "comprei 30 machos de 0 a 8 meses" tem que ir direto à confirmação.

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- O Redis local é `tibe-redis` na `56379` (conferido em 11/09); `docker ps` antes.
