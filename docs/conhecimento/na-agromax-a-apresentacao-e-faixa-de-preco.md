---
tipo: decisao
data: 2026-11-10
tags: [emporio, agromax, apresentacao, vendeu-pagou]
origem: docs/specs/module-39-meu-emporio.md (Q292)
---

# Na Agromax a apresentação é faixa de preço, não embalagem

## O que aconteceu

Em produção, os braquiarões da Agromax têm as apresentações CONSUMIDOR,
FRANQUIA, ATACADO e FRANQUIA PLUS no mesmo produto: são tabelas de preço por
tipo de cliente, não tamanhos de saco. Outros 32 produtos ativos não têm
apresentação nenhuma e vendem direto na unidade-base. A Agromax queria a
comissão de 10% "toda vez que vender na apresentação FRANQUIA", e a regra
do Vendeu, Pagou só aceitava apresentação de um produto escolhido.

## Por que importa

A alternativa descartada era uma regra por produto, que a Agromax recusou
("vou ter que criar regras demais"). A decisão (Q292) foi casar pelo
**nome** da apresentação em qualquer produto, sem diferenciar maiúscula,
acento e espaço, com nome igual (FRANQUIA PLUS não casa com FRANQUIA). Quem
trata apresentação como embalagem vai desenhar errado tudo o que é por
apresentação nessa conta: comissão, desconto, relatório.

## Como aplicar

- Recurso novo "por apresentação" no Empório: pergunte se vale pelo nome em
  todos os produtos, porque na Agromax é o caso comum.
- Lista de apresentações vazia não é defeito: o produto vende na
  unidade-base. A tela precisa dizer isso, senão parece quebrada.

## Relacionado

- [[o-custo-medio-que-parecia-errado-era-estoque-fantasma]]
