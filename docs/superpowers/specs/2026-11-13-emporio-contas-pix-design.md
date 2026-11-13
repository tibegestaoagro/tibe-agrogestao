# Empório: mais de uma conta PIX, escolhida na hora de lançar (Q310 a Q317)

Pedido do usuário em 13/11/2026: "a agromax tem uma conta de PIX que é faturada
em cada loja e uma conta PIX do site. quando for escolher a forma de pagamento
PIX precisamos escolher qual está sendo faturada naquele momento".

## Por que

Cada conta PIX recebe num CNPJ. Lançar o PIX na conta errada bagunça a
conferência do extrato e o faturamento por CNPJ. Hoje a venda sempre cai na
conta PIX da loja, e a conta do site não tem como ser escolhida.

## Como está hoje (13/11/2026)

- `BankAccount` tem só `name` e `bank`. Cadastro em Caixa > Contas.
- Cada loja aponta para uma conta (`Establishment.pix_bank_account_id`, Q83),
  em "Definir conta PIX".
- O servidor já aceita `payments[].bank_account_id` na venda
  (`prepararVenda`, `emporio-vendas.ts`) e `bank_account_id` no recebimento de
  fiado (`emporio-caixa.ts`); sem ele, usa a conta da loja. Nenhuma tela manda
  esse campo.
- A conta também serve para cartão, boleto, cheque e pagamentos. Isso não muda.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q310 | **Cadastro da conta:** identificador (o `name` de hoje, obrigatório), **CNPJ** (`document`, opcional, conferido pelo mesmo validador do fornecedor, que aceita o CNPJ alfanumérico da Receita; gravado sem pontuação) e **favorecido** (`beneficiary`, opcional, até 120 letras), além do banco que já existe. Contas já cadastradas continuam válidas | decisão do usuário: "só para cargo de lançamento nesse momento" |
| Q311 | **Disponibilidade da conta para o PIX:** "todas as lojas" (padrão, e o que as contas de hoje viram) ou uma lista de lojas, com pelo menos uma | decisão do usuário: liberdade sem tirar o recurso que limita |
| Q312 | A disponibilidade **só vale para escolher a conta do PIX** (venda e fiado). Cartão, boleto, cheque, pagamentos e saldo inicial seguem aceitando qualquer conta ativa | o pedido é sobre o PIX; restringir o resto mudaria fluxos que funcionam |
| Q313 | **A conta PIX da loja continua existindo** e é a que vem marcada. Ela precisa estar disponível para a loja: definir uma conta indisponível é recusado (`bank_account_id`), e mudar a disponibilidade de uma conta que é a PIX de uma loja fora da nova lista também (`establishment_ids`, a mensagem diz a loja) | não deixa o padrão apontar para conta que a loja não pode usar |
| Q314 | **No balcão** (venda nova e editar venda) e **no recebimento de fiado**: ao escolher PIX aparece "Conta do PIX", com as contas ativas disponíveis para a loja e a da loja marcada. Embaixo, o favorecido e o CNPJ da escolhida, para o caixa conferir. Com uma conta só disponível, o campo aparece já preenchido. Sem conta da loja e com várias disponíveis, nada vem marcado e a tela pede "Escolha a conta do PIX" (achado do juiz: marcar a primeira poria o PIX num CNPJ que ninguém escolheu) | decisão do usuário: o caixa vê a identificação no momento de lançar |
| Q315 | **O servidor confere:** conta informada precisa estar ativa e disponível para a loja da venda (`VALIDATION_ERROR`, `field` `payments`; no fiado, `bank_account_id`). Sem conta informada, a da loja, como hoje. Ao **editar** uma venda, a conta que já estava num PIX dela é aceita mesmo que tenha deixado de estar disponível (o mesmo princípio do franqueado arquivado) | regra no servidor, a tela só ajuda |
| Q316 | **Para o cliente nada muda:** orçamento, venda A4 e cupom mostram só "PIX" | decisão do usuário |
| Q318 | **"Não recebe PIX"** como terceira escolha de "Disponível para PIX em" (`receives_pix: false`): a conta some da lista do PIX e a lista de lojas é apagada. Tirar do PIX a conta PIX padrão de uma loja ativa é recusado (`receives_pix`, citando a loja). **Na migração**, conta que não é padrão de nenhuma loja e nunca recebeu PIX (venda ou fiado) nasce "não recebe PIX" | decisão do usuário em 13/11, depois de ver que a Da Mata tem 11 contas ativas e só uma recebe PIX (as outras são cartão, caixa interno e bancos) |
| Q317 | **Relatório:** o relatório de vendas ganha "PIX por conta": por conta, quantidade de pagamentos e valor, das vendas que o relatório já conta no período, no total e por loja. A tela da venda (interna) mostra a conta ao lado do PIX | decisão do usuário: a identificação sai no relatório |

## Quem vê a lista no balcão

Quem vende (`vendedor_da_loja`, o que inclui o Caixa) precisa da lista das
contas PIX disponíveis para a loja. Hoje `listarContasAction` exige gestor ou
financeiro. Nasce uma leitura enxuta só com o necessário para escolher
(id, identificador, banco, favorecido, CNPJ, se é a da loja), por loja, para
quem vende nela. O saldo das contas continua restrito.

## Dados

- `BankAccount`: `document String?`, `beneficiary String?`,
  `pix_all_establishments Boolean @default(true)`.
- Model novo `BankAccountPixEstablishment` (`tenant_id`, `bank_account_id`,
  `establishment_id`, único no par, apagado com a conta ou a loja), em
  `TENANT_SCOPED_MODELS`.
- Migração aditiva: nada existente muda de comportamento.

## API (extensão aditiva)

- `POST /api/v1/emporio/bank-accounts` e `PATCH .../[id]`: aceitam `document`,
  `beneficiary`, `pix_all_establishments` e `establishment_ids` (lista,
  obrigatória com pelo menos uma loja quando `pix_all_establishments` é
  `false`). A view da conta devolve os quatro.
- Leitura nova das contas PIX de uma loja, para quem vende nela (caminho a
  definir pelo builder seguindo as rotas do Empório, documentada em `/docs/api`).
- Venda e fiado: nenhum campo novo; `bank_account_id` passa a ser conferido.

## Fora

QR code ou chave PIX no impresso; conciliação com extrato; outras formas de
pagamento escolherem conta; o relatório do turno quebrar o PIX por conta (fica
como está: "Em conta").

## O que fica com o builder

O nome do caminho da leitura nova; o lugar exato do bloco no relatório e na
exportação, seguindo o que já existe; o texto das mensagens.
