# Onda 7 da UX do Empório: o manual

> **Para agentes:** execute com a skill `orquestrar-ondas` (subagentes por time, a sessão principal commita). Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** o manual do Meu Empório (`/manual/emporio`) volta a descrever as telas de hoje, depois das ondas 1 a 6: texto, partes, figuras e GIFs.

**Arquitetura:**
- O texto mora em `src/app/(dashboard)/manual/_conteudo/` (uma função por parte, mapeada por `conteudos.tsx`; a ordem e os nomes em `indice.ts`).
- As figuras são definidas em `figuras.ts` (alvos por texto, marcas numeradas) e fotografadas por `scripts/navegador/manual-emporio.py`. Os GIFs, em `animacoes.ts` e `scripts/navegador/manual-gifs.py`.
- Onde a tela fundiu, a parte funde, e o endereço antigo da parte redireciona.
- Nada de servidor, banco ou migração. A única tela que muda é a de Lojas (um rótulo).

**Stack:** Next.js 16 (App Router), React 19, roteiros Python em `scripts/navegador/`.

**Spec:** [2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md), §5 (o que as telas viraram), §6 (onda 7), §8. **Levantamento (leia antes da sua tarefa):** [2026-11-28-emporio-ux-onda7-levantamento.md](2026-11-28-emporio-ux-onda7-levantamento.md), com cada linha defasada por arquivo.

## Restrições globais

- **Invariantes do `CLAUDE.md`:** sem travessão (4), sem heredoc com escape (5), merge e push na `main` só com autorização na conversa (7), suíte verde não é validação (8).
- **Vale a tela, não o desenho.** Antes de escrever uma frase sobre uma tela, abra o código dela. Onde o desenho e o código divergem, o levantamento lista; escreva o que o código faz.
- **Escrita do manual:** português simples, frases curtas, para quem está no balcão. Siga o tom das partes intactas (Produtos, Preço, Compras). Nomes de botão, aba e menu exatamente como na tela, com o caminho do menu ("Dinheiro › A pagar, aba Despesas fixas").
- **Nada se escreve na conta Da Mata.** As figuras saem do banco local, com o cenário de demonstração.
- **O repositório é público:** figura e GIF só com os nomes do cenário de demonstração (o roteiro já esconde o resto por lista de permitidos).
- **`npm run check` limpo.**

## Decisões

As de 1 a 4 são do usuário (28/11, nesta sessão). As outras são minhas, como planejador, e vão ao usuário junto com o plano.

1. **Fundir onde a tela fundiu.** Saem 4 partes, entram 3; o resto fica. *(Usuário.)*

   | sai | entra | conteúdo |
   |---|---|---|
   | `resultado`, `relatorios` | `estatisticas`, "Estatísticas" | as cinco abas; a projeção e os relatórios do dinheiro que estavam em `financeiro-das-lojas` |
   | `despesas` | `a-pagar`, "A pagar e despesas" | as abas Contas, Despesas fixas e Vendeu, Pagou; pagar a conta da compra |
   | `financeiro-das-lojas` | `dinheiro`, "Dinheiro" | Hoje, A receber (as cinco abas), Aprovações, conferir com o banco |

