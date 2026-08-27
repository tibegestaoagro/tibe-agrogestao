# Módulo 30, fase 2: estadias temporárias do rebanho

**Data:** 27 de agosto de 2026
**Frente:** 2 de 5, da
[sequência para fechar os módulos](2026-08-27-sequencia-para-fechar-os-modulos-design.md)
**Contrato:** `docs/Modulo Rebanho/complemento - modulo Rebanho.doc`, o
documento do cliente, mais a seção 5 da
[spec do Módulo 30](../../specs/module-30-rebanho-livro-razao.md)
**Suíte:** `m47`

---

## 1. O problema, na frase do cliente

O complemento do Rebanho não abre com um fluxo. Abre com uma constatação:

> Essas seis situações mostram que o módulo Rebanho precisa separar três
> conceitos que até agora estavam misturados: quantidade de animais,
> propriedade dos animais e localização dos animais.

E com a regra que decorre dela:

> O Tibé deverá mostrar separadamente: rebanho próprio total; animais próprios
> na fazenda; animais próprios fora da fazenda; animais de terceiros na
> fazenda. Isso evita que o sistema mostre um total errado.

Ou seja: **a fase 2 é primeiro uma mudança de modelo, e só depois cinco
fluxos.** Um animal pode continuar sendo do produtor e não estar na fazenda; a
fazenda pode ter animais que não são do produtor. Hoje o sistema não sabe dizer
isso, porque a fase 1 sempre grava `situation: presente` e `owner: proprio`.

Os cinco fluxos: pasto de terceiros, animais de terceiros na fazenda,
desaparecimento, confinamento próprio e boitel. O sexto do documento, leilão e
feira, **não está aqui**: ele migrou para Negociações pela decisão 5 da spec do
Módulo 31, porque remessa num módulo e encerramento em outro seria o registro
partido em dois.

## 2. O terreno já está pronto

Conferido no `prisma/schema.prisma`, e deixado assim de propósito por quem
escreveu a fase 1:

- `HerdSituation` já tem `presente`, `evento`, `pasto_terceiro`, `boitel`,
  `confinamento` e `desaparecido`.
- `HerdOwner` já tem `proprio` e `terceiro`.

O comentário do schema explica: incluir o eixo depois obrigaria a migrar toda
movimentação já gravada. O que falta são os **tipos de movimento** e o que a
tela faz com esses eixos.

## 3. As decisões, e por quê

| # | Decisão | Motivo |
|---|---|---|
| 1 | A fase 2 **gera lançamento financeiro** | O documento pede: pasto de terceiros e boitel geram despesa ou conta a pagar, animais de terceiros geram receita ou conta a receber. O apelido "os 5 itens sem dinheiro", que o `dividas.md` usa, descreve a ausência de VENDA, não a de financeiro |
| 2 | Um model **`HerdStay`**, com as movimentações apontando para ele | O encerramento exige identidade ("a soma das destinações deve corresponder à quantidade enviada"), e o saldo por posição não distingue uma remessa de 20 de duas de 10. Mesma forma da decisão 1 do Módulo 31, já validada em produção |
| 3 | **Desaparecimento usa o mesmo model**, com lugar e contraparte nulos | Tem a mesma forma (não estão presentes, é temporário, termina de um jeito entre poucos). A diferença é de REGRA, não de estrutura, e regra por tipo é tabela de validação, não tabela de banco |
| 4 | **Confinamento próprio é pasto**, não situação | O documento pede literalmente que ele seja "cadastrado como um local interno da fazenda, semelhante a um pasto". Usar também `HerdSituation.confinamento` criaria dois jeitos de responder a mesma pergunta |
| 5 | **Desaparecido conta no rebanho próprio**, em linha própria | O animal continua sendo do produtor até a perda ser confirmada. Assim o total não cai sozinho quando alguém registra um sumiço, e a diferença fica explicada em vez de sumir |
| 6 | O lançamento usa **o valor que o produtor informar**, sem cálculo | A forma de cobrança (por cabeça, por mês, por período, fechado) é gravada como informação do acordo. O documento não define a fórmula (mês cheio ou proporcional? conta o dia da saída?), e fórmula inventada gera dinheiro errado em silêncio, que é o pior modo de falha deste produto |
| 7 | **Sem WhatsApp nesta frente** | O complemento não pede registro por WhatsApp para estes fluxos, ao contrário do documento principal, que pedia nos §13 e §14. Não se inventa intenção que o contrato não tem |

