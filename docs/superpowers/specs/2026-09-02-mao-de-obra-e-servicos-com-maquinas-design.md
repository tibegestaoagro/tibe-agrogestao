# Módulos 33 e 34: Mão de Obra, e Serviços com Máquinas

**Data:** 2 de setembro de 2026
**Contrato:** os dois documentos do cliente, em
`docs/modulo-area-mao-de-obra/tibe-area-mao-de-obra.docx` (43 seções) e
`docs/modulo-servico-com-maquinas/tibe-servicos-com-maquinas.docx` (47 seções)
**Fases:** 5, listadas na seção 6
**Suítes:** `m55` a `m59` (o próximo livre no `package.json` é o `m55`)

---

## 1. O que os dois documentos pedem

**Mão de Obra** quer que o produtor responda quem trabalha, no quê trabalhou,
quanto custou e o que falta pagar. O documento é explícito sobre o que ele NÃO
é: os §35 e §41 excluem folha de pagamento, eSocial, FGTS, INSS, férias, 13º,
rescisão, ponto e banco de horas. O §36 manda distinguir três populações que o
produtor mistura na fala: trabalhador fixo, trabalhador eventual e prestador
terceirizado.

**Serviços com Máquinas** quer as quatro perguntas do §4 (o que foi feito, com
qual máquina, quanto foi trabalhado, quanto foi cobrado ou pago) nos dois
sentidos: serviço prestado com máquina própria, que gera receita, e serviço
contratado de terceiro, que gera despesa.

## 2. O que já existe, e que nenhum dos dois documentos sabe

Este é o achado que mais muda o tamanho do trabalho. Boa parte dos 30 critérios
de aceite de Máquinas (§46) e dos 24 de Mão de Obra (§42) é fiação, não
construção.

| o documento pede | já existe | veredito |
|---|---|---|
| máquina, implemento, horímetro | `Machine.hour_meter`, `MachineMaintenance` | reusa |
| prestador com histórico | `Contact` com `ContactType.prestador_servico` | reusa o modelo |
| conta a pagar, a receber, parcial | `FinancialEntry`, `createLinkedEntry`, as parcelas do Módulo 31 | reusa inteiro |
| compromisso no Meu Dia | `Task`, e o padrão do Módulo 17 (previsão de gasto = `FinancialEntry` pendente com alerta `bill_due`) | reusa o padrão |
| combustível baixando estoque | `StockMovement` tipo `utilizacao` | reusa |
| custo por hora, dia ou fechado | `Service`, `PricingType`, `ServiceOrder` do Módulo 2 | ver decisão 1 |
| cliente do serviço | `ServiceClient` (perfil prestador) e `Contact` (perfil fazenda) | ver decisão 3 |
| serviço no histórico de Negociações | `Negotiation`, módulo fechado | ver decisão 4 |

## 3. As oito decisões

Tomadas com o usuário em 02/09, antes de qualquer linha de código.

**1. Modelo novo, e o Módulo 2 fica intacto.** O `ServiceOrder` do Módulo 2 é
metade do que Máquinas pede (catálogo com preço por hora, dia ou fechado, ordem
que vira receita), mas é restrito ao perfil prestador, e este trabalho é para o
perfil fazenda. Estendê-lo arrastaria um módulo validado em produção para
dentro desta frente. É a mesma razão que já separa `Contact` de `ServiceClient`,
e o custo aceito é o mesmo: dois conceitos de serviço convivendo.

**2. `Worker` cobre fixo e eventual; o prestador continua em `Contact`.** O
corte é o do §36: quem recebe salário ou diária é uma pessoa que trabalha; quem
entrega um serviço fechado é uma contraparte de negócio, e `Contact` já é
exatamente isso, com o tipo `prestador_servico` já existente.

**3. Serviço contratado de terceiro é UM modelo, entregue em duas fases.** Os
dois documentos descrevem o mesmo objeto por lados diferentes: "o Pedro fez a
cerca por 6 mil" é Mão de Obra §15, e "contratei o Pedro pra gradear 20 hectares"
é Máquinas §29. Se cada módulo criar o seu, o produtor tem dois lugares para
lançar a mesma coisa e precisa saber de antemão se houve máquina para escolher
a tela. `ServiceJob` nasce no Módulo 33 com `machine_id` nulo, e o Módulo 34
preenche a máquina e acrescenta a direção prestada.

