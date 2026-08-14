# Módulo 31: Área Negociações

**Origem:** `docs/moduloNegociacao/TIBÉ - Area Negociações .docx`, v0.2, 22
seções, lido na íntegra em 2026-08-11.

**Princípio do cliente (§22):** *"O produtor informa o negócio como ele
aconteceu, e o TIBÉ realiza automaticamente os registros necessários."*

Substitui a nomenclatura "Compra e Venda". Cobre compra e venda de gado, compra
e venda de produtos, permutas, leilões e feiras, pagamentos, recebimentos e
movimentação simplificada de estoque, atualizando sozinho Rebanho, Financeiro,
Contas a pagar/receber, Estoque, Máquinas e Histórico.

---

## 1. A decisão central: a Negociação é um ENVELOPE

**O §17.1 pede "registro único". Isso é exigência de EXPERIÊNCIA, não de
armazenamento.** O produtor preenche um formulário só; por baixo, cada peça
continua sendo gravada por quem já sabe gravá-la.

```
                    Negociação  (o que é COMERCIAL)
                    com quem, quanto, custos, parcelas
                              |
        +---------------------+---------------------+
        |                     |                     |
   HerdMovement         FinancialEntry        StockMovement
   (saldo do rebanho)   (o dinheiro)          (saldo de estoque)
```

Os **filhos apontam** para a negociação (`negotiation_id` anulável), e não o
contrário.

**Alternativa descartada: a Negociação como fonte da verdade, gerando os
movimentos.** Dois motivos mataram essa opção:

1. **Nem todo movimento nasce de um negócio.** Nascimento, morte, transferência
   e ajuste não nascem. Com a negociação por cima existiriam dois caminhos de
   escrita para a mesma coisa, e a experiência recente do Módulo 30 mostra que
   caminho duplicado é onde o dado diverge.
2. **Quebraria a invariante que sustenta o rebanho:** saldo nunca é gravado, é
   sempre soma. Essa regra foi validada em produção em 2026-08-11 e é o que
   impede número errado aparecer para o produtor.

---

## 2. As 12 decisões, e por quê

Tomadas com o usuário por grilling, em 3 rodadas, 2026-08-11.

| # | Decisão | Motivo |
|---|---|---|
| 1 | Negociação é **envelope**, não fonte da verdade | Ver seção 1 |
| 2 | Estoque é **livro-razão** (`StockMovement`), não saldo gravado | O §10 pede entrada, saída, ajuste com saldo anterior, estorno e bloqueio de negativo: é literalmente a lista do rebanho, cujo padrão já está escrito e testado |
| 3 | `Contact` é **model novo**, não `ServiceClient` estendido | `ServiceClient` é cliente de quem PRESTA serviço, vive no perfil prestador. Custo aceito: tenant com os dois perfis cadastra a pessoa duas vezes |
| 4 | Parcelamento é **N `FinancialEntry`**, não model novo | Contas a pagar/receber JÁ são `FinancialEntry` pendente, e sobre elas já rodam alerta de vencimento, DRE, fluxo de caixa e painel. Model novo obrigaria a replumbar tudo |
| 5 | **Leilão/feira migra para Negociações**; a fase 2 do M30 fica com os 5 itens sem dinheiro | Remessa num módulo e encerramento em outro seria o registro partido em dois, que o §17.1 proíbe |
| 6 | Custos adicionais são **`FinancialEntry` filhas**, não campos | Comissão é despesa real com contraparte real: em campo, sumiria do DRE e o produtor veria a venda render menos sem saber onde |
| 7 | Permuta v1 aceita **só os 4 tipos que movimentam algo** (animais, produtos, máquina, dinheiro) | "Serviço" e "Outro" não têm módulo que atualizar: virariam texto, quebrando em silêncio a promessa de "registre uma vez e o Tibé atualiza o resto" |
| 8 | Categoria de produto é **tabela por tenant**; unidade é **constante de código** | A constante do rebanho existe porque o §12 exige calcular sexo e idade. Aqui nada é calculado da categoria, é só agrupamento. Já a unidade governa validação (decimal), e uma inventada pelo usuário não teria regra |
| 9 | Situação (§16) é **derivada**, só `canceled_at` gravado | Campo gravado e realidade divergem em silêncio. "Em aberto" nem existe como estado salvo: o §17.2 exige confirmação ANTES de concluir |
| 10 | Editar é **cancelar e refazer** | Uma edição que mude quantidade ou valor teria que desfazer filhos que já podem ter virado dinheiro pago ou animal vendido |
| 11 | Ordem: gado, estoque, leilão, **permuta por último** | A permuta toca 4 módulos ao mesmo tempo; fazer por último é fazer sobre peças já testadas em uso real |
| 12 | WhatsApp **dentro de cada missão**, não missão própria no fim | Os defeitos de WhatsApp do M30 só apareceram em aparelho real e foram muitos: concentrar tudo no fim é descobrir todos de uma vez, no pior momento |

