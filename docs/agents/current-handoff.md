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

- Atualizado em: 2026-09-11.

### O Módulo 37 (Calculadora) está PRONTO, na branch `calculadora`

Treze tarefas, sete commits, **ainda não empurrado**. Sem model novo e sem
migração: calculadora continua função pura, e salvar cálculo segue fora
(decisão 6). Suíte **64/64** (a `m64` entrou), `tsc`, `lint` e `check` limpos.
Spec em
[../superpowers/specs/2026-09-11-modulo-37-calculadora.md](../superpowers/specs/2026-09-11-modulo-37-calculadora.md).

⚠️ **A auditoria do delta, prometida na decisão 1 de 10/09, nunca tinha sido
feita.** O plano previa "sete calculadoras novas" e tratava as 12 no ar como
prontas. Não estavam: faltava a de SEMENTES inteira (§8), a de mão de obra
responde "quantos funcionários" e o §29 pergunta "quanto custa", e sete
ferramentas não calculavam custo nem sacas. São 22 ferramentas agora.

**As três decisões do usuário em 11/09:** o delta entra junto com as sete
novas; a ponte com a Lista de Compra e a comparação com estoque (§37, §39)
entram nesta fase; e os handlers do WhatsApp ficam prontos com o classificador
congelado.

**Decisões que não devem ser redecididas:**

- **A função de cálculo continua pura e sem saber que a Lista existe.** Quem
  traduz resultado em material é a TELA, que já traduzia resultado em linha.
- **O saldo só é lido quando o produtor ABRE o painel.** É a quebra mínima da
  premissa de que a calculadora não fala com a rede.
- **Material casa com produto por ESCOLHA, nunca por nome parecido.** "Arame
  liso 500m" e "arame" são a mesma coisa para uma pessoa e dois produtos para o
  estoque.
- **Saca arredonda para CIMA, com a sobra dita junto**, em `emSacasECusto`
  (`src/lib/calculadoras/shared.ts`). Ninguém compra 4,8 sacas.
- **Custo só sai quando TODO ingrediente tem preço.** Com um faltando, o total
  sairia menor que o real e passaria por completo.
- **O alqueire nunca tem default:** paulista 24.200 m², mineiro 48.400.
- ⚠️ **O classificador do n8n NÃO emite as quatro intenções da calculadora**,
  como as da Lista, do evento e da permuta.

⚠️ **O defeito de unidade do Módulo 36 voltou, na ponte nova**: produto gravado
com `kg` em vez de `quilograma` fazia a criação do item ser recusada. É a
segunda vez que ele aparece; a guarda é `isStockUnit` antes de mandar a unidade.

### As duas provas que faltavam da 35.1 foram feitas, e acharam um defeito

Rodada de 11/09. Merge e push em `0df64d8..9c971a2`, dois commits, sem
migração. A branch `formato-do-dinheiro` foi apagada. Suíte **63/63**, `tsc`,
`lint` e `check` limpos.

**Deploy confirmado contra o agente de produção**, e não por `/docs/api`: numa
frente que não cria rota, a impressão digital é a própria frase. "anota uma
despesa de 60 mil reais com diesel do trator" respondia "R$ 60000.00" antes do
push e responde **"R$ 60.000,00"** depois. Levou cerca de dois minutos.

**Roteiro de tela, dez passos, todos passam** (navegador real, `next dev` contra
o Docker local, cenário de `scripts/_cenario-financeiro-35.ts`). O painel de
recebimento pré-preenche o saldo, a recusa de valor maior aparece embaixo do
campo com o foco nele, o registro parcial e o desfazer atualizam o saldo sem
fechar, o seletor do topo filtra tabela, cartões e gráfico juntos, e avisa que
274 lançamentos sem fazenda ficaram de fora. Em 400px a tabela rola no
container sem estourar a página.

**Banco de provas contra o agente de produção:** a categoria vem do banco
("anota uma despesa de 500 reais com diesel do trator" cai em "Combustíveis"),
o pasto ambíguo pergunta em vez de escolher, e **a recusa não grava nada**
(conferido no banco: zero lançamentos criados depois de "não, deixa pra lá").

⚠️ **"comprei 500 reais de diesel" NÃO é despesa para o classificador**: cai em
compra de estoque, e ele responde que não achou o produto. Quem quiser provar o
financeiro precisa dizer "anota uma despesa".

**O defeito que só a prova ao vivo acharia:** o agente respondia
**"R$ 500.00"**, ponto decimal e sem separador de milhar. Estavam assim 25
pontos (handlers, alertas, resumo diário, as duas calculadoras), e cinco
handlers já tinham a função certa copiada, cada um com o seu `reais()` privado.
Agora é `reaisBr()`, em `src/lib/numero-br.ts`, junto do `lerNumeroBr` que faz
o caminho de ida. A **conferência 16** do `npm run check` impede a volta, e foi
vista falhar. A `m43` fixa o formato, e as asserções da `m12` e da `m17`
passaram a compor o valor com o helper, porque o espaço depois do "R$" é NBSP
e literal digitado nunca casa. Lição no cofre:
[o valor certo escrito em outro idioma](../conhecimento/o-valor-certo-escrito-em-outro-idioma.md).

**Para provar cenário de pasto**, o tenant de provas ganhou "Pasto da Sede" e
"Pasto da Sede Nova". Nome dito por inteiro vence a lista; só o termo parcial
("sede") dispara a pergunta.

O **Módulo 36** e a **fase 35.1**, os dois em produção desde 11/09, saíram
deste arquivo quando ele passou de 200 linhas outra vez. O texto inteiro, com
as decisões que não devem ser redecididas, está em
[historico/2026-09.md](historico/2026-09.md).

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
e foi assim que o Módulo 36 foi validado. Três atritos conhecidos: a primeira
conexão exige `new_tab(url)` explícito (e o Chrome pode pedir permissão ao
usuário); clique por coordenada não dispara o botão no rodapé do `FormSheet`
(use `b.click()` por `js`); e os ids da árvore de acessibilidade mudam a cada
render, então resolva tudo na mesma chamada.

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

**2. Merge e push do Módulo 37**, que está pronto e validado na branch
`calculadora`. Sem migração, então o push não depende do Neon. Falta a
autorização do usuário.

**3. O Meu Dia (Módulo 38)**, última das quatro áreas, e a que fica por último
porque é camada de leitura e consome as outras três.

⚠️ **O backfill de `property_id` está autorizado** e é a dívida 2.11. Migração
por origem, fora da 35.1.

**Continuam esperando, para depois das quatro áreas:** a outra metade da
`dividas.md` §2.8 (a despesa avulsa e os sete destinos de saída), e três
decisões de produto do Leite (média diária por dias corridos; cabeçalho de uma
fazenda com armazenamento de todas; fechamento sem data nascendo "Vencida").

Não avance para outro módulo sem aprovação explícita.

### ⚠️ Para quem retomar em OUTRA MÁQUINA

- **`.claude/settings.local.json` não vai para o git** (`.gitignore` linha 58).
  O bloco `autoMode.allow` que destrava `npm run db:deploy` foi escrito no
  desktop em 01/09 e **não existe no notebook**. Lá, migração em produção volta
  a ser recusada pelo classificador, e o caminho é pedir ao usuário.
- **O Redis local desta máquina é `tibe-redis-local` na porta `6390`**, não a
  `56379` que o `CLAUDE.md` documenta. Confira com `docker ps` antes de copiar
  o comando de lá.
