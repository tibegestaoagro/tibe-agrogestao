# Módulo 35, fase 1: o estrutural do Financeiro

Fase nova do Financeiro que já existe desde o Módulo 4, não módulo novo. O
mapa das quatro áreas e as 34 decisões estão em
[2026-09-10-sequencia-das-quatro-areas.md](2026-09-10-sequencia-das-quatro-areas.md).

Documento do cliente: `docs/modulo-area-financeiro/`. As seções citadas com §
são dele.

**Por que esta fase existe:** três coisas que o documento pede não têm como ser
construídas em cima do que existe hoje. Pagamento parcial não tem onde ser
gravado, o lançamento não sabe de qual fazenda é, e não há forma de pagamento.
Tudo o mais que o documento pede depende de uma dessas três.

---

## O que existe hoje, medido

| pedido do documento | hoje |
|---|---|
| §13 e §14, pagamento e recebimento parcial | **não existe**. `markEntryPaidAction` quita o lançamento inteiro; não há campo de valor pago |
| §32, lançamento por fazenda | **não existe** `property_id`, e a tela `/financeiro` não filtra por propriedade |
| §9 e §10, cliente ou fornecedor | **não existe** `contact_id` |
| §16, forma de pagamento | **não existe** enum nem campo |
| §21, 26 categorias padrão | existem **11** (4 receita, 7 despesa) |
| §30, não chamar de saldo | a tela diz "Resultado do mês" e "Fluxo de caixa" |
| §15, parcelamento | existe, mas **só nasce por Negociações**, e sem número de parcela: agrupa por `negotiation_id` |
| §38, adiantamento | existe, mas **exclusivo de Mão de Obra** (`worker_entry_kind`) |
| §17, conta recorrente | **não existe** |

⚠️ **O status `overdue` do enum `FinancialEntryStatus` nunca é gravado.** As
únicas escritas são `paid` e `cancelled`. "Vencido" só existe derivado, e o
ramo de `financeiro/page.tsx:158`, que mostra o botão Cancelar para `overdue`,
**nunca executa**.

---

## O desenho

### Pagamento parcial: `FinancialPayment`

```
model FinancialPayment {
  id         String   @id @default(cuid())
  tenant_id  String
  entry_id   String
  amount     Decimal  @db.Decimal(14, 2)   // sempre > 0
  paid_at    DateTime
  method     PaymentMethod?
  notes      String?
  created_at DateTime @default(now())
  created_by_user_id String?
}
```

**O valor pago é a soma, nunca um campo.** É o invariante 2 do projeto aplicado
ao dinheiro. Um campo `paid_amount` sobrescreveria e perderia o rastro que o
§47 pede; partir a linha em duas destruiria a identidade da conta, e qualquer
referência a ela.

**O sentido vem do pai.** Um model só serve receita e despesa: "recebi 8 mil dos
20 mil" e "paguei 4 mil dos 10 mil" são a mesma operação com o sinal do
`entry_type`.

**Derivados, nunca gravados:**

```
pago      = soma dos pagamentos não cancelados
saldo     = amount - pago
situacao  = pago === 0            -> em aberto
            pago < amount         -> parcialmente paga
            pago >= amount        -> paga
```

**`status` continua gravado** (decisão 14), como máquina de estados, não como
saldo: ainda precisa distinguir `cancelled` de `pending`, coisa que soma nenhuma
responde, e os índices `[tenant_id, status, paid_at]` que a tela usa dependem
dele. Quando a soma fecha o total, grava `paid`; enquanto não fecha, fica
`pending`. **"Parcialmente paga" nunca é gravada.**

⚠️ **Recusar pagamento que estoure o total.** `amount` 10.000 com 4.000 pagos
aceita no máximo mais 6.000. Recusa com `field: "amount"`, para a mensagem cair
embaixo do campo.

⚠️ **Recusar pagamento em lançamento cancelado.**

### Compatibilidade do que já existe