---

## 3. Conflitos entre documentos do cliente

**Mensagem de saldo insuficiente.** O §7.5 daqui pede *"Existem apenas N animais
**disponíveis** nesta categoria. Revise a quantidade informada."* O §10.3 do
Rebanho pede a mesma frase **sem** "disponíveis".

**Decisão: manter a do Rebanho.** O sentido é idêntico, ela já está validada em
produção, e mudá-la quebraria testes de um módulo no ar. Registrado aqui para
não parecer descuido.

---

## 4. As 4 missões

| # | Missão | Entrega | Aceite do §21 | Suíte |
|---|---|---|---|---|
| 1 | Negócio de gado | `Negotiation`, `Contact`, compra e venda, parcelamento, custos, tela, WhatsApp | 1, 2, 7, 8, 9, 10, 11, 15, 16, 24, 25 | `test:m35` + `test:m36` |
| 2 | Estoque e produtos | `Product`, categorias por tenant, `StockMovement`, compra/venda/uso, ajuste, mínimo | 3, 4, 17, 19, 20, 21, 22 | `test:m37` |
| 3 | Leilão e eventos | Remessa, "em evento", encerramento com venda parcial | 12, 13, 14 | `test:m38` |
| 4 | Permuta | Troca entre os 4 tipos, com diferença em dinheiro | 5, 6, 18 | `test:m39` |

> **Numeração:** a missão 1 acabou com DUAS suítes, porque o registro por
> WhatsApp (§18) rendeu uma bateria própria que o contrato não previa. O
> `mNN` é contador de SUÍTES, não de módulo (ver CLAUDE.md), então o `m36`
> ficou com ela e as missões seguintes andaram um número. Renumerar
> colidiria, que é exatamente o estrago que o CLAUDE.md documenta.

---

## 5. Fora desta versão (§20)

Nota fiscal, SEFAZ, tributário, contabilidade completa, integração e
conciliação bancária, estoque por lote, número de série, validade avançada,
múltiplos depósitos, rastreabilidade fiscal, contrato digital, assinatura
eletrônica, cotação de mercado, integração com plataforma de leilão, gestão
avançada de comissão e custo médio contábil de estoque.

---

## 6. Armadilhas descobertas ao implementar

**Devolver erro de dentro de `$transaction` CONFIRMA a transação.** Só um
`throw` faz rollback. Como a negociação é criada antes dos movimentos, um
`return fail(...)` numa venda sem saldo deixava o envelope órfão apontando para
nada. Vale para toda operação composta deste módulo: usar o erro tipado que
aborta e é reconvertido fora da transação (`AbortarNegociacao` em
`negotiations.ts`).

**`recordMovement` abre a própria transação.** Uma negociação com 2 categorias e
3 parcelas são 6 escritas que ou entram todas ou nenhuma. Por isso existe
`recordMovementInTx`, que é o corpo sem a transação. Chamar `recordMovement` em
sequência abriria uma transação por movimento.


---

## 7. Registrado na revisão de 2026-08-13 (terceira rodada de juiz)

Coisas do documento do cliente que NÃO estão na missão 1, para não ficarem nem
feitas nem adiadas:

- **§19, os nove filtros da tela** (hoje, esta semana, este mês, este ano,
  período, tipo, fazenda, contato, situação). A action `listNegotiations` já
  aceita filtro; a tela só herda o seletor global de propriedade. Fica para a
  rodada seguinte, junto com o histórico do aceite 23, porque filtro sem
  volume de dado é enfeite: o primeiro cliente com 200 negócios é quem define
  quais filtros importam de verdade.
- **§13, formas de pagamento** (dinheiro, pix, boleto, prazo...). Não foi
  implementado nem citado. O §14 já cobre PARCELAMENTO, que é o que muda o
  financeiro; a forma em si é informação descritiva. Entra com o Estoque
  (missão 2), onde a mesma escolha aparece na compra de insumo.
- **§6.2 e §7.2 pedem pasto** de destino e de origem. O caminho do WhatsApp lê
  e grava; **o formulário web ainda não tem o campo**. Diferença conhecida e
  registrada, não descuido.
