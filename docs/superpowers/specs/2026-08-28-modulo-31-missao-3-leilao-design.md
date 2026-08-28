# Módulo 31, missão 3: leilão, feira e eventos

**Data:** 28 de agosto de 2026
**Frente:** 3 de 5, da
[sequência para fechar os módulos](2026-08-27-sequencia-para-fechar-os-modulos-design.md)
**Contrato:** §8 e §17.8 do documento do cliente (`docs/moduloNegociacao/`), mais
as decisões 5, 6, 11 e 12 da
[spec do Módulo 31](../../specs/module-31-negociacoes.md)
**Suíte:** `m48`

---

## 1. O problema, na frase do cliente

> O simples envio de animais para um evento não será considerado venda.
> Primeiro deverá existir uma remessa temporária.

E, mais adiante, o §17.8 repete o mesmo com outras palavras: "o envio de animais
para leilão, feira ou evento não poderá gerar venda antes da confirmação".

O erro que este módulo existe para impedir é **receita nascendo cedo**: mandar
20 cabeças para um leilão não é vender 20 cabeças, e um sistema que registra a
venda no envio mostra dinheiro que não entrou e tira do rebanho gado que ainda
é do produtor.

O encerramento é onde mora o resto do risco. O produtor informa quantos foram
vendidos, quantos retornaram e quantos seguiram para outro destino, e **a soma
tem que corresponder à quantidade enviada**.

## 2. A tensão que esta frente resolve

Duas estruturas prontas apontavam para a mesma coisa:

- `NegotiationType.evento`, criado na missão 2, com o comentário citando §8 e
  §17.8;
- `HerdStayType.evento`, criado na frente 2 (fase 2 do Módulo 30).

A decisão 5 da spec do Módulo 31 manda o leilão morar em Negociações, porque
"remessa num módulo e encerramento em outro seria o registro partido em dois".
A decisão 1 da mesma spec diz que **"registro único" é exigência de
experiência, não de armazenamento**: o produtor preenche um formulário só, e
cada peça é gravada por quem sabe gravá-la.

As duas se conciliam assim: **a Negociação é o envelope, e a estadia é filha
dela.**

## 3. As decisões, e por quê

| # | Decisão | Motivo |
|---|---|---|
| 1 | A remessa é uma **`Negotiation(evento)`** com uma **`HerdStay(evento)` filha** | Cada estrutura faz o que já sabe: o envelope guarda o comercial, a estadia guarda ONDE os animais estão. O leilão aparece em Negociações e em "Fora da fazenda agora" sem código novo |
| 2 | **Um registro só:** a mesma negociação ganha o valor no encerramento | É o registro único do §17.1. O produtor vê UMA linha, do envio ao fechamento. Consequência assumida: `amount` deixa de ser só dado de entrada e passa a ser preenchido depois |
| 3 | **"Outro destino" abre uma estadia nova** | É o que aconteceu de verdade: as cabeças não voltaram nem foram vendidas. Devolvê-las ao rebanho registraria um retorno que não houve, e dar baixa faria gado sumir sem venda, morte nem perda |
| 4 | **Sem valor quando não houve venda** | Aceitar valor num encerramento em que todos voltaram criaria receita sem contrapartida no rebanho. Esta regra não está escrita no documento: é decisão nossa, registrada aqui |
| 5 | **Handler de WhatsApp sim, classificador não** | O §19 pede as três operações por conversa ("criar remessas", "registrar vendas parciais", "registrar o retorno"). A decisão do usuário mantém o n8n congelado |
| 6 | Comissão, taxa e frete são **`FinancialEntry` filhas** | Decisão 6 da spec do Módulo 31, já implementada: comissão é despesa real com contraparte real, e como campo sumiria do DRE |

## 4. Modelo de dados

O que muda é pequeno, porque quase tudo já existe.

| Mudança | Conteúdo |
|---|---|
| `HerdStay.negotiation_id` (anulável) | de qual envelope a estadia nasceu |
| `HerdStay.event_type` (anulável) | "tipo do evento" do §8.1: leilão, feira, exposição |

**Nenhum tipo de movimento novo.** `envio_evento` e `retorno_estadia` nasceram
na frente 2, e a venda usa o `venda` que existe desde a fase 1.

Os campos do §8.1 mapeiam nos que a estadia já tem: nome do evento em
`location_name`, leiloeira ou organizador em `counterparty_name`, município em
`city`, data prevista de retorno em `expected_end_at`, observação em `notes`.

