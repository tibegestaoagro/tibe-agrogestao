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
| 1 | Negócio de gado | `Negotiation`, `Contact`, compra e venda, parcelamento, custos, tela, WhatsApp | 1, 2, 7, 8, 9, 10, 11, 15, 16, 24, 25 | `test:m35` |
| 2 | Estoque e produtos | `Product`, categorias por tenant, `StockMovement`, compra/venda/uso, ajuste, mínimo | 3, 4, 17, 19, 20, 21, 22 | `test:m36` |
| 3 | Leilão e eventos | Remessa, "em evento", encerramento com venda parcial | 12, 13, 14 | `test:m37` |
| 4 | Permuta | Troca entre os 4 tipos, com diferença em dinheiro | 5, 6, 18 | `test:m38` |

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
