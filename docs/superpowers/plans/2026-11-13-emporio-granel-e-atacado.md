# Granel em qualquer peso e atacado na mesma saca: plano

> Executar pela skill `orquestrar-ondas` (subagente não commita).

**Spec:** [../specs/2026-11-13-emporio-granel-e-atacado-design.md](../specs/2026-11-13-emporio-granel-e-atacado-design.md) (Q319 a Q324).

## Restrições globais

Invariantes do `CLAUDE.md` (sem travessão, `tenant_id` nunca do client, regra
na action, saldo nunca gravado, sem migração de schema nesta frente). Nomes de
campo: `content_qty` (o fator confirmado), `sealed`, `presentation_id`,
`presentation_ids`.

## Foco de revisão

1. Implantado em "Saca 40 kg", vender 1 em "ATACADO" (fechada, mesmo tamanho):
   passa e o saldo fechado do tamanho cai 1.
2. Abertura automática com duas apresentações fechadas do mesmo tamanho: abre
   uma saca só por vez, sem contar o saldo duas vezes.
3. Contagem com as duas apresentações do mesmo tamanho na mesma operação:
   recusa; com uma, acerta o saldo do tamanho.
4. Converter produto de 15 kg com histórico (implantação, compra, venda,
   contagem, transferência, composição): saldo × 15 e custo médio ÷ 15 em cada
   loja; depois, vender "300 g" funciona e a saca abre.
5. Converter com o fator diferente do que a prévia mostrou: recusa sem mudar nada.

## Onda 1 (paralela)

### T01: saldo fechado por tamanho (`servidor-acao`)
**Arquivos:** `src/lib/actions/emporio-estoque.ts`, `src/lib/actions/emporio-vendas.ts`, `src/lib/actions/emporio-transferencias.ts`, `src/lib/actions/emporio-producao.ts`, `src/lib/actions/emporio-compras.ts` (só se ler saldo fechado)
**Depende-de:** nenhuma. Q323, Q324 e a parte `SealedLine` da API.

### T02: suíte m115 da spec (`prova-suite`)
**Arquivos:** `scripts/m115-emporio-granel-e-atacado.test.ts`, `package.json` (linha `test:m115`)
**Depende-de:** nenhuma (roda depois de T01 e T03).

### T03: conversão de unidade (`servidor-acao`)
**Arquivos:** `src/lib/actions/emporio-conversao.ts` (novo), `src/app/api/v1/emporio/products/[id]/convert-unit/route.ts` (novo), `src/lib/actions/emporio-catalogo.ts` (só a mensagem da Q322), `src/app/(public)/docs/api/endpoints.ts` (rota nova e a `SealedLine` por tamanho)
**Depende-de:** nenhuma. Q320, Q321, Q322.

## Onda 2

### T04: telas (`tela-pagina`)
Botão e prévia da conversão na tela do produto; dica no cadastro; estoque,
contagem, implantação e perda com uma linha por tamanho.
**Depende-de:** T01, T03.

## Onda 3

`test:m115`, `test:all`, roteiro de navegador provado nos dois sentidos, juiz,
handoff. Depois, com autorização: merge e push (sem migração de schema).

## Depois

Manual (`/manual`) com as atualizações de 11/11 a 13/11 e GIFs dos passos.
