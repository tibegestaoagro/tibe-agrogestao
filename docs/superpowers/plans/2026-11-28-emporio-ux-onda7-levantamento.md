# Onda 7 da UX do Empório: levantamento do manual defasado

Anexo do plano [2026-11-28-emporio-ux-onda7-manual.md](2026-11-28-emporio-ux-onda7-manual.md).
Levantado em 28/11/2026, só lendo o código (dois levantamentos, texto e
imagens). As linhas são as de `7bb67b22`: confira antes de editar.

Abreviações: `man/` = `src/app/(dashboard)/manual/_conteudo/`; `emp/` =
`src/app/(dashboard)/emporio/`.

## Fatos da tela que sustentam quase tudo

- **Menu** (`src/lib/emporio/menu.ts`): Início | Vender | Vendas › (Vendas,
  Orçamentos, Clientes, Fiado, Franqueados) | Estoque › (Produtos, Estoque,
  Compras, Transferências, Fornecedores) | Dinheiro › (Hoje, Caixa, A receber,
  A pagar, Aprovações) | Estatísticas (item solto) | Ajustes › (Lojas, Equipe,
  Histórico, Configurações). Não existe item Despesas, Resultado, Relatórios,
  Projeção, Posição de caixa nem Cobrança. O menu do Caixa não tem Início
  (`/emporio` leva a Vender) e tem Clientes.
- **Sem barra de abas do Financeiro.** A pagar tem as abas Contas, Despesas
  fixas e Vendeu, Pagou. A receber tem Fiado, Cheques, Boletos, Cartões e
  Vencidos (a antiga Cobrança), com o total no rótulo. Aprovações tem
  Esperando e Decididos. Estoque tem Precisa repor (padrão) e Tudo.
- **Estatísticas** (`emp/estatisticas/page.tsx`): Visão geral | Vendas |
  Dinheiro (só quem tem a ação dinheiro) | Resultado | Relatórios para
  imprimir. Filtro único: Hoje, 7 dias, Este mês, Mês passado, Escolher datas
  e Aplicar. Resultado vale pelo mês da data final. Quem alcança só algumas
  lojas vê, em "Todas", a soma e "Loja por loja", sem o detalhe do mês.
  Abre para `gestor_da_loja` ou `dinheiro` (o Financeiro também vê).
- **Loja do topo** (`src/lib/emporio/loja-do-topo.ts`): vale em Início,
  Vendas, Orçamentos, Fiado, Estoque, Compras, Transferências, Hoje, A
  receber, A pagar, Estatísticas e Histórico. Só aparece com 2 ou mais
  lojas. Caixa e Aprovações ficam de fora (o Caixa tem filtro de loja
  próprio em "Saldo de cada lugar"). Um link com `?loja=` vira a loja do
  topo e sai da URL.
- **Vender** (`emp/_components/balcao.tsx`): o cliente já começa como
  Consumidor final, com o botão "Trocar" (F4). "Escolher cliente" e
  "Cadastrar novo cliente" só aparecem sem cliente; com cliente, o cadastro
  está na janela, como "Não achou? Cadastrar novo". Desconto no total,
  Frete, Origem, Pedido para entrega, Franqueado, Crédito e "Orçamento nº"
  (Carregar) ficam em "Mais opções", recolhido. Faixa do caixa no alto, com
  o botão "Abrir o caixa" (não existe "Abrir o Caixa 1"). O vendedor do
  Caixa é uma fileira de botões "1 Nome" (F8 e o dígito); loja com um
  vendedor só já vem escolhida. As teclas aparecem ao lado de cada campo, em
  tela grande; não há faixa no rodapé.
- **Início** (`emp/page.tsx`): "Precisa de você", quatro números, Atalhos
  e, por último, Primeiros passos (só Gestor para cima, e só com pendência).
- **Caixa** (`emp/caixa/page.tsx`): seção nova "Saldo de cada lugar" no alto
  (extrato e "Conferir com o banco", só com a ação dinheiro). Antecipar,
  Antecipações e "Conferir o dia" do cartão estão em A receber › Cartões; o
  Caixa mostra o cartão só para leitura.

## Texto defasado, por arquivo

**`man/partes-funcao.tsx`.** Dono: 45 e 46 (links e nomes Resultado e
Relatórios), 60 ("Todas as lojas somadas no Resultado"), 96 (figura do
Início). Gestor: 135, 136. Vendedor: 223, 224, 251 (Escolher cliente e
Cadastrar novo cliente), 227, 250, 257 e 258 (Mais opções), 267 (Abrir o
Caixa 1), 280 (nomes do menu). Caixa: 313 e 314 (menu do Caixa), 328 e 329,
338, 340 (vendedor em botões), 349, 419.

**`man/partes-tarefa-1.tsx`.** Primeiros passos: 15 e 33 (Início novo).
Equipe: 95. Estoque: 402 (loja pelo topo), 403 (aba Tudo, paginada), 432
(Precisa repor é aba).

**`man/partes-tarefa-2.tsx`.** Vender: 19, 27, 28 (Mais opções), 22 e 47
(cliente), 29 (vendedor em botões), 36, 118 e 127 (rodapé de atalhos).
Fiado: 201, 202, 221 (busca "Buscar cliente", omissão), 270, 271, 278, 293,
310 (Cobrança virou A receber › Vencidos). Caixa: 358, 543 a 545 (Antecipar
mora em A receber › Cartões), 548, e a omissão de "Saldo de cada lugar".
Despesas: 566, 570, 585, 601, 612, e a omissão das comissões agrupadas numa
linha (`agruparContas`). Resultado: 633, 661, 667 e 668.

