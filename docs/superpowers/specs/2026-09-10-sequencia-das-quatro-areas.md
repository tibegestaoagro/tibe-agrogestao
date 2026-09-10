# A sequência das quatro áreas novas

Documento de sequência, não spec. Ele existe para uma sessão nova entender a
ordem, o corte de cada fase e **as 34 decisões já tomadas**, sem refazer a
conversa que as produziu.

Origem: quatro documentos do cliente entregues em setembro de 2026, lidos
inteiros em 10/09 e commitados em `docs/modulo-*`. As decisões saíram de um
interrogatório em seis rodadas com o usuário, na mesma data.

⚠️ **Estas decisões não devem ser redecididas.** Se uma delas estiver errada,
a conversa é com o usuário; o caminho não é escolher diferente em silêncio.

---

## O que cada documento é

| documento | área existe hoje? | natureza |
|---|---|---|
| `modulo-area-financeiro` | sim, desde o Módulo 4 | fases novas do Financeiro |
| `modulo-meu-dia` | sim, Módulo 27 | fases novas do Meu Dia |
| `modulo-calculadora` | sim, 12 calculadoras | fase nova da Calculadora |
| `modulo-lista-de-compras` | **não existe nada** | módulo novo |

**Postura (decisão 1):** os três que já existem são tratados como **spec de
referência**, com auditoria do delta, e não como reescrita. Reimplementar
jogaria fora código validado e reabriria risco no Financeiro, que é a tabela em
que todo módulo escreve.

