---
tipo: design
data: 2026-11-07
modulo: 39 (Meu Empório)
origem: pesquisa de mercado (financeiro de agropecuária multilojas) e entrevista com o Dilton em 2026-11-07, em 24 decisões
---

# Meu Empório: o financeiro das lojas

O Dilton quer um financeiro para as lojas do Empório que **não tem nada a ver
com o financeiro do Tibé**: casa própria, regras próprias e uma pessoa que
cuida só do dinheiro das lojas. É um financeiro de todas as lojas, com filtro
por loja em toda tela e relatório.

Este documento cobre quatro entregas, nesta ordem, cada uma indo a produção
sozinha. **Cada entrega vira um plano próprio**, executado com contexto limpo.

1. A casa do financeiro, o papel Financeiro, o pagamento do fornecedor dentro
   do Empório e o Empório fora do `/financeiro` do Tibé.
2. Vencimento do fiado, limite de crédito, bloqueio, liberação registrada e a
   lista de cobrança.
3. Acordo, alçada de aprovação com aviso e o carimbo de conciliação.
4. Fluxo de caixa projetado, relatórios por idade e por vencimento, rateio
   automático.

A spec do módulo é `docs/specs/module-39-meu-emporio.md`. As decisões abaixo
entram na tabela de decisões dela, continuando a numeração: a última hoje é a
**Q213**, então estas são a **Q214 à Q237**. A pesquisa que embasou as
decisões está fora do repositório (pasta `reports/`, ignorada pelo git, porque
o repositório é público).

**Fora deste documento, por decisão do usuário:**

- **Nota fiscal** (NF-e, NFC-e, receituário, importação do XML do fornecedor).
  É frente própria, depois desta. O financeiro não depende dela.
- **Comissão por vendedor.** A regra atual (percentual por loja, apurada na
  venda) fica como está.
- **Conta bancária por loja.** A rede pequena tem um CNPJ raiz e uma conta só;
  a loja é dimensão do lançamento.
- **Aprovar pagamento respondendo no WhatsApp.** Seria intenção nova no
  classificador do n8n, que está congelado.
- **Pix dinâmico e boleto via Asaas.** Só fariam sentido com cobrança
  automática, que não foi escolhida.

⚠️ **Palavra que colide:** "financeiro" é também o `/financeiro` do Tibé (o da
fazenda). Neste documento, "Financeiro" com maiúscula é o papel novo; "o
financeiro do Empório" é a casa nova em `/emporio/financeiro`; "o `/financeiro`
do Tibé" é o da fazenda. No código, prefira nomes com `emporio` na frente.

---

## Por que

- **Agropecuária é um negócio de crédito operado por um balcão.** Na revenda
  de insumos só 15% da venda é à vista; a inadimplência das revendas saiu da
  faixa de 3% a 5% para perto de 10% em 2025; a margem líquida fica abaixo de
  10%. O que mais protege o dono não é relatório, é limite, bloqueio e
  cobrança.
- **Hoje o cliente vencido numa loja compra fiado na outra.** O cliente já é
  único na conta e o saldo consolidado já existe (`listarFiadoAction`), mas não
  há limite nem bloqueio: a única recusa do fiado é a do Consumidor final.
- **Hoje o dinheiro da compra sai do nada.** A conta a pagar da compra a prazo
  nasce certa (`FinancialEntry` com `related_id` da compra), mas não aparece nas
  Despesas da loja e só se quita pelo `/financeiro` do Tibé, que não tira
  dinheiro de gaveta nem de conta. É a dívida 2.26 de `docs/agents/dividas.md`.
- **Uma pessoa só no dinheiro precisa de controle compensatório.** O mercado
  resolve com alçada por valor e com a comparação do declarado contra o
  recebido. O Empório marca tudo por loja; falta a comparação.

**Sucesso, nas palavras do usuário:** uma pessoa contratada para o financeiro
das lojas entra no sistema e trabalha só ali, vendo o dinheiro de todas as
lojas e filtrando por loja quando quiser.

**O que seria fracasso mesmo funcionando:** o Financeiro precisar do
`/financeiro` do Tibé para alguma coisa; uma conta do Empório ser quitada sem
dizer de onde saiu o dinheiro; um cliente bloqueado comprar fiado em outra
loja; o total a receber mudar quando um acordo é feito.

---

## Decisões (Q214 à Q237)

