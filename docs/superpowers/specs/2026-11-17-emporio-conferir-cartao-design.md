# Empório: conferir o cartão (frente B, Q349 a Q353)

Segunda frente do plano de 17/11
([2026-11-17-emporio-plano-gestaoclick.md](2026-11-17-emporio-plano-gestaoclick.md)),
detalhando a Q342. Origem: na reunião de 09/11 o GestãoClick mostrou a parcela
do cartão "em aberto" até o Financeiro confirmar o que caiu, com "atrasada"
quando a data passa sem confirmação. É a ponte até importar o extrato da
Stone (dívida 2.58): quando o extrato vier, ele preenche a mesma conferência.

## O que existe hoje

- A parcela (`CardReceivable`) entra no saldo da conta sozinha, no
  `effective_on`, pelo `effective_net` calculado.
- O carimbo de conciliação (`reconciled_at`, entrega 3 do financeiro) marca a
  linha do extrato como conferida, sem valor.
- A antecipação pontual já pede o líquido que a adquirente pagou.
- Nada registra a diferença entre o líquido calculado e o que caiu.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q349 | **O saldo segue automático:** a parcela conta no saldo na data, como hoje. A conferência informa o que caiu e **a diferença vira ajuste** | decisão do usuário: muda pouco a projeção, a posição de caixa e o extrato |
| Q350 | **Conferir por dia e adquirente, e também uma a uma.** "Conferir o dia" pega as parcelas não conferidas de uma conta, uma adquirente e um `effective_on`, recebe o total que caiu e reparte a diferença entre elas | decisão do usuário: a Stone deposita num lançamento só as parcelas do mesmo dia |
| Q351 | **Atrasada = 1 dia útil depois da data** sem conferência (`proximoDiaUtil(effective_on)` já passou). Antes disso, a parcela do dia ou de ontem é "A conferir" | decisão do usuário: dá a manhã seguinte para o Financeiro conferir; o calendário é o do cartão (feriados nacionais, dívida 2.60) |
| Q352 | **Conferir = carimbar.** Na linha de cartão, o carimbo do extrato passa a ser a conferência com valor (e vice-versa); a linha de movimento segue com o carimbo de hoje | decisão do usuário: um conceito só |
| Q353 | **Parcelas antigas:** a migração marca como conferidas pelo previsto (`confirmed_net` = `effective_net`, sem ajuste, `reconciled_by_user_id` nulo) as parcelas não canceladas e sem carimbo com `effective_on` **mais de 7 dias antes do dia em que a migração roda** (`CURRENT_DATE - 7`, no fuso do banco convertido para Brasília). As dos últimos 7 dias ficam para conferir. As já carimbadas ganham `confirmed_net` = `effective_net` | decisão do usuário: pega o que ainda dá para checar na Stone sem soterrar o Financeiro |

## Estados da parcela (calculados, nada gravado além da conferência)

| estado | quando |
|---|---|
| Prevista | `effective_on` depois de hoje |
| A conferir | `effective_on` hoje ou antes, sem conferência, e `proximoDiaUtil(effective_on)` ainda não passou |
| Atrasada | sem conferência e hoje é depois de `proximoDiaUtil(effective_on)` |
| Conferida | `reconciled_at` preenchido |

Parcela cancelada (`canceled_at`) fica fora de tudo.

## Conferir

**Uma parcela:** informa o valor que caiu (padrão: o `effective_net`) e, se
quiser, uma observação. **O dia:** escolhe conta, adquirente e data; a tela
lista as parcelas não conferidas desse recorte com a soma prevista; informa o
total que caiu.

- Grava na parcela: `reconciled_at`, `reconciled_by_user_id` e o valor
  conferido (`confirmed_net`, campo novo, decimal 14,2).
- **Diferença** (conferido menos `effective_net`), quando não é zero: um
  `CashMovement` na conta da parcela, origem nova `ajuste_cartao`, ligado à
  parcela (`card_receivable_id`), saída quando caiu menos e entrada quando
  caiu mais. O saldo da conta passa a bater com o banco.
- No lote, a diferença total se reparte pelas parcelas na proporção do
  `effective_net` de cada uma, em centavos, com a sobra na maior parcela, de
  modo que a soma dos ajustes seja exatamente a diferença do dia.
- O ajuste entra no **Custo do cartão** do Resultado (saída aumenta, entrada
  reduz) e aparece no extrato como "Ajuste da conferência do cartão".
