---
tipo: design
data: 2026-11-09
modulo: 39 (Meu Empório)
origem: pesquisa (reports/Taxas de cartão no Empório.md, fora do git) e conversa com o Dilton em 2026-11-09; decisões Q250 a Q258
---

# Meu Empório: taxas de cartão por adquirente, bandeira, parcelas e vigência

A Agromax recebe no cartão pela Stone. A taxa muda por bandeira (Visa e
Master num grupo, Elo em outro), por modalidade (débito, crédito à vista,
crédito parcelado) e pela quantidade de parcelas (1x, 3x e 5x têm taxas
diferentes), e a taxa do crédito muda de mês em mês. O dinheiro entra em
datas diferentes por parcela, e há antecipação de recebíveis.

Hoje o Empório tem **uma** taxa por loja e por modalidade (`CardFeeRule`),
sem bandeira, adquirente, faixa de parcelas ou data de vigência; a venda
copia a taxa para o pagamento e gera um recebível por parcela a cada 30 dias
corridos. A pesquisa (relatório de 09/11) mostrou que a taxa de cartão é um
**dado com vigência** e a antecipação é um **evento que muda a data e o
valor do dinheiro**; o Tibé trata a primeira como constante e ignora a
segunda. A base boa já existe (recebível por parcela, saldo derivado, taxa
copiada no pagamento, despesa ligada à venda): a entrega 1 troca a fonte da
regra, não reescreve o módulo.

Este documento cobre **quatro entregas**, cada uma indo a produção sozinha,
e **detalha a entrega 1**. As entregas 2 a 4 ficam esboçadas com as
perguntas que ainda dependem do setor da Agromax. A spec do módulo é
`docs/specs/module-39-meu-emporio.md`; as decisões entram na tabela dela
como **Q250 a Q258**.

## O que o usuário respondeu (09/11)

- Adquirente: hoje só a Stone, mas o modelo fica aberto a mais adquirentes
  (cadastro, não enum).
- Não há TEF nem integração com a maquininha: o operador informa adquirente
  e bandeira no balcão, e a venda registra os dois para ajudar na
  conciliação.
- A taxa é cadastrada **por faixa e por número exato** de parcelas.
- Antecipação: hoje é pontual; se virar automática, a troca tem de ser por
  configuração, sem código.
- Vigência (se a Stone aplica a taxa do mês a todas as vendas do mês ou trava
  a do dia): **em aberto** com o setor. O desenho guarda a vigência e usa a
  linha vigente na data da venda; a tela permite cadastrar o mês seguinte com
  antecedência e corrigir para trás.