| # | decisão | motivo |
|---|---|---|
| Q214 | **Perfil da loja:** hoje balcão (ração, sal, medicamento, ferragem), sem venda na safra. O produto deixa lugar na modelagem para "vencimento na safra" e "limite por safra", sem construir. | Construir crediário de safra sem cliente que use é custo sem prova. |
| Q215 | **Papel novo `financeiro`** em `EmporioRole`: dinheiro de todas as lojas, sem vender, sem catálogo, sem equipe. | Nenhum dos quatro papéis descreve quem opera o dinheiro sem operar a loja. Sem ele, todo controle cai no Dono. |
| Q216 | **Financeiro antes da nota fiscal.** | A nota é projeto grande de integração com a SEFAZ; o financeiro entrega valor à pessoa contratada no primeiro dia. |
| Q217 | **Conta bancária única, uma chave Pix por loja.** | É como a rede pequena opera. O `BankAccount` já é da conta e a loja já tem `pix_bank_account_id`. |
| Q218 | **Fiado sem juros nem multa.** Campo reservado, regra desligada. | O controle que devolve dinheiro é bloquear a venda nova, não cobrar 2% de quem já não paga. |
| Q219 | **Bloqueio automático por fiado vencido há N dias (padrão 15) mais limite em reais** por cliente, com padrão da conta e valor por cliente. | Fecha a brecha entre lojas e responde "até quanto o Zé pode dever". |
| Q220 | **Comissão fica como está.** | Decisão do usuário; a apuração por vendedor e o Tema 65 do TST ficam para quando houver pedido. |
| Q221 | **O dinheiro sempre sai de algum lugar.** A compra se paga dentro do Empório, da gaveta ou da conta; nenhuma conta do Empório se quita pelo `/financeiro` do Tibé. | É o princípio "o saldo é a soma das movimentações" aplicado até o fim. Fecha a 2.26. |
| Q222 | **Independência nas telas, não nas tabelas.** Casa própria em `/emporio/financeiro`; o `/financeiro` do Tibé deixa de mostrar o Empório; a tabela continua `FinancialEntry` marcada `emporio`. | Independência é tela, regra e permissão. Tabela nova seria migração em dado real da Agromax para ganhar o que ninguém vê. |
| Q223 | **Vencimento do fiado:** prazo padrão da conta (30 dias), prazo por cliente quando existe, e a venda ainda pode mudar. Fiado antigo sem data conta o padrão a partir da venda. | O bloqueio precisa saber quando venceu. O prazo por cliente é o campo que vira "vence na safra". |
| Q224 | **Limite é do Financeiro; liberação pontual é do Gestor para cima,** registrada com quem e por quê. | Limite é política de dinheiro. Liberar uma venda é decisão de balcão: esperar o Financeiro atender perde a venda. O registro impede a exceção de virar regra. |
| Q225 | **Cobrança manual:** lista "Fiado vencido" por cliente, dias de atraso, botão que abre o WhatsApp do aparelho com texto padrão da conta, editável em Configurações. | Mensagem automática ao cliente exige consentimento, texto que não ameace (CDC) e chip que não seja o do agente. |
| Q226 | **Conciliação por carimbo manual** agora. OFX e NSU da adquirente ficam como dívida. | O carimbo já expõe a diferença sem depender de formato de banco. |
| Q227 | **Alçada por valor:** acima de um teto configurável por conta, o pagamento espera o Dono ou o Gerente geral aprovar. | Uma pessoa só no dinheiro exige controle compensatório; aprovar tudo trava o dia e o Dono aprova sem ler. |
| Q228 | **Fluxo projetado por data** (30, 60 e 90 dias). O fiado descontado por expectativa de recebimento fica como dívida. | Cartão e cheque já têm data; com a Q223 o fiado passa a ter. |
| Q229 | **Importar XML da nota do fornecedor vai na frente de nota fiscal.** | O trabalho de verdade é casar item da nota com produto do estoque. |
| Q230 | **Acordo formal:** junta os fiados em aberto do cliente em parcelas com datas, sem juros. | Decisão do usuário. É o que vira crediário quando a safra chegar. |
| Q231 | **O Financeiro entra numa tela "Hoje"** do dinheiro de todas as lojas, com filtro por loja. | É a tela que responde "o que eu faço agora"; o Resultado é leitura de fim de mês. |
| Q232 | **O Financeiro mantém os cadastros do dinheiro e lê vendas e estoque de todas as lojas sem editar.** | Quem concilia precisa abrir a venda que gerou o Pix que não caiu. |
| Q233 | **Acordo é do Financeiro e do Dono.** Os originais saem da cobrança; a parcela é o que vence e bloqueia; acordo em dia desbloqueia dentro do limite. | Renegociar é do dinheiro; liberar uma venda é do balcão. Desbloquear quem honra é o que faz honrar. |
| Q234 | **Aprovação na tela, com aviso pelo WhatsApp do Tibé** (valor, fornecedor, vencimento). | O Tibé já avisa por WhatsApp; aprovar respondendo exigiria intenção nova no n8n. |
| Q235 | **Relatórios de quem opera o dinheiro:** a receber por idade de atraso, a pagar por vencimento, posição de caixa por lugar, todos por loja. O Resultado da Loja fica; a DRE formal é dívida. | O Resultado já é uma DRE simplificada, e o contador trabalha com a nota, que não existe. |
| Q236 | **Rateio ganha três critérios automáticos:** proporcional ao faturamento, por área (m²) e por funcionários, além de percentual e valor. | Decisão do usuário. |
| Q237 | **Ordem de entrega:** casa e papel; crédito e cobrança; acordo, alçada e conciliação; projeção, relatórios e rateio. | A entrega 1 é a que permite contratar a pessoa e pô-la para trabalhar; a 2 vem logo atrás e não depende dela. |

---

## O que já existe, e a spec se apoia

Fatos conferidos no código em 07/11/2026. O builder confirma antes de mudar.

- **Papéis:** `src/lib/emporio/papel.ts`. O Dono é o `OWNER` do Tibé, sem
  `EmporioRole`. Papel fica em `User.emporio_role`, com `emporio_only` e
  `emporio_keys`; o vínculo com loja é `UserEstablishment`, e sem vínculo o
  usuário vê todas as lojas. `pode(contexto, acao, lojaId?)` decide por ações
  (`conta`, `gestor_da_loja`, `vendedor_da_loja`, `fora_do_caixa`,
  `fatura_na_loja`, `chave:*`); Dono e Gerente geral passam em todas. Dos
  cadastros do dinheiro, só a conta bancária exige `conta`; a conta Pix da
  loja, a regra de cartão, a despesa fixa e a regra variável exigem
  `gestor_da_loja`. Categoria financeira não é do Empório: é a do Tibé
  (`/api/v1/financial-categories`), e a de mercadorias nasce sob demanda em
  `criarCompraAction`.
- **Menu e trava:** `PAGINAS_DO_EMPORIO` em `src/lib/emporio/paginas.ts` diz
  a ação exigida por tela. Quem é "só da loja" só abre as páginas de
  `src/lib/emporio/paginas-do-so-da-loja.ts` (a mesma trava roda em
  `src/proxy.ts`). O login manda todo mundo para `/meu-dia`.