- **Aceite 23 do §21 ("Consultar o histórico")** não estava atribuído a missão
  nenhuma na tabela acima. Fica na missão 2, junto com os filtros do §19.

Divergências deliberadas de vocabulário em relação ao §16, todas a favor do §2
("a área não deverá ter aparência ou linguagem de um sistema contábil"):

- "Confirmada" virou **"A pagar"** (compra) e **"A receber"** (venda). O
  produtor não lê "confirmada" como estado de dinheiro.
- **"Vencida"** foi acrescentada. O §16 não a lista para a negociação, só o
  §14 a lista para a parcela, mas uma negociação com parcela vencida precisa
  se distinguir de uma em dia na única coluna que se lê de relance.
- "Paga" virou **"Quitada"** (compra) e **"Recebida"** (venda), acompanhando a
  distinção que o próprio §16 faz entre os dois lados.

Escolha registrada sobre o estorno: quando o produtor diz que **o dinheiro
voltou**, o estorno cobre o valor pago INTEIRO, inclusive frete e comissão. Na
prática esses custos raramente voltam, mas oferecer devolução parcial exigiria
uma terceira tela de conferência de valores no meio de um cancelamento. Se o
uso real mostrar que atrapalha, o lugar de mexer é `cancelNegotiation`.


## 8. Registrado na revisão de 2026-08-13 (quinta rodada de juiz)

**§17.2 ("apresentar um resumo para confirmação") no formulário web.** O
caminho do WhatsApp cumpre com um resumo explícito e um "sim". O formulário
web envia no clique, sem uma segunda tela. A leitura adotada é que **o
formulário preenchido É o resumo**: ele mostra, ao vivo e antes do envio, o
custo total da compra, o valor líquido da venda e a soma das parcelas, que são
exatamente os números que um resumo mostraria, e o botão diz o que vai
acontecer. Uma segunda tela repetindo os mesmos campos seria fricção sem
informação nova. No WhatsApp o resumo é indispensável porque lá o produtor NÃO
vê o formulário: ele só tem a frase que falou.

Se o cliente entender que o §17.2 exige a etapa extra também na web, é uma
tela a mais, não uma mudança de modelo.

**Compra e venda sem valor.** A regra de desempate manda TODA compra e TODA
venda de gado para `registrar_negocio_gado`, mesmo sem valor na frase, e o
assistente pergunta o valor. A regra anterior deixava a frase sem valor no
livro-razão do rebanho, e o efeito era "comprei 20 bezerros" registrando 20
cabeças e zero dinheiro, em silêncio, contra o §6.1 (valor total obrigatório),
o §17.3 (a compra gera despesa ou conta a pagar) e o §18.6 (perguntar o dado
indispensável que falta). Correção de livro-razão sem dinheiro continua
possível pelos tipos que não são comerciais.


## 9. Registrado na revisão de 2026-08-14 (oitava rodada de juiz)

**§6.2 e §7.2: peso total, peso médio, arrobas, valor por arroba e valor por
cabeça ficam para a missão 2.** Não existem no schema, na action, na rota nem
no WhatsApp. O único registro até aqui era um comentário de componente, com uma
leitura frouxa do parágrafo: o §6.2 diz que o sistema não deve **exigir** esses
campos quando o produtor informar só o valor total, o que não é o mesmo que
dizer que eles não precisam existir. Para quem compra gado, R$/arroba é a
língua do negócio. Adiado, não descartado.

**§5, aceite 7: a v1 do cadastro de contato é o nome digitado no formulário do
negócio.** O model e `POST /api/v1/contacts` aceitam tipo, telefone, município
e observação; a tela expõe só o nome. Não existe lista de contatos, nem edição,
nem como corrigir um nome duplicado. Isso atende "cadastro simples e rápido" no
fluxo em que ele importa (registrar o negócio sem parar para cadastrar
ninguém), e deixa a gestão de contatos para a missão 2, junto com os filtros do
§19 e o histórico do aceite 23.

**Pasto no contrato do classificador.** A seção 7 dizia que "o caminho do
WhatsApp lê e grava" o pasto, e isso era verdade no código e falso no contrato:
`docs/n8n-whatsapp-workflow.md` não listava `pasto` entre os parâmetros de
`registrar_negocio_gado`, então o campo só chegava por acaso, herdado do
contrato da outra intenção. Corrigido no guia. O handler passou a ler também
`pasto_destino`, que é o nome que o §6.2 usa para a compra.
