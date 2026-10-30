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

- Atualizado em: 2026-10-30.

### Programa de dívidas (07 a 14/10): encerrado, E0 a E10 em produção

⚠️ **Regra do Codex desde 07/10 (o limite de uso dele chegou a 90%):**
`adversarial-review` sempre com `--model gpt-5.6-terra` (intermediário; o
esforço padrão dele já é `medium`, e o comando não aceita `--effort`); **no
máximo 2 rodadas por etapa** (a primeira já pedindo só o bloqueante, a
segunda só para confirmar); o que sobrar vira dívida registrada; **etapa só
visual não passa pelo Codex** (quem pega defeito ali é o navegador). Não
editar `~/.codex/config.toml`: vale para todo o Codex do usuário.

O usuário aprovou em 07/10 um programa para fechar as dívidas de
[dividas.md](dividas.md) em etapas E0 a E11, uma branch por etapa, cada uma com
revisão adversarial do Codex e validação viva antes do merge. O plano está
fora do repositório (`~/.claude/plans/ok-agora-com-esse-vivid-petal.md`, só no
desktop); as decisões ficam resumidas aqui.
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

### Meu Empório (Módulo 39): F0 a F6 em produção

**F6 (ajustes do teste com o cliente, 30/10), branch `emporio-f6-equipe`.**
Decisões Q118 a Q138 na spec, tiradas por grill em três rodadas. Duas
entregas: **F6a** (saca e fardo como unidade-base com conteúdo, granel pelo
conteúdo com recusa da fração inexata, marca, fabricante, código, espécie,
fim do tipo Central/Ponto de venda) **em produção desde 30/10** (`a30c065`,
merge fast-forward autorizado pelo usuário; migração
`20261030120000_emporio_f6a` no Neon antes do push, `migrate status` em
dia; Vercel com sucesso; `content_qty` e `DUPLICATE_CODE` conferidos em
`/docs/api` de produção). Provas: `m86` verde (vista falhando antes), m37,
m77 a m85, docs-api, isolation, tsc e check verdes; roteiro `emporio-f6a`
verde e reprovado com a conversão escondida; telas vistas no celular. A
`m83` falhava no dia 30 por borda da janela de 30 dias no teste (corrigido).
**F6b em produção desde 30/10** (`e05846d`, merge fast-forward
autorizado pelo usuário; migração `20261030180000_emporio_f6b` no Neon
antes do push, `migrate status` em dia; Vercel com sucesso; rotas
`emporio/team`, `emporio/history` e `resolve` em `/docs/api` de produção;
`/login` 200 e página protegida redirecionando, ou seja, o proxy com banco
carrega na Vercel). Contrato na spec, seção "F6b: contrato"; a migração
traz função no Empório, transferência com diferença, `EmporioAuditLog` e a
migração de dados que dá a função a quem já via.
Entregue: papel lido do banco a cada request (`src/lib/emporio/papel.ts`,
fonte única da permissão), Equipe (`/emporio/equipe`), chaves do
Vendedor, trava só da loja na API (`guard()` com `lojaOk`), no WhatsApp
(`executarIntencao` e turno) e nas páginas (**no `proxy.ts`**: o layout e
o `template.tsx` não rodam na navegação por link, e o Vendedor via a
fazenda; o proxy do Next 16 roda em Node e lê o papel), Configurações com
o papel travado, transferência aguardando o Gestor, Histórico em toda
escrita (conferência 19 do `check` cobra) e tela `/emporio/historico`.
Regra a mais, decidida na revisão: o Gerente geral não altera nenhum
ADMIN da conta. Provas: m87, m88 (WhatsApp) e m89 (Histórico) escritas da
spec e vistas falhando antes; m77 a m89 verdes; roteiros emporio-f6b,
f6a, f5 e f1 verdes (f6b reprovado com a trava de página desfeita e com
a navegação por link antes do proxy); `test:all` 92/92. **Próximo:**
cenário de demonstração na Da Mata de produção (Q137) e manual em
`/manual` (Q138), que ainda não têm plano detalhado.

⚠️ **Em produção o Empório está ligado em QUATRO contas, não só na Da
Mata** (lido no Neon em 30/10): Da Mata, Max Dias, Laíza e Lucas
(Agromax), todas com a lista de usuários vazia e **só o Owner ativo**. Por
isso a migração de dados da F6b não muda ninguém em produção. Ela
transformaria Operador em Vendedor (só da loja, sem a fazenda): numa conta
com Operadores de fazenda e o Empório ligado para todos, isso seria
estrago. Conferir antes de reaproveitar aquele SQL.