- Conferida não se edita. **Desfazer a conferência** (o "cancelar
  confirmação" do GestãoClick): apaga o ajuste da parcela, limpa o carimbo e o
  `confirmed_net`, e registra no Histórico com o motivo. No lote, desfaz-se
  parcela por parcela.
- Diferença acima de 10% do previsto pede confirmação na tela ("Caiu R$ X a
  menos do que o previsto. Confirma?"); o servidor não recusa.
- Toda escrita chama `registrarNoHistorico`.

**Antecipação pontual:** como ela já pede o líquido real, as parcelas
antecipadas nascem conferidas (`confirmed_net` = o líquido informado, sem
ajuste). Desfazer a antecipação desfaz a conferência delas. A antecipação
automática não muda: as parcelas dela se conferem como as outras.

**Carimbo unificado (Q352):** carimbar uma linha de cartão no extrato abre a
conferência com o valor (padrão o previsto); tirar o carimbo de uma linha de
cartão é o desfazer acima. A rota de carimbo segue com o mesmo contrato:
com `kind: "cartao"`, `carimbarLinhaAction` delega à conferência de uma
parcela (aceita `received_amount` opcional, padrão o previsto) e
`descarimbarLinhaAction` delega ao desfazer (motivo padrão "Carimbo retirado
no extrato"). As linhas de movimento não mudam.

**Permissão:** a de hoje para carimbar (`dinheiro`: Dono, Gerente geral,
Financeiro).

## Onde aparece

- **A receber, Cartões a receber:** a seção passa a listar também as parcelas
  passadas não conferidas, com o estado em selo (Prevista, A conferir,
  Atrasada), e o botão Conferir por linha e "Conferir o dia" por grupo de
  data e adquirente. O filtro `?ver=vencido` (frente A) passa a mostrar as
  atrasadas, e a frase provisória da frente A sai.
- **A faixa do A receber (frente A):** Vencido soma as parcelas atrasadas.
- **Caixa, Cartões a receber:** o mesmo selo (só leitura para quem não tem
  `dinheiro`).
- **Hoje do Financeiro:** "Cartão a conferir: N parcelas, R$ X" e
  "Atrasadas: N", ligando para o A receber filtrado.
- **Extrato:** a linha de cartão conferida mostra o valor conferido e, se
  houve, a linha do ajuste logo abaixo.

## Contratos

| rota | o que muda |
|---|---|
| `POST /api/v1/emporio/finance/card-receivables/:id/confirm` (nova) | `{ received_amount, notes? }`; devolve a parcela com `status`, `confirmed_net` e `adjustment` |
| `POST /api/v1/emporio/finance/card-receivables/confirm-day` (nova) | `{ bank_account_id, acquirer_id, effective_on, received_total, notes? }`; devolve as parcelas e os ajustes; 409 se o recorte não tem parcela a conferir |
| `POST /api/v1/emporio/finance/card-receivables/:id/unconfirm` (nova) | `{ reason }` obrigatório; 409 se não está conferida |
| `GET /api/v1/emporio/finance/receivables` | `cards[]` ganha `status` (`prevista`, `a_conferir`, `atrasada`, `conferida`), `confirmed_net` e `adjustment`, e passa a trazer as parcelas passadas não conferidas |
| `GET /api/v1/emporio/finance/today` | ganha `cards_to_confirm` e `cards_overdue` (`count`, `total`) |
| carimbo do extrato | ver "Carimbo unificado" |

Migração: `CardReceivable.confirmed_net` e o valor `ajuste_cartao` no enum
`CashMovementOrigin`. Sem dado novo obrigatório.

## Provas

- Suíte nova (próximo número livre), escrita desta spec: os quatro estados com
  datas de sexta, sábado e segunda (dia útil); conferir uma com diferença para
  menos, para mais e zero (saldo da conta, ajuste, Custo do cartão); conferir o
  dia com reparte exato em centavos; desfazer; antecipação pontual nascendo
  conferida e desfeita junto; parcela cancelada fora; 403 para quem não tem
  `dinheiro`; isolamento entre contas e lojas; o `test:m120` segue verde com o
  Vencido somando as atrasadas.
- Roteiro de navegador provado nos dois sentidos: conferir o dia com
  diferença, ver o saldo e o Resultado mudarem, desfazer, o selo Atrasada.

## Fora

Importar o extrato da Stone (2.58) e o OFX (2.28); tolerância de atraso por
adquirente (opção recusada na Q351); feriado estadual e municipal (2.60).
