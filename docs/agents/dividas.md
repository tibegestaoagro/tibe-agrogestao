# Dívidas abertas do Tibé

Levantamento de 2026-08-18, feito com evidência no repositório, não de memória.
Existe para uma sessão nova conseguir escolher o próximo trabalho sem reler o
histórico inteiro.

**Como usar:** cada item tem o que é, a evidência (arquivo e linha, ou comando),
e o que custaria fechar. Nenhum item aqui está em andamento. O que está em
andamento vive no [current-handoff.md](current-handoff.md).

**Regra de manutenção:** ao fechar um item, apague-o daqui e registre no commit.
Lista de dívida que só cresce vira lista que ninguém lê.

⚠️ **A numeração tem buracos, e isso é de propósito.** O item apagado não é
renumerado: o handoff, as specs de `docs/superpowers/` e o comentário da
conferência 8 em `scripts/check-repo.ts` citam a dívida pelo número (`§2.5`,
`§2.8`, `§2.9`), e renumerar transformaria cada citação numa referência para o
item errado. Item novo entra com o próximo número livre da seção.

---

## 1. Validação que nunca aconteceu

### 1.1 Estoque no aparelho (Módulo 31, missão 2)

Está em produção desde 2026-08-18, com o classificador do n8n já ensinado, mas
**nunca foi usado num celular de verdade**.

O roteiro está pronto em [roteiro-aparelho-estoque.md](roteiro-aparelho-estoque.md),
6 blocos. Os blocos 1 e 3 já passaram contra produção pelo banco de provas
(`npm run wa`); faltam os blocos 2, 4 e 5, mais o que o banco de provas não
cobre por desenho: entrega no aparelho, áudio e foto de recibo.

**Por que importa mais do que parece:** o bloco 1 FALHOU nesse teste em
2026-08-18, gravando uma compra recusada de R$ 1.200. Cinco rodadas de juiz com
a suíte verde não tinham pego.

**Custo:** uma sessão de celular, mais o cadastro dos três produtos do bloco 0.

### 1.2 App mobile: 5 defeitos corrigidos, sem reteste

A branch `app-mobile-fundacao` tem **3 commits que a `main` não tem**, parada
desde 2026-08-05. Ela leva 21 arquivos `.tsx` contra os 9 que estão na `main`:
as abas Meu Dia e Tibé, Máquinas, a fila de escrita offline e a biometria.

Os 5 defeitos achados com modo avião num Android real foram corrigidos **e
nunca retestados**. Enquanto isso, a `main` recebeu Módulos 30 e 31 inteiros,
então a branch está 6 semanas atrás do back-end que ela consome.

**Custo:** rebase ou merge com resolução de conflito, mais uma passada de
aparelho. É a dívida que mais cresce sozinha.

### 1.3 Asaas nunca foi testado contra o sandbox real

O código de cobrança está em produção, mas a integração nunca rodou contra o
Asaas de verdade, nem em sandbox. Hoje isso significa que o caminho de
assinatura paga é o único do sistema sem nenhuma prova de integração.

**Custo:** chave de sandbox, mais uma rodada de teste do ciclo (criar
assinatura, webhook de pagamento, webhook de atraso).

---

## 2. Escopo desenhado e adiado

### 2.3 Itens do documento do cliente registrados como adiados

`docs/specs/module-31-negociacoes.md` seção 7, decididos na revisão de
2026-08-13 para não ficarem "nem feitos nem adiados":

| item | situação |
|---|---|
| §19, os nove filtros da tela de Negociações | a action já aceita filtro; a tela só herda o seletor de propriedade |
| §13, formas de pagamento (dinheiro, pix, boleto) | não implementado; o parcelamento, que é o que mexe no financeiro, existe |
| §6.2 e §7.2, pasto de origem e destino | o WhatsApp lê, a tela web não oferece |
| §6.2, peso, arroba e valor por cabeça | adiado desde a revisão de 2026-08-14 |
| §12.4, os valores estimados da permuta | fora da v1; o valor da negociação é só a diferença em dinheiro |
| histórico do aceite 23 | não implementado |

