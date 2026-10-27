# Módulo 39: Meu Empório

**Origem:** o documento do cliente em `docs/area-meu-emporio/` ("Área Funcional:
Meu Empório", versão 0.1, 28 seções e 18 critérios de aceitação). É um `.doc`
binário antigo (não `.docx`), então o `unzip` das outras specs não serve. Leia
com o LibreOffice, gravando fora do repositório:

```
"C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to "txt:Text (encoded):UTF8" --outdir <scratchpad> "<caminho do .doc>"
```

O Word por COM não está registrado nesta máquina.

**Decisões tomadas com o usuário em 2026-10-27**, por entrevista em cinco
rodadas (Q1 a Q49), antes de qualquer código. A seção 3 registra cada uma com o
motivo: é o motivo que permite revisitar a decisão sem repetir a discussão.

> O documento do cliente se declara "em construção, sujeito a análise e
> alterações". Se a Equipe TIBÉ alterá-lo, confira esta spec contra a versão
> nova antes de continuar. O `.doc` não é editado por nós (Q49).

---

## 1. O que a área é, e o que ela não é

Área **opcional** para o pequeno comerciante agropecuário: de uma loja só até
uma Central de Distribuição com vários Pontos de Venda. O princípio do §1 do
documento: **o comerciante informa o que aconteceu, e o Tibé faz as
consequências** (baixa de estoque, conta a receber, caixa, resultado).

O §1 é explícito: **não é um ERP**. O §24 lista o que fica de fora (ordem de
produção, etapas de fabricação, folha completa, DRE formal, fidelidade). Esta
spec acrescenta as exclusões da seção 9.

O que o comerciante precisa responder (§2): o que tem e onde está, quanto cada
loja comprou e vendeu, quanto custa e por quanto vende, quanto tem a receber e
a pagar, quanto há em cada caixa, e se cada loja se paga.

## 2. Como a área é liberada

O Empório entra **só em contas escolhidas**. Na fase de teste, só na **Da
Mata**, e só para o Owner (o usuário). São duas camadas, com papéis diferentes
(Q4, Q12):

| camada | pergunta que responde | quem liga |
|---|---|---|
| `TenantFeature` (tabela nova) | "este recurso está liberado para esta conta?" | só a Plataforma |
| `TenantProfile` com `emporio` | "esta conta opera como comércio?" | criado junto com a liberação |

A tabela de recursos é **genérica**: serve para qualquer módulo futuro em
liberação controlada. Ela aceita uma **lista opcional de usuários** (Q14):
com a lista, só eles veem; sem a lista, a conta inteira vê. É o mesmo
princípio do canário do WhatsApp.

**Recurso desligado (Q13):** o menu não mostra, a página devolve 404 e a rota
da API devolve 404, como se não existisse. Os dados ficam: religar traz tudo de
volta. É o critério "Usar TIBÉ sem Meu Empório" do §25.

**Conta só de Empório (Q6, Q16, Q17):** existe, e é a que tem o perfil
`emporio` sem o perfil `fazenda`. Na primeira versão ela só nasce pela
Plataforma; o cadastro público continua oferecendo fazenda e prestador. Ela vê:
Meu Empório, Financeiro, Meu Dia, Contatos, Lista de Compra, Calculadoras e
Configurações.

⚠️ **Contatos e Lista de Compra hoje redirecionam quem não tem o perfil
`fazenda`** (`src/app/(dashboard)/contatos/page.tsx`, linha 43, e
`src/app/(dashboard)/lista-de-compra/page.tsx`, linha 44). As duas passam a
abrir também para `emporio`. Na Lista de Compra, marcar como comprado exige
fazenda (`src/lib/actions/shopping-items.ts`, `FAZENDA_NECESSARIA`): para o
Empório, esse passo aceita um estabelecimento. O menu decide pelos perfis em
`src/lib/nav.ts`.

**Cobrança (Q7):** nenhuma por enquanto. O preço do Empório é decidido quando
ele sair do teste.

**A Da Mata como conta de teste (Q5, Q15):** decisão do usuário. Os dados da
Da Mata são de teste, então o que o Empório lançar lá não precisa de limpeza.
Mesmo assim, o Financeiro separa Fazenda de Empório (Q28), porque o primeiro
cliente real com as duas coisas vai precisar.

---

## 3. Decisões

| # | decisão | motivo |
|---|---|---|
| Q1 | **Estabelecimento é entidade nova.** O estoque aceita fazenda OU estabelecimento, exatamente um dos dois, com uma regra de saldo só | reaproveitar `Property` poria a "Loja 1" nos seletores de rebanho, pasto, máquinas e leite; um livro-razão separado seriam duas regras de saldo |
| Q2 | Estoque da fazenda e do Empório **não se cruzam** na primeira versão. O cadastro de produto é compartilhado | o documento não pede o cruzamento, e ele mexe no custo do rebanho e no resultado da fazenda (§21.1). Dívida 2.15 |
| Q3 | **Unidade-base por produto** (kg, L ou unidade). Cada apresentação diz quanto vale nela ("saca = 10 kg"). O banco guarda na unidade-base | é o único caminho sem erro acumulado (§7.2, §23.3), e permite saca de 10 kg num produto e de 40 kg em outro |
| Q4 | **Tabela genérica de recursos** (`TenantFeature`), ligada só pela Plataforma | o usuário quer o mecanismo pronto para os próximos módulos em teste |
| Q5 | Conta de teste: **Da Mata** | decisão do usuário |
| Q6 | **Pode existir Empório sem fazenda**, e com fazenda | decisão do usuário |
| Q7 | **Sem cobrança** na fase de teste | a liberação já é controlada pela Plataforma |
| Q8 | Papéis: de-para (OWNER e ADMIN = Proprietário; OPERADOR = Atendente), mais **vínculo opcional usuário-estabelecimento**. Quem tem vínculo só vê e opera os seus | atende "consultar resultados de outras lojas" (§20) sem um segundo sistema de papéis |
| Q9 | **Sem nota fiscal, receituário ou lote obrigatório.** Lote e validade existem como campo opcional por produto | nota fiscal é projeto à parte (certificado, SEFAZ por estado). Dívida 2.21: precisa existir antes de liberar para quem vende defensivo |
| Q10 | **Sem WhatsApp** na primeira versão. As actions ficam prontas para o agente | o classificador do n8n está congelado; a solução para o Empório será estudada numa versão própria. Dívida 2.16 |
| Q11 | Sinônimos numa **lista fixa no código**, mais a busca sem acento que já existe | a "Base Rural" do §5.1 não existe; sinônimo pesa mais na linguagem natural, que vem com o WhatsApp. Dívida 2.17 |
| Q12 | **Duas camadas**: o recurso libera, o perfil diz que a conta opera como comércio | a tabela de recursos serve a qualquer módulo; o perfil já decide o menu |
| Q13 | Desligado = **404 na página e na API**, dados guardados | §3.1 e o critério "Usar TIBÉ sem Meu Empório" |
| Q14 | Liberação com **lista opcional de usuários**; no teste, só o Owner | a Da Mata tem outros usuários que não sabem do teste |
| Q15 | Dados de teste na Da Mata **sem limpeza** | decisão do usuário: a conta é de teste |
| Q16 | Conta só de Empório **só pela Plataforma** | uma conta pública só de Empório precisaria de plano e preço (Q7). Dívida 2.20 |
| Q17 | A conta só de Empório vê Empório, Financeiro, Meu Dia, Contatos, Lista de Compra, Calculadoras e Configurações | o §21 integra com essas áreas |
| Q18 | **Estoque negativo bloqueado**, com liberação pelo OWNER por estabelecimento | é o "não autorizado" do §6.4; travar o balcão quando a compra ainda não foi lançada faz o comerciante abandonar o sistema |
| Q19 | **Transferência em duas etapas**: a saída deixa "em trânsito", o destino confirma. Diferença na chegada vira perda na origem. Cancelar antes do recebimento devolve à origem | §4.3 e o alerta "transferência aguardando recebimento" do §21.3. Quem cuida dos dois lados confirma na hora |
| Q20 | **Saca lacrada e avulsa separadas** já na primeira versão | pedido do cliente (§7.3); decisão do usuário de aplicar, embora seja o item mais caro do documento |
| Q21 | **Custo médio ponderado por estabelecimento**, recalculado a cada entrada com custo. A transferência leva o custo médio da origem. Entrada sem custo marca o resultado como estimado | critério inicial do §18.1; "não apresentar resultado aparentemente preciso" (§19) |
| Q22 | **Rendimento opcional** na composição. Vazio = 100% | §6.4; é um número: consumido = quantidade ÷ rendimento |
| Q23 | **Cartão:** regra por estabelecimento e forma (débito, crédito à vista, crédito parcelado) com taxa % e prazo. O valor fica "a receber do cartão" e baixa sozinho na data prevista, uma data por parcela | separa venda de dinheiro disponível (§12.5) sem virar conciliação bancária |
| Q24 | **Cheque:** recebido, depositado, compensado ou devolvido. O devolvido **reabre a dívida** do cliente | cheque devolvido é o caso real que mais dói |
| Q25 | **Despesa fixa é um modelo** no Empório que gera os lançamentos reais no Financeiro a cada período, um por estabelecimento quando é dividida | o Financeiro não tem recorrência nem rateio (conferido no código em 27/10); o lançamento continua sendo a única verdade do dinheiro |
| Q26 | **Ponto de equilíbrio** pela margem do mês corrente; com menos de 10 vendas, os últimos 30 dias; sem venda, "sem dados ainda"; margem zero ou negativa diz que a loja não se paga com os preços atuais | não dá número absurdo no dia 2 e não finge precisão |
| Q27 | **Desconto** reduz a venda líquida e não entra no "Vendeu, Pagou". Limite % por estabelecimento; acima dele só OWNER ou ADMIN. Grava quem deu | §8 e §20 sem travar o balcão |
| Q28 | No Financeiro: `RelatedModule` **`emporio`**, campo de **estabelecimento** e filtro **"Fazenda / Empório / Tudo"** | §21.1; o Resultado da Loja já lê por estabelecimento |
| Q29 | A separação lacrado/avulso **liga por produto**, e vem ligada quando há apresentação fechada vendida também a granel | "mínimo possível de intervenção" (§7.3) |
| Q30 | A saca **abre sozinha** na venda a granel, como movimentação vinculada à venda | §7.3 literal |
| Q31 | Compra e produto feito na loja **entram lacrados**. A transferência leva lacrado e avulso separados (padrão: lacrado). A contagem pergunta **as duas quantidades**. Venda de saca fechada sem saca lacrada é **recusada** | a recusa da venda impossível é o motivo do §7.3 existir; a contagem é quando se descobre a verdade física |
| Q32 | Só o **OWNER** libera o negativo. A venda nesse caso usa o último custo médio e fica marcada como **custo provisório**; quando a compra entra, a venda antiga **não muda** | §23.4 proíbe mudar operação concluída; a marca atende o "estimado" do §17.2 |
| Q33 | Confirma o recebimento **quem tem acesso ao destino**. Parada há mais de **2 dias**, a transferência aparece no Meu Dia de quem tem acesso aos dois lados | quem recebe a mercadoria é quem está na loja |
| Q34 | **Três lugares para o dinheiro:** a **gaveta** de cada estabelecimento, as **contas bancárias** da conta do cliente (compartilháveis entre lojas, recebem PIX e débito) e o **a receber do cartão** | é a distinção do §14.1; duas lojas com um CNPJ é o caso comum |
| Q35 | **Conferência de caixa livre**, a qualquer momento, com justificativa da diferença. Um dia com movimento sem conferência gera aviso no Meu Dia | abertura e fechamento obrigatórios por turno travam o balcão (§14.2, "simples") |
| Q36 | **Cancelamento total** estorna tudo, só OWNER ou ADMIN. **Devolução parcial** é operação nova ligada à venda (a mercadoria volta, ou vira perda se avariada). **Troca** é devolução mais venda nova, ligadas. Nada é apagado | o critério "Cancelar ou devolver uma venda" pede as duas |
| Q37 | **Fiado exige cliente** cadastrado em Contatos, com cadastro rápido na venda. Vencimento opcional, sem juros nem multa | sem cliente não existe "José pagou R$ 100 do que devia" (§12.4) |
| Q38 | A compra pode ser **registrada antes de chegar**: a conta a pagar nasce na hora, o estoque entra no recebimento. Padrão: "já recebi". A pendente conta na sugestão de reposição | sem isso o item 4 do §11.4 (não duplicar a sugestão) não funciona |
| Q39 | **Parcelas informadas na compra** (entrada + N), uma conta a pagar por parcela | padrão que as Negociações já usam; cada vencimento aparece no Meu Dia |
| Q40 | O preço cadastrado **nunca muda sozinho**. Quando o custo sobe, a tela avisa e mostra o novo sugerido; o comerciante aplica um a um ou em lote | liberdade comercial (§10.3) |
| Q41 | **"Vendeu, Pagou":** a despesa é reconhecida na venda (entra na margem) e só sai do caixa quando paga. Taxa de cartão abate do a receber; comissão e entrega viram conta a pagar; embalagem cadastrada sai do estoque. O valor real corrige o lançamento | distinção literal do §16.4, sem saída de dinheiro fictícia |
| Q42 | Empório e **Negociações não se cruzam** | a Negociação foi desenhada para gado e insumo de fazenda; o balcão precisa de uma venda de dez segundos. Entra na dívida 2.15 |
| Q43 | Cada entrada de produto feito na loja **guarda uma cópia** da composição usada. Faltando componente, a entrada é recusada (salvo negativo liberado) | resolve o §6.4 com menos estrutura que versionar |
| Q44 | Receita da Calculadora como composição: **F5** | o §21.5 diz "poderão auxiliar" |
| Q45 | **Lista de primeiros passos** abrindo os formulários normais. Estoque e fiado iniciais entram como movimentação de **implantação** | importação por planilha é onde mais aparece dado sujo. Dívida 2.18 |
| Q46 | **Mínimo e máximo por produto e estabelecimento**, em tabela própria. O `minimum_stock` da fazenda continua | não mexe num alerta em produção; coerente com a Q2 |
| Q47 | A conta bancária é cadastro da **conta do cliente**, mas só o Empório a usa | mexer no pagamento da fazenda abre telas e o WhatsApp. Dívida 2.19 |
| Q48 | **Sete fases** (seção 6), com aprovação do usuário ao fim de cada uma | a venda precisa de estoque e custo para nascer com margem |
| Q49 | As decisões ficam **nesta spec**; as dívidas também no `dividas.md`; o `.doc` não muda | a v0.2 do documento do cliente pode ser gerada depois, sem retrabalho |

---

## 4. Modelo de dados proposto

**É proposta, não contrato.** O `servidor-dados` confirma no início de cada
fase, e a mudança de nome ou de forma é registrada aqui. O que **não** muda
são os invariantes:

- **Nenhum saldo é gravado** (invariante 2): nem de estoque, nem de caixa, nem
  de lacrado ou avulso, nem de mercadoria em trânsito. Tudo é soma de
  movimentações não canceladas.
- **Todo model com `tenant_id` entra em `TENANT_SCOPED_MODELS`**
  (`src/lib/prisma.ts`), e `npm run test:isolation` reprova se esquecer.
- **Toda operação guarda os critérios do momento** (§23.4): preço, custo
  médio, taxa de cartão, regra do "Vendeu, Pagou", composição. Mudar a regra
  depois não mexe no passado.
- **Operação composta é atômica** (§23.1): a entrada de produto feito na loja,
  a venda que abre uma saca, a venda com pagamento misto. Uma transação, ou
  nada.
- **Idempotência** (§23.2): toda escrita do Empório aceita uma chave de
  operação, para que o reenvio (rede caída, botão clicado duas vezes, e depois
  o WhatsApp) não duplique.
- **Toda escrita grava quem e quando** (§13, §20).

### 4.1 Liberação

| model | campos principais |
|---|---|
| `TenantFeature` | `tenant_id`, `feature_key` (`emporio`), `enabled_at`, `disabled_at`, quem ligou |
| `TenantFeatureUser` | `tenant_feature_id`, `user_id` (lista vazia = conta inteira) |
| `ProfileType` | ganha `emporio` |

A checagem fica num ponto só (um `requireFeature("emporio")` usado pela
página, pela rota e pelo menu), para que o 404 da Q13 não dependa de cada tela
lembrar.

### 4.2 Estabelecimento e catálogo

| model | campos principais |
|---|---|
| `Establishment` | `name`, `kind` (`central`, `ponto_venda`), endereço, responsável, `archived_at`, `allow_negative_stock`, `max_discount_pct`, `default_expense_pct`, `default_profit_pct` |
| `UserEstablishment` | `user_id`, `establishment_id` (sem vínculo = vê todos) |
| `EmporioProduct` | `product_id` (1:1 com `Product`), `base_unit` (kg, L, unidade), `track_sealed`, `track_lot`, `track_expiry` |
| `ProductPresentation` | `product_id`, nome ("Saca 10 kg", "Quilo"), `base_qty` (quanto vale na unidade-base), `is_sealed_package`, ativo |
| `PresentationPrice` | `establishment_id`, `presentation_id`, `price`, exceções opcionais de % de despesas e de lucro |
| `Composition` | `product_id`, `reference_qty`, `yield_pct` opcional |
| `CompositionItem` | `composition_id`, componente, quantidade |
| `StockLimit` | `establishment_id`, `product_id`, `min_qty`, `max_qty` |

O cadastro básico continua em `Product` (§5.1); a configuração comercial é
toda opcional, e o produto simples não pede nada além do básico (§25, primeiro
critério).

### 4.3 Estoque

`StockMovement` ganha:
- `establishment_id`, e `property_id` passa a ser anulável, com `CHECK` de
  exatamente um dos dois;
- `package_state` (`lacrado`, `avulso` ou nulo para quem não separa);
- `unit_cost` (custo na unidade-base no momento) e um vínculo de operação, que
  amarra as movimentações de uma mesma operação;
- tipos novos em `StockMovementType`: transferência (saída e entrada),
  produção (entrada do produto e consumo do componente), abertura de
  embalagem, devolução, perda e implantação.

⚠️ **Precisão:** hoje `quantity` é `Decimal(14,3)` na unidade do produto. Na
unidade-base, 3 casas são 1 g, o que basta para venda, mas a abertura de
embalagem e o rendimento geram dízimas. A F0 decide entre ampliar a coluna
(alargar é seguro) e arredondar na borda. A regra do §23.3 é que a soma nunca
derive.

⚠️ **Risco que a F0 precisa fechar antes de mexer:** todo leitor atual de
`StockMovement` que soma sem filtrar por `property_id` passaria a contar o
estoque das lojas. Os leitores precisam ser auditados um a um (estoque da
fazenda, Negociações, confinamento, máquinas, alertas, WhatsApp), e uma suíte
prova que a fazenda não enxerga a loja.

O custo médio por estabelecimento é derivado das entradas com custo; o que fica
gravado é o `unit_cost` de cada saída, como registro do momento (§23.4), não um
saldo.

| model | para quê |
|---|---|
| `StockTransfer` | origem, destino, situação (`em_transito`, `recebida`, `cancelada`), quem enviou e quem recebeu. As quantidades vivem nas movimentações |
| `ProductionEntry` | a entrada de produto feito na loja, com a **cópia** da composição usada (Q43) |

### 4.4 Compra, venda e dinheiro

| model | para quê |
|---|---|
| `EmporioPurchase` + itens | estabelecimento, fornecedor (`Contact`), recebida ou não (Q38), frete somado ao custo (§9.3), parcelas |
| `EmporioSale` + itens | estabelecimento, cliente opcional (obrigatório no fiado, Q37), por item: apresentação, quantidade, preço sugerido, preço praticado, desconto, custo do momento, marca de custo provisório (Q32) |
| `EmporioSalePayment` | forma, valor, destino do dinheiro, regra de cartão do momento |
| `EmporioSaleReturn` | devolução parcial e troca, ligadas à venda (Q36) |
| `CashDrawer` | a gaveta de cada estabelecimento |
| `BankAccount` | conta bancária da conta do cliente (Q47) |
| `CashMovement` | onde o dinheiro está: entrada e saída da gaveta, da conta e do a receber do cartão, inclusive transferência entre caixas (§14.3). O saldo é a soma |
| `CashCount` | conferência: esperado, contado, diferença, justificativa (Q35) |
| `CardFeeRule` | estabelecimento, forma, taxa %, prazo em dias (Q23) |
| `EmporioCheck` | situação do cheque (Q24) |

**As formas de pagamento do Empório têm enum próprio:** dinheiro, PIX, débito,
crédito à vista, crédito parcelado, cheque e fiado. O `PaymentMethod` atual
(`dinheiro`, `pix`, `transferencia`, `boleto`, `cheque`, `cartao`, `outro`) não
separa débito de crédito nem tem fiado, e mudá-lo mexeria no Financeiro inteiro.

⚠️ **Quem é a verdade de quê** (definir no detalhe na F3, sem exceção):
- o **Financeiro** (`FinancialEntry` + `FinancialPayment`) é a verdade de
  receita, despesa, a receber e a pagar. O fiado é um lançamento a receber com
  o cliente; "José pagou R$ 100" é um `FinancialPayment` nele (§12.4);
- o **`CashMovement`** é a verdade de **onde** o dinheiro está. Ele aponta para
  o pagamento que o originou e nunca cria receita nem despesa. A transferência
  entre caixas só existe aqui, por isso não altera o resultado (§14.3).

### 4.5 Resultado

| model | para quê |
|---|---|
| `VariableExpenseRule` | "Vendeu, Pagou": tipo de cálculo (% , fixo por venda, por unidade, informado), condições (estabelecimento, forma, produto, apresentação) |
| `SaleVariableExpense` | a despesa reconhecida em cada venda, com a regra do momento |
| `FixedExpenseTemplate` + rateio | o modelo da despesa fixa (Q25): valor previsto, periodicidade, vencimento, divisão por estabelecimento em % ou valor |

`FinancialEntry` ganha `establishment_id` (anulável, ao lado de `property_id`),
e `RelatedModule` ganha `emporio` (Q28).

---

## 5. Regras que a spec fixa além do documento

1. **A baixa da composição só acontece com origem "feito aqui"** (§6.3). Quando
   a entrada vem de compra ou transferência, a origem já está dada e não se
   pergunta.
2. **A abertura de saca usa o menor número de sacas** que cobre a venda a
   granel, e a sobra vira avulso.
3. **A transferência de produto com separação** leva lacrado por padrão; o
   avulso só vai se a pessoa escolher.
4. **O ajuste de contagem nunca é venda nem compra** (§11.3): é movimentação de
   ajuste, guardando o saldo anterior e o corrigido, como já faz o estoque da
   fazenda.
5. **Sugestão de reposição** (§11.4) = máximo menos (saldo + compras não
   recebidas + transferências em trânsito para o mesmo estabelecimento). Sem
   máximo cadastrado, só alerta, sem quantidade sugerida. Com saldo em outro
   estabelecimento, oferece a transferência como alternativa. Nada é executado
   sem confirmação.
6. **Taxa de cartão em pagamento misto** incide só sobre a parte paga no
   cartão (§16.3).
7. **O % de despesas da formação de preço nunca entra na margem** (§17.6). Na
   margem entram só o custo real e o "Vendeu, Pagou" reconhecido.
8. **Resultado estimado** (§17.2): qualquer venda com custo desconhecido ou
   provisório, ou despesa fixa só prevista, marca o número como estimado, e a
   tela diz por quê (§26, "explicação dos números").
9. **Visão somada** (§14.3, §17.5): soma os estabelecimentos tirando as
   transferências internas, e conta a despesa dividida uma vez só.
10. **Usuário com vínculo** a estabelecimentos não vê a visão somada nem o
    resultado dos outros (§20).

---

## 6. Fases

Cada fase segue a ordem de sempre: **action, depois rota, só então tela**, com
suíte escrita da spec (`prova-suite`, sem ler a implementação) e validação no
navegador, na Da Mata, antes de pedir aprovação. Cada fase é uma branch. A
migração vai ao Neon antes do push (invariante 3), e merge e deploy esperam
autorização (invariante 7). A primeira suíte livre é a `test:m77`.

### F0: liberação e fundação

- `TenantFeature`, `TenantFeatureUser`, perfil `emporio`, `requireFeature`.
- Na Plataforma: ligar e desligar o recurso por conta, com a lista de usuários;
  criar conta só de Empório.
- Menu, Contatos e Lista de Compra abrindo para o perfil `emporio`. A rota
  da API passa a aceitar qualquer um de uma lista de perfis
  (`guard(..., { profile: ["fazenda", "emporio"] })`). Marcar item da Lista
  como comprado continua exigindo fazenda até a F2a, que é quando o
  estabelecimento passa a ter estoque para receber a compra.
- `FinancialEntry.establishment_id`, `RelatedModule.emporio`.
- `StockMovement` com `establishment_id`, `property_id` anulável e o `CHECK`;
  a **auditoria dos leitores** da seção 4.3.
- Na Da Mata, ligado só para o Owner.

**Aceite:** recurso desligado devolve 404 na página e na API e some do menu;
ligado com lista, só quem está na lista vê; conta só de Empório abre sem erro
em todas as telas da Q17; a fazenda não enxerga movimentação de loja (suíte).

### F1: estabelecimentos e catálogo

- Estabelecimento (cadastro, arquivar, configurações comerciais) e vínculo
  usuário-estabelecimento.
- Produto do Empório: unidade-base, apresentações, separação lacrado/avulso,
  lote e validade opcionais.
- Preço por estabelecimento e apresentação; formação de preço (custo, % de
  despesas, % de lucro, exceções por produto e apresentação, ajuste manual).

**Aceite (§25):** "cadastrar produto simples" não pede composição nem
configuração comercial; "vender o mesmo produto em lojas diferentes" aplica o
preço de cada uma (provado na F3, com o preço cadastrado aqui).

### F2a: compra e estoque

- Compra à vista, a prazo, parcelada e com entrada; recebida ou não; frete no
  custo; conta a pagar no Financeiro.
- Saldo por estabelecimento, por produto em todas as lojas, consolidado, e
  lacrado contra avulso.
- Custo médio por estabelecimento.
- Ajuste de contagem (as duas quantidades, com motivo), perda e avaria.
- Mínimo e máximo, alerta e sugestão de reposição; encaminhar à Lista de
  Compra, e marcar item da Lista como comprado num estabelecimento.
- Estoque inicial como implantação.

**Aceite (§25):** "comprar a prazo" registra o estoque recebido e a obrigação;
"conferir estoque físico" ajusta com motivo e histórico; mais os critérios
adicionais do §11.4 (limites diferentes por loja, venda fracionada atualiza a
comparação, sem sugestão duplicada, produto sem limite funciona).

### F2b: transferência e composição

- Transferência em duas etapas, em trânsito, confirmação, diferença como
  perda, cancelamento.
- Composição com rendimento; entrada de produto feito na loja com baixa dos
  componentes, recusa por falta, cópia da composição.

**Aceite (§25):** "cadastrar produto com composição" não movimenta estoque;
"entrar 400 kg de produto elaborado" acrescenta o produto e baixa 260, 116 e
24 kg; "comprar produto pronto que possui composição" não baixa ingrediente;
"transferir da Central para uma loja" não gera venda nem receita.

### F3: venda e caixa

- Venda com preço sugerido, desconto com limite, pagamento misto.
- Abertura automática de saca, recusa da venda impossível.
- Fiado com cliente, recebimento parcial.
- Cartão (taxa, prazo, parcelas, baixa automática) e cheque (quatro situações,
  devolvido reabre a dívida).
- Gaveta, contas bancárias, a receber do cartão, transferência entre caixas,
  conferência.
- Cancelamento, devolução parcial e troca.

**Aceite (§25):** "vender 1 kg de saca de 10 kg" reduz 0,10 saca; "vender com
pagamento misto" registra uma venda, R$ 120 recebidos e R$ 80 a receber;
"receber pagamento de fiado" reduz a dívida sem nova venda; "transferir
dinheiro entre caixas" não altera o resultado; "cancelar ou devolver uma
venda" ajusta estoque, Financeiro e resultado, preservando o histórico.

### F4: resultado

- Despesa fixa (modelo, geração por período, rateio).
- Regras do "Vendeu, Pagou", reconhecidas na venda e pagas depois.
- Resultado da Loja: vendas, custo, "Vendeu, Pagou", margem, fixas,
  resultado, ponto de equilíbrio, quanto falta, acompanhamento do mês.
- Visão somada; produtos que mais vendem e que mais dão margem; vendas com
  margem negativa.
- Filtro "Fazenda / Empório / Tudo" no Financeiro.

**Aceite (§25):** "registrar taxa de cartão" aplica a regra só à parte no
cartão; "cadastrar despesas fixas" entra no acompanhamento do mês; "calcular
ponto de equilíbrio" usa as fixas e a margem, sem dupla contagem (o exemplo do
§17.3: R$ 5.500 ÷ 30% = R$ 18.333); "consultar resultado global" não duplica
transferências nem despesas divididas.

