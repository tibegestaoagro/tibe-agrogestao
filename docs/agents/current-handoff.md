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

### As duas provas que faltavam da 35.1 foram feitas, e acharam um defeito

Rodada de 11/09, na branch `formato-do-dinheiro`, ainda **não empurrada**.

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

### O Módulo 36 (Lista de Compra) está EM PRODUÇÃO

Merge e push em 11/09 (`bd579e2..89cd10c`, 14 commits), com a migração
`20260911100000_lista_de_compra` aplicada no Neon antes do push. A branch
`lista-de-compra` foi apagada. As **onze tarefas da spec** estão feitas, suíte
**63/63** (a `m63` entrou), `tsc`, `lint` e `check` limpos. Spec em
[../superpowers/specs/2026-09-11-modulo-36-lista-de-compra.md](../superpowers/specs/2026-09-11-modulo-36-lista-de-compra.md).

O que o módulo faz: o produtor anota o que precisa comprar, pelo painel ou pelo
WhatsApp, e **anotar não é comprar** (§3): nada mexe em estoque nem em
financeiro até ele confirmar a compra, e aí quem registra é Negociações.

**Decisões que não devem ser redecididas:**

- **Não existe entidade "lista"**: a lista é a consulta dos pendentes.
- **Item sem produto não vira compra sozinho.** A negociação exige um `Product`
  porque é ele que tem saldo e unidade; "comprar arame" é anotação legítima e
  vira compra quando o produtor disser qual produto é. Vale no painel e no
  WhatsApp.
- **Concluir o item entra na MESMA transação da compra**, por um gancho
  opcional em `createProductNegotiation`. Fora dela existiria a janela em que a
  compra já entrou e o item continua na lista, e o produtor compra de novo.
- **A duplicata AVISA, nunca recusa de verdade** (§19.7), e a comparação é
  larga de propósito.
- **As categorias são as de PRODUTO**, agora 25: as 15 do Estoque mais as 10 do
  §6. O provisionamento acrescenta o que falta e **nunca ressuscita arquivada**.
- ⚠️ **O classificador do n8n NÃO emite as quatro intenções da lista**, como as
  do evento e da permuta desde o Módulo 31.
- ⚠️ **Unidade de produto fora do vocabulário não pode barrar o item.** Achado
  ao vivo: um produto com `kg` em vez de `quilograma` fazia o botão do alerta
  recusar calado.

### A fase 35.1 do Financeiro está EM PRODUÇÃO

Merge e push em 11/09 (`310d707..799096c`, 23 commits), com as **três migrações
aplicadas no Neon antes do push** e o deploy confirmado pelas duas rotas de
pagamento aparecendo no `/docs/api` público. A branch `financeiro-fase-1` foi
apagada. Suíte **65/65**, `tsc`, `lint` e `check` limpos.

Pagamento parcial como soma, os vínculos de fazenda e contato, forma de
pagamento, as 26 categorias do §21, a tela do §30 e do §32, a suíte `m62`, e as
dívidas 2.10 e 3.3 fechadas. Relato por tarefa em `historico/2026-09.md`.

✅ **As duas provas que faltavam foram feitas em 11/09**, e estão relatadas na
seção do topo. O roteiro é
[roteiro-tela-financeiro-35.md](roteiro-tela-financeiro-35.md).

### O que a fase 35.1 decidiu no código, e não deve ser redecidido

- **Valor pago é a SOMA dos `FinancialPayment`**, nunca um campo. "Parcialmente
  paga" nasce derivada em `situacaoDe`. O `status` continua gravado porque é
  máquina de estados, não saldo.
- **Comparação em CENTAVOS**, nunca em float.
- **`markEntryPaidAction` é pagamento do SALDO restante**, e o contrato da rota
  `/pay` continua igual de propósito.
- **`cancelEntryAction` recusa conta que já tem pagamento** (`ENTRY_HAS_PAYMENTS`),
  e **desfazer pagamento APAGA a linha**, em vez de marcar cancelado.
- ⚠️ **`createLinkedEntry` cria o pagamento junto quando nasce `paid`.** Sem
  isso, toda venda e compra nova teria `status: paid` e pago ZERO.
- **Conta pendente PARCIALMENTE paga não é apagada** no cancelamento de
  movimentação, estadia e serviço: vai para o ramo de estorno.
- **A lista de categorias vem do BANCO**, no painel e no WhatsApp.
  `category-suggestions.ts` é só o palpite por palavra-chave, descartado quando
  o nome não existe no tenant. O provisionamento roda em TODA listagem e
  acrescenta o que falta; desativar as antigas sem uso foi MIGRAÇÃO, não
  provisionamento.
- ⚠️ **O fluxo de caixa soma os `FinancialPayment`, não os lançamentos pagos.**
  Não volte a filtrar por `status: "paid"` ali.
- **A tela do Financeiro filtra pela propriedade ATIVA do seletor do topo.**
  Lançamento sem fazenda some com o filtro ligado, porque `property_id` não teve
  backfill: a tela conta quantos ficaram de fora. Isso é a dívida 2.11.

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

**2. A Calculadora (Módulo 37)**, terceira das quatro áreas, seguida do Meu Dia
(38). O `ShoppingPurpose` já nasceu compartilhado com a Calculadora, como a
decisão 32 pede. A spec ainda não foi escrita, e o documento do cliente está em
`docs/modulo-calculadora/`.

**3. A branch `formato-do-dinheiro` está pronta e não foi empurrada.** Ela não
tem migração, só texto de resposta, então o push não depende do Neon. Falta a
autorização do usuário para merge e push.

⚠️ **O backfill de `property_id` está autorizado** e é a dívida 2.11. Migração
por origem, fora da 35.1.

Depois da Lista de Compra: **Calculadora** (Módulo 37) e **Meu Dia** (38), nessa
ordem. O Meu Dia é por último porque é camada de leitura e consome os outros.

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
