# Módulo 32: Área Leite

**Origem:** `docs/area-funcional-confinamento/` (o arquivo da Área Leite, versão
0.2, 40 seções e 30 critérios de aceite). O nome do arquivo tem travessão, por
isso não é citado literalmente aqui; leia com:

```
unzip -p "<caminho>" word/document.xml | sed -e 's/<[^>]*>/ /g'
```

**Decisões tomadas com o usuário em 2026-09-01** (as três fases) **e em
2026-09-02** (as quatro da Fase 1), por entrevista, antes de qualquer código.
Este documento registra o motivo de cada uma: é o motivo que permite revisitar
a decisão sem repetir a discussão.

> O documento do cliente se declara "em construção, sujeito a análise e
> alterações". Se a equipe TIBÉ alterá-lo, confira esta spec contra a versão
> nova antes de continuar.

---

## 1. O que a área é, e o que ela não é

O §1 é explícito: **não é um sistema zootécnico**. É o básico da atividade
leiteira para o pequeno produtor. O §38 lista vinte controles que ficam
deliberadamente de fora (produção por vaca, brinco, CCS, CBT, gordura,
reprodução, curva de lactação, integração com ordenhadeira).

O §3 dá o princípio: **o controle é coletivo**. O produtor diz "tenho 25 vacas
em lactação e produzi 420 litros hoje", e o sistema calcula a média. Não existe
animal identificado nesta área.

O que o produtor precisa responder (§2): quantas vacas estão produzindo, quantos
litros saíram, onde o leite está, de quem ele é, quanto foi vendido e quanto
falta receber.

---

## 2. As três fases

Decisão do usuário em 2026-09-01: a área entra em **três fases, com aprovação
entre elas**. O documento é grande demais para uma rodada, e as três partes têm
riscos diferentes.

| fase | seções | o que fecha |
|---|---|---|
| **1** | §4 a §11 | lactação, produção, média por vaca, histórico |
| **2** | §12 a §22 | tanque, ponto de coleta, leite de terceiros |
| **3** | §23 a §30 | venda, comprador, fechamento por período, Financeiro |

**Esta spec detalha a Fase 1.** A seção 12 guarda a análise estrutural das
fases 2 e 3, para que ela não seja refeita do zero.

A Fase 2 é o coração da área, e é onde está a única exigência sem paralelo no
sistema (saldo por proprietário dentro do mesmo tanque). A Fase 1 existe antes
dela porque é a que o produtor usa todo dia, e porque a média por vaca do §10
depende só dela.

---

## 3. A Fase 1 são dois números derivados

Não há volume armazenado ainda: o tanque é Fase 2. O que a Fase 1 entrega são
**dois contadores, e nenhum dos dois é gravado** (invariante 2):

1. **Vacas em lactação:** o dobramento dos registros de lactação até uma data.
2. **Litros produzidos num período:** a soma dos registros de produção.

A média por vaca (§10) é a divisão de um pelo outro, e por isso também não é
gravada em lugar nenhum.

O §37.1 e o §37.4 fecham a fronteira com o Rebanho: registrar leite não muda a
quantidade de animais, e entrar ou sair da lactação também não. O §37.2 diz por
quê: **"em lactação" é uma condição, não uma categoria**. Uma vaca em lactação
continua contada uma única vez, no `AnimalBatch` da categoria dela.

Consequência prática: a Área Leite **não escreve no livro-razão do rebanho**.
Nenhuma `HerdMovement`, nenhum `AnimalBatch` tocado. Se você se pegar
importando `herd-ledger`, parou no lugar errado.

---

## 4. As quatro decisões da Fase 1

### 4.1. O lote leiteiro é uma entidade nova e leve

O §6 fala em "Lote 1, vacas em maior produção", "lote recém-paridas". O sistema
já tem `AnimalBatch`, e a tentação é reusar.

**Não é a mesma coisa.** O `AnimalBatch` é definido por categoria e quantidade,
e o §37.3 diz que os animais de um lote leiteiro **continuam pertencendo às
categorias já definidas no Rebanho**. Reusar obrigaria o produtor a fatiar o
rebanho por critério de produção, que é exatamente o controle complexo que o §1
recusa.

Fica um model próprio, `MilkGroup`: nome, fazenda, observação, arquivável. Ele
**não conta cabeça**, não duplica animal e não aparece em nenhuma soma do
Rebanho. O §6 é literal sobre a ambição dele: "nesta primeira versão, o lote
servirá apenas como uma forma simples de organização".