- **Filtro de loja** é a query `?loja=` na URL, com "Todas as lojas"
  (`vendas-filtro.tsx` e irmãos). Não há "loja atual" global.
- **Dinheiro:** todo lançamento é `FinancialEntry` (`related_module: emporio`,
  `establishment_id`, `emporio_customer_id` ou `emporio_supplier_id`) criado
  por `createLinkedEntry` (`src/lib/financial.ts`), pago por
  `FinancialPayment`. Onde o dinheiro está é `CashMovement`, com exatamente
  um lugar: gaveta (`establishment_id`), conta (`bank_account_id`) ou gerência
  (`manager_establishment_id`). Saldo nunca gravado (`saldosDasContas`,
  `saldoDoCaixa` em `emporio-caixa.ts`). **A parcela de cartão não vira
  `CashMovement`:** `saldosDasContas` soma ao saldo da conta as
  `CardReceivable` com `expected_on` até hoje, direto, sem movimento e sem
  job.
- **Fiado:** a venda cria um `FinancialEntry` income pendente por venda, com
  `due_date` igual ao vencimento informado ou à data da venda
  (`emporio-vendas.ts`); a parte fiado é um `EmporioSalePayment` sem
  `FinancialPayment`. `receberFiadoAction` (`emporio-caixa.ts`) recebe em
  dinheiro (exige turno) ou Pix (conta Pix da loja), distribui das vendas mais
  antigas para as mais novas e grava `fiado.receber` no Histórico.
  `listarFiadoAction` agrupa por cliente com `owed`, `overdue_amount` e
  `oldest_due_date`. `EmporioCustomer` não tem limite nem bloqueio.
- **Compra:** `criarCompraAction` (`emporio-compras.ts`) cria um
  `FinancialEntry` expense por lançamento (`CATEGORIA_MERCADORIAS`,
  `related_id` = compra), pago quando à vista ou entrada (com o
  `FinancialPayment` que `createLinkedEntry` cria), pendente quando a prazo ou
  parcela. **Nenhum `CashMovement`** nasce aí, nem para a parte paga. Exige
  `chave:lancar_compra`. `cancelarCompraAction` já recusa compra com parte
  paga (`PURCHASE_HAS_PAYMENT`).
- **A lacuna 2.26:** `listarContasAPagarAction` e `pagarDespesasAction`
  (`emporio-despesas.ts`) filtram por `SO_DO_EMPORIO` (entry com
  `sale_variable_expense` ou `fixed_occurrence`), então a conta da compra não
  aparece nem se paga ali. No `/financeiro` do Tibé, `registrarPagamentoAction`,
  `markEntryPaidAction`, `cancelEntryAction` e `postponeEntryDueDateAction`
  (`financial-payments.ts`, `financial-entries.ts`) aceitam entry do Empório e
  não criam `CashMovement`.
- **Área do `/financeiro`:** `src/lib/financial-area.ts` (`filtroDeArea`,
  `fazenda | emporio | tudo`) e `financeiro/area-filtro.tsx`, que só aparece
  quando a conta tem os dois perfis. `financial-summary.ts` também recebe a
  área.
- **Despesa fixa:** `FixedExpenseTemplate` (`split_kind: percentual | valor`,
  `due_day`), `FixedExpenseSplit` por loja, `FixedExpenseOccurrence` por loja
  e mês com a entry. `partesDoMes` e `criarOcorrencia` em
  `emporio-despesas.ts`. **As ocorrências nascem em lote de 12 meses**
  (`MESES_GERADOS`) ao criar e ao renovar o modelo, e editar o modelo
  recalcula todas as futuras não pagas. O Resultado soma as fixas pelo
  vencimento, pagas ou não (`emporio-resultado.ts`).
- **Histórico:** `registrarNoHistorico(tx, ator, { action, establishment_id?,
  target_type, target_id?, summary, changes? })` em
  `src/lib/emporio/historico.ts`, com catálogo fixo `ACOES_DO_HISTORICO`. A
  conferência 19 do `npm run check` reprova action de escrita do Empório sem
  ele.
- **Aviso a um usuário:** `notify(recipient, content, urgency)` em
  `src/lib/notify/index.ts`. A urgência `conversa` é a única que garante o
  WhatsApp (as outras preferem push). O telefone do usuário é `User.phone`.
- **Suítes:** a próxima livre é `test:m98`. Roteiros em
  `scripts/navegador/emporio-*.py`.

---

## Entrega 1: a casa do financeiro

### O papel Financeiro

- Valor novo `financeiro` em `EmporioRole` (migração de enum). Em `papel.ts`,
  `PapelEmporio` ganha `"financeiro"`, com `lojas: null` (todas) e
  `soDaLoja: true`: o Financeiro é só do Empório e nunca abre o Tibé da
  fazenda. `emporio_only` é verdadeiro para ele.
- Ação nova em `AcaoEmporio`: **`dinheiro`**. Passam nela o Dono, o Gerente
  geral e o Financeiro. É a ação exigida por tudo o que esta spec cria. Nos
  cadastros do dinheiro que já existem, **`dinheiro` soma, não substitui**: a
  conta bancária aceita `conta` ou `dinheiro`; a conta Pix da loja, a regra de
  cartão, a despesa fixa com o rateio e a regra variável aceitam
  `gestor_da_loja` (na loja dele) ou `dinheiro`. O Gestor não perde nada do
  que faz hoje. Os campos de Configurações que esta spec cria (prazo, dias de
  bloqueio, limite padrão, texto de cobrança, teto de alçada) são editáveis
  por `dinheiro`; o builder divide `editarConfiguracoesAction` ou relaxa a
  checagem só para esses campos. Categoria financeira continua sendo a do
  Tibé; se o Financeiro precisar criar uma, o builder expõe isso dentro do
  Empório sob `dinheiro`.