### F5: integrações e implantação

- Meu Dia: fornecedor a pagar, fiado vencido, estoque baixo, transferência
  parada, caixa não conferido (§21.3), respeitando perfil e vínculo.
- Lista de Compra: incluir não gera compra (§21.4).
- Calculadora de Receitas: "criar composição desta receita" (Q44).
- Lista de primeiros passos (Q45), mostrando o que falta para o resultado ser
  confiável.

**Aceite (§25):** "usar TIBÉ sem Meu Empório" não mostra nada do Empório (já
provado na F0, repetido aqui com o módulo inteiro no ar).

---

## 7. Validação viva

Teste verde não é validação (invariante 8). Em cada fase, no navegador, na Da
Mata:

1. o fluxo da fase, do jeito que o comerciante faria;
2. a mesma tela por um usuário da Da Mata **fora** da lista: não pode ver nada;
3. as telas da fazenda que leem estoque e Financeiro: não podem ter mudado;
4. no celular, ao menos a venda (F3) e a contagem (F2a), que são as operações
   de balcão.

## 8. Perguntas que ficam para o desenho técnico de cada fase

O documento lista no §27 oito pontos a detalhar na implementação. Os itens 1
(embalagem), 2 (custo médio), 3 (variáveis previstas e realizadas), 4 (rateio),
5 (cartão e cheque), 6 (transferência) e 8 (limites de autorização) estão
decididos na seção 3. O item 7 (exigências fiscais e sanitárias) está fora da
primeira versão (Q9). Fica aberto, para decidir na fase em que aparecer:

- **F0:** a precisão de `quantity` (seção 4.3).
- **F3:** o desenho exato entre `FinancialEntry`, `FinancialPayment` e
  `CashMovement`, sem receita duplicada (seção 4.4).
- **F4:** a periodicidade suportada pela despesa fixa (mensal só, ou também
  semanal e anual) e até quantos períodos à frente ela gera.

## 9. Fora da primeira versão, e as dívidas

O §24 do documento, mais:

| item | dívida |
|---|---|
| Cruzar estoque entre fazenda e loja, e Empório com Negociações (Q2, Q42) | 2.15 |
| Empório no WhatsApp (Q10) | 2.16 |
| Base Rural de sinônimos (Q11) | 2.17 |
| Importação de produtos e estoque por planilha (Q45) | 2.18 |
| Contas bancárias no Financeiro da fazenda (Q47) | 2.19 |
| Cadastro público e cobrança da conta só de Empório (Q7, Q16) | 2.20 |
| Nota fiscal, receituário agronômico, lote e validade obrigatórios (Q9) | 2.21 |

O detalhe de cada uma está em [../agents/dividas.md](../agents/dividas.md).