Texto livre foi descartado porque erro de digitação vira lote novo, e o
histórico por lote deixa de ser confiável no primeiro mês.

### 4.2. A contagem de vacas é por fazenda, e o lote é um rótulo

O §34 e o §35 mostram **um número só**: "Vacas em lactação: 32". O §4 pede a
quantidade atual da fazenda.

Saldo por lote foi descartado para a Fase 1 por dois motivos. Ele obrigaria todo
registro a escolher um lote (ou a inventar um balde "sem lote", que é a mesma
complexidade com nome pior), e quebraria a frase mais natural do WhatsApp:
"estou com 32 vacas dando leite" não diz lote nenhum.

O lote continua sendo gravado no registro, quando informado, e serve para
filtrar o histórico. **O que ele não faz é ter saldo próprio.**

Se o uso real pedir média por vaca de cada lote, o lugar de mexer é o
dobramento da seção 6.1, e a mudança é aditiva: passar a chave de `property_id`
para `(property_id, group_id)`.

### 4.3. Cada registro de produção é uma linha, com turno

O §9 aceita as duas formas: "produzi 500 litros hoje" e "300 de manhã e 180 à
tarde". O §9.2 manda o TIBÉ somar.

Cada registro é **uma linha**: data, litros, turno (`dia`, `manha`, `tarde`,
`noite`). A produção do dia é a soma das linhas daquela data, **nunca um campo
gravado**. O formulário continua sendo um só, com os três campos de ordenha, e
grava até três linhas de uma vez.

Uma linha por dia com três colunas foi descartada porque o caminho do WhatsApp
chega em pedaços: "tirei 300 de manhã" às nove, "mais 180 à tarde" às cinco.
Com linha por dia, o segundo registro vira uma edição, e o handler passa a
depender de achar a linha certa antes de gravar. Com linha por registro, é
sempre um `insert`.

O turno `dia` existe para o caso do §9.1, e não é o mesmo que ordenha não
informada: ele diz "este número é o dia inteiro".

### 4.4. Nada é editado nem apagado: cancela e registra de novo

O §37.11 exige histórico de tudo. Registro errado recebe `cancelled_at`, sai
das somas e **fica na lista**, marcado. É o mesmo padrão do cancelamento de
estadia, e evita que a média por vaca de um mês fechado mude sem rastro.

---

## 5. Modelo de dados

Três models e dois enums, todos novos. Nenhum model existente é alterado, e
nada entra em `RelatedModule` nesta fase: a Fase 1 não gera dinheiro.

Os três entram em `TENANT_SCOPED_MODELS` (invariante 1), e
`npm run test:isolation` reprova se esquecer.

```prisma
enum LactationEntryType {
  /// "Estou com 32 vacas dando leite": define o valor absoluto.
  definir
  /// "Entraram 4 vacas no leite": soma.
  entrada
  /// "Sequei 3 vacas": subtrai.
  saida
}

enum MilkShift {
  /// §9.1: o número é o dia inteiro, sem detalhar ordenha.
  dia
  manha
  tarde
  noite
}

/// §6: agrupamento leiteiro, puramente organizacional. NÃO conta cabeça e não
/// aparece em soma nenhuma do Rebanho (§37.3).
model MilkGroup {
  id          String    @id @default(cuid())
  tenant_id   String
  property_id String
  name        String
  notes       String?
  /// Desativar, nunca apagar: mesmo padrão de Property, Pasture e Contact.
  archived_at DateTime?
  created_at  DateTime  @default(now())
}

/// §4 e §7. A contagem vigente NUNCA é gravada: é o dobramento destas linhas
/// (invariante 2, e seção 6.1 da spec).
model LactationEntry {
  id          String             @id @default(cuid())
  tenant_id   String
  property_id String
  type        LactationEntryType
  /// Sempre positivo. O sinal quem dá é o `type`.
  quantity    Int
  recorded_at DateTime
  notes       String?
  /// §4: pasto é informação opcional do registro, não eixo de saldo.
  pasture_id  String?
  group_id    String?
  cancelled_at DateTime?
  recorded_by_user_id String?
  created_at  DateTime           @default(now())
}

/// §8 e §9. Uma linha por registro. O total do dia é a soma, nunca um campo.
model MilkProduction {
  id          String    @id @default(cuid())
  tenant_id   String
  property_id String
  /// Litros. Decimal porque o produtor mede em litros com fração.
  liters      Decimal   @db.Decimal(12, 2)
  shift       MilkShift
  recorded_at DateTime
  group_id    String?
  notes       String?
  cancelled_at DateTime?
  recorded_by_user_id String?
  created_at  DateTime  @default(now())
}
```

