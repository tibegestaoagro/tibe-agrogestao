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

- Atualizado em: 2026-10-08.

### Programa de dívidas (desde 07/10): E0 a E7 em produção

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
`low`; gasto do programa US$ 5,82 de US$ 30.

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

**0. Programa de dívidas: E7 em produção** (merge `d44ffd5`, 08/10; migração `20261008120000_busca_sem_acento` rodada pelo usuário no Neon antes do push, conferida por `migrate status` e pela coluna preenchida nas 7 linhas; levou junto a `pos-e6`). Validação viva pela rota de turno de produção com o `WA_TEST_PHONE`: "quanto o Zé Carlos ainda me deve" achou o contato "do Ze Carlos", "quanto o Jõao me deve" achou "Joao". **E8 na branch `app-mobile-rebase`** (rebase limpo dos 3 commits sobre a `pos-e7`, mais `10f78ca` com o status `cancelled` nos tipos; rotas, corpos e `tsc` do app conferidos contra o back-end atual). **Falta o reteste no Android pelo usuário** (roteiro de 5 itens na dívida 1.2), e só então merge. Sem Codex: rebase sem lógica nova. A E9 (contratos) espera este merge: a prova dela é o `tsc` do app contra o pacote. E7: coluna GERADA `name_busca` em `Contact` e `ServiceClient` (função `nome_de_busca`, a mesma regra do `normalizarTermo`, sem a extensão `unaccent`, que transliterava mais que o JS), busca pelo client escopado em vez de ler a tabela; contas do contato pelo `contact_id`, negociação sem `contact_id` como complemento (5.2). m70 seção 14, `test:all` 75/75, drift limpo, Codex aprovou na rodada 2. Fecha 5.0 e 5.2; nova 5.13 (sem índice trigram). **E6 em produção** (merge `7ecbfa7`, 08/10). Validação viva da E6: a rota de turno de produção, chamada direto com o `WA_TEST_PHONE` (que não está no canário do n8n), respondeu "quantos pasto temos cadastrados" com os pastos da Fazenda de Provas, e "acabei de pagar o Zé" foi para mão de obra ("ninguém cadastrado"), sem gravar nada. Intenção `consultar_pastos` (só leitura: pastos por fazenda, cabeças `presente` de qualquer dono e área; nome que casa dois mostra os dois) e a descrição de domínio de `mao_de_obra` para pagamento sem valor. Medição em 53 casos novos: pagamento 80-84% para 93,5% nas duas rodadas, pastos 100%, regressão `forademostra` 100% em intenção, zero gravação indevida ([relatório](agente-whatsapp/avaliacao-fase-8.md)). ⚠️ A primeira versão passou na nota e marcava compra a prazo como paga (11 de 12 chamadas); só a sonda contra o controle achou: o pontuador não confere campo a mais. A bancada não media conversa desde 18/09 (telefone fora da forma canônica), corrigida. Fecha 5.4; 5.0a encolheu para duas frases. Vale só na rota de turno (canário). Codex: duas rodadas feitas, achados corrigidos (`ee290ee` e o seguinte: gado em pasto desativado, nome exato em duas fazendas, telefone canônico da bancada); arquivar pasto ocupado virou dívida 5.12. **E5 em produção** (`4acd0e6`, 08/10): 5.0b, 5.0c, 5.5, 5.7; o negócio com dois itens não foi exercitado pela rota de turno (dívida 5.11). Pendente do usuário: olhar o painel logado (E4), conferir a tela de push (E3), e decidir se monta o cenário de confinamento no tenant BANCO DE PROVAS (E2).

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
