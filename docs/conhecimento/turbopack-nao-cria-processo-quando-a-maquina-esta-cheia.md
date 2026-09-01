---
tipo: armadilha
data: 2026-09-01
tags: [ambiente, next, windows, validacao-viva]
origem: 1fe1ccf
---

# Turbopack não cria processo quando a máquina está cheia, e o erro não diz isso

## O que aconteceu

Em 01/09, ao subir o `next dev` para validar o Confinamento, toda página
devolveu **500**, com um erro que parece de código:

```
Failed to write app endpoint /(public)/page
Caused by:
- [project]/src/app/globals.css [app-client] (css)
- creating new process
- node process exited before we could connect to it with exit code: 0xc0000142
```

O rastro aponta para `globals.css`, `parse_css`, `PostCssTransformedAsset`. Nada
disso está errado: `0xc0000142` é `STATUS_DLL_INIT_FAILED` do Windows, e
significa que **o processo filho não conseguiu nascer**. O Turbopack roda o
PostCSS num processo separado, e é ele que não sobe.

A causa era outro projeto: 8 workers de `vitest` do `pleno-crm` na mesma
máquina, somando mais de 1 GB, além do Docker Desktop que tinha acabado de
subir. O Tibé não tinha nada de errado.

## Por que importa

O erro **nomeia um arquivo do projeto**, e a reação natural é ir mexer no CSS ou
na configuração do PostCSS, que estão certos. Foi preciso ler até o
`0xc0000142` para ver que era ambiente.

E o sintoma persiste depois: o crash deixa o `.next` num estado que faz o
webpack quebrar com `SyntaxError: Unexpected end of JSON input`, o que parece um
segundo defeito e é o mesmo.

## Como aplicar

**A sequência que resolveu, em ordem:**

1. `npx next dev --webpack`, que não usa o processo separado do Turbopack. Só
   isso já sobe na maioria dos casos.
2. Se aparecer `Unexpected end of JSON input`, **apague o `.next`** e suba de
   novo: o cache ficou corrompido pelo crash anterior.
3. Só então olhe a máquina:
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` com `CommandLine`
   diz quem está comendo memória. Em 01/09 eram 16 processos node, e os pesados
   eram de outro projeto.

⚠️ **Nunca mate node em bloco.** O próprio Claude Code roda em node, e
`Get-Process node | Stop-Process` derruba a sessão. Mate por PID, depois de ler
a linha de comando de cada um.

⚠️ **Processo de outro projeto é do usuário.** Peça antes de encerrar, mesmo
quando ele parece travado.

## Relacionado

- [[next-dev-mais-cookie-valida-o-servidor-sem-navegador]]
- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