⚠️ **O §8 lista "quantidade de vacas em lactação" como campo opcional do
registro de produção, e ele NÃO existe no model.** Isso é deliberado: gravá-lo
ali criaria uma segunda fonte para o mesmo número, e as duas divergiriam no
primeiro mês. O campo existe **no formulário**, e quando preenchido grava um
`LactationEntry` do tipo `definir` na mesma data, dentro da mesma transação. O
produtor vê o que o §8 pede, e o sistema continua com uma fonte só.

---

## 6. Regras de cálculo

### 6.1. Contagem vigente numa data

```
vacasEmLactacao(fazenda, data) =
  a partir do último `definir` com recorded_at <= data,
  somar as `entrada` e subtrair as `saida` posteriores a ele
  (ordenado por recorded_at, desempate por created_at),
  ignorando tudo que tem cancelled_at
```

Antes do primeiro `definir` a contagem é **indefinida**, e não zero. Zero é uma
afirmação ("não tenho vaca em lactação"); indefinido é a ausência de resposta, e
a tela precisa dizer coisas diferentes nos dois casos.

Um `entrada` anterior ao primeiro `definir` não inventa contagem: ele fica no
histórico e entra na conta assim que existir um `definir` antes dele. É o preço
de deixar o produtor registrar na ordem que quiser.

### 6.2. A contagem nunca fica negativa

"Sequei 3 vacas" com 2 em lactação é **recusado**, com
`field: "quantity"` e a frase dizendo quantas existem. Mesmo tratamento da saída
parcial do confinamento.

A conferência vale para a data do registro **e para todas as datas seguintes**:
lançar uma saída retroativa que zera o passado e deixa o presente negativo é o
mesmo erro, só que mais difícil de ver.

### 6.3. Média por vaca (§10)

```
mediaPorVaca(periodo) =
  litros do periodo / soma, dia a dia, das vacas em lactacao naqueles dias
```

É litros por vaca/dia, e degrada corretamente para o caso de um dia só, que é o
exemplo do §10 (450 litros, 30 vacas, 15 litros por vaca).

**Dias sem contagem conhecida saem dos dois lados da divisão**, numerador e
denominador, e a tela informa quantos dias entraram na conta. A alternativa
(dividir pelo número de hoje) daria média errada em qualquer mês em que o
rebanho leiteiro mudou de tamanho, que é todo mês.

Quando nenhum dia do período tem contagem conhecida, a média **não aparece**:
mostra traço, que é o campo vazio da convenção de UI, e não zero.

### 6.4. As seis janelas do §11

Hoje, ontem, semana, mês, mês anterior e acumulado no ano. Cada uma devolve
**total produzido, média diária e média por vaca**.

Os limites de dia são calculados em `America/Sao_Paulo`, como já fazem
`src/lib/actions/confinement.ts` e `src/lib/actions/financial-reports.ts`. O
servidor da Vercel roda em UTC, e "produção de hoje" calculada em UTC muda de
dia às 21h para o produtor.

"Semana" é os últimos sete dias, incluindo hoje, e não a semana do calendário: o
§11 não define, e sete dias corridos é o que responde "minha produção caiu?".
Registrado aqui porque é uma escolha, não uma leitura.

---

## 7. Contrato de API

Guard: **`guard("leite", ...)` não existe.** Reusa `"rebanho"`, com
`{ profile: "fazenda" }`, pelo mesmo motivo que o Confinamento reusa: a matriz
do PRD §5.2 não tem linha para Leite, e inventar uma seria decidir permissão sem
o cliente. `OPERADOR` escreve, `VISUALIZADOR` lê, que é o comportamento certo.

