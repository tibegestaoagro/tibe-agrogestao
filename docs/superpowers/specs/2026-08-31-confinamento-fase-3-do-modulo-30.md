# Confinamento: a fase 3 do Módulo 30

**Data:** 31 de agosto de 2026
**Origem:** `docs/area-funcional-confinamento/`, documento "Área Funcional
Confinamento", v0.1, status "documento em construção", lido na íntegra em
2026-08-31
**Suíte:** `m51`

**Princípio do cliente (§3):** *"O envio de um animal para confinamento não
representa entrada ou saída definitiva do rebanho. O animal continua
pertencendo ao produtor. O que muda é sua localização e situação."*

---

## 1. A decisão central: isto não é módulo novo

O princípio do §3 é **exatamente** o que o Módulo 30 fase 2 entregou. A área
Confinamento é a **fase 3 do Módulo 30**, e não uma área do zero.

⚠️ **Metade do documento já está em produção.** Todo o Boitel, que ocupa os §4.2,
§15 e §16, foi entregue em 2026-08-28 como `HerdStayType.boitel`.

Tratar isto como módulo novo criaria um segundo modelo de estadia ao lado do
que existe, e o extrato do rebanho passaria a ter duas verdades sobre onde o
animal está.

## 2. O terreno que já existe

| o documento pede | onde já está |
|---|---|
| Boitel: envio, dono inalterado, dias, cobrança (§4.2, §15, §16) | `HerdStayType.boitel`, `envio_boitel`, `charge_type`, `charge_value` |
| Dias em confinamento (§8) | `HerdStay.started_at`, contado na leitura |
| Saída total ou parcial (§17, §20) | regras de encerramento em `src/lib/herd/stay-rules.ts` |
| Retorno ao pasto sem mexer no total (§18, §27.3) | `retorno_estadia` |
| Venda direto do confinamento (§19, §27.4) | `HerdStay.negotiation_id` |
| Morte e desaparecimento (§21, §22) | regras do Rebanho, reusadas |
| Histórico obrigatório (§27.8) | `HerdMovement`, ligado à estadia |
| Telas de abrir e encerrar estadia | `stay-form.tsx`, `stay-close-form.tsx` |

**O que falta, e é o escopo desta frente:**

| # | falta | onde |
|---|---|---|
| 1 | `confinamento` como tipo de estadia | `HerdStayType` tem `boitel`, não tem `confinamento`. A **situação** já existe em `HerdSituation` |
| 2 | movimento de envio para confinamento | `HerdMovementType` tem `envio_boitel`, `envio_evento`, `envio_pasto_terceiro` |
| 3 | cadastro do local (§5, aceite §29) | hoje o local é texto livre na estadia, sem reuso |
| 4 | alimentação reduzindo estoque (§10, §11, §27.6) | `StockMovement` tem `herd_category_id` e `pasture_id`, **não tem** vínculo com estadia |
| 5 | custo acumulado por lote (§13, §14, §24) | `FinancialEntry` tem `related_module` e `related_id` genéricos, mas não há valor `confinamento` |
| 6 | tela e intenções de WhatsApp (§25, §26) | |

## 3. As decisões, e por quê

| # | Decisão | Motivo |
|---|---|---|
| 1 | Confinamento é **fase 3 do Módulo 30**, sobre `HerdStay` | Ver §1. Dois modelos de estadia dariam duas respostas para "onde o animal está" |
| 2 | `confinamento` entra em `HerdStayType`, e `envio_confinamento` em `HerdMovementType` | O `retorno_estadia` já serve para a volta: a situação de origem diz de onde o animal voltou, e um tipo por destino diria a mesma coisa duas vezes |
| 3 | **A cobrança continua gravada e mostrada, e NÃO calculada** | Decisão do usuário em 31/08, mantendo a do Módulo 30 fase 2. O §16 diz que o cálculo "poderá ser apresentado com base nos dias", e o documento **continua sem definir a fórmula**: mês cheio ou proporcional, o dia da saída conta, o da entrada conta. Fórmula inventada gera dinheiro errado em silêncio, que é o pior modo de falha deste produto |
| 4 | Cadastro de local vira **tabela própria**, `ConfinementSite` | O §5 pede o cadastro e o §29 o cobra no aceite. Texto livre não atende ao §25 ("quantos lotes ativos" por local) nem ao §2 ("quantos em próprio, quantos em Boitel") |
| 5 | `StockMovement` ganha `stay_id` opcional | É o vínculo que o §11 exige ("a utilização deverá ficar vinculada ao confinamento") e o que torna o custo do §24 somável |
| 6 | Custo do lote é **soma do que está ligado**, nunca estimativa | Produto do estoque mais `FinancialEntry` com `related_module: confinamento`. Mão de obra, combustível e frete entram **se** o produtor lançar: o sistema não inventa custo que ninguém digitou |
| 7 | **Peso fica fora** desta frente | O §23 diz "não será obrigatório nesta primeira versão" e o ganho depende de peso de entrada E de saída, que é fluxo próprio |