`PATCH /api/v1/financial-entries/[id]/pay` **continua existindo** e passa a
criar um pagamento do **saldo restante**. O botão "Pagar" da tela continua
sendo "quitar de uma vez", que é o caso comum. Quebrar essa rota quebraria a
tela e o WhatsApp sem necessidade.

### Os dois vínculos

`property_id` e `contact_id` no `FinancialEntry`, ambos **opcionais**, sem
backfill retroativo. Backfill exigiria adivinhar pela `related_id` de sete
módulos, e adivinhação em dinheiro de cliente é a pior classe de migração.

`createLinkedEntry` ganha os dois parâmetros. **Treze dos quinze arquivos que a
chamam já têm `property_id` na mão**, e seis já têm o contato: preencher é
mecânico, sem query nova. `milk-storage.ts` é o único sem nenhum dos dois, e
fica nulo com comentário dizendo por quê.

| origem | property_id | contato |
|---|---|---|
| negotiations, event-consignments, barters, product-negotiations | sim | sim |
| milk-sales, service-jobs | sim | sim |
| herd-ledger, herd-stays, animal-movements, animal-batches, animal-vaccinations | sim | não se aplica |
| machines, workers, service-costs | sim | não se aplica |
| milk-storage | **não** | não |

### Forma de pagamento

```
enum PaymentMethod {
  dinheiro
  pix
  transferencia
  boleto
  cheque
  cartao
  outro
}
```

Opcional, e vive **nos dois lugares**: no `FinancialEntry` (a forma combinada) e
no `FinancialPayment` (a forma de cada pagamento). Quem paga metade no PIX e
metade em dinheiro precisa dos dois.

⚠️ **"Parcelamento" e "compensação em permuta" do §16 ficam de fora, de
propósito.** Não são forma de pagamento, são estrutura da operação:
parcelamento já é N lançamentos, e permuta sem dinheiro já não gera lançamento
nenhum por decisão da frente 4. Colocá-los no enum criaria dois caminhos para a
mesma coisa.

### Categorias e vocabulário

As 26 do §21 (9 receita, 17 despesa) acrescentadas ao provisionamento.
**Acrescentar, nunca apagar nem renomear:** tenant que já criou ou renomeou uma
categoria não perde nada.

Rótulos do §30: "Resultado do mês" vira "Diferença do período", e o gráfico
perde o nome "Fluxo de caixa". O §51 lista fluxo de caixa avançado como fora da
v1, e o §30 diz que o produtor não pode tomar a diferença por dinheiro em conta.

---

## Tarefas

### T01: schema e migração

`FinancialPayment`, `PaymentMethod`, `property_id`, `contact_id`. Model novo
entra em `TENANT_SCOPED_MODELS` (invariante 1), e `npm run test:isolation`
reprova se esquecer.

⚠️ Migração escrita à mão com `migrate diff`, nunca `migrate dev`. Aplicar
primeiro no Docker local.

### T02: a migração de backfill, separada

Um `FinancialPayment` por lançamento `status = 'paid'`, com `amount` igual ao do
lançamento e `paid_at` igual ao dele. Sem isso, todo lançamento quitado passa a
ter pago zero e o "Entrou" dos meses anteriores muda.

⚠️ **Provar o predicado antes de aplicar**, como foi feito na migração de boitel
do Confinamento: plantar no banco de dev um lançamento pago, um pendente e um
cancelado, rodar, e conferir que só o primeiro ganhou pagamento.

⚠️ `paid_at` é nullable no schema. Lançamento `paid` sem `paid_at` existe?
**Conferir antes**, e se existir, decidir a data com o usuário em vez de chutar
`created_at`.

### T03: as actions

`registrarPagamentoAction` (recusa estouro, recusa cancelado, fecha o `status`
quando a soma bate), `cancelarPagamentoAction`, e a derivação de `pago`,
`saldo` e `situacao`. `markEntryPaidAction` passa a criar o pagamento do saldo.

Regra de negócio em `src/lib/actions/`, nunca na rota (invariante 6).

### T04: as rotas