| método | rota | o que faz |
|---|---|---|
| GET | `/api/v1/milk/groups` | lista lotes leiteiros (exclui arquivados por padrão) |
| POST | `/api/v1/milk/groups` | cadastra lote (§6) |
| PATCH | `/api/v1/milk/groups/[id]/archive` | arquiva ou desarquiva |
| GET | `/api/v1/milk/lactation` | histórico de registros de lactação, com a contagem vigente |
| POST | `/api/v1/milk/lactation` | registra `definir`, `entrada` ou `saida` (§4, §7) |
| POST | `/api/v1/milk/lactation/[id]/cancel` | cancela um registro (§37.11) |
| GET | `/api/v1/milk/production` | lista registros, com filtro por período e lote |
| POST | `/api/v1/milk/production` | registra produção, até três turnos de uma vez (§8, §9) |
| POST | `/api/v1/milk/production/[id]/cancel` | cancela um registro |
| GET | `/api/v1/milk/summary` | o painel: hoje e as seis janelas do §11 |

Regra de negócio em `src/lib/actions/`, rota fina (invariante 6). A ordem de
entrega é action, rota, tela.

Recusas usam o vocabulário já em uso no projeto, com `field` apontando o campo:
`SALDO_INSUFICIENTE` (§6.2), `QUANTIDADE_INVALIDA`, `FAZENDA_OBRIGATORIA`,
`LOTE_DE_OUTRA_FAZENDA`.

---

## 8. A tela `/leite`

Entra no menu **já na Fase 1**, dentro do grupo "Operação", ao lado de Rebanho.
Mostra só o que existe: os blocos de armazenamento e de dinheiro do §34 chegam
com as fases 2 e 3.

⚠️ **O grupo "Operação" nasce fechado.** Foi assim que o Confinamento subiu em
01/09 e gerou a pergunta "cadê o Confinamento?" no mesmo dia. Vale conferir na
validação ao vivo que o item aparece depois de expandir, e considerar se o
grupo deveria abrir sozinho quando a rota atual está dentro dele.

Blocos da Fase 1:

- **Hoje:** vacas em lactação, litros produzidos, média por vaca. Os três com
  traço quando o dado não existe, nunca zero inventado.
- **Registrar produção:** data, litros do dia **ou** manhã/tarde/noite, lote
  opcional, vacas em lactação opcional (que grava o `definir` da seção 5),
  observação.
- **Lactação:** a contagem atual, com os três botões do §7 (definir, entraram,
  secaram).
- **Histórico:** as seis janelas do §11, e a lista de registros com o cancelado
  visível e marcado.
- **Lotes:** cadastro e arquivamento, discreto. É §6, não é o assunto da tela.

Convenções que a tela precisa respeitar, e que o `npm run check` cobra:
`<input type="number">` é proibido (usar o campo do kit, que passa por
`src/lib/numero-br.ts`), cor crua do Tailwind é proibida, todo campo do `ORDEM`
renderiza o próprio `error=`, e painel de escrita sai do kit.

---

## 9. WhatsApp (§36)

Os handlers nascem e são testados; **as intenções não são emitidas**. O
classificador do n8n está congelado por decisão do usuário até o sistema estar
revisado, e essa decisão continua valendo. O mesmo já aconteceu com as missões
3 e 4 do Módulo 31.

Intenções da Fase 1, com os parâmetros que o handler lê:

| intenção | parâmetros | §36 |
|---|---|---|
| `registrar_producao_leite` | `litros` ou `manha`/`tarde`/`noite`, `data`, `lote`, `fazenda` | "tirei 480 litros hoje" |
| `definir_vacas_em_lactacao` | `quantidade`, `data`, `lote`, `fazenda` | "estou com 32 vacas dando leite" |
| `registrar_entrada_lactacao` | `quantidade`, `data`, `lote`, `fazenda` | "entraram mais 4 vacas" |
| `registrar_saida_lactacao` | `quantidade`, `data`, `lote`, `fazenda` | "sequei 3 vacas" |

⚠️ **São QUATRO, e não as três que esta seção previa.** A versão anterior tinha
um `ajustar_vacas_em_lactacao` com o sentido em `parameters`, e implementar
mostrou que o sentido seria justo a parte que o classificador erra: "entraram 4
vacas" e "sequei 4 vacas" carregam o mesmo número e diferem só no verbo, e
confundir os dois erra a contagem em oito cabeças, no sentido errado. Mesmo
argumento que separou as quatro do confinamento.