Pendências pequenas da F6b: o lembrete de cadastro abandonado
(`pending-flows`) ainda pode sair para quem virou só da loja (a retomada é
bloqueada); a idempotência do resolver da transferência é pelo estado
(sem coluna da chave); a perda no caminho sem motivo por item grava
`outro`. Depois da F6: cenário de demonstração na Da Mata de produção
(Q137) e manual em `/manual` (Q138). A coluna `Establishment.kind` e o
enum saem numa entrega seguinte (Q121).

⚠️ O `next dev` entra em laço ou responde 500 depois do `prisma generate`
de uma migração. Parar o `next dev` ANTES do generate evita. Se for de
outra sessão, o classificador não deixa o agente matar: quem para é o
usuário (`taskkill //PID <pid> //T //F` no `!`, barras duplas por causa do
Git Bash), depois `rm -rf .next/dev`. `TaskStop` da tarefa do `npm run dev`
mata o npm mas deixa o node na porta.

**F0 (liberação e fundação) em produção desde 27/10** (`192e402`, merge
fast-forward da `emporio-f0`, que trouxe a spec junto; autorizado pelo
usuário). Migração `20261027120000_emporio_f0` aplicada no Neon antes do
push (`migrate status`: em dia), deploy da Vercel com sucesso, e as rotas
novas conferidas em `/docs/api` de produção. `TenantFeature`/`TenantFeatureUser`,
`Establishment`, perfil `emporio`, `StockMovement.property_id` anulável com
CHECK de exatamente um local, e os funis do estoque da fazenda filtrando
`property_id` não nulo. Cartão "Recursos em teste" no detalhe da conta da
Plataforma. Provas: `tsc` 0, `check` 0 falhas, `test:m77` verde (seção 12
vermelha antes da correção dos funis), `test:all` 79/80 com a `m73`
corrigida depois. Validação viva, seis passos aprovados no navegador
(desligado: sem menu e 404; ligar só o Owner, com a recusa da lista vazia;
página e API 200; estoque da fazenda igual; desligar e religar preservando a
lista; conta só de Empório). Ela achou dois defeitos, corrigidos: a sidebar
ignorava o `show` dos links de topo (anterior à F0) e o Painel rotulava
`emporio` como "Prestador". Observado e não mexido: na conta só de Empório,
o Meu Dia diz "SUA FAZENDA" e o menu mostra Calculadora Pecuária e Fazenda
em Números (igual às contas só de prestador hoje).

Cenário local: `scripts/_cenario-emporio-f0.ts` (conta
`so-emporio@teste.local`) e `scripts/_sessao-local.ts --plataforma`.

**F1 (estabelecimentos e catálogo) em produção desde 27/10** (`150b04a`,
merge fast-forward autorizado pelo usuário; migração
`20261027180000_emporio_f1` no Neon antes do push; Vercel com sucesso;
rotas conferidas em `/docs/api`). Loja nova vem como "Ponto de venda"
(decisão do usuário). Decisões Q50 a Q59 e o contrato na spec, dívida 2.22
nova. Quatro tabelas: `UserEstablishment`, `EmporioProduct`,
`ProductPresentation`, `PresentationPrice`. 16 actions em `emporio-catalogo.ts`, 12 rotas,
telas em `/emporio`, `/emporio/estabelecimentos`, `/emporio/produtos` e
`/emporio/produtos/[id]`. Provas: `tsc` 0, `check` 0 falhas, `test:all`
81/81, `test:m78` com 118 checagens (4 vermelhas com a precedência invertida
e o filtro Q51 tirado), roteiro `npm run navegador -- emporio-f1` com 33
itens (2 vermelhos com a fórmula trocada por soma) e o `emporio-f0` ainda
verde. O cenário `_cenario-emporio-f1.ts` liga o recurso na conta do seed
inteira e cria o `operador-emporio@teste.local`.

⚠️ **Prisma Client regenerado com o `next dev` no ar deixa o servidor com o
client velho** (`db.userEstablishment` indefinido), e depois disso o cache
`.next/dev` entrou em ciclo de recompilação (página recarregando a cada
poucos segundos, `js()` estourando o tempo). Saída: parar o `next dev`,
apagar `.next/dev` e subir de novo; a primeira compilação leva minutos.

