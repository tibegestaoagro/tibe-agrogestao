# Módulo 31, missão 4: permuta

**Data:** 28 de agosto de 2026
**Frente:** 4 de 5, da
[sequência para fechar os módulos](2026-08-27-sequencia-para-fechar-os-modulos-design.md)
**Contrato:** §12, §17.7, §17.9, §18.5 e os aceites 5, 6 e 18 do §21 do documento
do cliente (`docs/moduloNegociacao/`), mais as decisões 1, 7, 10 e 11 da
[spec do Módulo 31](../../specs/module-31-negociacoes.md)
**Suíte:** `m49`

---

## 1. O problema, na frase do cliente

> Permuta é uma negociação em que o produtor entrega algo e recebe outro item,
> bem, animal, produto, serviço ou valor em troca.

E o §12.6 diz o que isso exige do sistema:

> A permuta deverá ser registrada como uma única negociação. O produtor não
> deverá precisar criar manualmente uma venda e depois uma compra.

Os dois exemplos do documento são o contrato de aceite:

| § | O produtor entrega | Recebe | O sistema faz |
|---|---|---|---|
| 12.7 | 20 bois | 1 trator, e paga R$ 30.000 | tira os animais, **cadastra o trator**, gera despesa |
| 12.8 | 15 fêmeas de 13 a 24 meses | 10 bezerros e R$ 18.000 | reduz 15, acrescenta 10, gera receita |

Esta é a última missão do Módulo 31, e a decisão 11 da spec manda que seja a
última pelo motivo certo: ela toca rebanho, estoque, financeiro e máquinas ao
mesmo tempo, e fazer por último é fazer sobre peças já testadas em uso real.

## 2. O terreno que já existe

Boa parte do caminho foi preparada nas missões anteriores.

| Peça | Estado |
|---|---|
| `NegotiationType.permuta` | existe, sem uso |
| `StockMovementType.permuta_entrada` / `permuta_saida` | existem **e já estão ligados**: rótulo na tela de Estoque ("Entrou por permuta"), enum da rota `POST /api/v1/stock/movements`, e `permuta_saida` já conta como saída no livro-razão. Falta só uma action que os grave |
| `HerdMovementType` | **não tem** nada de permuta |
| `Machine` | **não tem** vínculo com `Negotiation` |
| `MachineStatus` | tem `sold`, que a tela mostra como "Vendida" |
| `AbortarNegociacao` / `comRollback` | exportados na missão 3, prontos para reuso |
| `validarPagamento` | extraído na missão 3: a regra do §14 num lugar só |
| Situação `sem_valor` | criada na missão 3, para negócio sem lançamento principal |

## 3. As decisões, e por quê

Tomadas com o usuário em 2026-08-28, cada uma respondendo a uma ambiguidade
achada na leitura do §12.

| # | Decisão | Motivo |
|---|---|---|
| 1 | **`permuta_entrada` e `permuta_saida` no rebanho**, tipos próprios | Reusar `compra`/`venda` faria o extrato do rebanho mostrar "Venda" de 20 cabeças sem receita nenhuma ligada, e o relatório do mês contaria gado que ninguém vendeu. É o §12.6 quebrado no lugar em que ele mais importa: o histórico. O estoque já resolveu assim na missão 2, com os rótulos "Entrou por permuta" e "Saiu por permuta" já na tela |
| 2 | **O valor da negociação é só a diferença em dinheiro** | É o único número que o sistema pode defender: o dinheiro que de fato mudou de mão. Os valores estimados do §12.4 ficam fora da v1. Sem diferença, a negociação nasce sem valor e a linha diz "Troca sem dinheiro", reusando `sem_valor`. E a regra do §14 (a soma das parcelas corresponde ao valor da operação) passa a valer sem nenhuma adaptação |
| 3 | **Cancelar deixa a máquina recebida como `inactive`**, e recusa quando ela já tem manutenção lançada | Cancelar nunca apaga, em todo o resto do projeto. Apagar o registro destruiria em silêncio a manutenção que o produtor lançou à mão. A recusa é o §17.9 ("quando parte do item já tiver sido utilizada, o sistema deverá alertar antes do cancelamento") |
| 4 | **Serviço e Outro são aceitos**, viram texto, com aviso visível na tela | **Revisa a decisão 7 da spec do Módulo 31**, que os recusava. O motivo dela era que virariam texto "quebrando em silêncio" a promessa de atualizar tudo: o aviso tira o silêncio. E a metade que o Tibé sabe registrar (o bezerro que saiu do rebanho de verdade) passa a ser registrada, em vez de o produtor inventar uma venda de R$ 0,00 para tirar o animal do saldo |
| 5 | **`MachineStatus.negociada`**, valor novo | `sold` é mostrado como "Vendida", e a máquina dada em permuta não foi vendida. Mesma decisão 1, aplicada às máquinas |
| 6 | **Nenhum model de itens da permuta** | A tela lê os filhos, como `getNegotiation` já faz para gado e produto. Um `NegotiationItem` guardaria a quantidade uma segunda vez, e quantidade em dois lugares é onde o dado diverge no dia em que alguém cancela uma movimentação sozinha |

