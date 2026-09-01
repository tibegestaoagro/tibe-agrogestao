---
tipo: referencia
data: 2026-09-01
tags: [validacao-viva, ambiente, sessao, confinamento]
origem: 1fe1ccf
---

# `next dev` + cookie do seed valida o servidor inteiro, sem navegador

## O que aconteceu

O `CLAUDE.md` diz, corretamente, que **sessão autenticada via `next start` +
cookie jar não funciona**: o Edge Middleware não reconhece a sessão nesse setup,
e por isso a orientação era "use `next dev` + navegador real".

Em 01/09, validando o Confinamento, apareceu o meio-termo que faltava:
**`next dev` + o cookie de `scripts/_sessao-local.ts` funciona com `curl`**.
`GET /confinamento` respondeu 200 autenticado, e dali saiu a validação de cinco
casos contra o app de verdade, com dado de verdade, sem abrir navegador nenhum:

| caso | como foi provado |
|---|---|
| §16, "por cabeça/dia" | `POST /api/v1/confinement/stays` devolveu **201** |
| `ORIGEM_AMBIGUA` | **422** com `field: "pasture_id"` e a frase nomeando os dois pastos |
| conta órfã do cancelamento | conta em `confinamento` antes, **zero em módulo nenhum** depois |
| saída parcial (§20) | 15 de 40, `encerrada: false`, `saldo_aberto: 25`; 30 recusado |
| boitel na DRE (§15) | a conta de R$ 12.000 aparece sob `related_module=confinamento` |
| rótulo cru | `grep` no HTML: zero ocorrências de `>confinamento<` |

## Por que importa

Isso não substitui o navegador, e não deve pretender substituir. **O que ele
cobre é tudo até o HTML**, o que já é muito mais do que ler código: pega recusa
em inglês, rótulo cru de enum, número com sinal trocado, título errado, saldo
errado, e o campo que a rota recusa.

**O que ele NÃO cobre** é o que só existe depois do JavaScript rodar: a recusa
aparecendo embaixo do campo certo, foco, contraste, elemento invisível. Para
isso o navegador continua obrigatório.

⚠️ Quando o navegador não estiver disponível, a recusa de campo ainda pode ser
fechada **por cadeia**, elo por elo, e vale dizer no relatório que foi assim:

1. a rota devolve o `field` certo (verificável por `curl`);
2. `aplicarErroDoServidor` manda para `erros.<campo>` quando ele está no `ORDEM`;
3. a **conferência 15** do `npm run check` garante que todo campo do `ORDEM`
   recebe `error=`;
4. `Field` renderiza `<p role="alert">` quando `error` existe.

## Como aplicar

```
DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" \
  REDIS_URL="redis://127.0.0.1:56379" npx next dev --webpack
COOKIE=$(... npx tsx scripts/_sessao-local.ts | tail -1)
curl -s -H "Cookie: $COOKIE" http://127.0.0.1:3000/confinamento
```

`scripts/_cenario-confinamento.ts` monta o cenário (dois pastos com saldo da
mesma categoria, um lote aberto de 40, uma estadia de boitel com cobrança), e é
idempotente.

⚠️ **`--webpack` não é detalhe.** Ver
[[turbopack-nao-cria-processo-quando-a-maquina-esta-cheia]].

## Relacionado

- [[validacao-viva-acha-o-que-a-suite-verde-nao-acha]]
- [[campo-no-ordem-sem-error-engole-a-recusa]]
- [[turbopack-nao-cria-processo-quando-a-maquina-esta-cheia]]