Documento do cliente em `docs/area-meu-emporio/` (`.doc` binário; como ler
está no topo da spec). Entrevista com o usuário em cinco rodadas, Q1 a Q49,
registrada em [../specs/module-39-meu-emporio.md](../specs/module-39-meu-emporio.md)
(`1b2e871`, branch `spec-modulo-37-emporio`, empurrada, não mergeada).
Cortes de escopo viraram as dívidas 2.15 a 2.21. Teste na **Da Mata**, só
para o Owner, liberado por uma `TenantFeature` nova (genérica, com lista de
usuários). Sete fases (F0, F1, F2a, F2b, F3, F4, F5), aprovação entre elas.

### Dependências com falha de segurança (26/10): `npm audit` de 19 para 0

Em produção desde 26/10 (`74c9119`), três branches validadas (suíte 79/79,
CI, preview pelo usuário): next 16.4.3, react 19.2.9, zod 4.6.7; prisma 7.10.1
mais `audit fix` sem force; nodemailer 10.2.1 com `overrides`. O porquê de
cada uma está na mensagem do commit. Relatório da pesquisa, só no desktop e
fora do repo: `D:\Projetos\reports\Falhas de segurança do app Tibe.md`.

⚠️ Duas lições novas no cofre: `npm-audit-fix-force-troca-o-next-auth-por-outro-pacote`
e `o-preview-da-vercel-escreve-em-producao` (o teste de reset no preview mandou
código ao Owner da Da Mata). **No notebook, `node -v`: precisa ser 24.22.1
ou mais** (`winget upgrade --id OpenJS.NodeJS.LTS`).

### Ambiente

⚠️ **Os containers `tibe-pg` e `tibe-redis` caem sozinhos**, e o sintoma é uma
suíte que trava sem mensagem. `docker ps` antes de culpar o código; em 11/09
eles estavam parados e só os do `pleno-crm` de pé.

⚠️ **`npx prisma migrate deploy` é recusado pelo classificador de auto mode**
nesta máquina quando o alvo é o Neon, mesmo com autorização do usuário na
conversa. Em 11/09 uma segunda tentativa passou e, na outra vez, quem rodou foi
o usuário. Tente uma vez; se bloquear, dê a ele o comando e o diretório, e
confira com `migrate status` antes do push.

✅ **A validação com navegador (`browser-harness`) funciona, e desde 27/10
roda num Chrome só de testes:** `npm run navegador -- <roteiro>` (seção no
`CLAUDE.md`); o primeiro roteiro é o `emporio-f0`, 31 itens. Os seis atritos
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

**Meu Empório: TESTE DE CLIENTE pelo usuário, em produção.** As sete fases
(F0 a F5) estão no ar desde 29/10, mas foram provadas só no banco local;
ninguém usou o Empório com dado real. O usuário vai seguir
[roteiro-teste-emporio-cliente.md](roteiro-teste-emporio-cliente.md) (blocos
0 a 4: ligar só para o Owner da Da Mata, montar a loja, um dia de balcão no
celular, o dia seguinte, a produção). **Quem retomar:** receba a lista do que
ele estranhou, separe defeito (correção numa branch nova, com roteiro que
reprove antes) de "faz falta" (conversa de escopo, cruzando com as dívidas
2.15 a 2.27), e confirme com ele a decisão do balcão como página inteira.
Não ligue o recurso nem escreva dado da Da Mata pelo agente: é o usuário quem
faz, pela Plataforma e pelas telas.

Histórico das fases do Empório, abaixo.

**Meu Empório:** F0, F1, F2a e F2b em produção (recurso desligado até o
usuário ligar na Da Mata pela Plataforma). **F2b em produção desde 28/10**
(`31d02f8`, merge fast-forward autorizado; migração
`20261028120000_emporio_f2b` no Neon antes do push, autorizada; Vercel com
sucesso; transfers e production conferidas em `/docs/api`).