**4. Não reabrir o Módulo 31.** Máquinas §37 diz que a prestação de serviço
será uma negociação. Atender isso com um `NegotiationType` novo faria
`cancelNegotiation` precisar saber desfazer serviço, combustível e horímetro,
num módulo declarado fechado. O que o §37 promete ao produtor (ver o serviço no
histórico) é entregue por consulta, sem tocar no envelope comercial.

**5. A despesa de mão de obra amarra ao lote por `related_id`.** Os §27 e §28
mandam a mão de obra compor o custo do Confinamento e do Leite.
`confinement.ts:456` já lê `financialEntry.findMany({ where: { related_id:
stayId } })`, e hoje nada nasce assim: é o defeito registrado na `dividas.md`
§2.8. Lançar com `related_id: stay.id` faz a coluna "Custo acumulado", travada
em R$ 0,00, passar a somar sem que esta frente toque nela.

**6. A previsão de pagamento do trabalhador fixo é rolante.** Existe sempre UMA
previsão pendente por trabalhador. Quando o produtor confirma o pagamento, a
próxima nasce na mesma transação. Não precisa de cron, então não depende do
worker da rotina diária, que segue sendo pendência de infraestrutura do usuário.
E casa com o §40.3, que proíbe marcar pagamento automaticamente.

**7. Handler de WhatsApp pronto, classificador congelado.** Mesmo padrão das
missões 3 e 4 do Módulo 31: os handlers e as suítes existem, e o agente não
emite as intenções até o usuário destravar o n8n.

**8. Duas escolhas de `RelatedModule`.** O dinheiro do `Worker` usa um valor
novo, `mao_de_obra`, porque o §30 pede o gasto com equipe somável em separado.
O dinheiro do `ServiceJob` reusa o `servico` que já existe, porque `entry_type`
já separa a receita do serviço prestado da despesa do contratado, e um tenant
raramente tem os dois perfis.

## 4. O modelo de dados

Quatro modelos novos. **Nenhum valor pago, devido ou acumulado é gravado em
nenhum deles.**

### `Worker`: a pessoa

Nome, função (texto, com as dez sugestões do §6 oferecidas na tela), tipo
(`fixo` ou `eventual`), situação (`ativo` ou `inativo`), frequência e valor de
pagamento, dia habitual, propriedade, telefone, data de início, observação. É
cadastro, não folha: nenhum campo de encargo, nenhum cálculo trabalhista.

### `WorkerLog`: a anotação simples

Um modelo para os §12 (atividade realizada) e §34 (falta, folga, férias,
afastamento), separados por um `kind`. Os dois documentos são explícitos que
isto é opcional e que o objetivo não é controlar cada minuto, então é data,
tipo, descrição, e no máximo fazenda e pasto.

### `ServiceJob`: o trabalho contratado ou prestado

Absorve quatro seções da Mão de Obra e a área inteira de Máquinas:

| o que o produtor diz | como vira `ServiceJob` |
|---|---|
| "vieram 3 homens por 4 dias, 150 a diária" (MO §13) | `contratado`, pricing `dia`, 12 unidades a 150 |
| "o Pedro fez a cerca por 6 mil" (MO §15) | `contratado`, pricing `fechado`, combinado 6000 |
| "roçada de 30 hectares a 120" (MO §17) | `contratado`, pricing `hectare`, 30 unidades |
| "contratei o Pedro pra gradear 20 hectares" (MQ §29) | `contratado`, pricing `hectare`, com máquina do terceiro |
| "vou gradear 20 hectares pro João a 180" (MQ §42) | `prestado`, máquina própria, receita |

A contraparte é `worker_id` (diarista cadastrado), `contact_id` (prestador ou
cliente) ou nenhum dos dois com `worker_count`, que é o caso dos três homens sem
nome do §14.

Campos: direção, situação (`agendado`, `em_andamento`, `concluido`,
`cancelado`), data, descrição do serviço, forma de cobrança, preço unitário,
valor combinado (só quando a cobrança é `fechado`), propriedade, pasto, máquina,
implemento, operador, lote de confinamento, ponto de leite, horímetro inicial e
final, cancelamento com autor e motivo.