**`man/partes-tarefa-3.tsx`.** Configurações: 173 (legenda das teclas).
Orçamento: 200 a 203, 248. Entrega: 323. Relatórios: 456, 458, 459, 515,
524, 544. Histórico: 682 (o campo Loja saiu). Franqueados: 708 e 709.
Financeiro das lojas: 727, 731, 734, 735, 736, 737, 820 (a âncora
`conferir-com-o-banco` está na 816), 840, 869, 876, 892, 897.

**`man/partes-consulta.tsx`.** Perguntas: 58 (Produtos e Estoque também
paginam), 86 (não há item Financeiro), 118, 122, 130, 134, 142. Glossário:
sem erro; faltam "Loja do topo" e "Conferir com o banco".

**`src/app/(dashboard)/manual/emporio/vendedor-imprimir/page.tsx`.** 12, 33,
49, 76 ("Cliente novo"), 77.

**`man/figuras.ts`** (alt, legenda e marcas): 36 a 44, 148 a 157, 160 a 169,
172 a 181, 185 a 196, 198 a 208, 211 a 221 (marca 1 cita "Padrão" e "Esta
semana", que não existem), 232 a 246, 302 a 310, 362 a 371, 424 a 446, 449 a
470, 474 a 483, 577 a 583, 646 a 655, 722 a 742; a 80 cita "Novo
estabelecimento". **`man/animacoes.ts`:** 78 e 79, 128.

Partes intactas: produtos, preço, compras, fornecedores, transferências,
clientes, devolver, glossário (só faltam verbetes).

## Figuras e GIFs

- 55 figuras (`figuras.ts`, uma `figura(...)` cada em
  `scripts/navegador/manual-emporio.py`), em computador e celular: 110 PNG,
  mais 8 GIF com o PNG do último quadro. Nada falta nem sobra em
  `public/manual/emporio/`. O cabeçalho do roteiro diz "44 figuras".
- **Todas as de computador mostram o menu antigo.** No celular, as do Vender
  mostram o layout antigo.
- **Marca sem alvo (11):** `inicio-primeiros-passos` (grade de cartões saiu;
  `cartoes_sem_fixtures` virou operação vazia), `financeiro-hoje`
  (`nav[aria-label="Telas do Financeiro"]` não existe), `despesas-fixas`
  (marcas 3 e 4 estão em outras abas), `resultado-loja` (seletor de loja e
  mês saiu), `relatorios-periodo` (campo Loja, "Ver relatório" e "Mês atual"
  saíram), `balcao-cliente-vendedor` ("Cadastrar novo cliente"),
  `balcao-escolher-cliente` (clica "Escolher cliente", que não existe com o
  Consumidor final; use o ajudante que aceita "Trocar cliente"),
  `orcamento-balcao`, `orcamento-salvo`, `orcamento-faturar`,
  `balcao-entrega` (campos em "Mais opções": chamar `abrir_mais_opcoes()` do
  `_lib.py`, que nenhum dos dois roteiros usa).
- **Sessão ou loja:** `resultado-loja` e `resultado-equilibrio` usam o
  gestor (Fernanda, duas lojas, sem alcance total). Com "Todas" ela só vê a
  soma: precisa de uma loja escolhida ou da sessão do dono.
- **Só no celular:** `fiado-lista` (a coluna chama "Vence" abaixo do `md`).
- **Endereços que redirecionam** (funcionam, mas o certo é o novo):
  `/emporio/despesas`, `/emporio/financeiro/cobranca`,
  `/emporio/financeiro/caixa`, `/emporio/relatorios`, `/emporio/resultado`,
  `/emporio/financeiro/relatorios`, `/emporio/financeiro/projecao`.
- **Adoção do `?loja=`:** o seletor faz `router.replace` e `router.refresh`
  depois do carregamento; o `ir()` não espera isso, e o refresh pode desfazer
  o `ocultar_fixtures` e o `limitar_linhas`. Esperar a URL perder o `loja`
  antes de preparar a página. O `entrar()` apaga os cookies, então cada
  figura começa em "Todas".
- **GIFs:** `balcao-credito-franqueado` (Franqueado e Crédito em "Mais
  opções"); `produto-fracao-gramas` passo 4 e `estoque-atacado-mesma-saca`
  (o Estoque abre em Precisa repor: usar `?aba=tudo`; as pílulas "Todas as
  lojas" de `CFG_ESTOQUE` e `CFG_ESTOQUE_B` não existem mais). Os outros 5
  passam, mas com o menu e o Vender antigos nos quadros. `manual-gifs.py`
  tem uma cópia própria do `AJUDA_JS`, sem `M.Bs`, `M.LIN` e `M.LN`.
- **Cenário:** o log final de `scripts/cenario-demonstracao-emporio.ts`
  (1672 a 1681) cita endereços antigos. O Início novo precisa de avisos no
  "Precisa de você" e, para o cartão Primeiros passos, de uma pendência; a
  Visão geral precisa de vendas no mês passado. Não conferido se o cenário
  já gera isso.

## Divergências entre o desenho e o código (vale o código)

- O Caixa manteve as seções "A receber do cartão", "Cheques" e "Boletos"
  além das abas de A receber (§5.8).
- O botão e o painel de Lojas ainda dizem "Novo estabelecimento" e "Editar
  estabelecimento" (§5.1). **Decisão de 28/11: corrigir nesta onda.**
- Alt+1 não é atalho padrão (§5.7); os padrões são F2, F4, F8, F9 e
  Ctrl+Enter (`src/lib/emporio/atalhos.ts`).
- O seletor do topo não existe em Aprovações (§5.3).
