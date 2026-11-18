# Empório: paginação das listas e acertos da curva ABC (dívidas 5.26 e 5.27, Q366 e Q367)

Design curto (mudança pequena e média, sem migração), aprovado pelo usuário em
18/11/2026. Segue a frente H
([2026-11-18-emporio-curva-abc-design.md](2026-11-18-emporio-curva-abc-design.md)).

## Por que

A lista de Orçamentos cortava nos 200 mais recentes sem avisar, e a Agromax
achou que os antigos tinham sumido. A Q365 a paginou; outras nove listas do
Empório têm o mesmo corte (dívida 5.26). Contagem no Neon em 18/11 (conta da
Agromax): Produções 67 (~11/dia), Movimentos do caixa 48 (~10/dia, corte em
100), Compras 15 (~8/dia), Vendas 32 (~5/dia); Transferências, Pedidos de
pagamento, Antecipações e Entregas, 0. A 5.27 junta dois acertos da curva ABC.

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q366 | **Paginação no padrão da Q365 em todas as listas da 5.26.** Completa (20, 40, 80 ou 100 por página, ordem, números) nas listas com página própria: Vendas, Compras, Transferências e Aprovações. Compacta (de 20 em 20, "Mostrando X a Y de N" e os números, sem seletor de tamanho) nas listas dentro de outras telas: produções na ficha do produto, antecipações no A receber, entregas e movimentos no Caixa. Conferências do caixa: só a API ganha página. Os resumos da tela inicial do Empório seguem com os últimos registros | aprovado pelo usuário em 18/11 |
| Q367 | **Curva ABC:** os percentuais (de cada item e das classes) fecham exatamente em 100,00% (sobra distribuída pelo maior resto); o seletor "Lucro" é decidido no servidor antes de aparecer | dívida 5.27, aprovado pelo usuário em 18/11 |

## Comportamento

- **Servidor:** cada action listada aceita `page`, `per_page` e `order`
  (`desc` padrão, `asc`), conta sob o mesmo filtro, pagina com `skip`/`take`,
  devolve a última página quando pedem além dela e informa o `total`. Sem
  `page`, o `limit` antigo continua valendo para quem o usa (a tela inicial do
  Empório). `per_page` fora de 20, 40, 80 e 100: 422 em `per_page`. As rotas
  devolvem as linhas em `data` e `meta: { total, page, per_page }`, como a de
  orçamentos. A ordem é a natural de cada lista (data ou número), invertida
  pelo `order`.
- **Lista que já pagina por cursor** (Pedidos de pagamento, com `before` e
  `before_id`): se a tela já mostra "ver mais" sem cortar em silêncio, fica
  como está e a dívida dela fecha só com a conferência; se corta, entra no
  padrão.
- **Telas:** o componente `src/app/(dashboard)/emporio/_components/paginacao.tsx`
  em todas. Na completa, os seletores "Por página" e "Ordem" junto dos filtros
  da página; na compacta, só a barra embaixo da seção. Cada lista guarda a
  própria página na URL com um parâmetro próprio (ex.: `pagina_mov` e
  `pagina_ent` no Caixa), para duas listas na mesma tela não se misturarem.
  Mudar filtro ou busca volta à página 1 daquela lista.
- **`lerCaixaAction`** é composta (saldos e movimentos): só os movimentos
  paginam, com o `total` deles; quem a chama para os saldos (Despesas, A
  pagar, Franqueado) não muda.
- **Curva ABC:** os `share_pct` dos itens e das classes somam 100,00 (maior
  resto, em centésimos); `cumulative_pct` segue a soma dos `share_pct`
  arredondados, terminando em 100,00. A classificação continua pelos inteiros
  (não muda). A página do Relatórios pergunta ao servidor se a pessoa pode ver
  o lucro e só então mostra o seletor; o 403 da rota continua.

## Fora do escopo

Paginação nas listas que não cortam (as que já mostram tudo de uma loja ou de
um cadastro pequeno) e nos relatórios.

## Validação

Suíte escrita da spec (cada action com página, total, ordem, 422 e o `limit`
antigo; a curva fechando em 100), as suítes antigas que leem essas listas
ajustadas sem afrouxar, roteiro de navegador provado nos dois sentidos, juiz,
manual e merge com autorização do usuário.