**F3a (venda, fiado e caixa) em andamento na `emporio-f3`** (a partir da
`main` em `31d02f8`). A F3 foi dividida em F3a e F3b (Q81). Decisões Q81 a
Q87 e o contrato da F3a na spec (`e1ab1ef`), dívida 2.24 nova (crédito na
loja). Schema e migração `20261028180000_emporio_f3a` **só no Docker**
(`5facad4`): `BankAccount`, `EmporioSale` e itens, pagamentos, devoluções e
itens, `CashMovement` (CHECK de gaveta OU conta), tipos `abertura_lacrado`,
`abertura_avulso` e `devolucao`; sem `CashDrawer` (a gaveta é a loja).
Feito em 28/10: suíte `m81` da spec (`8a0c078`), actions e 15 rotas
(`b507bcf`), devolução em dinheiro só até o que o cliente pagou e venda de
troca que não se cancela (`cfd9de8`, achados na revisão; 3 checagens
vermelhas sem a correção), `m81` pelas rotas (`4ce37ce`: 401, 404 desligado,
422 em português), cenário `_cenario-emporio-f3a.ts` (`1c6338d`), telas
`/emporio/vender`, `vendas`, `vendas/[id]`, `fiado`, `caixa` e os cartões do
início (`4220a7d`), recusa da troca em `items_devolvidos` (`e5d191a`). Provas:
`tsc` 0, `check` 0 falhas, `m81` verde com 224 checagens, `test:all` 84/84.
Roteiro `emporio-f3a` (`477e84d`, 40 itens, 0 falhas; vermelho com o
cancelamento desfazendo a abertura da saca), com o balcão em 390 px (sem
rolagem lateral, botão de fechar visível, teclado decimal). Roteiros
`f0`, `f1`, `f2a` e `f2b` verdes de novo (o `f2b` reprovou uma vez por tempo
na rodada em sequência e passou sozinho). **Em produção em 28/10, autorizado
pelo usuário:** migração `20261028180000_emporio_f3a` no Neon (URL Direct,
`migrate status` em dia) antes do push, e merge fast-forward da
`emporio-f3`. O balcão é página e não `FormSheet` (decisão de desenho a
validar com o usuário). **F3a aprovada pelo usuário em 28/10**; o teste do
balcão no celular dele fica junto com o da F3b.

**F3b (cartão, cheque, transferência entre caixas, conferência) em andamento
na `emporio-f3b`** (a partir da `emporio-f3`, que é a `main` mais a nota do
cofre `8c15bdd`). Decisões Q88 a Q95 e o contrato na spec (`f9f6656`), dívida
2.25 nova. Schema e migração `20261028220000_emporio_f3b` **só no Docker**
(`63615a9`): `CardFeeRule`, `CardReceivable` (a parcela é o a receber, e o
saldo da conta soma as parcelas de hoje para trás, por cálculo na leitura),
`EmporioCheck`, `CashTransfer`, `CashCount`. Suíte `m82` da spec
(`79679ba`, 231 checagens), actions e 11 rotas (`dee9294`), cenário
`_cenario-emporio-f3b.ts` (`87db9a3`), telas do balcão e do caixa
(`eef1dfb`), roteiro `emporio-f3b` (`e8b7492`, 0 falhas; 4 vermelhas com a
parcela caída fora do saldo da conta). Provas: `tsc` 0, `check` 0 falhas,
`m81` e `m82` verdes, `test:all` 85/85, roteiro `emporio-f3a` verde de novo.
**Em produção em 28/10, autorizado pelo usuário na conversa:** migração
`20261028220000_emporio_f3b` no Neon (URL Direct, `migrate status` em dia)
antes do push, merge fast-forward `c58c5f1..33b878b`, deploy de Production
do `33b878b` conferido pela API de deployments e as rotas novas no
`/docs/api`. **Falta:** o usuário ligar o Empório só para o Owner da Da Mata
na Plataforma e validar o balcão (F3a e F3b) no celular. **F3b aprovada pelo
usuário em 28/10.**

**F4a ("Vendeu, Pagou", despesa fixa, Resultado da Loja) em andamento na
`emporio-f4`** (a partir da `emporio-f3b`). A F4 foi dividida em F4a e F4b
(Q96). Decisões Q96 a Q102 e o contrato da F4a na spec (`7519076`), dívida
2.26 nova. Schema e migração `20261029120000_emporio_f4a` **só no Docker**
(`27fe8ee`): `VariableExpenseRule`, `SaleVariableExpense`,
`FixedExpenseTemplate`, `FixedExpenseSplit`, `FixedExpenseOccurrence`. Suíte
`m83` da spec (`1ecc63d`, 246 checagens), actions e 12 rotas (`92f0f96`),
cenário `_cenario-emporio-f4a.ts` (`263b819`, resultado previsto -750 e ponto
de R$ 2.222,22, conferido pela action), telas `/emporio/resultado` e
`/emporio/despesas` (`cc25280`), roteiro `emporio-f4a` (`94da23d`, 0 falhas;
3 vermelhas com as perdas fora do resultado). Provas: `tsc` 0, `check` 0
falhas, `m81`, `m82` e `m83` verdes, `test:all` 86/86, roteiros `f3a` e
`f3b` verdes de novo. **Em produção em 29/10, autorizado pelo usuário na
conversa:** migração `20261029120000_emporio_f4a` no Neon (URL Direct,
`migrate status` em dia) antes do push, merge fast-forward
`33b878b..3db1e63`, deploy de Production do `3db1e63` conferido pela API de
deployments e as rotas novas no `/docs/api`.

