# Preço do cadastro, desconto por PIN e brinde: plano

> Executar pela skill `orquestrar-ondas` (subagente não commita).

**Spec:** [../specs/2026-11-16-emporio-preco-travado-desconto-pin-e-brinde-design.md](../specs/2026-11-16-emporio-preco-travado-desconto-pin-e-brinde-design.md) (Q327 a Q334 e as escolhas depois da revisão).

## Costura com a tela

Item: `discount_pct`. Corpo: `order_discount_amount`, `discount_authorization`.
`POST /api/v1/emporio/discount-authorizations` `{ establishment_id,
authorizer_user_id, pin, discount_pct }` devolve `{ authorization, discount_pct,
expires_at, authorizer: { id, name } }`. Recusas: 422 `items` (frases da spec),
403 `DISCOUNT_ABOVE_LIMIT` em `items` (frase de hoje), 403
`DISCOUNT_AUTHORIZATION_INVALID` em `discount_authorization`, 422 `INVALID_PIN`
e 429 `PIN_LOCKED` em `pin`, 422 em `authorizer_user_id`. Visões:
`order_discount_amount` na venda e no orçamento; `has_pin` na Equipe.

## Ondas

| onda | tarefa | agente | arquivos | depende |
|---|---|---|---|---|
| 0 | T1 schema e migração | servidor-dados | `prisma/schema.prisma`, `prisma/migrations/20261116180000_emporio_desconto_pin_brinde/` | nada |
| 1 | T2 núcleo puro | servidor-acao | `src/lib/emporio/desconto.ts`, `src/lib/emporio/autorizacao-desconto.ts`, `src/lib/emporio/autorizadores.ts`, `src/lib/rate-limit.ts` | T1 |
| 1 | T3 suíte da spec | prova-suite | `scripts/m118-emporio-preco-desconto-pin-brinde.test.ts`, `package.json` | T1 (roda depois de T4 e T5) |
| 2 | T4 preço, venda, orçamento | servidor-acao | `src/lib/emporio/precificar.ts`, `src/lib/actions/emporio-vendas.ts`, `src/lib/actions/emporio-orcamentos.ts`, `src/lib/emporio/vendeu-pagou.ts`, `src/lib/emporio/venda-schema.ts`, `src/lib/actions/emporio-resultado.ts` | T2 |
| 2 | T5 PIN e autorização | servidor-acao | `src/lib/actions/emporio-autorizacao.ts`, `src/lib/actions/emporio-equipe.ts`, `src/lib/emporio/historico.ts`, rotas novas (`discount-authorizations`, `establishments/[id]/authorizers`, `me/emporio-pin`, `team/[userId]/pin`) | T2 |
| 2 | T7 suítes antigas | prova-suite | `scripts/m81-emporio-f3a.test.ts`, `scripts/m94-emporio-orcamento.test.ts` | T4 para rodar |
| 3 | T6 `/docs/api` | servidor-acao | `src/app/(public)/docs/api/endpoints.ts` | T4, T5 |
| 3 | T9a impresso | servidor-acao | `src/lib/actions/emporio-impressao.ts` | T4 |
| 3 | T8 balcão | tela-pagina | `venda-estado.ts`, `venda-campos.tsx`, `balcao.tsx`, `balcao-orcamento.tsx`, `trocar-form.tsx`, `devolucao-itens.tsx`, `catalogo-venda.ts`, `autorizacao-gestor.tsx` (novo), `vender/page.tsx`, `vendas/[id]/page.tsx` | T4, T5 |
| 3 | T11 PIN na tela | tela-pagina | `configuracoes/senha/page.tsx`, `configuracoes/senha/emporio-pin-form.tsx`, `emporio/equipe/page.tsx`, `emporio/equipe/_components/equipe-apagar-pin-botao.tsx` | T5 |
| 4 | T9b papéis e orçamento | tela-pagina | `papel-a4.tsx`, `papel-cupom.tsx`, `orcamentos/[id]/page.tsx` | T9a |
| 4 | T12 manual | tela-pagina | `manual/_conteudo/*` | T8 |
| 4 | T10 roteiros | prova-viva | `emporio-orcamento-editar.py`, `manual-emporio.py`, `emporio-desconto-pin.py` (novo), `_cenario-emporio-desconto-pin.ts` (novo) | T8, T11 |
| 5 | juiz, `test:all`, handoff | prova-juiz | | tudo |

Antes do push: migração no Neon (invariante 3), com autorização do usuário.