## 4. Modelo de dados

```
enum HerdMovementType  +=  permuta_entrada, permuta_saida
enum MachineStatus     +=  negociada
Machine.acquired_negotiation_id  String?   FK -> Negotiation, onDelete: SetNull
Machine.disposed_negotiation_id  String?   FK -> Negotiation, onDelete: SetNull
Negotiation.barter_out_note      String?
Negotiation.barter_in_note       String?
```

**Duas colunas em `Machine`, e não uma.** Um trator pode ENTRAR por uma permuta
e SAIR por outra, meses depois. Com uma coluna só, cancelar a segunda permuta
não teria como saber se aquele vínculo é o da entrada ou o da saída, e desfaria
a errada.

**`permuta_entrada` e `permuta_saida` entram nas listas de forma** do
`validateShape` (`herd-ledger.ts`): entrada é `ENTRY_ONLY` (não tem origem) e
saída é `EXIT_ONLY` (não tem destino). Sem isso as duas caem no ramo de
`ajuste`, que exige exatamente uma das pontas, e a permuta passaria a ser
gravada com a forma errada, como aconteceu na missão 3 com `envio_evento`.

**Os dois campos de texto são para o lado sem área.** Quando o lado é serviço ou
outro, não há módulo que atualizar, e a descrição do produtor é tudo que existe.
Quando o lado é animais, produtos ou máquina, os campos ficam nulos e a tela lê
os filhos.

## 5. Onde cada metade é gravada

| O lado é | Grava em | Como |
|---|---|---|
| Animais | `HerdMovement` | `permuta_saida` ou `permuta_entrada`, com `negotiation_id` |
| Produtos | `StockMovement` | `permuta_saida` ou `permuta_entrada`, com `negotiation_id` |
| Máquina que entra | `Machine` novo | `acquired_negotiation_id` apontando para a permuta |
| Máquina que sai | `Machine` existente | status `negociada` e `disposed_negotiation_id` |
| Serviço ou Outro | `Negotiation.barter_out_note` / `barter_in_note` | a descrição do produtor |
| Dinheiro | `FinancialEntry` | **é** a diferença, não um lado à parte |

**Dinheiro num lado É a diferença.** O §12.2 oferece "Dinheiro" como opção nos
dois lados, e o §12.1 dá o exemplo "animais e dinheiro por uma máquina". São a
mesma coisa dita de dois jeitos: escolher "Dinheiro" no lado recebido é o mesmo
que informar diferença recebida. A tela oferece as duas portas e grava uma
coisa só.

**A máquina recebida NÃO passa por `createMachineAction`.** Aquela action cria
um `FinancialEntry` sozinha quando recebe custo de aquisição, e numa permuta
isso geraria uma despesa fantasma além da diferença. Além disso ela não aceita
`tx`, então não caberia na transação. A permuta cria a `Machine` direto, sem
custo de aquisição: o que o trator custou foi o gado, não dinheiro.

## 6. Abrir a permuta

`createBarter(db, input)`, numa transação só, nesta ordem:

1. **valida**, incluindo a recusa nova da seção 7;
2. resolve ou cria o contato pelo nome, dentro da transação, como a missão 1 já
   faz, para que uma recusa adiante não deixe contato órfão;
3. cria a `Negotiation(permuta)`, com `amount` igual à diferença, ou nulo quando
   não houve;
4. grava o lado entregue e o lado recebido, cada um pelo caminho da seção 5;
5. quando há diferença, ela vira o lançamento `principal`: **despesa** quando o
   produtor paga, **receita** quando recebe, com parcelas quando houver.

O bloqueio de saldo negativo é o de sempre, porque é o mesmo
`recordMovementInTx` e o mesmo `recordStockMovementInTx`: sem cabeça ou sem
saca suficiente, **nada** é gravado, nem o envelope.

## 7. A recusa que não está no documento

**Se nada se move e não há dinheiro, não é permuta.** Serviço por serviço, sem
diferença, não muda rebanho, estoque, máquina nem financeiro: é uma anotação,
e gravá-la como negociação encheria a lista de linhas que não representam nada.
O Tibé recusa dizendo isso.

