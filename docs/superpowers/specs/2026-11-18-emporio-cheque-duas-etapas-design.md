# Empório: cheque em duas etapas (frente C, Q354 a Q356)

Terceira frente do plano de 17/11
([2026-11-17-emporio-plano-gestaoclick.md](2026-11-17-emporio-plano-gestaoclick.md)),
detalhando a Q343. Origem: na reunião de 09/11 a Laiza contou que quem faz a
venda nem sempre é quem recebe o cheque, e que cheques chegam em nome de outras
pessoas ("recebemos dois cheques numa venda, em nome de outras pessoas, e no
financeiro caiu tudo em nome do cliente"). A proposta dela: no balcão, só o
cheque, o valor e o nome; o cadastro do cheque (número, banco, datas) é feito
pelo Financeiro.

## Por que

O cadastro do cheque fica hoje com quem vende, e não com quem recebe e cuida do
cheque. Quem vende trava a venda por falta de um dado que não tem, ou digita
qualquer coisa. A frente tira esse peso do balcão e põe o cadastro com quem o
faz de verdade, sem deixar o cheque incompleto se perder.

## O que existe hoje

- A venda cria um `EmporioCheck` por linha de pagamento `cheque`
  (`sale_payment_id` único): mais de um cheque na venda já são várias linhas.
- `number`, `bank`, `good_for` e `holder_name` são NOT NULL. A action
  `prepararVenda` (`src/lib/actions/emporio-vendas.ts`, bloco `kind === "cheque"`)
  recusa com 422 em `payments` se faltar número, banco ou data.
- **"Em nome de" já existe (Q284):** vem preenchido com o nome do cliente e é
  editável. Um titular diferente do cliente já é o "cheque de terceiros".
- Cheque exige cliente de verdade (422 em `customer_id` para o Consumidor final).
- Carteira: depositar (`chave:depositar_cheque` ou `dinheiro`), compensou e
  voltou (`gestor_da_loja` ou `dinheiro`). **Não existe editar cheque:** a única
  forma de mudar um dado é editar a venda, que recria os cheques.
- Leem `good_for`: A receber (faixas vencido, hoje e a vencer, `emporio-financeiro.ts`),
  o Hoje do Financeiro ("Vence hoje a receber"), a Projeção (`emporio-projecao.ts`),
  o atraso na ficha do cliente (`emporio-clientes.ts`), a ordem da carteira
  (`emporio-caixa.ts`), a tela da venda (`vendas/[id]/page.tsx`) e o painel de
  editar venda (`venda-estado.ts`). O impresso da venda só usa o titular; o
  romaneio não tem pagamento.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q343 | Confirmada: no balcão, **valor e nome** (o nome vem do cliente da venda e é editável: é o cheque de terceiros). Número, banco e bom para são completados depois | proposta da Laiza na reunião; resposta do usuário em 17/11 |
| Q354 | **O "bom para" também fica para depois.** Sem data, o cheque fica "A completar": aparece destacado, e só entra em vencido, hoje, a vencer, Projeção e atraso do cliente depois de completado | decisão do usuário em 18/11 (a Laiza: "pode pôr só cheque e valor") |
| Q355 | **Completam e corrigem:** quem tem `dinheiro` (Dono, Gerente geral, Financeiro) e o **Gestor da loja do cheque**. O Vendedor e o Caixa não | decisão do usuário em 18/11: quem recebe o cheque na loja completa na hora |
| Q356 | **Caminho A:** `number`, `bank` e `good_for` passam a aceitar nulo. "A completar" é **calculado**: cheque com algum dos três nulo. As situações (`recebido`, `depositado`, `compensado`, `devolvido`, `devolvido_ao_cliente`) não mudam | decisão do usuário em 18/11 |

## Abordagens consideradas

- **A. Campos anuláveis, "A completar" calculado (escolhida).** Migração que só
  tira o NOT NULL. Nada para manter de acordo: completo ou não é sempre o que os
  campos dizem.
- **B. Situação nova `a_completar`.** Mais explícita, mas todo filtro por
  situação (carteira, A receber, Projeção, cancelamento, voltou) precisaria
  aprender a nova, e ficaria possível um `recebido` sem data ou um `a_completar`
  cheio, se algum caminho esquecesse de trocar.
- **C. Valor provisório** (número "a completar", data fictícia). Descartada:
  toda soma e todo relatório leriam a data falsa como verdade.

## Comportamento

### No balcão (venda, orçamento faturado, troca, editar venda)

- A linha de cheque pede **valor** e **Em nome de** (obrigatórios; o nome vem do
  cliente, como hoje, até 120 letras).
- Número, banco e bom para ficam **opcionais**, num bloco recolhido "Tenho os
  dados do cheque" (minha chamada de tela: quem tem o cheque na mão completa ali
  e o cheque já nasce completo). Preencher só parte vale: o que faltar fica para
  depois.
- Data informada continua tendo de ser uma data válida (422 em `payments`).
  Número e banco têm teto de tamanho (minha chamada: 30 e 60 letras), aparados.
- Cheque segue exigindo cliente de verdade.
- O rótulo do campo fica "Em nome de (cheque de terceiros: troque o nome)" ou
  equivalente curto (minha chamada de texto).

### Cheque "A completar"

- **Definição:** `status = recebido` e (`number` nulo ou `bank` nulo ou
  `good_for` nulo). Só existe em `recebido`, porque não se deposita incompleto.
- **Não se deposita:** `depositarChequeAction` recusa com 409 `CHEQUE_INCOMPLETO`
  ("Complete o número, o banco e o bom para antes de depositar").
- **Voltou** e **cancelar a venda** (devolver ao cliente) seguem valendo para o
  cheque incompleto, como para o recebido.