O §36 mostra o TIBÉ confirmando antes de gravar em todos os casos, e a lição do
estoque vale aqui: **"não, deixa pra lá" não pode gravar**. O contrato vai para
`docs/n8n-whatsapp-workflow.md` junto com o handler, mesmo sem o classificador
emitir, porque foi a ausência do parâmetro no contrato que fez o pasto chegar
por acaso no Módulo 31.

Uma frase que soma ordenhas ("tirei 300 de manhã e 180 à tarde") pode chegar
como uma intenção com dois turnos ou como duas mensagens. O handler aceita as
duas, porque cada registro é uma linha (decisão 4.3).

---

## 10. O que a Fase 1 não faz

Explicitamente fora, para não ser cobrado como defeito:

- Tanque, saldo armazenado, retirada, ponto de coleta, leite de terceiros
  (§12 a §22, Fase 2).
- Venda, comprador, preço por litro, conta a receber, fechamento por período
  (§23 a §30, Fase 3).
- Destino do leite (§12 e §30). O destino só faz sentido quando existe um lugar
  de onde tirar, que é a Fase 2.
- Integração com Estoque (§31) e com Financeiro (§32). A Fase 1 não movimenta
  produto nem dinheiro.
- Tudo o que o §38 já exclui da primeira versão inteira.

---

## 11. Critérios de aceite da Fase 1

Do §39, os que esta fase precisa fechar:

1. Informar vacas em lactação.
2. Trabalhar com lotes de animais.
3. Registrar entrada e saída da lactação.
4. Registrar produção.
5. Registrar produção por ordenha, opcionalmente.
6. Consultar produção diária e mensal.
7. Visualizar média por vaca.
8. Integrar com Rebanho, no sentido que o §5 e o §37 definem: **a Área Leite não
   altera o total do rebanho**, e a tela deixa isso visível.

Além do documento, e por serem os erros que este projeto já cometeu:

9. Nenhuma quantidade de leite ou de vaca é gravada como saldo (invariante 2).
10. `npm run test:isolation` verde com os três models novos.
11. Saída maior que a contagem é recusada, com `field` apontando o campo, e a
    recusa **aparece embaixo do campo** no navegador, não só na resposta.
12. Validação ao vivo antes de reportar concluído: a suíte verde não basta.

---

## 12. O que já está analisado para as fases 2 e 3

Feito em 2026-09-01, sobre o documento inteiro. Está aqui para não ser refeito.

**O leite é o terceiro livro-razão.** Volume nunca gravado, sempre soma das
movimentações. A posição é `local x dono`.

**Os §16 a §21 são exatamente o padrão `HerdStay`**, que já está em produção:

| situação do leite | equivalente que já existe |
|---|---|
| leite próprio em ponto de coleta de terceiros | `pasto_terceiro` / `boitel` (coisa nossa em lugar dos outros) |
| fazenda como ponto de coleta | `terceiro_na_fazenda` (coisa dos outros em lugar nosso) |
| §22, cobrar pelo serviço | as seis formas de cobrança de `HerdChargeType`, que já geram receita |
| §37.6, enviar não é venda | é o §17.8 do leilão com outras palavras |

O que já existe e reusa:

- **`Contact`** já é o cadastro simplificado do §24 (nome, tipo, telefone,
  município), e serve para comprador **e** para o produtor terceiro do §19.
  Falta acrescentar `laticinio`, `queijaria` e `mercado` ao `ContactType`, que
  já tem `cooperativa`.
- **`createLinkedEntry`** mais `RelatedModule` ganhando `leite` cobre o §32
  inteiro, conta a receber do §27 incluída.
- **`StockMovement`** já tem `stay_id` para o confinamento; o §31 pede o vínculo
  análogo com o lote de leite.
- **`ConfinementSite`** já tem exatamente os campos do tanque do §13,
  `capacity` incluído.

**A venda de leite é uma `Negotiation` nova**, tipo novo no enum, de forma
aditiva, sem tocar nos quatro existentes. O fechamento por período do §28 segue
o padrão da remessa de evento, que já acumula entregas e fecha com o dinheiro.
Reabre o Módulo 31 só por acréscimo.

⚠️ **A única coisa sem paralelo:** o §20 exige saldo **por proprietário** dentro
do mesmo tanque (próprio 400, João 300, Carlos 250, físico 950). O eixo de dono
do rebanho é só `proprio | terceiro`, sem nome. A posição do leite precisa
apontar para um `Contact`. É onde vale gastar o desenho da Fase 2.