O raciocínio registrado para os filtros continua válido: **filtro sem volume de
dado é enfeite**, e o primeiro cliente com 200 negócios é quem define quais
importam.

### 2.4 Rebanho por categoria x por brinco

O maior desalinhamento aberto com o cliente Agromax: foi pedido rebanho **por
categoria**, e o que existe é por brinco com categoria em cima. Não é dívida de
código, é de produto, e precisa de conversa antes de virar tarefa.

### 2.5 Site público, auth e plataforma sem token semântico

A frente 5 cobriu o **painel do tenant**, e ele está quase inteiro. Ficaram
fora, por decisão do usuário em 2026-08-28, os arquivos que restam na linha de
base (`scripts/baseline-cor-crua.json`):

⚠️ **Corrigido em 2026-08-31: este item afirmava que o painel estava INTEIRO, e
era falso.** A frase dizia "nenhum arquivo de `src/app/(dashboard)/` usa mais a
paleta crua". O piloto do time de agentes descobriu por quê: a regex da
conferência 8 cobria só `(text|bg|border)-`, e **quatro arquivos do painel
pintam `divide-gray` cru**, invisíveis ao portão. A regex foi estendida e os
quatro entraram na catraca. São dívida nova, pequena:
`alert-preference-toggles.tsx`, `configuracoes/assinatura/page.tsx`,
`dashboard/page.tsx` e `relatorios/page.tsx`.

A conta abaixo é a de **2026-08-28**, quando a base tinha 52. Hoje ela tem
**34**: saíram os 22 do site público, convertidos em 31/08, e entraram os 4 do
painel.

⚠️ **A catraca cresceu, contra o princípio de que ela só encolhe, e a exceção
foi autorizada pelo usuário em 2026-08-31.** Fica registrado aqui porque
autorização que não se acha depois não vale: os 4 arquivos são dívida
pré-existente que a regex antiga não enxergava, não regressão nova, e a
alternativa (consertá-los na mesma rodada) foi recusada para não misturar
frentes.

| o que | quantos |
|---|---|
| site público (`src/app/(public)/`) | 18 |
| auth, onboarding, escolher plano e afins | 14 |
| componentes do painel da plataforma (`src/components/platform/`) | 15 |
| componentes do site público (`src/components/public/`) | 4 |
| `src/components/signup/verify-code-form.tsx` | 1 |

⚠️ O plano previa que a linha de base fecharia em **32**, contando os
componentes de plataforma e de site público junto com o painel. Não é trabalho
esquecido: eles pertencem a estas duas frentes, não à do painel. As páginas de
`src/app/plataforma/` nem aparecem na conta, porque a catraca as exclui por
desenho (casca escura, onde o cinza claro é a escolha certa).

São outro contexto visual, com outro público, e validar marketing e curral no
mesmo dia dilui a atenção. A tela de login soma-se a isso por não ser validável
por este agente sem digitar senha.

**Custo:** uma rodada própria. O ganho é o modo escuro passar a ser possível no
app inteiro, e não só no painel.

⚠️ **Armadilha herdada, achada na varredura de 2026-08-31:** o alias depreciado
`tibe.light` aponta para `--superficie-afundada`, que é **exatamente o fundo do
painel**. Toda pílula ou cartão que ainda usa `bg-tibe-light` sobre a página
fica invisível: sobra o texto solto. Um caso foi corrigido (as pílulas de
"Perfis ativos" em Configurações); os que restam estão em hover de tabela, foco
de select e menus, onde o efeito é só um realce fraco, e no site público e
auth, que esta frente não cobriu.

### 2.6 `text-tibe-dark`: um token de SUPERFÍCIE pintando TEXTO, 41 vezes

**O que é:** `tibe.dark` é `var(--superficie-invertida)`
(`tailwind.config.ts`), cujo papel é "superfície inversa da página": é o verde
escuro da sidebar. Ele é usado como **cor de texto** (`text-tibe-dark`) em **41
lugares** do site público, nos títulos de `/`, `/planos`, `/faq`, `/docs` e das
três etapas de `/criar-conta`.