**Consequência de escopo:** `HerdStay(evento)` deixa de ser criável
diretamente. O formulário de estadia da frente 2 continua oferecendo pasto de
terceiro, boitel, animais de terceiros e desaparecimento, e **não** oferece
evento: quem abre remessa é Negociações. Um caminho só para cada coisa.

## 5. Abrir a remessa

`POST /api/v1/negotiations/events`, numa transação só:

1. `Negotiation(evento)` **sem `amount`**, com contato (a leiloeira) resolvido
   ou criado dentro da transação, como a missão 1 já faz;
2. `HerdStay(evento)` filha, com os campos do §8.1;
3. movimento `envio_evento`, de `presente`/`proprio` para `evento`/`proprio`,
   apontando para os dois por `negotiation_id` e `stay_id`.

**Nenhum lançamento financeiro nasce aqui.** É o §17.8, e é o ponto em que
errar custa mais caro: receita antes da confirmação.

O bloqueio de saldo negativo é o mesmo de sempre, porque é o mesmo
`recordMovementInTx`: sem cabeça suficiente, nada é gravado, e a recusa aponta
`quantity`.

## 6. Encerrar

`POST /api/v1/negotiations/{id}/close-event`. O produtor informa os três
destinos, e a soma precisa ser igual ao que está na remessa. Não batendo, o
servidor devolve `DESTINOS_NAO_BATEM` com `field: "quantity"`, e nada se move.

| Destino | No livro-razão |
|---|---|
| Vendidos | `venda`: saem definitivamente do rebanho |
| Retornaram | `retorno_estadia`: voltam para `presente` |
| Outro destino | fecham esta remessa e abrem uma `HerdStay` nova, do tipo que o produtor escolher |

O dinheiro, todo ligado à mesma negociação:

- o valor da venda vira `amount` e o lançamento `principal`, pago ou a receber,
  com parcelas quando houver (a soma das parcelas tem que dar o valor, regra
  que a missão 1 já aplica);
- comissão, taxa e frete viram lançamentos `custo_adicional`, um por linha,
  cada um com a sua descrição.

**Encerramento parcial não é caso especial**: é um encerramento em que um dos
baldes é "outro destino". A soma sempre fecha, o que varia é para onde foram.

## 7. Cancelar

`cancelNegotiation` já desfaz os filhos de uma negociação: movimentos de
rebanho voltam, lançamento pendente é apagado, pago ganha estorno. Ele passa a
desfazer **a estadia junto**, com a mesma regra da frente 2: recusa quando já
houve encerramento, porque desfazer o que já foi vendido é decisão do produtor.

## 8. Entrega e provas

Ordem do protocolo: **action, depois rota, só então tela.** O handler de
WhatsApp nasce junto (decisão 5), sem tocar no classificador.

A tela aparece em dois lugares, porque a remessa é as duas coisas: o formulário
e a linha do negócio em **Negociações**, e as cabeças em **Rebanho**, na lista
"Fora da fazenda agora", sem código novo, porque são uma estadia como as
outras.

**Suíte `m48`**, com o exemplo do próprio documento (20 enviados, 12 vendidos,
8 retornados):

- a remessa nasce **sem lançamento financeiro nenhum** (§17.8);
- o rebanho próprio não muda no envio, e as cabeças saem da quantidade física;
- a soma dos três destinos precisa bater, e não batendo nada se move;
- a venda parcial gera receita só para os vendidos, e a comissão nasce como
  `custo_adicional` ligado à mesma negociação;
- "outro destino" fecha a remessa e abre a estadia nova, sem cabeça sumir;
- encerramento sem venda recusa valor (decisão 4);
- cancelar desfaz rebanho, dinheiro e estadia juntos.

Mais `test:isolation` pelas rotas novas e `test:docs-api` pela documentação.

**Migração antes do push**, com as duas colunas, aplicada primeiro no Docker
local e no Neon só junto do merge, como ficou combinado na frente 2.

**Validação ao vivo** no navegador: o caso 12/8 do documento ponta a ponta, com
os números do painel de Rebanho anotados antes e depois, e a conferência de que
nenhuma receita existe entre o envio e o encerramento.

## 9. Fora desta frente

- **Permuta**: é a missão 4, e a spec do Módulo 31 manda ser a última, porque
  toca quatro módulos sobre peças já testadas em uso real.
- **Integração com plataforma de leilão**: o §20 põe fora desta versão.
- **Classificador do n8n**: congelado por decisão do usuário até o sistema
  estar completo.
