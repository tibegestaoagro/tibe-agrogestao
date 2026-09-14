---
tipo: armadilha
data: 2026-09-14
tags: [prisma, typescript, dashboard, filtro]
origem: a360393
---

# Relação renomeada dentro de spread condicional no `where` passa pelo tsc e dá 500

## O que aconteceu

O `/dashboard` contava as vacinas previstas com um filtro opcional por fazenda:

```ts
where: {
  next_due_at: { gte: eventWindowStart, lte: eventWindowEnd },
  ...(activePropertyId ? { animal: { property_id: activePropertyId } } : {}),
}
```

Na unificação do rebanho (2026-08-04), `AnimalVaccination` deixou de ter a
relação `animal` e passou a ter `batch`. Esta linha não foi trocada, e **o `tsc`
continuou limpo por mais de um mês**. Em runtime, o Prisma recusava o campo
desconhecido, e a página inteira dava **500 para qualquer produtor com uma
fazenda escolhida no seletor**. Sem fazenda escolhida, o spread era `{}` e tudo
funcionava, e é assim que a suíte e quase toda validação abriam a página.

Achado em 2026-09-14 ao validar outra coisa no navegador.

## Por que importa

O TypeScript só faz a checagem de propriedade excedente nas chaves **escritas
direto** no literal. A chave que chega por spread de expressão condicional não
é conferida.

Provado em 2026-09-14 com um arquivo descartável contra o client gerado:

| `where` | `tsc` |
|---|---|
| `{ animal: {...} }` direto | reprova (TS2353, propriedade desconhecida) |
| só `{ ...(cond ? { animal: {...} } : {}) }` | reprova (TS2559, nenhuma propriedade em comum) |
| `{ next_due_at: {...}, ...(cond ? { animal: {...} } : {}) }` | **aprova** |

O terceiro é o caso do `/dashboard`, e é o formato comum: filtro opcional ao
lado de um filtro fixo. O padrão `...(cond ? {...} : {})` é o jeito idiomático
de filtro opcional neste projeto, então a mesma falha pode estar em qualquer
consulta com filtro por fazenda.

O defeito ainda se esconde no caminho que ninguém exercita: só dispara com o
filtro ligado.

## Como aplicar

- Ao renomear relação ou campo no `schema.prisma`, **busque o nome antigo por
  texto** (`grep -rn "animal:" src`), não confie no `tsc` para achar os usos.
- Ao validar tela com filtro opcional, abra **com o filtro ligado** também. O
  caminho sem filtro é o que todo mundo já testou.
- Quando o filtro opcional é importante, prefira montar o `where` numa variável
  tipada (`const where: Prisma.XWhereInput = {...}`) e acrescentar a chave com
  `if`: a atribuição direta devolve a checagem ao `tsc`.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[filtro-na-busca-esconde-o-defeito-que-o-teste-procura]]