**Evidência:** achado pelo segundo julgamento independente da frente do token
semântico, em 2026-08-31.

**Por que importa, e é a dívida mais séria desta lista:** no dia do tema
escuro, o valor de `--superficie-invertida` será decidido pelo que a **sidebar
precisa ser**. Se ele continuar `#022e20` (verde escuro de marca, a escolha
natural para manter a sidebar), **todos os títulos do site público ficam verde
escuro sobre página escura**.

⚠️ **Isto mina a justificativa da frente que a descobriu.** A spec do site
público em token semântico se justifica dizendo que "depois que tudo fala
token, o tema escuro é um bloco que redefine os 37 de uma vez". Com 41 títulos
presos ao token da sidebar, não é.

**Custo de fechar:** decidir qual token os títulos devem usar (`--texto`? um
`--texto-marca` novo?) e trocar 41 ocorrências. É decisão de design, e deve
ser a **primeira tarefa da frente de tokens escuros**, não um remendo.

Sobram também `border-tibe-primary` (5) e `ring-tibe-primary` (1), do mesmo
bloco de alias.

### 2.7 Selos de método e chips de código no limiar do invisível

**O que é:** em `/docs/api`, os cinco selos de método HTTP e os cerca de 107
chips `<code>` de `/docs` têm fundo entre **1,037:1 e 1,100:1** contra o branco
da página. Medições do segundo julgamento independente, por WCAG 2.1:

| elemento | antes da frente | depois |
|---|---|---|
| selo PATCH | 1,114:1 | **1,037:1** |
| selo DELETE | 1,222:1 | 1,094:1 |
| selo GET | 1,220:1 | 1,088:1 |
| selo PUT | 1,180:1 | 1,100:1 |
| chip `<code>` | 1,101:1 | 1,056:1 |

**Por que importa:** a frente do token semântico deixou esses elementos mais
marginais do que já eram. E há inconsistência do nosso próprio critério: dois
chips que estavam em **1,000:1** (contraste zero, invisíveis) ganharam borda
para voltar a aparecer, e os cinco selos ficaram nesta faixa **sem borda**.

⚠️ **Nenhum portão mede isto**, e o `check-contraste.ts` nunca vai medir: ele
compara par (texto, fundo), e aqui o que está em jogo é fundo contra fundo. A
conferência 14 pega o caso extremo (fundo idêntico ao do pai), não o limiar.

**Custo de fechar:** decidir se pílula e chip precisam de contorno próprio por
padrão no sistema de design. É decisão de design, e **só o navegador resolve**:
1,056:1 é cálculo, não observação, e o quanto some depende de monitor e
ambiente.

✅ **Metade resolvida por observação, em 2026-08-31.** O usuário abriu
`/docs/api` em produção e confirmou que **os cinco selos se distinguem** entre
si, com o `PUT` verde de pé. A medição dizia 1,037:1 no PATCH e sugeria risco;
o olho disse que não há. **A medição estava certa e a conclusão que se tirava
dela, errada**, que é exatamente por que este projeto não fecha frente sem
abrir a tela.

**Continua aberto:** os cerca de 107 chips `<code>` inline de
`/docs/arquitetura`, `/docs/schema` e `/docs/api`, a 1,056:1. Não foram objeto
de pergunta específica na validação, e a resposta dos selos não se transfere
automaticamente: selo tem texto colorido e forma de pílula larga, chip é
estreito e monoespaçado.

---

### 2.8 Confinamento: dois pedidos do cliente que a spec calou

Achados pelo juiz em 2026-08-31, no rejulgamento da frente. Não são defeito de
implementação: são **escopo do documento do cliente que a spec estreitou sem
dizer**, e por isso a tabela "o que falta" dela não os menciona.

**§29, "registrar custos básicos": METADE resolvida em 02/09.**

✅ **O que passou a funcionar:** um serviço contratado amarrado ao lote (o
tratorista do trato, a limpeza, a manutenção) chega ao "Custo acumulado". A
fase 33.2 acrescentou `ServiceJob.confinement_stay_id`, e
`getConfinementLotSummary` passou a somar por JUNÇÃO, porque `related_id`
aponta para uma coisa só e o §22 do Módulo 33 exige que o serviço saiba quanto
dele já foi pago. Está provado nos dois sentidos pelo bloco 11 da `m58`.