**Consequência assumida da decisão 4:** o valor `confinamento` do enum
`HerdSituation` fica sem uso. Está registrado aqui para a próxima sessão não
procurar o que ele faz nem inventar um uso.

## 4. Modelo de dados

### `HerdStay`

Uma estadia é um episódio em que as cabeças estão fora do normal,
temporariamente, e que termina.

| campo | conteúdo |
|---|---|
| `type` | `pasto_terceiro`, `boitel`, `evento`, `terceiro_na_fazenda`, `desaparecimento` |
| `property_id` | a fazenda de origem, ou a que recebe os animais de terceiros |
| `counterparty_name` | dono do pasto, nome do boitel, dono dos animais de terceiros |
| `location_name`, `city` | identificação do local e município, opcionais |
| `started_at` | data de saída, de entrada ou em que o sumiço foi percebido |
| `expected_end_at` | retorno previsto, opcional |
| `charge_type` | `por_cabeca`, `por_mes`, `por_periodo`, `fechado`, opcional |
| `charge_value` | valor estimado ou contratado, opcional |
| `reason` | motivo provável, usado pelo desaparecimento |
| `notes` | observação livre |
| `canceled_at` | cancelar não apaga, como no resto do projeto |

**O que o model NÃO tem, e por quê:**

- **Quantidade.** É a soma das movimentações que apontam para a estadia. O
  invariante 2 vale aqui igual: se você se pegar escrevendo um campo de
  quantidade, parou no lugar errado.
- **Situação de aberta ou encerrada.** A estadia está aberta enquanto o saldo
  derivado dela for maior que zero. É a decisão 9 do Módulo 31: campo gravado e
  realidade divergem em silêncio.

`HerdStay` entra em `TENANT_SCOPED_MODELS`, e `npm run test:isolation` reprova
se isso for esquecido.

### `HerdMovement`

Ganha `stay_id` anulável, exatamente como já tem `negotiation_id`: **o filho
aponta para o envelope**, nunca o contrário.

Tipos novos em `HerdMovementType`:

| tipo | de onde sai | para onde vai |
|---|---|---|
| `envio_pasto_terceiro` | `presente`, próprio | `pasto_terceiro`, próprio |
| `envio_boitel` | `presente`, próprio | `boitel`, próprio |
| `retorno_estadia` | a situação da estadia | `presente`, próprio |
| `entrada_terceiro` | nada (é entrada) | `presente`, terceiro |
| `saida_terceiro` | `presente`, terceiro | nada (é saída) |
| `desaparecimento` | `presente`, próprio | `desaparecido`, próprio |
| `perda_confirmada` | `desaparecido`, próprio | nada (saída definitiva) |

Um só `retorno_estadia` para os três casos de volta, porque a situação de
origem já diz de onde o animal está voltando. Morte confirmada de um
desaparecido reusa o `morte` que já existe, com origem em `desaparecido`.

Confinamento próprio **não cria estadia nem tipo novo**: é o
`transferencia_pasto` que já existe, para um pasto que representa o
confinamento (decisão 4).

## 5. Os cinco números

Hoje `summarizePositions` (`src/lib/herd/summary.ts`, função pura, testada pelo
`test:m32`) recebe `SummarizablePosition` sem `situation` nem `owner`. A tela
busca os dois e joga fora. Passam a entrar:

| número | fórmula |
|---|---|
| Rebanho próprio | `owner = proprio` |
| Próprios na fazenda | `owner = proprio` e `situation = presente` |
| Próprios fora | `owner = proprio` e situação em (`evento`, `pasto_terceiro`, `boitel`) |
| Desaparecidos | `owner = proprio` e `situation = desaparecido` |
| De terceiros aqui | `owner = terceiro` |
| Total físico na propriedade | próprios na fazenda + de terceiros |

A identidade que a tela precisa respeitar: **próprio = na fazenda + fora +
desaparecidos**. O exemplo do documento (180 próprios, 150 na fazenda, 30 fora,
40 de terceiros, 190 no total físico) entra como caso do `m32`.

## 6. Os fluxos, e o encerramento

Duas rotas, não cinco, porque os cinco fluxos são o mesmo ciclo com validação
diferente:

- **`POST /api/v1/herd/stays`**: abre a estadia e grava a movimentação de envio
  no mesmo passo. Um registro, uma ação do produtor.
