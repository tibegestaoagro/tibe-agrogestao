---
tipo: armadilha
data: 2026-10-08
tags: [prisma, migracao, schema, postgres]
origem: prisma/migrations/20261008120000_busca_sem_acento/migration.sql
---

# Coluna gerada do Postgres precisa de `@default(dbgenerated(...))` no schema

## O que aconteceu

Na E7 (dívida 5.0), `Contact.name_busca` e `ServiceClient.name_busca` nasceram
como `GENERATED ALWAYS AS (nome_de_busca("name")) STORED`, escritas à mão na
migração, porque o Prisma não representa coluna gerada. Declaradas no
`schema.prisma` como `String?` comum, o `npm run test:drift` acusou
`ALTER COLUMN "name_busca" DROP DEFAULT` nas duas: o `migrate diff` lê a
expressão de geração como se fosse um `DEFAULT`.

Com `@default(dbgenerated("nome_de_busca(name)"))` o diff fica limpo, e o
Prisma ainda deixa de mandar o campo no `create`, que é o que a coluna gerada
exige (o banco recusa escrita nela).

## Por que importa

Sem o `dbgenerated`, a próxima pessoa a rodar `migrate diff` para outra
mudança recebe o `DROP DEFAULT` misturado no SQL, e o CI reprova por drift
todo push dali em diante. Ruído desse tipo ensina a ignorar o drift, como os
dois índices parciais já ensinavam.

## Como aplicar

- Coluna gerada escrita à mão na migração: no schema, `String?` com
  `@default(dbgenerated("<a mesma expressão>"))`, e rodar `npm run test:drift`
  com a URL do Docker inline antes do commit.
- A expressão do banco tem de ser a MESMA regra que normaliza o termo no JS.
  A primeira versão usava a extensão `unaccent`, que translitera mais que o
  NFD do `normalizarTermo` ("Ł" vira "l", "ß" vira "ss"): "Łucas" escrito
  igual ao cadastro deixava de casar. `normalize(lower(x), NFD)` e a remoção de
  U+0300 a U+036F reproduzem o JS sem extensão; o m70 (14.3b) compara os dois
  lados com caracteres difíceis.
- Preferi a coluna gerada ao `$queryRaw` porque a busca continua no client
  escopado: `$queryRaw` não passa pela extensão de isolamento por tenant, e
  seria o primeiro do projeto num caminho de negócio.

## Relacionado

- [[migrate-diff-le-o-env-e-o-env-e-producao]]
