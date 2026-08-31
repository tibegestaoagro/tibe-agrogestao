---
tipo: armadilha
data: 2026-08-31
tags: [ambiente, prisma, migracao, invariante-3]
origem: 4f6c042
---

# `migrate diff --from-config-datasource` lê o `.env`, e o `.env` é produção

## O que aconteceu

O fluxo de migração documentado no `CLAUDE.md` é:

```
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

**Sem URL inline.** A flag `--from-config-datasource` lê a `DATABASE_URL` do
`.env`, e ⚠️ **o `.env` deste projeto aponta para o Neon de PRODUÇÃO**.

Em 31/08 isso apareceu pela primeira vez, porque o banco local estava **à
frente** da produção: uma migração anterior da mesma rodada ainda não tinha
sido aplicada no Neon (por desenho: produção exige autorização do usuário). O
diff saiu poluído, propondo criar uma tabela e enums que **já existem** no
banco local.

O agente investigou antes de aplicar, entendeu que era drift esperado, refez o
diff apontando para o Docker, e a saída correta tinha duas linhas.

## Por que importa

O comando documentado é seguro **só enquanto produção e local estão iguais**.

E eles ficam diferentes exatamente na situação mais comum deste projeto: a
migração foi criada e aplicada localmente, e espera autorização para subir. Ou
seja, **a janela em que o comando engana é a janela normal de trabalho**.

O resultado enganoso é sutil: não é um erro, é um SQL a mais, que aplicado no
lugar errado tenta criar o que já existe.

## Como aplicar

**Passe a URL local inline no `migrate diff`, como já se faz no `db:deploy` e
nas suítes:**

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" \
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

- **Leia o SQL gerado antes de salvar.** Se ele propõe criar algo que você sabe
  que já existe localmente, o "de" do diff está errado.
- Vale o mesmo cuidado que a suíte já tem: `127.0.0.1`, nunca `localhost`, e
  nunca `$env:VAR=` dentro do Bash.

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