- **De onde o dinheiro sai, por papel.** O Financeiro paga e recebe **só pela
  conta bancária**: ele não está na loja e não abre turno. O Gestor continua
  pagando da gaveta da loja dele (com turno aberto) e da conta bancária, como
  hoje. O Dono e o Gerente geral, dos dois lugares.
- **O Financeiro não passa em** `vendedor_da_loja`, `fatura_na_loja`,
  `gestor_da_loja` nem em chave nenhuma: não vende, não troca, não lança
  compra, não conta estoque, não mexe em catálogo nem em equipe.
- **Leitura:** o Financeiro lê vendas, orçamentos, compras, estoque,
  clientes, fornecedores e o Histórico de todas as lojas, sem editar. A ficha
  do cliente (hoje `vendedor_da_loja`) abre para ele, porque é nela que vão
  morar o limite, o prazo, as liberações e o acordo das entregas 2 e 3. `alcanceDeLeitura` e a lista de
  páginas precisam contemplar isso: a página de Vendas, por exemplo, abre para
  ele sem os botões de escrever.
- A Equipe (`conta`) passa a oferecer o papel Financeiro ao convidar ou
  editar alguém. Quem tem papel Financeiro não precisa de `UserEstablishment`.
- **Entrada:** depois do login, o Financeiro cai em `/emporio/financeiro`. O
  Gerente geral e o Dono continuam onde estão. Como fazer (redirecionar no
  login por papel, ou no `/meu-dia`) fica com o builder; o destino do "só da
  loja" (`DESTINO_DO_SO_DA_LOJA`) precisa aceitar a casa nova.

### A casa: `/emporio/financeiro`

Página nova no menu do Empório, exigindo `dinheiro`. Toda tela dela tem o
filtro de loja (`?loja=`, com "Todas as lojas" como padrão), no mesmo
componente dos filtros que já existem.

**Tela "Hoje"** (a entrada), em blocos, cada um levando à tela que resolve:

1. Posição de caixa por lugar: cada gaveta (por loja), cada gerência, cada
   conta bancária, e o total. É `saldosDasContas` mais `saldoDoCaixa` de cada
   lugar, sem cálculo novo.
2. Vence hoje a pagar: as contas do Empório com `due_date` hoje ou antes e
   `status: pending`, somadas e listadas.
3. Vence hoje a receber: fiado com vencimento hoje ou antes, cheque com `good_for`
   hoje, cartão com `expected_on` hoje.
4. Fiado vencido: o total e a quantidade de clientes, a partir de
   `listarFiadoAction`.
5. Esperando aprovação (entrega 3) e Sem carimbo (entrega 3): nascem na
   entrega 3; na 1, o bloco não existe.

**Contas a pagar:** a lista de `listarContasAPagarAction`, por vencimento, com
a loja, o fornecedor ou a categoria, e o botão de pagar. Ver "O pagamento"
abaixo.

**Contas a receber:** o fiado por cliente (o que `/emporio/fiado` já mostra),
mais os cheques em carteira e os cartões a receber, por data. O recebimento do
fiado pelo Financeiro é **por Pix ou transferência na conta bancária**, sem
turno; o recebimento em dinheiro continua no caixa da loja, como hoje.
`receberFiadoAction` passa a aceitar o Financeiro (ação `dinheiro`) só quando
o lugar é uma conta.

**Posição de caixa:** a tabela do bloco 1 em tela própria, com o extrato do
lugar escolhido no período (é a base do carimbo da entrega 3). Na conta
bancária, o extrato lista os `CashMovement` **e** as parcelas de cartão
(`CardReceivable`) com `expected_on` no período, como linhas iguais: é o que
`saldosDasContas` soma, e é o que aparece no extrato do banco. Sem isso, a
maior fonte de diferença ficaria fora da tela.

### O pagamento do fornecedor dentro do Empório (fecha a 2.26)

- `listarContasAPagarAction` passa a listar a conta da compra: entry expense
  com `related_module: emporio` e `related_id` de uma `EmporioPurchase` não
  cancelada, além das que `SO_DO_EMPORIO` já aceita. A linha mostra o
  fornecedor e a loja.
- `pagarDespesasAction` aceita essa conta, com as mesmas regras: `from` é uma
  loja (gaveta, exige turno, checa `saldoDoCaixa`) ou uma conta bancária
  (checa `saldosDasContas`); cria `FinancialPayment`, fecha a entry e cria o
  `CashMovement` de saída. O Histórico grava `despesa.pagar` com o alvo da
  compra.
- **A compra à vista e a entrada da parcelada passam a dizer de onde saiu o
  dinheiro.** `criarCompraAction` recebe o lugar para a parte paga e cria o
  `CashMovement` correspondente na mesma transação. Sem saldo, recusa com
  `INSUFFICIENT_CASH`, como `pagarDespesasAction`. Origem nova em
  `CashMovementOrigin` (`pagamento_compra`) ou a `pagamento_despesa`
  reaproveitada: builder decide e documenta. As regras de lugar, por papel,
  são as mesmas do pagamento de despesa:
  - da **gaveta da loja**: exige turno aberto naquela loja, como a sangria.
    Quem lança a compra (Gestor, ou Vendedor com a chave `lancar_compra`) pode
    usar a gaveta da loja onde está;
  - da **conta bancária**: só quem passa em `gestor_da_loja` ou `dinheiro`. O
    Vendedor com a chave não tira dinheiro da conta;
  - **a nota de ontem, com o turno fechado,** entra como compra a prazo com
    vencimento na própria data e se paga em seguida pelas contas a pagar, de
    onde o dinheiro saiu de fato. Decisão minha: a alternativa (compra à vista
    da gaveta sem turno) recriaria o dinheiro que sai do nada.
- `cancelarCompraAction` continua recusando compra com parte paga
  (`PURCHASE_HAS_PAYMENT`): quem errou cancela o pagamento primeiro, quando
  esse caminho existir, ou corrige pela conferência de caixa. Nada muda aqui.