- Extrato da Stone para conciliação: em aberto (o setor vai verificar).

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| Q250 | **Adquirente é cadastro da conta** (`CardAcquirer`: nome, arquivada, quem alterou). Os parâmetros de comportamento (devolve a taxa no cancelamento, modo de antecipação, taxa de antecipação, calendário) entram nas entregas 2 e 3 como colunas novas desta tabela, sem migração destrutiva. | Resposta 1 do usuário: Stone hoje, outras depois; e a antecipação precisa virar configuração (resposta 2). |
| Q251 | **Bandeira é grupo fixo:** `CardBrand` = `visa_master`, `elo`, `hipercard`, `amex`, `outra`, mais o coringa `qualquer` só na tabela de taxas (nunca na venda). | É como a Stone e o sistema atual da Agromax agrupam ("VISA / MASTER", "ELO"); um grupo por botão no balcão. |
| Q252 | **Tabela de taxas com vigência** (`CardFeeRate`): por loja, adquirente, bandeira (ou `qualquer`), modalidade (`CardKind`), faixa de parcelas (`installments_from` e `installments_to`; 1 a 1 no débito e no crédito à vista; no parcelado, número exato é faixa de um só), `fee_pct`, `fee_fixed` (R$ por transação, 0 por padrão), `days` (prazo da 1ª parcela em dias corridos, como hoje), conta de destino, `valid_from` (data) e `valid_to` (data, nula = aberta). **Resolução na venda:** linhas da loja, adquirente e modalidade vigentes em `sold_at`; bandeira exata vence `qualquer`; faixa mais estreita que contém o número de parcelas vence a mais larga. **Sem linha:** a venda é recusada dizendo a combinação que falta (loja, adquirente, bandeira, modalidade, parcelas). **Sobreposição** (mesma chave, faixas e vigências que se cruzam) é recusada na action com 409. | Faixa e número exato no mesmo campo (resposta 2); a vigência é o que faz "a taxa do mês" ser dado, não sobrescrita; o `@@unique` não expressa a regra, então ela vive na action. |
| Q253 | **Mudar a taxa não edita a linha vigente:** a tela oferece "Nova vigência a partir de", que encerra a anterior (`valid_to` = véspera) e cria a nova com os mesmos campos para editar. Editar no lugar só é permitido numa linha que **nenhuma venda usou** (sem pagamento apontando para ela). Remover segue a mesma regra; a linha usada se encerra. | Histórico consultável da taxa, que o `AuditLog` não dá; a venda antiga continua explicando o próprio valor. |
| Q254 | **A venda congela a taxa:** `EmporioSalePayment` ganha `acquirer_id`, `brand`, `fee_fixed_amount` e `fee_rate_id` (a linha usada), além de `installments`, `fee_pct` e `fee_amount` que já existem. `fee_amount` passa a ser `round(valor × pct / 100) + fee_fixed`. O recebível (`CardReceivable`) ganha `acquirer_id` e `brand` (cópia, para listar e conciliar sem join na venda). Nada é recalculado depois. A prévia do balcão e `prepararVenda` usam **uma** função de resolução e cálculo (`src/lib/emporio/cartao.ts`). | Snapshot é o que os ERPs maiores fazem e o que a conciliação precisa; a prévia divergir do gravado já aconteceu neste projeto. |
| Q255 | **Balcão:** ao escolher débito, crédito à vista ou parcelado, o pagamento pede adquirente (pré-escolhida quando a conta tem uma só ativa) e bandeira (botões Visa/Master, Elo, Hipercard, Amex, Outra); o parcelado pede o número de parcelas como hoje. A prévia mostra taxa, líquido e a 1ª data. Venda, lista, recibo, a receber do cartão e extrato mostram adquirente e bandeira. | Resposta 1 do usuário: sem TEF, registrar na venda é o que ajuda a conciliar. |
| Q256 | **Migração sem perda:** cada `CardFeeRule` vira uma `CardFeeRate` com adquirente "Maquininha" (criada por conta que tenha regra, renomeável para "Stone"), bandeira `qualquer`, faixa 1 a 1 (débito e crédito à vista) ou 2 a 12 (parcelado), `valid_from` = `created_at` da regra, `valid_to` nulo. Os pagamentos e recebíveis existentes ficam com `acquirer_id` e `brand` nulos (o passado não se inventa). A tabela `CardFeeRule` é removida na mesma migração, depois da cópia. | Produção (Agromax) não pode parar de vender; o que já foi vendido não ganha dado que não existia. |
| Q257 | **Cancelamento na entrega 1 segue como hoje** (a despesa "Taxas de cartão" é cancelada, parcelas futuras somem, as caídas são estornadas). A regra da Stone (a taxa da transação volta, a de antecipação não) entra na entrega 3, quando a antecipação existir. | Sem antecipação gravada não há taxa de antecipação para preservar. |
| Q258 | **Onde fica a tela:** as taxas continuam na página do Caixa (`/emporio/caixa`), onde a regra atual mora, agora como "Adquirentes e taxas de cartão": lista por adquirente com as vigências, botão "Nova vigência", e o cadastro da adquirente. Permissão: a mesma da regra atual (gestor da loja; adquirente é da conta, então Dono e Gerente geral). | Menos mudança para quem já usa; a adquirente é da rede, a taxa é da loja. |