2. **Figuras novas, as quatro:** `loja-do-topo`, `inicio`, `estatisticas-visao-geral`, `balcao-mais-opcoes`. As 55 de hoje são todas fotografadas de novo (o menu mudou em todas). *(Usuário.)*
3. **A tela de Lojas** passa a dizer "Nova loja" e "Editar loja" (§5.1), antes das fotos. *(Usuário.)*
4. **Os 8 GIFs são refeitos.** *(Usuário.)*
5. **Ordem das partes** em `indice.ts`: `dinheiro` no lugar de `financeiro-das-lojas`, `a-pagar` no lugar de `despesas`, `estatisticas` no lugar de `resultado`; `relatorios` sai. Ficam 27 partes.
6. **Endereços antigos das partes redirecionam** (`/manual/emporio/<antigo>`): `financeiro-das-lojas` vai a `dinheiro`, `despesas` a `a-pagar`, `resultado` a `estatisticas#resultado`, `relatorios` a `estatisticas#vendas`. O navegador mantém o `#` do link original quando o destino não tem um, e por isso `financeiro-das-lojas#conferir-com-o-banco` continua achando a seção.
7. **Âncoras fixas** (contrato entre tarefas): em `estatisticas`, `visao-geral`, `vendas`, `dinheiro`, `resultado`, `imprimir`; em `dinheiro`, `hoje`, `a-receber`, `aprovacoes`, `conferir-com-o-banco`; em `a-pagar`, `contas`, `despesas-fixas`, `vendeu-pagou`. As duas telas que linkam o manual (`financeiro-extrato.tsx` e `financeiro-hoje.tsx`) passam a `/manual/emporio/dinheiro#conferir-com-o-banco`.
8. **Onde entram as figuras novas:** `inicio` e `loja-do-topo` numa seção nova de **Primeiros passos**, "Como o Empório se organiza" (o menu em grupos, o Início, a loja do topo e o (i) com "Ver no manual"); `estatisticas-visao-geral` em `estatisticas`; `balcao-mais-opcoes` em `vender`. Não nasce parte nova para o Início.
9. **Os ids das figuras antigas não mudam**, mesmo os que dizem `financeiro-*` ou `resultado-*`: muda o endereço que elas abrem, a legenda e as marcas. Trocar id quebraria os PNG e o cache sem ganho para quem lê.
10. **Sessão das figuras de Resultado:** `resultado-loja` e `resultado-equilibrio` passam ao **dono** com uma loja escolhida no topo (o gestor do cenário só vê a soma em "Todas"). As figuras usam o endereço novo (`/emporio/estatisticas?aba=...`), não o que redireciona.
11. **Glossário ganha dois verbetes:** "Loja do topo" e "Conferir com o banco".
12. **Suíte nova `m136`** trava a estrutura do manual (decisão 1, 6 e 7, figuras e frases que não existem mais), sem banco.

---

### Task 1: a tela de Lojas diz "loja"

**Time:** `tela-pagina`. **Depende-de:** nada. **Arquivos:**
- Modificar: `src/app/(dashboard)/emporio/_components/estabelecimento-form.tsx` (linhas 134, 193 e 196)
- Modificar: `scripts/navegador/emporio-f1.py`, `emporio-f6a.py`, `emporio-financeiro-projecao.py`, `emporio-orcamento-leve-e-cep.py` (onde esperam "Novo estabelecimento" ou "Editar estabelecimento")

- [ ] Botão e título do painel: "Nova loja" e "Editar loja"; a recusa de nome vazio: "Informe o nome da loja."
- [ ] Os quatro roteiros esperam o rótulo novo.
- [ ] `npm run textos-defasados` não acusa "estabelecimento" em roteiro nem suíte (o `manual-emporio.py` é da Task 4).

### Task 2: a estrutura e as partes do Dinheiro, A pagar e Estatísticas

**Time:** `tela-pagina`. **Depende-de:** nada (usa os ids da Task 4 pelo contrato). **Arquivos:**
- Modificar: `src/app/(dashboard)/manual/_conteudo/indice.ts`, `conteudos.tsx`
- Modificar: `src/app/(dashboard)/manual/emporio/[parte]/page.tsx`
- Criar: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-4.tsx` (`ParteDeDinheiro`, `ParteDeAPagar`, `ParteDeEstatisticas`)
- Modificar: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx`, `partes-tarefa-3.tsx`
- Modificar: `src/app/(dashboard)/emporio/_components/financeiro-extrato.tsx`, `financeiro-hoje.tsx` (só o link do manual)

**Interfaces:**
- Produz, em `indice.ts`: `export const PARTES_ANTIGAS: Record<string, string>` com os quatro destinos da decisão 6 (`"resultado": "estatisticas#resultado"` e afins). A suíte `m136` lê este nome.
- `[parte]/page.tsx`: slug em `PARTES_ANTIGAS` faz `permanentRedirect` para `${BASE_DO_EMPORIO}/<destino>`; `generateStaticParams` continua só com as partes vivas.

- [ ] `indice.ts` e `conteudos.tsx` com as 27 partes (decisões 1 e 5). Resumos novos: Dinheiro, "Hoje, A receber, Aprovações e conferir com o banco."; A pagar e despesas, "Pagar a conta da compra, despesas fixas e Vendeu, Pagou."; Estatísticas, "Visão geral, vendas, dinheiro, resultado e relatórios para imprimir."
- [ ] `partes-tarefa-4.tsx`: o texto de `ParteDeFinanceiroDasLojas`, `ParteDeDespesas`, `ParteDeResultado` e `ParteDeRelatorios` reescrito nas três partes, com as âncoras da decisão 7 e as linhas do levantamento corrigidas. Entram as omissões: comissões agrupadas numa linha (A pagar), a busca de cliente e as abas com total (A receber), Antecipar e "Conferir o dia" em A receber › Cartões, a aba Dinheiro que só aparece para quem cuida do dinheiro, e o Financeiro que também abre Estatísticas. `<Figura id="estatisticas-visao-geral" />` na seção `visao-geral`.
- [ ] As quatro funções antigas saem de `partes-tarefa-2.tsx` e `partes-tarefa-3.tsx`; o resto desses dois arquivos é corrigido pelo levantamento (Vender, Fiado, Caixa, Configurações, Orçamento, Entrega, Histórico, Franqueados). `<Figura id="balcao-mais-opcoes" />` em `vender`, onde o texto fala de "Mais opções".
- [ ] Nenhum `${B}/resultado`, `${B}/relatorios`, `${B}/despesas` ou `${B}/financeiro-das-lojas` sobra nos dois arquivos.
- [ ] `tsc` limpo; `/manual/emporio/resultado` redireciona a `/manual/emporio/estatisticas#resultado` (conferir com `curl -sI` no `next dev`).