- **As compras à vista já lançadas pela Agromax** (desde 01/11) nasceram pagas
  sem movimento, então o saldo das gavetas e da conta está acima do real por
  esse valor. Decisão minha: **nenhum ajuste de dados em produção.** A
  conferência de caixa da gaveta e o saldo inicial da conta, que já existem,
  absorvem a diferença na primeira conferência depois do deploy, e o manual
  avisa. Mexer em dado real para reconstituir de onde saiu cada compra custa
  mais do que a diferença que corrige.

### O Empório fora do `/financeiro` do Tibé

- O `/financeiro` do Tibé e o resumo do Painel (`financial-summary.ts`) passam
  a filtrar sempre `establishment_id: null`. O seletor de área
  (`area-filtro.tsx`) e a chave `tibe:financeiro:area` do `localStorage` saem.
  O parâmetro `?area=` das seis rotas que o aceitam (`financial-entries`,
  `financial/dre`, `cash-flow`, `upcoming`, `report`, `report/link`)
  **continua aceito e passa a ser ignorado**, sempre fazenda, para não quebrar
  contrato; o `/docs/api` diz isso. Os handlers do agente do WhatsApp que
  resumem o financeiro ("quanto gastei") passam a forçar a fazenda também: o
  agente é da fazenda, e o Empório é outro sistema (Q222). Alertas e Meu Dia
  já filtram `establishment_id: null` e não mudam. A dívida 2.27 (filtro
  Fazenda/Empório/Tudo no Painel e no WhatsApp) é fechada como "não vai
  existir" em `dividas.md`.
- `registrarPagamentoAction`, `markEntryPaidAction`, `cancelEntryAction` e
  `postponeEntryDueDateAction` **recusam** entry com `establishment_id` não
  nulo ou `related_module: emporio`, com mensagem que aponta para o Empório
  ("Esta conta é do Empório: pague em Meu Empório > Financeiro."). As rotas
  `/api/v1/financial-entries/*` e `/api/v1/financial-payments` herdam a recusa.
- Adiar vencimento e cancelar uma conta do Empório passam a existir dentro do
  Empório: `adiarVencimentoAction` e `cancelarContaAction` (nomes do builder),
  exigindo `dinheiro`, registradas no Histórico (`despesa.adiar`,
  `despesa.cancelar` ou o que o catálogo ganhar). Cancelar conta já paga é
  recusado.

### Consequências da entrega 1

- Migração: enum `EmporioRole`; talvez `CashMovementOrigin`.
- `docs/api` (`src/app/(public)/docs/api/endpoints.ts`): rotas novas do
  financeiro do Empório e a recusa nova nas rotas do `/financeiro`.
- O manual do Empório ganha a parte do Financeiro (papel e casa).
- `scripts/cenario-demonstracao-emporio.ts` e `seed:demo` criam um usuário
  Financeiro e compras à vista com lugar do dinheiro.
- Dívida 2.26 fechada; 2.27 fechada como decisão.

---

## Entrega 2: crédito e cobrança

### Vencimento do fiado (Q223)

- Configurações do Empório (`EmporioSettings`) ganham **prazo padrão do fiado
  em dias** (padrão 30) e **dias de atraso para bloquear** (padrão 15).