## Entrega 1 (esta): tabela com vigência, snapshot e bandeira no balcão

Escopo: Q250 a Q258. Migração `CardFeeRule` para `CardFeeRate` mais
`CardAcquirer`; actions e rotas de adquirente (`/api/v1/emporio/card-acquirers`)
e de taxas (`/api/v1/emporio/card-fee-rates`, substituindo `card-fee-rules`);
`venderAction` com `acquirer_id` e `brand` por pagamento de cartão
(obrigatórios no cartão; `editarVendaAction` e a troca herdam o mesmo corpo);
leitura (`VendaView.payments[]`, a receber do cartão, extrato, recibo) com
adquirente e bandeira; balcão; página do Caixa; suíte nova (`test:m103`),
roteiro de navegador nos dois sentidos, manual, `/docs/api`, dívidas e
handoff.

Fora da entrega 1: dia útil, taxa por parcela no recebível, antecipação,
extrato da Stone, chargeback, aluguel de máquina.

## Entregas seguintes (esboço, cada uma com spec curta própria)

**Entrega 2: calendário e recebível por parcela.** `CardReceivable` ganha
`fee_amount` por parcela (hoje derivado) e `expected_on` em dia útil
(feriados nacionais; regra "cai no fim de semana vai ao dia útil seguinte"
como parâmetro da adquirente, porque a Stone não a publica); prazo por
modalidade na adquirente (débito D+1 útil, crédito 30, parcelado 30/60/90
como padrão). Perguntas: a Stone move para o dia útil seguinte? Os prazos do
contrato diferem do padrão?

**Entrega 3: antecipação como fato.** Pontual primeiro (`CardAnticipation`
com itens por parcela: data, conta, bruto, líquido, custo; cada parcela
ganha `anticipated_on`, `anticipation_fee`, `settled_net`), depois a
automática por configuração da adquirente (vigência, taxa ao mês,
periodicidade; vale para vendas posteriores à ativação, como na Stone). O
custo vai para `FinancialEntry` em categoria própria "Antecipação de
recebíveis" (despesa financeira), separada de "Taxas de cartão" (que fica na
margem). Cancelamento coerente com a Stone (parâmetro "devolve a taxa da
transação", ligado; a de antecipação não volta; estorno pelo `settled_net`).
Resultado com as duas linhas e o custo efetivo do cartão. Perguntas: a
automática está ativa, desde quando, a que taxa ao mês e com que
periodicidade; o extrato mostra o custo por operação ou por parcela; o
contador separa a antecipação na DRE.

**Entrega 4: conciliação com o extrato da Stone.** Campos opcionais de
conciliação no recebível (identificador da Stone, autorização, data e valor
liquidados) e a linha "diferença de taxa" para registrar a divergência sem
reescrever a venda; importador do arquivo (layouts 2.2 ou 2.4 do portal de
conciliação da Stone) casando por dia, adquirente, bandeira, modalidade,
parcelas e valor bruto (sem TEF não há NSU na venda). Depende de um arquivo
real da Agromax e da resposta sobre quem acessa o portal.

## O que não muda

- Nenhum saldo gravado (invariante 2): o a receber do cartão continua sendo a
  soma das parcelas por data.
- A despesa "Taxas de cartão" continua uma por venda, paga, ligada por
  `createLinkedEntry`, no valor total do MDR (percentual mais fixa).
- As regras do "Vendeu, Pagou" com condição de forma de pagamento continuam
  olhando a modalidade (`debito`, `credito_vista`, `credito_parcelado`), não a
  bandeira.
- O agente do WhatsApp não vende no cartão; nada a mudar nos handlers.

## Fora deste documento

- Integração com TEF ou com a API da Stone (sem pedido).
- Chargeback (sem fonte sobre a regra brasileira).
- Aluguel de máquina (é despesa fixa, já existe o caminho).
