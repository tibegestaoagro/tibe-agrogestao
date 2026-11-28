# Onda 7 da UX do Empório: o que o manual precisa acompanhar

Lista viva, acumulada desde a onda 2. O manual é a última coisa a ajustar
(decisão do usuário de 25/11/2026). Cada onda acrescenta aqui o que o
`npm run textos-defasados` e a passada dos roteiros acharam no manual.

## Da onda 6 (loja no topo)

- O manual cita o filtro de loja de cada tela (`figuras.ts:152`,
  `partes-tarefa-3.tsx:736`), os botões de loja do Estoque e o campo Loja do
  Histórico. Hoje a loja é escolhida uma vez, no "Loja: Todas ▾" do topo.
- `scripts/navegador/manual-emporio.py` (linhas 640 e 674) e
  `scripts/navegador/manual-gifs.py` (linhas 110, 648, 649, 710, 723 e 743)
  usam `?loja=` e as pílulas "Todas as lojas". O link com `?loja=` agora vira
  a loja do topo e sai da URL.

## Das ondas 4 e 5 (Dinheiro e Estatísticas)

- Endereços antigos em `manual/_conteudo/figuras.ts` (linhas 186, 199, 212,
  363, 425, 438, 450, 463 e 725) e em `partes-tarefa-3.tsx` (linhas 869 e
  892). Eles caem nos redirecionamentos.
- A barra de abas, Despesas, Cobrança, Posição de caixa e o menu antigo das
  Estatísticas.
- `scripts/cenario-demonstracao-emporio.ts` também cita os endereços antigos.

## Das ondas 2 e 3 (Início e Vender)

- `manual-emporio.py` (linhas 148 e 149) e a figura `inicio-primeiros-passos`
  com a grade antiga do Início.
- A legenda de atalhos do Vender, "Escolher cliente" (virou "Trocar"), o
  vendedor em botões e "Abrir o Caixa 1" (`partes-funcao.tsx:267`,
  `partes-consulta.tsx:130`, `vendedor-imprimir/page.tsx:49` e `:77`).

As linhas são as de quando cada onda fechou: confira antes de editar.