### Task 3: o texto das funções, dos primeiros passos e da consulta

**Time:** `tela-pagina`. **Depende-de:** nada (usa os slugs e ids pelo contrato). **Arquivos:**
- Modificar: `src/app/(dashboard)/manual/_conteudo/partes-funcao.tsx`, `partes-tarefa-1.tsx`, `partes-consulta.tsx`
- Modificar: `src/app/(dashboard)/manual/emporio/vendedor-imprimir/page.tsx`

- [ ] Cada linha do levantamento nesses quatro arquivos corrigida. Links para as partes que saíram vão às novas, com a âncora (`${B}/estatisticas#vendas`, `${B}/a-pagar#despesas-fixas` e afins).
- [ ] Primeiros passos: a seção "Como o Empório se organiza" (decisão 8), com `<Figura id="inicio" />` e `<Figura id="loja-do-topo" />`. Diz onde a loja do topo vale e onde some, que só aparece para quem tem mais de uma loja, e que um link com a loja muda a loja do topo.
- [ ] Glossário: "Loja do topo" e "Conferir com o banco" (decisão 11). Perguntas: as 7 linhas.
- [ ] O Guia do Vendedor continua cabendo numa folha A4 (o `manual-emporio.py` confere no fim; a Task 6 roda).

### Task 4: as figuras e os GIFs (definições e roteiros)

**Time:** `prova-viva`. **Depende-de:** nada. **Arquivos:**
- Modificar: `src/app/(dashboard)/manual/_conteudo/figuras.ts`, `animacoes.ts`
- Modificar: `scripts/navegador/manual-emporio.py`, `scripts/navegador/manual-gifs.py`
- Modificar, se o cenário não trouxer o que as figuras novas pedem: `scripts/_cenario-manual-emporio.ts`, `scripts/_cenario-manual-gifs.ts`, `scripts/cenario-demonstracao-emporio.ts` (o log final, linhas 1672 a 1681, também)

**Interfaces:** produz os ids `loja-do-topo` (dono, seletor aberto), `inicio` (dono: Precisa de você, os números, Atalhos), `estatisticas-visao-geral` (dono, aba Visão geral, com a barra de abas e o filtro), `balcao-mais-opcoes` (vendedor_centro, "Mais opções" aberto). `inicio-primeiros-passos` fica, recortado no cartão.

- [ ] As 17 entradas de texto defasado do levantamento (alt, legenda, marcas) e as 11 marcas sem alvo, com o endereço novo de cada figura (decisão 10) e a sessão do dono nas duas de Resultado.
- [ ] Depois de `ir()` num endereço com `?loja=`, esperar a URL perder o `loja` antes de preparar a página (ajudante local nos dois roteiros; não mexa no `_lib.py`, que serve a todos).
- [ ] Os passos que usam "Mais opções" chamam `abrir_mais_opcoes()`; `balcao-escolher-cliente` abre a janela pelo "Trocar"; o Estoque dos GIFs vai a `?aba=tudo`; as pílulas de loja saem de `CFG_ESTOQUE` e `CFG_ESTOQUE_B`.
- [ ] O cenário deixa o que as figuras novas pedem: avisos no "Precisa de você", uma pendência de Primeiros passos para o dono, vendas no mês passado para a comparação da Visão geral. Conferir antes; acrescentar só o que faltar, com chave fixa (rodar de novo não duplica).
- [ ] O cabeçalho do roteiro diz o número certo de figuras (59).
- [ ] Rodar só as figuras quebradas e as novas (`FIGURAS=...`), uma vez, para provar que acham os alvos. A rodada inteira é da Task 6.

### Task 5: a suíte `m136` da estrutura do manual

