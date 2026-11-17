---
tipo: armadilha
data: 2026-08-31
tags: [typescript, prisma, enum, rebanho, confinamento]
origem: 1d7514d
---

# `Record<string, ...>` é onde o enum cresce sem ninguém avisar

## O que aconteceu

O enum `HerdStayType` ganhou `confinamento`, o `HerdMovementType` ganhou
`envio_confinamento` e o `HerdChargeType` ganhou duas formas de cobrança. Cinco
mapas que traduzem esses enums ficaram para trás, **e o `tsc` não disse nada**,
porque todos eram `Record<string, ...>`:

| mapa | consequência do buraco |
|---|---|
| `ESTADIA_LABEL` (`rebanho/page.tsx`) | o lote aparecia escrito `confinamento`, cru |
| `DESTINOS_POR_TIPO` (`stay-close-form.tsx`) | o painel "Encerrar" abria **sem nenhum campo** |
| `HERD_CHARGE_TYPES` (`herd-ledger.ts`) | a rota recusava com 422 o que a tela oferecia |
| `CHARGE_LABEL` (`confinamento/labels.ts`) | a lista da tela e a do servidor discordavam |
| `MODULE_LABEL` (`related-modules.ts`) | rótulo em branco na DRE (corrigido antes, T15) |

O `satisfies readonly T[]` **não** protege: ele aceita subconjunto, então faltar
valor nunca foi erro de tipo. Era isso que deixava `tsc`, `lint` e a suíte
inteira verdes com a rota recusando o exemplo literal do documento do cliente.

## Por que importa

O buraco só aparece **quando o enum cresce**, que é meses depois de o mapa ser
escrito, numa outra frente, por outra pessoa. Nenhuma revisão de diff pega:
o diff que cresce o enum não toca no mapa, e o diff do mapa não existe.

E o sintoma nunca é um erro: é um rótulo cru, uma lista curta, um painel vazio.
Coisas que só o olho vê, e só se a tela for aberta com aquele valor.

## Como aplicar

**Mapa cuja chave é valor de enum do Prisma nasce tipado pelo enum**, nunca por
`string`:

```ts
import type { HerdStayType } from "@/generated/prisma/enums";
const ESTADIA_LABEL: Record<HerdStayType, string> = { ... };   // exaustivo
const MOVIMENTO_LABEL: Partial<Record<HerdMovementType, string>> = { ... };
```

- **Exaustivo** quando o mapa É a lista (o Select é montado com
  `Object.entries` dele, ou o rótulo é obrigatório para todo valor).
- **`Partial<Record<...>>`** quando a tela cobre só alguns valores de propósito.
  O tipo da chave continua valendo, então um valor inventado é erro de
  compilação. Escreva no comentário **por que** é parcial.
- **Melhor que completar a lista é apagá-la:** `HERD_CHARGE_TYPES` virou
  `Object.values(HerdChargeType)`, e não há mais o que ficar para trás.
- `import type` é apagado na compilação, então isso vale em componente client
  também: nada do runtime do Prisma entra no bundle.

⚠️ **Prove nos dois sentidos.** Remova uma chave, rode `npx tsc --noEmit`, veja
quebrar, devolva. Sem isso você tem a sensação de proteção, não a proteção.

## Relacionado

- [[portao-mede-a-relacao-que-lhe-deram]]
- [[campo-no-ordem-sem-error-engole-a-recusa]]

## Acréscimo de 2026-11-17: `satisfies Record<Enum, string>` quando o mapa é lido por `string`

O `pagamento_franqueado` (Q304) apareceu cru na coluna Origem do Caixa: o mapa
`ORIGEM_CAIXA_ROTULO` era `Record<string, string>`, e o enum cresceu sem ele.

Tipar o mapa como `Record<CashMovementOrigin, string>` quebrou outro arquivo: a
página do Caixa indexa o mapa com uma `string` que vem da linha do banco. A
saída foi manter o tipo e conferir a cobertura:

```ts
export const ORIGEM_CAIXA_ROTULO: Record<string, string> = {
  venda: "Venda",
  // ...
} satisfies Record<CashMovementOrigin, string>;
```

Diferente do `satisfies readonly T[]` citado acima, o `satisfies` com `Record`
sobre um objeto reprova a chave que FALTA e a chave inventada. Provado nos dois
sentidos (chave removida: o `tsc` reprova; devolvida: passa). Use esta forma
quando o mapa já é lido por `string` em mais de um lugar.