⚠️ **O que continua faltando, e é o caso mais comum:** a despesa avulsa. O
produtor compra R$ 3.000 de ração e lança em `/financeiro`; o
`createManualEntryAction` grava `related_module: "geral"` **sem `related_id`**,
e aquele dinheiro continua não chegando ao lote. O §13/§14 lista nove tipos de
custo, e só os que passam por um `ServiceJob` chegam hoje.

**Custo de fechar o resto:** o lançamento manual precisa poder apontar para um
lote, o que significa um campo a mais no formulário de `/financeiro` e a
decisão de produto que a nota original já pedia (como o produtor amarra uma
despesa a um lote sem transformar o lançamento rápido num formulário longo).

**§17 pede sete destinos de saída, e a tela oferece três.** `stay-rules.ts` tem
`encerramentos: ["retorno_estadia", "venda", "morte"]` para `confinamento`. O
documento pede também transferência para outra fazenda, leilão ou feira,
frigorífico e outro confinamento. Tirar 20 cabeças e mandar para a Fazenda B
não tem como ser registrado: "Voltaram para o pasto" grava a posição na fazenda
**de origem**, porque `closeStay` monta o destino com o `property_id` da
abertura.

⚠️ **Os dois ainda exigem decisão de produto antes de virar tarefa** (como o
produtor amarra uma despesa AVULSA ao lote; quais dos sete destinos viram
movimento novo no livro-razão). Decisão do usuário em 31/08: entram numa onda
própria, com as perguntas trazidas junto da spec.

### 2.11 O histórico financeiro não tem fazenda, e some do filtro por fazenda

**O que é:** `FinancialEntry.property_id` nasceu na fase 35.1 (10/09/2026) e
**não teve backfill**, por decisão da spec: preencher o que já existia exigiria
adivinhar pela `related_id` de sete módulos diferentes. As origens que sabem a
fazenda passaram a preencher; tudo o que é anterior está nulo.

**Evidência:** a tela `/financeiro` filtra pela propriedade ativa desde a T07.
Com uma fazenda escolhida, todo lançamento anterior a 10/09 desaparece da
tabela, dos cards e do gráfico. A tela conta quantos ficaram de fora e diz para
escolher "todas as fazendas", então nada some em silêncio, mas o produtor com
duas fazendas não consegue ver o passado de uma delas.

**Por que importa:** o §32 do documento do cliente pede o Financeiro por
fazenda, e o §33 pede a visão consolidada. Hoje só a consolidada mostra o
histórico completo. Quanto mais tempo passa, menor a dívida fica sozinha: cada
lançamento novo já nasce com a fazenda.

**Custo de fechar:** o usuário autorizou o backfill em 10/09/2026, e ele é uma
migração de dados por origem, não uma só. O caminho que parece certo: para cada
`related_module`, seguir a `related_id` até o registro de origem e ler a
propriedade dele (movimentação de rebanho, estadia, ordem de serviço, máquina,
talhão). Onde a origem não souber, deixar nulo em vez de chutar.

⚠️ **Provar o predicado antes de aplicar**, como foi feito no backfill de
pagamento da T02: plantar no banco de dev um caso por origem, rodar, e conferir
que nenhum lançamento recebeu a fazenda errada. Adivinhação em dinheiro de
cliente é a pior classe de migração, e é exatamente por isso que este backfill
foi adiado uma vez.

### 2.12 O `/dashboard` e o resumo do WhatsApp contam o rebanho por campo gravado

**O que é:** `countActiveAnimals` (`src/lib/actions/animals.ts`) soma
`AnimalBatch.quantity`, que é campo. O invariante 2 diz que o saldo do rebanho
nunca é gravado, e desde o Módulo 30 a fonte é o livro-razão
(`getPositions` + `summarizePositions`). O `/dashboard` e o `resumo` do WhatsApp
ainda usam o campo.