### `ServiceJobLog`: a quantidade, que é sempre soma

**A quantidade trabalhada nunca é um campo do `ServiceJob`.** Ela é a soma das
linhas deste modelo, pelo mesmo motivo que o saldo do rebanho e o do estoque são
soma: o §19 permite que um serviço dure vários dias, e o §20 permite acrescentar
"fiz 8 hectares hoje" ao serviço em andamento. Um campo gravado divergiria do
que o produtor lançou, em silêncio.

⚠️ **Por isso este modelo nasce na fase 33.2, e não na 34.2**, embora a tela de
lançamento diário só chegue na 34.2. Um serviço de tiro único cria uma linha só.
A alternativa (guardar `quantity` no `ServiceJob` e convertê-la em razão depois)
seria uma migração de dado de produção para consertar um invariante que já
conhecemos.

O total do serviço é derivado: `fechado` usa o valor combinado; qualquer outra
cobrança usa a soma dos logs vezes o preço unitário.

## 5. A regra do dinheiro

Todo dinheiro é `FinancialEntry` criado por `createLinkedEntry`, com
`related_id` apontando para o `Worker` ou o `ServiceJob`. Nada de valor pago ou
devido nos modelos de domínio.

O que isso entrega sem uma linha nova: conta a pagar e a receber, parcelamento
com a validação do §14 do Módulo 31 (a soma das parcelas tem que bater com o
valor), pagamento parcial com saldo, alerta `bill_due`, DRE por competência, e
edição e quitação no painel financeiro.

**Uma coluna nova em `FinancialEntry`:** `worker_entry_kind`, anulável, com os
valores `pagamento`, `adiantamento`, `gratificacao`, `beneficio` e `outro`. Ela
existe pelo mesmo motivo que `negotiation_role` existe: o §9 pede o adiantamento
mostrado separado do pagamento normal, e `category` é texto livre que o produtor
pode renomear no painel. Sem ela, o histórico do §37 agruparia por string.

**Cancelamento** segue o padrão do Módulo 31: cancelar um `ServiceJob` cancela
os lançamentos pendentes e gera estorno para os já pagos, com a data em que o
dinheiro voltou, em vez de apagar o lançamento original.

## 6. As cinco fases

Cada fase entrega **action, depois rota, depois tela**, na ordem do protocolo, e
é validável sozinha no navegador.

| fase | entrega | fecha | suíte |
|---|---|---|---|
| **0. Contatos** | tela de contatos: listar, criar, editar, arquivar, histórico. `PATCH` e arquivamento não existem hoje | `dividas.md` §2.3, e destrava as outras quatro | `m55` |
| **33.1 Fixa** | `Worker`, funções padrão, previsão rolante, pagamento com confirmação, adiantamento, outros pagamentos e benefícios | MO §5 a §11, §33, §35 a §37, §40 | `m56` |
| **33.2 Contratado** | `ServiceJob` contratado, `ServiceJobLog`, as nove formas de cobrança, conta a pagar e pagamento parcial, vínculo com fazenda, pasto, máquina, confinamento e leite, `WorkerLog`, o resumo do §30 | MO §12 a §32, §34, e metade da `dividas.md` §2.8 | `m57` |
| **34.1 Prestado** | direção prestada: máquina, implemento, operador, receita, conta a receber, recebimento parcial, agenda de serviços | MQ §5 a §18, §26 a §31, §39, §40 | `m58` |
| **34.2 Custeio** | lançamento diário, combustível baixando estoque, horímetro alimentando a máquina, custo total do serviço | MQ §19 a §25, §32 a §35, §41 | `m59` |

Intenções de WhatsApp por fase: 33.1 traz `registrar_trabalhador`,
`registrar_pagamento_trabalhador` e `registrar_adiantamento`; 33.2 traz
`registrar_diaria` e `registrar_servico_contratado`; 34.1 traz
`registrar_servico_prestado` e `encerrar_servico`; 34.2 traz
`registrar_producao_servico`, `registrar_combustivel_servico` e
`registrar_recebimento_servico`.