**F4b (visão somada, produtos, margem negativa, filtro de área do
Financeiro) em andamento na `emporio-f4b`** (a partir da `emporio-f4`;
começo aprovado pelo usuário em 29/10). Decisões Q103 a Q107 e o contrato na
spec (`060c556`), dívida 2.27 nova. **Sem schema novo** (sem migração no
Neon). Suíte `m84` da spec (`67ad3b1`, 155 checagens; 4 vermelhas com a
diferença da transferência contada também no destino), actions e rotas,
inclusive `area` no Financeiro e no PDF (`2771727`), cenário
`_cenario-emporio-f4b.ts` (`f6428a9`), telas (`9aa6eeb`), roteiro
`emporio-f4b` (`f52d51f`, 0 falhas; vermelho com a área Empório sem filtro).
Provas: `tsc` 0, `check` 0 falhas, `m83` e `m84` verdes, as suítes do
Financeiro verdes, `test:all` 87/87, roteiro `f4a` verde de novo. **Em
produção em 29/10, autorizado pelo usuário na conversa:** merge fast-forward
`3db1e63..9d95bc9` (sem migração), deploy de Production do `9d95bc9`
conferido pela API de deployments e as rotas novas no `/docs/api`.

**F5 (Meu Dia, Lista, Calculadora, primeiros passos) em andamento na
`emporio-f5`** (a partir da `main`; começo aprovado pelo usuário em 29/10).
Decisões Q108 a Q117 (todas A) e o contrato na spec (`fafbe6f`). **Sem schema
novo.** Achado que pautou a fase: os lançamentos do Empório caíam no Meu Dia
(tela, Painel, WhatsApp) e nos alertas de qualquer usuário, e no "Tudo" do
Financeiro de quem está fora da lista. Suíte `m85` da spec (`791d058`),
actions e rotas (`658aab4`), cenário `_cenario-emporio-f5.ts` (`fcb4374`),
telas (`96f032c`), roteiro `emporio-f5` (`8b26b17`, 33 itens, 0 falhas; 2
vermelhos com `veEmporio` sempre verdadeiro). Provas: `tsc` 0, `check` 0
falhas, `test:all` 88/88. **Em produção em 29/10, autorizado pelo usuário
na conversa:** merge fast-forward `9d95bc9..047065e` (sem migração), deploy
de Production do `047065e` conferido pela API de deployments e as rotas
`first-steps` e `composition/from-recipe` no `/docs/api`. **Com a F5, as
sete fases do Módulo 39 estão em produção.** Falta o usuário ligar o Empório
para o Owner da Da Mata na Plataforma e validar no celular.

⚠️ **O desktop tem DOIS clones** (`C:\Projetos\tibe-agrogestão` e
`D:\Projetos\tibe-agrogestão`). Em 29/10 o `next dev` do `D:` ocupava a 3000
e devolvia 500, e o classificador recusou derrubá-lo. Saída sem matar nada:
o Next deste clone sobe na 3001 e o roteiro segue com
`TIBE_BASE="http://localhost:3001" npm run navegador -- <roteiro>`. Também:
o `innerText` devolve texto com o `uppercase` do CSS aplicado, e a
calculadora só mostra resultado depois de clicar em Calcular.