- **Fora das datas:** sem `good_for`, não entra em vencido, hoje, a vencer, na
  Projeção nem no vencido da ficha do cliente. **Com data e sem número ou
  banco, entra pelas datas normalmente** (minha chamada: o vencimento depende só
  da data; o selo "A completar" continua), então os filtros do Prisma por
  `good_for` não ganham condição nova. **Entra** no "em aberto" do
  cliente e no total da carteira, porque é dinheiro que o cliente deve.
- **Onde aparece destacado:**
  - Cheques em carteira (A receber) e a seção de cheques do Caixa: selo
    "A completar" e "-" no lugar do que falta, no topo da lista.
  - Hoje do Financeiro: cartão ou linha "Cheques a completar: N, R$ X", com
    link para a carteira filtrada.
  - Tela da venda: "Cheque a completar" em vez de número, banco e data (hoje
    sairia 01/01/1970).

### Completar (e corrigir)

- Ação nova `completarChequeAction` em `src/lib/actions/emporio-caixa.ts` (onde
  moram as outras do cheque) e rota `PATCH /api/v1/emporio/checks/:id` (minha
  chamada de contrato), corpo com `number`, `bank`, `good_for` e `holder_name`,
  todos opcionais, ao menos um.
- **Só em `recebido`** (completo ou não): depositado, compensado, voltou ou
  devolvido recusam com 409. Corrigir um cheque já completo é o mesmo caminho.
- Pode deixar um campo ainda vazio (completar aos poucos); não pode apagar um
  campo já preenchido (minha chamada: corrigir troca, não esvazia) nem esvaziar
  o nome.
- Permissão: `dinheiro`, ou `gestor_da_loja` da loja do cheque (Q355). Os
  outros: 403. Cheque de outra conta: 404.
- Recusas com `field` (`number`, `bank`, `good_for`, `holder_name`), em
  português.
- Vai para o Histórico (`registrarNoHistorico`) com o antes e o depois.
- Tela: botão "Completar" (ou "Corrigir", se já completo) na linha, nos dois
  lugares da carteira, para quem pode; painel de escrita do kit com os quatro
  campos.

### Contrato e documentação

- `POST /sales` (e editar venda): `check.number`, `check.bank` e
  `check.good_for` passam a opcionais; documentar em `/docs/api`.
- Leituras de cheque (`ChequeView`, a venda): `number`, `bank` e `good_for`
  podem vir `null`, e ganham `incomplete: boolean` (extensão aditiva).
- `PATCH /checks/:id` documentado.
- Manual: a seção do cheque na venda e uma tarefa "Completar o cheque".

## Fora do escopo

- Cheque no recebimento de fiado (dívida 2.25): segue sem cheque.
- Importar dados do cheque por leitora ou foto.
- Avisar o Financeiro por WhatsApp ou email do cheque a completar (o destaque
  no Hoje basta nesta frente).
- Mudar quem deposita, compensa ou marca voltou.

## Anti-objetivos

- O cheque incompleto sumir de alguma lista ou soma de "em aberto": ele é
  dinheiro devido.
- Um cheque incompleto contar como vencido (sem data não há vencimento).
- Um cheque incompleto ser depositado.
- Data fictícia em qualquer lugar.

## Riscos que a validação precisa cobrir

- Todo leitor de `good_for` em memória (`diaIso`, `dia`, `new Date`) com nulo:
  quebra ou 01/01/1970. Os filtros do Prisma (`good_for: { lte }`) já excluem o
  nulo sozinhos, mas o `noRecorte` da tela e a ficha do cliente não.
- Ordem da carteira por `good_for`: o nulo precisa ir ao topo (destacado), não
  sumir.
- Editar uma venda com cheque incompleto: o painel carrega `null` sem quebrar, e
  a venda recriada mantém o que o Financeiro já completou.
- As suítes que hoje exigem 422 por falta de número, banco ou data (`m82`,
  `m108`) mudam de propósito: o 422 vira cheque "A completar".
- Somas de tela sobre a lista de cheques (lição de 17/11: a lista que ganha
  linha diferente contamina a soma da tela).
- Os resumos do Histórico usam `cheque.number` ("Depositou o cheque 123",
  "Marcou o cheque 123 como devolvido", a parcela extra do acordo): com nulo
  sairia "cheque null". Usar "sem número".

## Respostas da revisão (18/11)

- **Editar venda:** não há casamento a fazer. O painel de editar carrega os
  dados do cheque (`venda-estado.ts`) e os reenvia, e a venda recriada nasce com
  eles; o que o Financeiro completou volta no formulário. O risco que sobra é o
  formulário aberto antes de o Financeiro completar: a edição grava o que o
  formulário tinha. Aceito (raro), sem trava nova. Venda com cheque depositado
  ou compensado já não se edita nem cancela (`SALE_HAS_DEPOSITED_CHECK`).
- **Loja do cheque:** `EmporioCheck.establishment_id` (a loja da venda). A
  checagem `gestor_da_loja` por loja já existe (`exigirUma` com a loja, usada no
  compensou e no voltou).
- **Corrigir:** vale para qualquer cheque `recebido` da loja, completo ou não,
  inclusive o `good_for`. Não há cache: A receber e Projeção leem o banco.
- **`number` e `bank` não são chave** de agrupamento nem de unicidade em lugar
  nenhum; só aparecem em tela e no texto do Histórico (acima).
- **Outros chamadores de `POST /sales`:** só a tela. O Empório não tem agente no
  WhatsApp (dívida 2.16).

## Validação

Suíte nova `test:m122` escrita da spec, roteiro de navegador
`emporio-cheque-duas-etapas` provado nos dois sentidos, `test:all`, juiz,
manual. Migração no Docker antes, no Neon só com autorização.