**Time:** `prova-suite`, escrita destas decisões, sem ler as Tasks 2 a 4. **Depende-de:** nada. **Arquivos:**
- Criar: `scripts/m136-manual-emporio.test.ts`; Modificar: `package.json` (`test:m136`)

Sem banco. Confere:
- [ ] Toda parte de `PARTES_DO_EMPORIO` tem conteúdo em `CONTEUDOS`, e o inverso; são 27; os slugs `resultado`, `relatorios`, `despesas` e `financeiro-das-lojas` não estão entre elas.
- [ ] `PARTES_ANTIGAS` tem as quatro entradas da decisão 6, e cada destino é parte viva com âncora existente.
- [ ] Todo link `/manual/emporio/<slug>(#id)` do manual e de `src/app/(dashboard)/emporio/**` aponta para parte viva (ou `vendedor-imprimir`) e para âncora existente. Para achar as âncoras, renderize cada parte (`renderToStaticMarkup`) ou leia o `id=` do código; escolha e diga qual.
- [ ] Toda `<Figura id>` e `<Animacao id>` usada existe em `FIGURAS` e em `ANIMACOES`, e os ids da decisão 2 estão lá. O PNG de computador e o de celular existem em `public/manual/emporio/` (esta conferência só passa depois da Task 6).
- [ ] Frases que não existem mais nas telas não aparecem no texto, nas legendas nem nas marcas: "Abrir o Caixa 1", "Cadastrar novo cliente" fora de "sem cliente", "aba Cobrança", "Posição de caixa" como aba, "Ver relatório", "Mês atual", "Esta semana", "filtro de loja", "Novo estabelecimento", "faixa do rodapé". Lista num array no topo, comentada.
- [ ] Provar nos dois sentidos: plantar um link para `${B}/resultado` e uma figura inexistente, ver reprovar, desfazer.

### Task 6: as fotos e a prova viva

**Time:** `prova-viva`. **Depende-de:** 1 a 5. **Arquivos:** `public/manual/emporio/*` (gerados); ajustes pontuais nos roteiros da Task 4 se uma figura não achar o alvo.

- [ ] `next dev` com `--disable-source-maps` e `--max-old-space-size=4096`; cenário de demonstração na conta do seed (cabeçalho do `manual-emporio.py`).
- [ ] `npm run navegador -- manual-emporio` inteiro: 59 figuras, computador e celular, e a folha A4 do Guia. Em blocos (`FIGURAS=`), em primeiro plano.
- [ ] `npm run navegador -- manual-gifs` e `python scripts/manual-gifs-montar.py`; depois `manual-animacoes`.
- [ ] Olhar cada PNG novo (abrir a imagem) contra a legenda e as marcas: marca no lugar, sem nome fora do cenário, sem rolagem lateral no celular, o menu novo à vista.
- [ ] `/manual/emporio` no navegador: as 27 partes abrem, anterior e próximo seguem a ordem, os quatro endereços antigos redirecionam, o "Ver no manual" do extrato cai na seção certa (`emporio-ux-onda1` passo 6).
- [ ] `npm run test:m136` verde.

### Task 7: juiz e fechamento

**Depende-de:** 6.
- [ ] `prova-juiz` no range da onda, com o desenho, este plano e o levantamento; achados tratados.
- [ ] `npm run textos-defasados` limpo; passada de todos os `emporio-*` e dos `manual-*`, com cenário limpo antes de cada um; `npm run check`; `npm run test:all`.
- [ ] Handoff: onda 7 pronta; o `docs/agents/emporio-ux-onda7-manual.md` fica marcado como concluído (ou apagado, com o link do handoff retirado).
- [ ] Relatório ao usuário com as fotos das partes que mais mudaram. Merge só com autorização na conversa.

## Foco de revisão

1. **Frase que descreve a tela antiga com palavras novas.** O levantamento pega o nome; o juiz deve ler cada passo como quem segue com o dedo na tela.
2. **Link para âncora que não existe.** O redirecionamento leva à parte, mas a âncora some sem erro; a `m136` confere.
3. **Figura com a loja errada no topo.** O cookie da loja persiste dentro de uma figura; uma figura de "Todas" logo depois de uma com `?loja=` na mesma sessão sai com a loja errada.
4. **O Caixa no manual.** O menu dele não tem Início e tem Clientes; o Vender dele tem os botões de vendedor. É o papel que mais lê o Guia impresso.
5. **O manual para quem tem uma loja só.** O seletor do topo não aparece; o texto não pode mandar "escolha a loja no topo" sem dizer isso.