A regra é: pelo menos um dos dois lados move alguma coisa (animais, produtos ou
máquina), **ou** existe diferença em dinheiro.

## 8. O dinheiro, e uma consequência

A diferença vira um `FinancialEntry` com `negotiation_role: "principal"`,
categoria "Diferença de permuta", pago ou a receber, com parcelas quando houver
(a soma tem que dar o valor, regra que `validarPagamento` já aplica).

`related_module` é `"geral"`, e não `"rebanho"`: uma permuta pode ser estoque
por máquina, sem animal nenhum envolvido. É também o que `moduloDoEstorno` já
devolve hoje para `permuta`, então o cancelamento arquiva o estorno na mesma
gaveta, sem mudança.

⚠️ **`ehVenda()` não consegue responder por uma permuta.** Ela decide, por uma
lista fixa de tipos, se o dinheiro entra ou sai, e numa permuta isso depende da
**direção da diferença**, não do tipo. Sem tratar, a linha mostraria "A pagar"
numa permuta em que o produtor recebeu, que é o mesmo sinal invertido que a
validação ao vivo da missão 3 encontrou. A direção é derivada do próprio
lançamento principal, que é o único lugar que sabe a resposta.

## 9. Cancelar

`cancelNegotiation` ganha o tratamento da permuta, com as recusas **antes** de
tocar em qualquer coisa:

- a máquina que entrou já tem manutenção lançada: recusa (§17.9, decisão 3);
- a máquina que entrou já saiu por outra permuta: recusa, porque desfazer
  exigiria decidir o que fazer com a segunda troca, e essa decisão é do
  produtor;
- saldo insuficiente para devolver as cabeças ou as sacas: a recusa que já
  existe.

Passando, desfaz tudo junto: movimentos de rebanho e estoque cancelados, a
máquina que entrou vira `inactive` mantendo o vínculo (para a linha dizer de
onde ela veio), a máquina que saiu volta para `active` com o vínculo limpo, e o
dinheiro segue o `dinheiro_pago` que já existe (`mantem`, `devolvido`,
`engano`).

## 10. Entrega e provas

Ordem do protocolo: **action, depois rota, só então tela.** O handler de
WhatsApp nasce junto, sem tocar no classificador, como nas missões 2 e 3.

- `POST /api/v1/negotiations/barters`
- intenção `registrar_permuta`, com pendência guardada (o mesmo mecanismo de
  `event-pending.ts`), e o resumo literal do §18.5: "Entendi a seguinte
  permuta: Entregou X; Recebeu Y; Diferença paga: R$ Z. Deseja registrar?"
- tela: o formulário de dois lados em Negociações, com o aviso da decisão 4
  quando o lado escolhido é serviço ou outro.

**Suíte `m49`**, com os dois exemplos do documento:

- **§12.7 literal:** 20 bois por 1 trator com R$ 30.000 pagos. O rebanho cai 20,
  a `Machine` nasce apontando para a permuta, e existe **uma** despesa de
  R$ 30.000, não duas;
- **§12.8 literal:** 15 fêmeas por 10 bezerros com R$ 18.000 recebidos. O
  rebanho cai 15 e sobe 10, e nasce **receita**, não despesa;
- troca seca (produto por animal, sem diferença): **nenhum lançamento
  financeiro**, e a situação é `sem_valor`;
- permuta em que nada se move e não há dinheiro: recusada (seção 7);
- saldo insuficiente: nada gravado, nem negociação, nem contato, nem a metade
  que caberia;
- o extrato do rebanho mostra `permuta_saida`, **nunca** `venda`;
- cancelar com manutenção lançada na máquina: recusado;
- cancelar sem manutenção: gado volta, máquina vira `inactive`, dinheiro
  estornado.

Mais `test:isolation` pelas rotas novas, `test:docs-api` pela documentação, e
`test:m27` (máquinas) e `test:m35` (negociação de gado) porque as duas são
tocadas e estão em produção.

**Migração antes do push**, aplicada primeiro no Docker local e no Neon só junto
do merge, com autorização do usuário.

**Validação ao vivo** no navegador: os dois exemplos do documento ponta a ponta,
com os números do Rebanho, do Financeiro e de Máquinas anotados antes e depois.
As três missões anteriores tiveram defeitos que só apareceram aqui.

## 11. Fora desta missão

- **Valores estimados do §12.4** (quanto valia cada lado): decisão 2. Não
  descartado, adiado.
- **Formas de pagamento do §13** (pix, boleto, cheque): já adiado na revisão de
  2026-08-13 e continua fora.
- **Classificador do n8n**: congelado por decisão do usuário até o sistema estar
  completo. O handler nasce pronto e espera.