`POST /api/v1/financial-entries/[id]/payments` e
`DELETE /api/v1/financial-entries/[id]/payments/[paymentId]`. `GET` do
lançamento passa a devolver `pago`, `saldo`, `situacao` e a lista de pagamentos.

⚠️ Recusa com `field` preenchido, senão a mensagem cai no rodapé em vez de
embaixo do campo. `apiErroDeZod` para o Zod.

### T05: `createLinkedEntry`, as 15 origens, e o apagar em cascata

Os dois parâmetros novos, e as 13 origens que têm o dado passam a preencher.
Nenhuma query nova: se o valor não está à mão, fica nulo.

⚠️ **Risco achado na T03, e é aqui que ele se resolve.** `herd-ledger.ts:808`,
`herd-stays.ts:592` e `service-jobs.ts` (três pontos) **apagam**
`FinancialEntry` pendente direto no banco quando a operação de origem é
cancelada. Com `onDelete: Cascade` no `entry_id`, isso passa a apagar junto os
`FinancialPayment` daquela conta.

Numa conta pendente **parcialmente paga**, o registro do dinheiro que já saiu
sumiria sem aviso. O caso concreto: cancelar um confinamento cujo boitel foi
meio pago.

Decisão do usuário em 10/09: tratar junto desta tarefa. O caminho é a mesma
guarda da `cancelEntryAction`, que já recusa cancelar conta com pagamento:
esses três pontos precisam recusar antes de apagar, em vez de apagar em
silêncio.

### T06: as 26 categorias

### T07: a tela

Coluna de fazenda e de contato, filtro por propriedade (a página hoje nem
importa `getActivePropertyId`), painel de pagamento parcial com o saldo visível,
lista de pagamentos no detalhe, rótulos do §30, e **o ramo morto do `overdue`
apagado**.

Painel de escrita nasce no kit: `FormSheet` + `Field` + `useErrosDeFormulario`,
com o `id` do `Field` sendo o nome do campo na API. As conferências 11 e 15 do
`npm run check` reprovam o contrário.

### T08: a suíte

Suíte nova no próximo número livre (`m62`), **escrita da spec, sem ler a
implementação**. O que ela precisa provar: soma de dois pagamentos parciais
fecha o lançamento; pagamento que estoura é recusado com `field`; pagamento em
cancelado é recusado; cancelar pagamento devolve o lançamento para pendente;
isolamento entre tenants; e o backfill do T02 nos três casos.

⚠️ **Quebrar a trava de propósito antes de confiar nela.** Teste que passa antes
e depois da correção não prova nada.

### T09: os encaixes de dívida

`dividas.md` §2.10 (o rótulo "Prestador" com três origens diferentes) e §3.3
(`resolverPasto` devolve o primeiro achado em silêncio, com duas
implementações de referência já no repositório).

### T10: validação ao vivo

Navegador, com `scripts/_sessao-local.ts` e cenário próprio. O que olhar: pagar
parcial e ver o saldo mudar; tentar estourar e ver a recusa **embaixo do
campo**; filtrar por fazenda; e conferir que os rótulos do §30 mudaram.

Suíte verde não é validação (invariante 8).

---

## Critérios de aceite

O produtor consegue: registrar pagamento parcial de despesa e de receita; ver
quanto pagou e quanto falta; ver o histórico de pagamentos de uma conta;
cancelar um pagamento; informar a forma de pagamento; relacionar lançamento a
uma fazenda e filtrar por ela; ver com quem foi o negócio; e escolher entre as
26 categorias sem criar nenhuma.

E o sistema: recusa pagamento que estoura o total, nomeando o campo; recusa
pagamento em lançamento cancelado; não muda nenhum total de mês anterior depois
do backfill.

---

## Fora desta fase

Parcelamento na tela e conta recorrente vão para a 35.2. WhatsApp e as consultas
em linguagem natural vão para a 35.3. Adiantamento genérico não precisa de
trabalho: com o model de pagamentos, ele já é um pagamento antecipado.