**Numeração (decisão 24):** só a Lista de Compra ganha número novo. As outras
três são fases de módulos existentes, escritas como o Confinamento foi ("fase 3
do Módulo 30, não módulo novo"). Numerar de novo o Financeiro partiria o
histórico de decisões dele em dois lugares.

---

## A ordem, e por que ela

**Financeiro, Lista de Compra, Calculadora, Meu Dia** (decisão 2).

Os quatro se consomem em cadeia: a Calculadora despeja na Lista de Compra
(§37), a Lista despeja em Negociações (§12) e aparece no Meu Dia (§14), o
Financeiro alimenta o Meu Dia (§7, §25, §46), e o Meu Dia consome todos.

O Meu Dia fica por último porque é **camada de leitura**. Adiantá-lo, que é a
tentação natural por ser a cara do produto, obriga a refazer a tela a cada área
que chega depois.

---

## Antes de tudo, fora da fila

| o que | por quê |
|---|---|
| Consertar a tarefa que nasce "Atrasada" | defeito ativo em produção (decisão 10) |
| Rodar `npm run wa` da dívida §2.9 | última prova que falta daquela dívida |
| Commitar os quatro documentos | feito em 10/09, commit `75287a5` |
| Segurança: rotação e fechar o repositório | é do usuário, corre em paralelo |

**O defeito da tarefa:** `effectiveStatus()` (`src/lib/actions/tasks.ts:15-18`)
compara por **instante**, não por dia-calendário, e o formulário grava meia
noite de um `<input type="date">`. Toda tarefa criada para hoje já nasce
atrasada. O Financeiro e as Negociações comparam por dia; só o Meu Dia não.

---

## Módulo 35: Financeiro, três fases

### 35.1, o estrutural

Tudo aqui é pré-requisito do resto. Detalhe em
`2026-09-10-modulo-35-financeiro-fase-1.md`.

- **Pagamento parcial** (decisão 7): model novo `FinancialPayment`, N pagamentos
  por lançamento, valor pago é a **soma**. Não é campo `paid_amount`, que
  sobrescreveria e perderia o rastro, nem partir a linha em duas, que destruiria
  a identidade da conta.
- **Migração** (decisão 13): um pagamento por lançamento já quitado, valor igual
  ao `amount`, data igual ao `paid_at`. Determinístico, não adivinha nada.
- **`status` continua gravado** (decisão 14), como máquina de estados, não como
  saldo. "Parcialmente paga" nasce **derivada**: `soma > 0 && soma < amount`.
- **Dois vínculos** (decisão 8): `property_id` e `contact_id`, ambos opcionais,
  **sem backfill retroativo**.
- **Forma de pagamento** (decisão 9): enum, opcional. **Sem "parcelamento" e sem
  "compensação em permuta"**, que não são forma de pagamento e sim estrutura da
  operação, já resolvidas em outro lugar.
- **Categorias** (decisão 33): as 26 do §21, acrescentadas sem apagar nem
  renomear o que o produtor criou.
- **Vocabulário do §30** (decisão 34): "Resultado do mês" vira "Diferença do
  período", e o gráfico perde o nome "fluxo de caixa", que é o jargão que o §51
  lista como fora da v1.
- **Código morto** (decisão 10): o status `overdue` nunca é gravado, então o
  ramo de `financeiro/page.tsx:158` nunca executa. Apagar o ramo, **manter o
  valor no enum** (remover custa migração e não devolve nada).
- **Encaixes de dívida**, porque os arquivos já serão abertos (decisão 30):
  `dividas.md` §2.10 (rótulo "Prestador") e §3.3 (`resolverPasto` ambíguo).

### 35.2

Parcelamento na tela do Financeiro (hoje só nasce por Negociações, e sem número
de parcela: agrupa por `negotiation_id`), e conta recorrente pelo **padrão
rolante** da Mão de Obra (decisão 22): uma pendência por vez, a próxima nasce na
confirmação. Nunca gerar doze parcelas futuras, que envelhecem erradas e somam
um ano inteiro no "Tenho para pagar".

O adiantamento do §38 **não custa nada**: com o model de pagamentos da 35.1, ele
já é um pagamento antecipado (decisão 23). O adiantamento de Mão de Obra fica
como está, porque lá ele não abate da previsão do mês, regra do §9 daquele
documento.

### 35.3

WhatsApp do §42 e as nove consultas do §43. **Handler nasce e é testado, o
classificador espera** (decisão 29), como nas quatro últimas frentes.

---

## Módulo 36: Lista de Compra, novo

- **Sem entidade "lista"** (decisão 15): só `ShoppingItem` solto por tenant, e
  "a lista" é a consulta dos pendentes. O agrupamento que o produtor quer é por
  local de compra (§16), e isso é **campo opcional no item**.
- **Item híbrido** (decisão 11): `product_id` opcional mais descrição livre. O
  §5 é explícito que "comprar arame" sem quantidade tem que funcionar, mas sem o
  vínculo a sugestão por estoque baixo e o reaproveitamento na compra não
  existem.
- **Campos** (decisão 32): descrição obrigatória, todo o resto opcional
  (quantidade, unidade, fazenda, prioridade, observação, local de compra).
  **Categoria reusa `ProductCategory`**, que já é a categoria de produto do
  tenant. **Finalidade vira enum próprio**, porque não é o que o produto é, é
  para onde ele vai.
- **Registrar compra reusa Negociações** (decisão 12), sem exceção. Caminho
  próprio criaria uma segunda porta para mexer em estoque e financeiro, que é
  como nasce o lançamento duplicado que o §49 proíbe.
- **Estoque baixo reusa o alerta** (decisão 27): `low_stock` ganha a ação
  "adicionar à lista". Segunda varredura significaria dois lugares decidindo o
  que é estoque baixo. ⚠️ Registrar na spec que o alerta compara o **total do
  tenant**, não o saldo por fazenda.

---

## Módulo 37: Calculadora

Sete calculadoras novas, todas puras, **sem persistência** (decisão 6):
piquetes (§12), receitas e misturas (§18 a §21), reservatório (§23), ganho de
peso (§27), custo por hectare (§32), serviço terceirizado (§33), conversões
rurais e área (§35 e §36).

**Fora: simulação de engorda** (§28, decisão 16). Combina seis entradas e cruza
consumo com custo alimentar, e o próprio documento diz "manter simples" sem
dizer o que é simples.

As receitas do §21 nascem em **constante de código**, como as referências
técnicas. Receita salva pelo usuário fica para a fase de persistência, se ela
vier.

**Referências técnicas continuam em código** (decisão 17). "Atualizável pela
equipe TIBÉ" (§45) é satisfeito por um deploy. Tabela editável significaria
tela de administração, permissão, histórico de quem mudou e o que acontece com
o cálculo salvo antes da mudança, e nada disso foi pedido.

---

## Módulo 38: Meu Dia, por último

- **`due_date` opcional** (decisão 19), com três consequências resolvidas: sem
  data vai para seção própria, nunca misturada com "Hoje"; não gera lembrete,
  porque não há dia para lembrar; e nunca é "Atrasada", porque não há prazo a
  estourar.
- **Responsável aponta para `Worker`** (decisão 20), opcional, com texto livre
  de fallback. "Eu" resolve sem campo: tarefa sem responsável é a de quem
  anotou. Não aponta para `User`, que seria atribuição entre usuários do painel,
  listada no §63 como fora da v1.
- **Campos que entram** (decisão 31): horário de verdade, fazenda, observação.
  **Pasto fica fora**: o §18 é o único lugar que o menciona, nenhum exemplo o
  usa, e ele custa uma pergunta a mais num cadastro que o próprio §18 pede que
  seja "extremamente simples".
- **Prioridade** (decisão 28): enum `Prioridade { normal, urgente }`
  **compartilhado com a Lista de Compra**. Mesmo conceito, mesmo vocabulário;
  dois enums idênticos divergem no dia em que alguém acrescentar "alta" num só.
- **Recorrência pelo padrão rolante** (decisão 25). Consequência aceita de olhos
  abertos: quem pula três segundas seguidas fica com uma pendência, não três.
  Para tarefa de rotina isso está certo.
- **As três seções leem ao vivo** (decisão 21): "Hoje", "Atenção" e "Próximos
  dias" são consulta no request, como o `/dashboard` já faz. O §61 é explícito:
  "não deverá criar bases paralelas desnecessárias". Materializar daria a cada
  módulo um segundo lugar para escrever, e quando os dois divergirem a tela
  mente.
- **Histórico do dia idem** (decisão 26): união de `HerdMovement`,
  `StockMovement`, `FinancialPayment`, `MilkMovement` e `ServiceJobLog` por
  data. Sem tabela de log, que traria a pergunta sem boa resposta: o que
  acontece com a linha quando a movimentação de origem é cancelada.

⚠️ **O que ninguém tinha notado:** hoje não existe adiar, editar título nem
excluir tarefa. `PATCH /api/v1/tasks/[id]` aceita só `status`
(`src/app/api/v1/tasks/[id]/route.ts:9-11`) e `TaskActions` tem dois botões,
Concluir e Cancelar. Entra nesta fase.

---

## Fora, de propósito

| o que | por quê |
|---|---|
| Entrada universal (§36 e §37 do Meu Dia) | depende do classificador congelado; caixa de texto sem cérebro atrás mente para o produtor (decisão 5) |
| Meu Dia como porta de entrada (§4, §66) | a home continua `/dashboard` até o Meu Dia estar completo (decisão 4) |
| Persistir cálculo, favoritos, memória | conveniência; medir se alguém pede antes de construir (decisão 6) |
| Pasto na tarefa | decisão 31 |
| Simulação de engorda | decisão 16 |

## Depois das quatro

A outra metade do Confinamento (`dividas.md` §2.8: despesa avulsa amarrada ao
lote, e os sete destinos de saída) e as três decisões de produto do Leite. São
conversa de produto, sem relação com o que está sendo construído, e misturá-las
agora dilui a atenção (decisão 30).