**Evidência:** achado no Módulo 38 (14/09/2026), ao montar o "Sua fazenda" do
Meu Dia. O Meu Dia usa o livro-razão; o `/dashboard` na mesma sessão pode
mostrar outro número para o mesmo rebanho.

**Custo de fechar:** trocar as duas chamadas e conferir contra a tela do
Rebanho. Pequeno, mas mexe no número mais visto do painel, então precisa de
validação na tela e não só de `tsc`.

### 2.13 A saudação do `/dashboard` usa a hora do servidor

**O que é:** `greeting()` em `src/app/(dashboard)/dashboard/page.tsx` usa
`new Date().getHours()`, que na Vercel é UTC. Às 9h na fazenda o servidor marca
meio-dia, e o produtor lê "Boa tarde" antes do café.

**Custo de fechar:** trocar por `saudacaoEmSaoPaulo`, de `dia-calendario.ts`,
que o Meu Dia já usa. Uma linha.

### 2.14 Recorrência mensal nos dias 29 a 31 deriva, e tarefa não tem `completed_at`

**O que é:** duas limitações medidas e aceitas no Módulo 38, as duas marcadas
como `ponytail:` em código. "Todo dia 31" vira 28/02 e depois 28/03, e nunca
volta ao 31, porque não há onde guardar o dia original. E o histórico do dia lê
a conclusão pelo `updated_at`, então editar uma tarefa concluída hoje a faria
aparecer como concluída hoje.

**Custo de fechar:** uma coluna cada (`recurrence_day`, `completed_at`), com
migração. A `m65` fixa a deriva como comportamento atual e reprova quando alguém
a corrigir, para o comentário não ficar mentindo.

---

## 3. Rede de segurança com furo

Vazia hoje. O único item que morava aqui era o `resolverPasto`, que escolhia o
primeiro pasto parecido em silêncio, e ele foi fechado em 10/09/2026: agora
conta os achados e pergunta quando há mais de um, com o bloco 18 da `m34`
provando nos dois sentidos. A seção fica de pé porque a numeração não é
reaproveitada.

---

## 4. Cobertura desigual

### 4.1 `packages/contracts` cobre 4 domínios de muitos

Existem contratos tipados para `alerts`, `auth`, `financial` e `users`. O
back-end tem 58 arquivos de action e 84 rotas em `/api/v1`.

Isso importa porque o app mobile consome esses contratos: o que não está lá é
consumido sem segurança de tipo, e a divergência aparece em runtime, no
aparelho, longe de quem escreveu.

**Precedente concreto:** os contratos ficaram parados em 5 tipos de alerta
enquanto o banco chegou a 8, e um alerta de manutenção de máquina quebrava a
lista inteira no app. Já corrigido, mas a mesma forma de falha continua possível
em todo domínio não coberto.

---

## 5. Higiene menor

- **`.claude/settings.local.json` tem 175 permissões**, quase todas comandos de
  uso único de sessões passadas (`curl` para localhost, `rm` de arquivo
  temporário específico). É ruído, não risco: os curingas perigosos foram
  removidos em 2026-08-18. Limpar é cosmético.
- **A numeração de suíte descolou da de módulo** por volta do `m25` e não tem
  volta (renumerar colide). Já está documentado no `CLAUDE.md` e o
  `npm run check` reprova suíte órfã, então é convivência, não dívida.

---

## O que NÃO é dívida, e por quê

Registrado para uma sessão futura não "consertar" o que é decisão:

- **Saldo derivado, nunca gravado** (rebanho e estoque): é o invariante 2.
- **Recusa cancela sempre no estoque**, mesmo quando a mensagem traz correção
  contrastiva: decidido em 2026-08-18 depois de a alternativa gravar dinheiro.
  Reabrir exige ancorar no texto digitado, nunca em comparar campos remontados.
- **O produto nunca é criado pela conversa**: cadastro exige categoria e
  unidade, e adivinhar as duas cria três saldos para a mesma coisa.
- **Duas instâncias NextAuth** (tenant e plataforma): é o que impede uma sessão
  de tenant alcançar o painel interno.
