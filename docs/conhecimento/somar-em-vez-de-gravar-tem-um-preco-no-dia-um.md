---
tipo: licao
data: 2026-09-10
tags: [financeiro, invariante-2, migracao, modulo-35]
origem: cc25d3e
---

# Trocar campo gravado por soma tem um preço no dia um, e ele não está na spec

## O que aconteceu

A fase 35.1 trocou "o lançamento tem um valor pago" por "o valor pago é a soma
dos `FinancialPayment`". É o invariante 2 do projeto aplicado ao dinheiro, e é
o desenho certo.

A spec previu o custo óbvio: **o passado**. Sem backfill, todo lançamento já
quitado passaria a ter pago zero, e o "Entrou" de todo mês anterior mudaria de
valor. Isso virou a tarefa T02, com o predicado provado nos três casos.

O que a spec **não** previu foi o custo simétrico: **o futuro**.
`createLinkedEntry` cria lançamento com `status: "paid"` por default, e não
criava pagamento nenhum. Toda venda, compra, insumo e diária nova nasceria
quitada e com pago zero, e a tela diria "falta pagar tudo" numa conta paga.

O backfill arruma o passado uma vez. Sem a correção no helper, o problema
voltaria a cada lançamento novo, para sempre.

## A regra que fica

Quando um valor **gravado** vira valor **derivado de soma**, existem sempre
DUAS pontas, e é fácil enxergar só uma:

| ponta | pergunta | onde se resolve |
|---|---|---|
| passado | o que já existe soma certo? | migração de backfill |
| futuro | tudo que nasce cria a parcela? | **todo** ponto que cria o registro pai |

A ponta do futuro é a que escapa, porque a migração é visível e ruidosa
(arquivo novo, revisão, autorização) e o helper é uma linha silenciosa dentro
de uma função que já existia.

## Como achar a ponta do futuro

Liste quem cria o registro pai, não quem o lê:

```
grep -rn "createLinkedEntry" src/lib --include=*.ts | sed 's/:.*//' | sort | uniq -c
```

Foram 52 chamadas em 15 arquivos. **Todas passam pelo mesmo helper**, e por
isso a correção coube em um lugar só. Se o projeto permitisse criar
`FinancialEntry` fora dele, seriam 52 pontos para lembrar, e alguns ficariam
para trás.

Isso é a defesa da regra do `CLAUDE.md` que proíbe criar `FinancialEntry` sem
passar por `createLinkedEntry`: ela existe para o dia em que o desenho muda.

## 2026-09-14: a terceira ponta é quem ainda LÊ o campo antigo

No rebanho, a troca aconteceu no Módulo 30: o saldo passou a ser a soma de
`HerdMovement`. Passado e futuro foram cuidados. Mas `countActiveAnimals`, que
alimenta o `/dashboard` e o `resumo` do WhatsApp, **continuou somando
`AnimalBatch.quantity`**, o campo aposentado. Medido em produção em
2026-09-14: o Painel da Da Mata dizia **2 cabeças**, e o livro-razão tinha
**21**. O Meu Dia, na mesma sessão, mostrava o número certo.

Ninguém viu por meses porque as suítes criavam o lote com `quantity` e **não
passavam pelo livro-razão**: nelas os dois números coincidiam. Trocar a leitura
fez `m12` e `m17` reprovarem, e elas precisaram do helper `registrarNoLivro`
(`scripts/helpers/herd.ts`) para lançar as cabeças como movimentação.

| ponta | pergunta | onde se resolve |
|---|---|---|
| leitores | quem ainda soma o campo aposentado? | `grep` pelo nome do campo em toda leitura, não só em escrita |

Fixture que grava o campo antigo direto esconde exatamente esta ponta: ela faz
o campo e a soma concordarem, o que produção nunca garante.

Ver [[fixture-de-rebanho-precisa-de-situacao-e-dono]], que é a mesma família:
um registro que nasce sem o campo que a soma precisa não dá erro, só some da
conta.