## 4. Modelo de dados

**Enums, aditivo:**

```
HerdStayType      + confinamento
HerdMovementType  + envio_confinamento
RelatedModule     + confinamento
```

**Tabela nova:**

```
ConfinementSite
  id, tenant_id
  name                 §5 nome do confinamento
  type                 proprio | boitel
  property_id          §5 fazenda relacionada, quando proprio
  counterparty_name    §5 empresa ou proprietario, quando boitel
  city                 §5 opcional
  capacity             §5 opcional
  notes                §5 opcional
  archived_at
```

**Campos novos, todos opcionais:**

```
HerdStay        + confinement_site_id
StockMovement   + stay_id
```

⚠️ **Nada é obrigatório, e nada migra dado existente.** As estadias de boitel
já gravadas continuam válidas com `confinement_site_id` nulo: o
`counterparty_name` que elas já têm continua sendo a resposta.

⚠️ **`ConfinementSite` tem `tenant_id`, então entra em `TENANT_SCOPED_MODELS`**
(`src/lib/prisma.ts`), e o `npm run test:isolation` reprova se esquecer.

⚠️ **`ConfinementSite` referencia `Property`, então entra no `wipeDemoData`**
(`scripts/seed-demo-data.ts`). Quatro tabelas ficaram de fora quando os Módulos
30 e 31 chegaram, e o `seed:demo` morreu em chave estrangeira por dez dias.

## 5. Os fluxos

**Entrada (§6, §7):** abre uma `HerdStay` de tipo `confinamento` ou `boitel`,
apontando para um `ConfinementSite`, com um `envio_confinamento` (ou
`envio_boitel`) que tira os animais da localização anterior e os põe na
situação correspondente. **O total do rebanho não muda** (§27.1).

**Alimentação (§10, §11, §12):** um `StockMovement` de saída com `stay_id`
preenchido. Quando o produto está no estoque, o saldo cai; quando não está, o
consumo é registrado sem estoque. O §12 é explícito: o sistema **não** obriga a
registrar cada trato.

**Saída (§17 a §20):** encerramento de estadia, total ou parcial, pelas regras
que já existem. Retorno ao pasto não muda o total; venda reduz e cria a
`Negotiation` mais o lançamento financeiro.

**Custo (§13, §24):** soma do que está ligado à estadia, em duas origens
(estoque e financeiro), apresentada como **soma simples**, como o §14 pede.

## 6. Entrega e provas

Ordem: **schema e migração, depois action, depois rota, só então tela.**

- Suíte `m51`, escrita **da spec**, sem ler a implementação. Prova:
  1. Entrada em confinamento **não altera o total** do rebanho (§27.1).
  2. O animal sai da localização anterior e aparece em confinamento (§7).
  3. Dias confinados batem com a data de entrada (§8).
  4. Alimentação com produto do estoque **reduz o saldo** (§11).
  5. Alimentação com produto fora do estoque registra sem reduzir nada.
  6. Saída parcial deixa o restante no lote (§20).
  7. Venda direto do confinamento **reduz** o rebanho e cria a receita (§19).
  8. Morte reduz lote e rebanho (§21).
  9. **A cobrança não é multiplicada por nada** (decisão 3).
- `npm run test:isolation` verde, e `npm run test:drift` no CI.
- `npm run check`, `tsc`, `lint` limpos.

⚠️ **A migração vai ANTES do push** (invariante 3). A Vercel faz deploy
automático e o build não roda migração.

⚠️ **Validação ao vivo antes de considerar entregue.** Suíte verde não basta, e
o lugar de risco aqui é a tela do §25: um número de "confinados" que não bate
com o rebanho é pior que não ter a tela.

## 7. Fora desta missão

Adiado, não descartado:

- **O cálculo da cobrança do Boitel** (decisão 3), até o cliente definir a
  fórmula. As perguntas em aberto estão na decisão 3.
- **Peso e ganho médio** (§23), que o próprio documento marca como opcional.
- **As intenções de WhatsApp do §26.** Os handlers nascem nesta frente e são
  testados; ensinar o classificador é trabalho de painel do n8n, e ele está
  **congelado** por decisão do usuário. Ver o agente `n8n-fluxo`.
- **Tudo do §28**: animal individual, brinco, conversão alimentar, matéria seca,
  dieta, curva de desempenho, custo por arroba, integração com balança e cocho.
- **A Área Leite**, que é módulo novo de verdade e vem depois.