## 7. Uma dívida que se paga dentro da fase 33.1

O store de pendência do WhatsApp tem **seis cópias** (`dividas.md` §3.2). Estas
duas frentes criam dez intenções novas, ou seja pelo menos duas cópias a mais.
O comentário original de `negotiation-pending.ts` previa extrair "quando o
terceiro domínio precisar", e o Confinamento pagou juros por adiar.

A extração do store genérico entra como primeira tarefa da fase 33.1, com
`m24`, `m36`, `m37`, `m48`, `m49` e `m51` rodando antes e depois. É a única
coisa fora do escopo dos dois documentos incluída aqui, e está registrada como
tal.

## 8. O que fica fora da primeira versão

Além das listas dos §41 e §45 dos documentos (folha, eSocial, encargos,
telemetria, GPS, nota fiscal, gestão de frota), esta frente adianta:

- **O horímetro alimentando alerta de manutenção** (MQ §34). O documento usa
  "futuramente"; a fase 34.2 grava as horas na máquina, e o alerta fica para
  uma frente própria, junto do resto do alertário.
- **O rateio de custo do serviço prestado por cliente ou por máquina** além do
  resumo do §41. Filtro sem volume de dado é enfeite, o mesmo raciocínio já
  registrado para os nove filtros do Módulo 31.
- **O classificador do n8n**, congelado por decisão do usuário.

## 9. Onde isto vai doer

- **`resolverPasto` devolve o primeiro achado** (`dividas.md` §3.3). As duas
  frentes aceitam pasto pelo WhatsApp, então cada handler novo é mais um caminho
  para gravar a fazenda errada em silêncio. Não é regressão desta frente, mas o
  risco cresce com ela.
- **Migração antes do push** (invariante 3), e quem aplica no Neon é o usuário,
  no terminal: `db:deploy` contra produção é recusado pelo classificador de
  permissões mesmo com a marca de autorização.
- **Quatro modelos novos com `tenant_id` entram em `TENANT_SCOPED_MODELS`**
  (invariante 1), e `npm run test:isolation` reprova se faltar.
- **Cinco conferências do `npm run check`** valem para tela nova: cor crua,
  recusa do servidor tratada, painel de escrita usando `FormSheet`, recusa do
  Zod em português, e campo do `ORDEM` renderizando a própria recusa. A catraca
  só encolhe, então as telas precisam nascer conformes.
- **Item de menu dentro de grupo nasce invisível**: aconteceu com o Confinamento
  no dia do deploy. Os dois módulos entram no grupo "Operação" de
  `src/lib/nav.ts`.
- **Suíte verde não valida** (invariante 8). A passada de navegador de cada fase
  é parte da estimativa, não sobra.

## 10. Critérios de aceite

Os dos documentos, redistribuídos por fase. A frente inteira está pronta quando
o produtor conseguir:

**Fase 0:** listar, criar, editar e arquivar contato, e ver o histórico dele.

**Fase 33.1:** cadastrar trabalhador fixo com função, valor e frequência; ver o
próximo pagamento; confirmar o pagamento e ver a despesa no Financeiro sem
relançar; registrar adiantamento separado; registrar gratificação e benefício;
inativar trabalhador.

**Fase 33.2:** registrar diária com quantidade de pessoas e dias; registrar
serviço por empreito, por hectare, por hora e por metro; registrar pagamento
parcial e consultar o saldo; amarrar serviço a fazenda, pasto, máquina, lote de
confinamento e ponto de leite; anotar atividade e ausência; consultar o custo
mensal separado em fixa, eventual e terceirizados.

**Fase 34.1:** registrar serviço prestado com máquina, implemento e operador;
cobrar por hora, hectare, diária, viagem, tonelada, metro, quilômetro, cabeça e
fechado; gerar receita e conta a receber; registrar recebimento parcial; ver a
agenda de hoje e dos próximos.

**Fase 34.2:** lançar produção dia a dia num serviço em andamento; registrar
combustível e ver o estoque baixar; informar horímetro inicial e final e ver as
horas na máquina; ver o resultado simples do serviço (receita menos custos
registrados).

Em todas: as intenções da fase respondidas pelo handler, com suíte, ainda que o
agente não as emita.