- **`POST /api/v1/herd/stays/{id}/close`**: encerra, informando os destinos.
- **`GET /api/v1/herd/stays`**: lista, com o saldo aberto derivado de cada uma.
- **`POST /api/v1/herd/stays/{id}/cancel`**: cancela a estadia inteira, e com
  ela as movimentações que nasceram dela.

**A regra do encerramento**, que é o que o documento cobra: o produtor informa
quantos foram vendidos, quantos retornaram e quantos seguiram para outro
destino, e a soma tem que bater com a quantidade enviada. O servidor recusa
quando não bate, com o campo apontado (`quantity`), aproveitando o `field` do
envelope de erro que a frente 1 abriu.

Encerramento parcial não é caso especial: é um encerramento que não zera o
saldo da estadia. A spec do Módulo 30 avisa que **é aí que moram os piores
bugs**, e é por isso que existe uma rota só, e não uma por fluxo.

### Validação por tipo

Uma tabela, não um `if` espalhado pelo código:

| tipo | permite | proíbe |
|---|---|---|
| `pasto_terceiro` | retorno total ou parcial, venda direta, morte | entrada de terceiro |
| `boitel` | retorno, venda direta, morte, transferência para outro local | idem |
| `desaparecimento` | encontrado (retorno), morte confirmada, perda confirmada | **venda, transferência e qualquer outra movimentação** |
| `terceiro_na_fazenda` | saída total ou parcial, transferência entre pastos da propriedade | entrar no rebanho próprio por qualquer caminho |

A linha do desaparecimento é regra escrita do documento: "enquanto o
desaparecimento estiver em aberto, o animal deverá aparecer separadamente no
resumo e não poderá ser vendido, transferido ou movimentado".

## 7. O dinheiro

Quando o produtor informa `charge_value`, nasce **um** lançamento por
`createLinkedEntry` (`src/lib/financial.ts`), que é o caminho único de todo
lançamento automático do projeto:

- `pasto_terceiro` e `boitel`: despesa ou conta a pagar;
- `terceiro_na_fazenda`: receita ou conta a receber.

Valor exatamente igual ao informado, sem cálculo (decisão 6). Vencimento na
data que o produtor escolher, com o `expected_end_at` como sugestão.

Cancelar a estadia antes de o lançamento virar dinheiro apaga o lançamento
pendente; se já foi pago, segue o mesmo tratamento que o Módulo 31 já dá para
esse caso, com estorno em vez de apagamento.

## 8. Entrega e provas

Ordem do protocolo: **action, depois rota, só então tela.**

A tela recebe duas coisas: o painel dos cinco números no Rebanho, que o piloto
da frente 1 deixou de fora esperando esta frente, e uma lista de estadias
abertas com o saldo de cada uma e o botão de encerrar. Tudo com o kit do
piloto: `FormSheet`, `Field`, `EmptyState`, e nenhuma cor crua, que a catraca
do `npm run check` agora reprova.

**Suíte `m47`:**

- a soma dos destinos bate com o enviado, e o servidor recusa quando não bate;
- encerramento parcial deixa a estadia aberta com o saldo certo;
- desaparecido recusa venda, transferência e movimentação que não seja um dos
  três encerramentos;
- animal de terceiro nunca entra no rebanho próprio;
- o lançamento financeiro nasce ligado à estadia e some quando ela é cancelada
  antes de virar dinheiro.

Mais o `m32` com o exemplo dos cinco números, e o `test:isolation` cobrindo o
model novo.

**Migração antes do push** (invariante 3): model novo e valores novos de enum,
gerados por `migrate diff`, aplicados primeiro no Docker local e só então no
Neon, lembrando de remover do SQL os dois `DROP INDEX` que o `migrate diff`
sempre sugere para os índices parciais.

**Validação ao vivo**, porque suíte verde não é validação (invariante 8):
navegador real com `next dev`, incluindo o caso que mais importa, que é enviar
20 e encerrar com 12 vendidos e 8 retornados, conferindo os cinco números antes
e depois.

## 9. Fora desta frente

- **Leilão e feira**: é a missão 3 do Módulo 31 (frente 3).
- **WhatsApp**: decisão 7.
- **Cobrança recorrente**: um boitel por mês, com fim desconhecido, exigiria
  maquinaria de recorrência que o projeto não tem e dependeria do worker da
  rotina diária, que ainda não foi provisionado.
- **Rebanho por categoria em vez de por brinco**: continua sendo decisão de
  produto represada com o cliente, fora do escopo combinado.