Histórico da F2a: decisões Q60 a Q71 e o contrato na spec (`f1b5d17`). Estoque
(`1ecaf19`), compras e Lista com loja (`576c842`), telas (`3d61ef7`),
produtos do Empório no comprei da Lista com loja (`85f1977`). Provas: `tsc`
0, `check` 0 falhas, `test:all` 81/82 com a `m73` corrigida depois
(`75ba8e2`, contrato), `test:m79` com 162 checagens (6 vermelhas com o
cancelado contado e o frete por igual), roteiro `emporio-f2a` com 32 itens
(vermelho com a média trocada pelo último custo), `emporio-f0` e
`emporio-f1` verdes. Papéis da F2a decididos pelo padrão da Q55 (compra,
contagem, perda e estoque inicial com OPERADOR; cancelar e limites com OWNER
e ADMIN), registrados na spec. Histórico da F2b (transferência e
composição): decisões Q72 a Q80 e o contrato na spec (`2e80991`),
dívida 2.23 nova, schema e migração `20261028120000_emporio_f2b` só no
Docker (`bec3487`). Transferências com Meu Dia e em trânsito na reposição
(`df37456`), composição e produção (`be15a19`), suíte `m80` com 149
checagens (5 vermelhas sem a exigência do motivo, 2 sem o rendimento;
`b890a82`), telas (`3c719d6`), cenário `_cenario-emporio-f2b.ts`
(`9e4eed3`), roteiro `emporio-f2b` com 29 itens (`4b37012`, vermelho com o
custo da entrada trocado). Validação: `test:all` 83/83, os quatro roteiros
do Empório verdes, `check` 0 falhas. ⚠️ O Claude Code corta o `next dev` em
segundo plano quando a memória aperta com a sessão parada (27 e 28/10):
liberar memória antes da validação viva, ou iniciar o Claude Code com
`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`. Acompanhar o `test:all` em
primeiro plano evita o corte. A rotação de segurança
(item 1) foi adiada pelo usuário em 27/10 para tratar do Empório.

**0. Programa de dívidas ENCERRADO: E0 a E11 em produção** (E11, `ccf1474`).
E10 (2.3): filtros do §19, pasto, forma de pagamento e peso/arroba (`31027e1`,
migração no Neon pelo usuário antes do push). **14/10: `.env` é o Neon e
`.env.local` o Docker**; suítes e seeds leem `scripts/_env-local.ts`, o Prisma
CLI só o `.env` (tabela no `CLAUDE.md`). O que sobrou para o usuário está no
item 12 de [pendencias-do-usuario.md](pendencias-do-usuario.md). Depois, em
produção: 2.8 (`229b957`), 5.12 (`dcbbd73`, `m75`), 3.3 (`78829e1`:
o agente segue a régua do painel; `m76`). 4.1 servidor em produção
(`cdd6473`: sete domínios no pacote, seção por domínio na `m73`). **n8n, 14/10:
`Execute Action` manda `provider_message_id`** (1ª chave vista em produção).
`npm run wa` lê só o `.env`, mas o `REDIS_URL` dele é local: não vê resposta. 5.13/5.15/5.10 paradas. 5.0a em produção (`2ff9a3b`). **5.9 em produção
(`divida-5-9-ja-recebeu`, só no canário)**: leilão e permuta perguntam se o dinheiro entrou
(`m48`, `m49`; avaliação em `avaliacao-fase-8.md`), Codex aprovou. 16/10, canário: "3 novilhas" na permuta dizia "é máquina ou produto"; agora pergunta a faixa, e a faixa sobrevive à pergunta do vencimento (`m49` bloco 18; validado no aparelho em 19/10, com a 5.9). 2.3 fechada
por decisão; 2.4 espera a conversa com a Agromax ([roteiro](roteiro-agromax-rebanho-por-categoria.md)). E3-E9: [historico/2026-10.md](historico/2026-10.md). **Próximo no aparelho (26/10): o [roteiro do estoque](roteiro-aparelho-estoque.md), blocos 0 a 5; a Da Mata não tem produto (lido em produção), então começa pelo bloco 0 no painel.**

**1. Segurança, que é do usuário e vem antes de tudo:** rotacionar as 22
variáveis, fechar o repositório e pedir a coleta ao Suporte do GitHub. Não
avançou, e cada commit que sobe é leitura pública. **27/10: o usuário decidiu
começar agora**, logo depois das dependências. É o próximo trabalho da
sessão: guiar a rotação variável por variável (o agente nunca lê nem imprime
o valor; quem troca no painel de cada serviço e na Vercel é o usuário), e só
então apagar `D:\tmp\tibe-backup-pre-rewrite.git`.

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
  No desktop (clone novo em `D:\Projetos\tibe-agrogestão`, 26/10) existia um
  `tibe-redis-local` na `6390` que o `.env.local` não usa: foi parado e o
  `tibe-redis` criado. O `.env` e o `.env.local` desse clone vieram da pasta
  do usuário no OneDrive (`tibe-docs`), e o banco local recebeu as 12
  migrações que faltavam.
- `npm run test:all` repetido no mesmo dia reprova a `m19` pelo lock do Redis;
  `docker exec tibe-redis redis-cli FLUSHALL` (Redis LOCAL) e ela passa.