- O cliente (`EmporioCustomer`) ganha **prazo próprio**, opcional, em uma de
  duas formas: dias depois da venda, ou dia fixo do mês ("fecha a conta todo
  dia 10"; no mês mais curto, o último dia, como `due_day` da fixa). Os nomes
  ficam com o builder. É este campo que um dia recebe "vence na safra" (uma
  data): o builder não constrói a data, mas não modela de um jeito que a
  impeça.
- Na venda com fiado, o vencimento sugerido é, nesta ordem: o informado na
  venda, o prazo do cliente, o prazo padrão da conta. O Caixa pode mudar na
  venda, como hoje. O `due_date` da entry e do `EmporioSalePayment` passam a
  ser sempre preenchidos.
- **Fiado antigo sem vencimento próprio** (entry cuja `due_date` é a data da
  venda porque o Caixa não informou; o `EmporioSalePayment.due_date` nulo é o
  sinal) passa a vencer na data da venda mais o prazo padrão. **É regra de
  leitura, não `UPDATE` em produção:** `entradasAbertas`, `listarFiadoAction`,
  o bloqueio e a cobrança calculam o vencimento efetivo na hora, lendo o prazo
  configurado. Assim a regra acompanha a configuração quando o Financeiro a
  mudar, e nenhum dado real da Agromax é reescrito. Decisão minha, aceita pelo
  usuário na parte do prazo; a forma (leitura) é escolha desta spec.

### Limite de crédito (Q219, Q224)

- Configurações ganham **limite padrão de fiado em reais**, opcional. Nulo
  quer dizer "sem limite de valor" até o Financeiro definir: assim o deploy
  não muda o comportamento da Agromax antes de alguém decidir.
- O cliente ganha **limite próprio**, opcional, que vence o padrão. Zero quer
  dizer "não vende fiado para este cliente".
- Quem define os dois é quem passa em `dinheiro`. Mudar limite grava no
  Histórico (`fiado.limite`) com o valor antigo e o novo.
- **Saldo do cliente** para o limite: a soma do que ele deve em fiado em
  aberto em todas as lojas (o `owed` de `listarFiadoAction`), mais o que esta
  venda acrescenta, mais as parcelas de acordo em aberto (entrega 3).

### Bloqueio (Q219)

Na venda com fiado (`criarVendaAction`, e o faturamento do orçamento que chega
nela), antes de gravar:

1. Se o cliente tem fiado vencido há mais dias que o configurado, em qualquer
   loja: recusa `FIADO_BLOQUEADO` (409), mensagem "Cliente com fiado vencido há
   N dias. Peça a liberação ao gestor." com `field: payments`.
2. Senão, se há limite (do cliente ou padrão) e o saldo mais a venda passa do
   limite: recusa `LIMITE_EXCEDIDO` (409), dizendo o limite e quanto falta.
3. Uma **liberação** válida para o cliente passa pelos dois.

O bloqueio vale para todas as lojas da conta, porque o cliente é um só. As
outras formas de pagamento da mesma venda não são afetadas: a recusa é do
fiado, e a tela deixa o Caixa trocar a forma.

### Liberação pontual (Q224)

- Quem passa em `gestor_da_loja` (na loja da venda), ou acima, cria uma
  liberação para o cliente: motivo obrigatório, vale para **uma venda** e
  **até o fim do dia**. Model novo (nome do builder: `EmporioCreditRelease` ou
  parecido) com cliente, loja, quem liberou, motivo, validade e a venda que a
  consumiu.
- A venda que usa a liberação grava a referência; a liberação não se reutiliza.
- Histórico: `fiado.liberar`, com o motivo, aparece no Histórico da loja e na
  ficha do cliente.
- Onde fica o botão: na recusa da venda (o Caixa vê a mensagem e um atalho
  "Pedir liberação") e na ficha do cliente. Como o Gestor se identifica para
  liberar no aparelho do Caixa é desenho do builder, dentro do que o sistema
  já faz para a sangria confirmada pelo gestor; **não** pode ser o Caixa
  digitando a senha do Gestor no mesmo formulário da venda.

### A ficha de crédito do cliente

Na ficha do cliente do Empório: limite (próprio ou padrão), prazo, saldo em
aberto por loja e total, vencido mais antigo, liberações recentes, e os
botões de mudar limite e prazo (`dinheiro`) e de liberar (`gestor_da_loja`).

### Lista de cobrança (Q225)

Tela em `/emporio/financeiro`, por cliente, com: total vencido, dias de atraso
do mais antigo, telefone, loja(s) do fiado, e o botão **Cobrar no WhatsApp**,
que abre `https://wa.me/55<telefone>?text=<mensagem>` no aparelho. A mensagem
é o texto padrão da conta (Configurações do Empório, com os marcadores
`{nome}`, `{valor}` e `{dias}` ou o que o builder definir), editável. Sem
telefone no cadastro, o botão explica o que falta. Ordenação: mais atrasado
primeiro; filtro por loja e por faixa de atraso.

Clicar em "Cobrar" grava `fiado.cobrar` no Histórico (com a data), para a
ficha do cliente mostrar quando foi cobrado. É o único registro da cobrança:
não há envio pelo sistema.

### Consequências da entrega 2

- Migração: campos em `EmporioSettings`, `EmporioCustomer`, model de
  liberação.
- Contrato: campos novos nas rotas de cliente e de configurações; a recusa
  nova na rota de venda; rota de liberação.
- Manual: Fiado ganha limite, bloqueio, liberação e cobrança.

---

## Entrega 3: acordo, alçada e carimbo

### Acordo (Q230, Q233)

- Quem faz: só o Financeiro e o Dono (Q233). O Gerente geral passa em
  `dinheiro` para tudo o mais, mas **não faz acordo**: é a única exceção da
  ação, e o builder a trata de forma explícita na checagem.
- O acordo escolhe os fiados em aberto do cliente (todos ou alguns, vencidos
  ou não) e define parcelas: quantidade, valores e datas (a soma das parcelas
  é igual à soma dos saldos escolhidos, sem juros, Q218). Model novo (nome do
  builder: `EmporioCreditAgreement` e parcelas) com cliente, quem fez, data,
  observação e as entries de origem.
- **O que acontece com as entries de origem:** saem da cobrança e do cálculo
  de vencido, mas o total a receber do cliente não muda. Mecanismo sugerido:
  cada parcela é um `FinancialEntry` income pendente (`related_module:
  emporio`, `related_id` do acordo, categoria própria, `emporio_customer_id`,
  `establishment_id` da loja do fiado mais antigo ou nulo), e as entries de
  origem são fechadas com `status: cancelled` e a referência ao acordo em
  `notes` ou coluna própria. O builder pode preferir outro mecanismo, desde
  que: o total a receber antes e depois do acordo seja igual; a venda original
  continue ligada ao cliente e ao acordo; `listarFiadoAction` e o recebimento
  passem a incluir as parcelas; e o Resultado da Loja não mude (ele lê a venda,
  não a entry).
- **Bloqueio com acordo:** a parcela vencida bloqueia como um fiado vencido.
  Acordo em dia desbloqueia: o cliente compra fiado dentro do limite, e o
  saldo para o limite inclui as parcelas em aberto.
- Receber a parcela usa o mesmo recebimento do fiado (mais antiga primeiro; na entrega 3 ficou pelo vencimento efetivo, Q238 da spec do módulo, confirmada pelo usuário em 08/11).
- **Venda cuja entry entrou num acordo:** a devolução com abatimento no fiado
  (`devolverVendaAction` com `abater_fiado`) abate na parcela mais antiga em
  aberto do acordo, e o total do acordo diminui; se o abatimento passar do que
  resta, o excedente segue a regra que a devolução já tem para fiado quitado.
  O cancelamento da venda (`cancelarVendaAction`) é **recusado** enquanto a
  venda estiver em acordo, com mensagem que aponta para o acordo. Decisão
  minha: o acordo é um compromisso assinado com o cliente, e desfazer uma
  venda por baixo dele exigiria refazer o acordo.
- Histórico: `fiado.acordo`, com as origens e as parcelas. A ficha do cliente
  mostra o acordo e o andamento.

### Alçada (Q227, Q234)

- Configurações ganham **teto de pagamento sem aprovação**, opcional. Nulo é
  "sem alçada".
- Quando quem paga não é o Dono nem o Gerente geral, e o total do pagamento
  passa do teto, `pagarDespesasAction` **não paga**: cria um **pedido de
  pagamento** (model novo, nome do builder) com as contas, o lugar de onde
  sairia o dinheiro, o valor, quem pediu e o estado `pendente`. A resposta da
  action diz que ficou esperando aprovação.
- Aviso: `notify` com urgência `conversa` (a que garante o WhatsApp) para cada
  Dono (`OWNER` ativo) e Gerente geral com `User.phone`: valor, fornecedor ou
  categoria, vencimento e o link da fila. Sem telefone, o aviso é só a fila.
- A fila **Esperando aprovação** aparece na tela "Hoje" do Dono e do Gerente
  geral e no `/emporio/financeiro`. Aprovar executa o pagamento naquele
  momento, com a checagem de saldo do lugar; se faltar saldo, a aprovação
  falha e o pedido continua pendente com o motivo. Recusar exige motivo, e o
  pedido fica `recusado`; a conta continua pendente.
- Pedido pendente trava a conta: ela não pode ser paga por outro caminho nem
  cancelada até ser aprovada ou recusada.
- Histórico: `pagamento.pedir`, `pagamento.aprovar`, `pagamento.recusar`.

### Carimbo de conciliação (Q226)

- `CashMovement` em **conta bancária** e `CardReceivable` ganham
  `reconciled_at` e `reconciled_by_user_id` (nomes do builder): as duas são as
  linhas do extrato da conta (entrega 1), e as duas se carimbam. Movimento de
  gaveta e de gerência não se concilia: o que se confere no extrato é o banco.
- Tela do extrato da conta (a Posição de caixa da entrega 1) ganha, por
  período: cada linha com origem, loja, valor e um botão de carimbar;
  filtro "só sem carimbo"; o total sem carimbo no período. Carimbar e
  descarimbar exigem `dinheiro` e gravam `conciliacao.carimbar` e
  `conciliacao.descarimbar`.
- A tela "Hoje" ganha o bloco **Sem carimbo** (total e quantidade, nos últimos
  30 dias).
- É só isso. Importar OFX e casar NSU da adquirente são dívidas.

### Consequências da entrega 3

- Migração: models de acordo e de pedido de pagamento; colunas no
  `CashMovement`; campo em `EmporioSettings`.
- Contrato: rotas de acordo, de aprovação e de carimbo.
- Manual: Acordo, aprovação e conferência do extrato.

---

## Entrega 4: projeção, relatórios e rateio

### Fluxo de caixa projetado (Q228)

Tela em `/emporio/financeiro`, por loja ou todas, em 30, 60 e 90 dias a partir
de hoje, por semana:

- **Saldo de hoje:** a posição de caixa (todos os lugares).
- **A receber:** fiado e parcelas de acordo pelo `due_date`; cartão pelo
  `expected_on` do `CardReceivable` não cancelado e ainda não recebido; cheque
  pelo `good_for` dos cheques `recebido` ou `depositado`. O vencido entra na
  primeira semana.
- **A pagar:** entries expense pendentes do Empório pelo `due_date`, mais as
  ocorrências de despesa fixa dos meses dentro da janela que ainda não
  nasceram (calculadas pelo modelo, sem criar nada).
- **Saldo projetado** ao fim de cada semana. Só leitura.

### Relatórios (Q235)

Na página Relatórios do Empório ou na casa do financeiro (builder decide, sem
duplicar), todos com filtro por loja e período:

- **A receber por idade:** por cliente e no total, nas faixas em dia, 1 a 15,
  16 a 30, mais de 30 dias de atraso.
- **A pagar por vencimento:** por semana e por categoria ou fornecedor,
  vencido em destaque.
- **Posição de caixa por lugar**, com o movimento do período por origem.

O Resultado da Loja não muda.

### Rateio automático (Q236)

- `FixedSplitKind` ganha `faturamento`, `area` e `funcionarios`.
- A loja (`Establishment`) ganha **área em m²** e **número de funcionários**,
  informados à mão nas configurações da loja (`gestor_da_loja` ou `dinheiro`).
  Decisão minha, aceita pelo usuário: campo informado, não derivado da equipe
  cadastrada.
- O rateio automático é calculado **quando a ocorrência do mês nasce**, não a
  cada venda. Para `faturamento`, a base é o faturamento líquido (`net_amount`
  das vendas concluídas menos devoluções, a mesma soma do Resultado) do **mês
  anterior completo** de cada loja: quando a ocorrência nasce, o mês corrente
  ainda não aconteceu. Decisão minha. Loja sem área, sem funcionários ou sem
  faturamento no mês anterior recebe zero e a tela avisa; o centavo que sobra
  fica na primeira loja, como hoje.
- **Isso muda como as ocorrências nascem nos critérios automáticos.** Hoje
  elas nascem em lote de 12 meses, e uma base congelada por 12 meses não é
  rateio por faturamento. Nos critérios `faturamento`, `area` e
  `funcionarios`, o modelo gera **só a ocorrência do mês corrente**; a do mês
  seguinte nasce no primeiro acesso do Empório naquele mês (gatilho de
  leitura, o mesmo mecanismo que a renovação `needs_renewal` já usa), com a
  base daquele momento. `percentual` e `valor` continuam em lote de 12, como
  hoje. Editar o modelo recalcula só as futuras não pagas que existem. O fluxo
  projetado (acima) estima as ocorrências que ainda não nasceram com a base
  atual e diz que é estimativa. Decisão minha.
- O modelo de despesa fixa deixa de exigir `FixedExpenseSplit` quando o
  critério é automático; a ocorrência grava o valor por loja como hoje, então
  o Resultado não muda.

### Consequências da entrega 4

- Migração: enum `FixedSplitKind`, colunas em `Establishment`.
- Contrato: rotas de projeção e relatórios; campos novos da loja.
- Manual: Fluxo projetado, relatórios e os critérios de rateio.

### Decisões da execução da entrega 4

Decididas pelo agente, a confirmar com o usuário (registro completo na spec do módulo):

- Os relatórios ficam na casa do financeiro, aba Relatórios, com uma linha de ligação na página Relatórios (Q239; a spec deixava ao builder).
- O critério automático divide entre todas as lojas ativas no momento em que a ocorrência nasce, sem `FixedExpenseSplit` de verdade, e exige ver todas as lojas (`CRITERIO_SEM_LOJAS`, Q240). Base zero em todas as lojas vira partes iguais com aviso.
- O a receber por idade é o retrato de hoje, sem período (Q241).
- Por loja, a projeção e a posição por lugar deixam a conta bancária de fora (Q242).
- No a pagar por vencimento, o vencido (antes de hoje) entra sempre na primeira semana, em destaque, mesmo anterior ao início do período (Q243): "vencido em destaque" não se cumpria com o padrão `de` igual a hoje.
- O mês do modelo conta como nascido quando já tem ocorrência (a base que muda no meio do mês não cobra a mais), e `renovar` é inócuo em modelo automático.

---

## Dívidas registradas nesta spec

Entram em `docs/agents/dividas.md`, com as decisões que as geraram:

- Conciliação por OFX do banco e por NSU com o arquivo da adquirente (Q226).
  Falta saber qual adquirente a Agromax usa.
- Fiado descontado por expectativa de recebimento no fluxo projetado (Q228).
- DRE formal em três blocos, por loja e consolidada, quando a nota fiscal
  entrar (Q235).
- Juros e multa no fiado: campo reservado, regra desligada (Q218).
- Crediário com parcelas na venda e vencimento na safra: o prazo por cliente
  e o acordo deixam o lugar (Q214, Q223, Q230).
- Lembrete automático de cobrança pelo WhatsApp (Q225).
- Importação do XML da nota do fornecedor, na frente de nota fiscal (Q229).

---

## Como entregar

- **Quatro planos, um por entrega, na ordem.** Cada plano com a ordem do
  CLAUDE.md (action, rota, tela), uma branch por plano, merge na `main` só
  com autorização do usuário a cada vez. Cada entrega vai a produção sozinha e
  é usada pela Agromax antes da seguinte.
- Toda entrega muda o banco: migração no Docker, testes, cópia da produção no
  Docker, e só então o Neon (URL Direct), com autorização.
- Toda action nova de escrita do Empório registra no Histórico (conferência
  19). Ações novas entram em `ACOES_DO_HISTORICO`.
- Suítes novas com o próximo número livre de `test:mNN` (a próxima é `m98`),
  uma por entrega. Cobrir no mínimo:
  - Entrega 1: o Financeiro vê todas as lojas e nenhuma página do Tibé; não
    vende nem edita produto; cria conta bancária; a conta da compra aparece em
    contas a pagar e se paga da conta com `CashMovement`; compra à vista sem
    saldo recusada; o `/financeiro` do Tibé recusa quitar, cancelar e adiar
    entry do Empório; o resumo do Painel não soma o Empório; isolamento entre
    contas.
  - Entrega 2: vencimento sugerido pela ordem venda, cliente, conta; fiado
    antigo sem data passa a vencer no padrão; bloqueio por atraso vale na
    outra loja; limite por cliente vence o padrão; limite zero recusa; a
    liberação passa uma venda e só uma; liberação do Gestor em loja que não é
    dele recusada; a lista de cobrança ordena pelo mais atrasado e gera o link
    certo; sem telefone, sem link.
  - Entrega 3: total a receber igual antes e depois do acordo; parcela
    vencida bloqueia; acordo em dia desbloqueia; Gerente geral não faz acordo;
    pagamento acima do teto vira pedido e não move dinheiro; aprovar sem saldo
    falha e mantém o pedido; conta com pedido pendente não se paga por outro
    caminho; carimbo só em movimento de conta.
  - Entrega 4: projeção soma fiado, cartão, cheque e fixas futuras nas semanas
    certas; faixas de idade; rateio por faturamento usa o mês anterior; loja
    sem área recebe zero com aviso; o Resultado da Loja não muda com o critério
    novo.
- Validação viva em roteiros de `scripts/navegador/`, nos dois sentidos, por
  entrega: entrar como Financeiro e cair na tela "Hoje"; pagar a conta da
  compra e ver o saldo da conta cair; vender fiado para cliente bloqueado e
  ver a recusa, liberar e vender; fazer acordo e cobrar; aprovar um pagamento
  pela fila. Ver no celular.
- O manual do Empório (`/manual`) ganha a parte do Financeiro a cada entrega,
  e o roteiro `manual-emporio` regrava os PNGs.
- A tabela de decisões de `docs/specs/module-39-meu-emporio.md` recebe a Q214
  à Q237 no primeiro plano.

## O que fica com o builder

- Os nomes de models, colunas, rotas, ações do Histórico e códigos de recusa
  não fixados acima.
- O mecanismo das entries de origem no acordo, dentro dos quatro requisitos.
- Como o Gestor se identifica para liberar no aparelho do Caixa, sem senha
  digitada no formulário da venda.
- Como o Financeiro é redirecionado para a casa depois do login.
- Se os relatórios da entrega 4 ficam em Relatórios ou na casa do financeiro.
- O desenho das telas, dentro do kit e dos filtros que já existem.
- Se a compra à vista reaproveita `pagamento_despesa` ou ganha origem própria.
- Se `editarConfiguracoesAction` se divide ou relaxa a checagem para os
  campos do dinheiro.
- Como o gatilho de leitura do rateio automático se encaixa no que a
  renovação já faz.
