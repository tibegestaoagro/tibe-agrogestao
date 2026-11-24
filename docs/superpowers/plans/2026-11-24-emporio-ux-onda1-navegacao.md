# Empório UX, onda 1 (navegação): plano de implementação

> **Para agentes:** sub-skill obrigatória: `superpowers:subagent-driven-development`,
> com o protocolo `orquestrar-ondas` do projeto (campos `Arquivos:` e
> `Depende-de:`, subagente não commita, a sessão principal commita uma tarefa
> por vez com o `HEAD` fresco). Passos em caixa de seleção (`- [ ]`).

**Objetivo:** o menu do Empório em grupos, um cabeçalho único com o (i) em
todas as telas, o topo sem o seletor de propriedades, tela sem permissão
voltando ao Início, "Lojas" no lugar de "Estabelecimentos" e "Conferir com o
banco" no lugar de "carimbo".

**Arquitetura:** a árvore do menu nasce numa função pura nova
(`menuDoEmporio`), ao lado da lista plana de permissões que já existe
(`PAGINAS_DO_EMPORIO`, que continua sendo a fonte dos gates de cada página). O
menu lateral do Tibé ganha um terceiro nível (subgrupo) só para o Empório. O
cabeçalho vira dois componentes do Empório, e as 35 telas passam a usá-los.
Nenhuma regra de negócio muda; nenhuma rota é criada ou removida.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind com os
tokens de `globals.css`. Suítes em `scripts/*.test.ts` (tsx), roteiros de
navegador em `scripts/navegador/` (`npm run navegador`).

**Spec:** [../specs/2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md)
(§5.1, §5.2, §5.3 primeira parte, §5.4, §5.6, "Lojas", e o menu entre as
ondas no §6). Mockup de referência:
[../specs/mockups/2026-11-24-emporio-ux/menu-inicio.html](../specs/mockups/2026-11-24-emporio-ux/menu-inicio.html).

## Restrições globais

- Invariantes do `CLAUDE.md`: nada de travessão (4); nada de heredoc com
  escape (5); regra de negócio só em `src/lib/actions/*` (6); merge, push na
  `main` e deploy só com autorização do usuário na conversa (7).
- Suítes com o banco local inline:
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:<nome>`.
- `npm run check`, `npx tsc --noEmit` e `npm run lint` (com `--max-warnings 0`)
  limpos ao fim de cada tarefa.
- Cor só por token (`text-texto`, `bg-primaria` e afins); conferência 7 reprova
  cor crua do Tailwind, e a 6, par de token sem contraste.
- Kit (`src/components/ui/`) e `globals.css` não mudam nesta onda.
- Códigos de erro, nomes de ação do Histórico e parâmetros de URL **não**
  mudam (ex.: `JA_CARIMBADO`, `conciliacao.carimbar`, `?carimbo=`): só o texto
  que a pessoa lê.
- Endereços não mudam nesta onda: `/emporio/estabelecimentos` continua, só o
  rótulo vira "Lojas".
- Commits: `Área: descrição`, em português, com as linhas de atribuição da
  sessão.

## Foco da revisão

Condições que a spec implica e que nenhum teste unitário pega, cada uma com o
teste na tarefa dona:

1. Papel que não abre nenhuma tela de um grupo (ex.: o financeiro não abre
   Estoque): o grupo some, sem botão vazio. Teste na Tarefa 1.
2. Estado salvo de subgrupo que o papel não tem, ou de rótulo que mudou: é
   ignorado sem erro, e a primeira pintura não pisca (lido depois de montar).
   Conferido na Tarefa 7, recarregando a página.
3. Link salvo para uma tela que o papel não abre (gestor em
   `/emporio/financeiro/pagar`): volta ao `/emporio`, nunca o 404 em inglês.
   Conferido na Tarefa 7.
4. Celular (390 px): abrir e fechar um subgrupo não fecha a gaveta do menu (só
   clique em link fecha). Conferido na Tarefa 7.
5. (i) pelo teclado: Tab chega ao botão, Enter abre, `Esc` fecha e devolve o
   foco ao botão, o link "Ver no manual" é alcançável. Conferido na Tarefa 7.

## Ondas

| onda | tarefas | por quê |
|---|---|---|
| 1 | 1, 2, 3 | sem dependência entre si, arquivos disjuntos |
| 2 | 4a, 4b, 4c, 5 | dependem da 3; arquivos disjuntos |
| 3 | 6 | a trava só passa com as telas migradas |
| 4 | 7 | prova viva de tudo |
| 5 | 8 | juiz e fechamento |

---

### Tarefa 1: suíte do menu agrupado (da spec, sem ler a implementação)

**Agente:** `prova-suite`.
**Arquivos:** `scripts/m130-emporio-menu-agrupado.test.ts` (novo),
`package.json`.
**Depende-de:** nenhuma.

**Interfaces:**
- Consome (definido na Tarefa 2):
  `menuDoEmporio(c: PapelContexto): EntradaDoMenu[]` de `@/lib/emporio/menu`,
  com `type ItemDoMenu = { href: string; rotulo: string; exact?: boolean; destaque?: boolean }`
  e `type EntradaDoMenu = ({ tipo: "item" } & ItemDoMenu) | { tipo: "grupo"; rotulo: string; itens: ItemDoMenu[] }`.
- Monte o `PapelContexto` como as suítes `m98` e `m92` já fazem
  (`{ papel, lojas: new Set([...]), chaves: new Set(), soDaLoja }`).

- [ ] **Passo 1: escrever a suíte** no formato das outras (`check(nome, cond)`,
  saída 1 com falha), impressa como "Empório UX onda 1: menu agrupado". Casos:
  - **dono:** entradas na ordem `Início` (item, `exact`), `Vender` (item,
    `destaque: true`), grupo `Vendas` [Vendas, Orçamentos, Clientes, Fiado,
    Franqueados], grupo `Estoque` [Produtos, Estoque, Compras,
    Transferências, Fornecedores], grupo `Dinheiro` [Hoje, Caixa, A receber,
    A pagar, Despesas, Aprovações], grupo `Estatísticas` [Relatórios,
    Resultado, Projeção], grupo `Ajustes` [Lojas, Equipe, Histórico,
    Configurações].
  - hrefs do dono: Hoje `/emporio/financeiro`, Caixa `/emporio/caixa`,
    A receber `/emporio/financeiro/receber`, A pagar `/emporio/financeiro/pagar`,
    Despesas `/emporio/despesas`, Aprovações `/emporio/financeiro/aprovacoes`,
    Relatórios `/emporio/relatorios`, Resultado `/emporio/resultado`,
    Projeção `/emporio/financeiro/projecao`, Lojas `/emporio/estabelecimentos`.
  - **caixa** (lojas `["L"]`): menu **plano**, sem nenhum `tipo: "grupo"`,
    exatamente `Início, Vender, Vendas, Clientes, Fiado, Caixa`, nessa ordem.
  - **gestor** (lojas `["L"]`): sem nenhum item de `/emporio/financeiro`
    (Hoje, A receber, A pagar, Aprovações, Projeção); o grupo `Dinheiro` existe
    com `Caixa` e `Despesas`; o grupo `Estatísticas` tem `Relatórios` e
    `Resultado` e **não** tem `Projeção`.
  - **financeiro:** não tem `Vender` nem `Equipe`; tem `Dinheiro` com os 6
    itens (o financeiro passa em `fora_do_caixa`, então vê Estoque e
    Orçamentos: não afirme o contrário).
  - **regra do grupo de um item** (pelo `vendedor`, lojas `["L"]`): `Caixa` e
    `Lojas` aparecem como `tipo: "item"`, fora de grupo (Dinheiro e Ajustes
    teriam um item só); não há grupo `Estatísticas`; o menu **não** é plano
    (tem os grupos `Vendas` e `Estoque`).
  - **nenhum grupo vazio** em nenhum dos seis papéis
    (`dono, gerente_geral, gestor, vendedor, caixa, financeiro`).
  - **todo href do menu abre para o papel:** para cada papel e cada item,
    `veAPagina(c, href)` é verdadeiro, ou o href começa com
    `/emporio/financeiro` e `veAPagina(c, "/emporio/financeiro")` é verdadeiro.

- [ ] **Passo 2: entrada no `package.json`:**
  `"test:m130": "tsx scripts/m130-emporio-menu-agrupado.test.ts"`, ao lado da
  `test:m129`.

- [ ] **Passo 3: rodar e ver falhar** (o módulo ainda não existe):
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m130`.
  Esperado: erro de import de `@/lib/emporio/menu`.

- [ ] **Passo 4: relatar** os arquivos tocados (a sessão principal commita
  depois da Tarefa 2: `Empório UX: suíte do menu agrupado (m130)`).

### Tarefa 2: menu agrupado e topo sem o seletor de propriedades

**Agente:** `tela-pagina`.
**Arquivos:** `src/lib/emporio/menu.ts` (novo), `src/lib/nav.ts`,
`src/components/layout/sidebar.tsx`, `src/app/(dashboard)/layout.tsx`,
`src/components/layout/dashboard-shell.tsx`, `scripts/nav-build.test.ts`.
**Depende-de:** nenhuma.

**Interfaces:**
- Produz `menuDoEmporio(c: PapelContexto): EntradaDoMenu[]`, `ItemDoMenu` e
  `EntradaDoMenu` (tipos exatos na Tarefa 1).
- Produz, em `sidebar.tsx`:
  `export type NavChild = { href: string; label: string; show: boolean; exact?: boolean; destaque?: boolean }`
  (o tipo atual com `destaque` a mais),
  `export type NavSubgroup = { kind: "subgroup"; label: string; children: NavChild[] }`,
  e o grupo de `NavItem` passa a ter `children: (NavChild | NavSubgroup)[]`.
- `buildNavItems` troca o parâmetro `paginasDoEmporio` por
  `menuDoEmporio?: EntradaDoMenu[]`.

- [ ] **Passo 1: `src/lib/emporio/menu.ts`.** A estrutura do menu da onda 1
  (rótulos, ordem e hrefs da Tarefa 1) como constante, e `menuDoEmporio`:
  - item visível: `veAPagina(c, href)`; para href abaixo de
    `/emporio/financeiro/`, `veAPagina(c, "/emporio/financeiro")`;
  - grupo sem item visível sai; grupo com um item vira `tipo: "item"`;
  - se, fora `Início` e `Vender`, sobram **até 5** itens visíveis, o menu sai
    todo plano, na ordem da estrutura (é o que dá o menu do Caixa);
  - `Início` com `exact: true`, `Vender` com `destaque: true`.
  `PAGINAS_DO_EMPORIO`, `veAPagina` e `paginasVisiveis` **não mudam** (35
  telas e o Início dependem deles).

- [ ] **Passo 2: `nav.ts`.** O grupo "Meu Empório" monta os filhos a partir de
  `menuDoEmporio`: `tipo: "item"` vira `NavChild`, `tipo: "grupo"` vira
  `NavSubgroup`. `restringirAoSoDaLoja` filtra também as folhas dentro de
  subgrupo e descarta subgrupo vazio.

- [ ] **Passo 3: `sidebar.tsx`.** Subgrupo: botão com `aria-expanded` e a
  seta, folhas recuadas um nível. Aberto = estado salvo, senão "tem filho
  ativo". Estado salvo em `localStorage`, chave `tibe:menu:subgrupos`,
  `Record<string, boolean>` com chave `"<grupo>/<subgrupo>"` (ex.:
  `"Meu Empório/Vendas"`), **lido num `useEffect` depois de montar** (a primeira
  pintura usa só "tem filho ativo"; nada de diferença de hidratação); chave
  desconhecida é ignorada. Folha com `destaque`: pílula no estilo do botão
  primário do kit (fundo `primaria`, texto invertido), centralizada. O clique
  em botão de subgrupo não fecha a gaveta do celular (o `onClick` da `nav` já
  só fecha em link: manter).

- [ ] **Passo 4: `layout.tsx`.** Passa
  `menuDoEmporio: hasEmporio ? menuDoEmporio(papelEmporio) : []`.

- [ ] **Passo 5: `dashboard-shell.tsx`.** Não renderiza o `PropertySelector`
  quando `usePathname()` começa com `/emporio`. Fora do Empório, igual.

- [ ] **Passo 6: `scripts/nav-build.test.ts`.** Troque a afirmação dos "21
  filhos, na ordem" por: o grupo "Meu Empório" do dono tem, na ordem, as
  folhas `Início` e `Vender` e os subgrupos `Vendas, Estoque, Dinheiro,
  Estatísticas, Ajustes`; com `soDaLoja`, os subgrupos continuam e nenhuma
  folha fora do Empório aparece. As demais afirmações do arquivo continuam.

- [ ] **Passo 7: rodar** `npm run test:nav` e `npm run test:m130` (com a URL
  local inline), `npm run test:m92`, `npm run test:m98`, `npm run test:m77`,
  `npx tsc --noEmit`, `npm run lint`, `npm run check`. Esperado: tudo verde
  (a `m130` passa agora).

- [ ] **Passo 8: relatar** os arquivos. Commits da sessão principal, nesta
  ordem: Tarefa 1, depois esta (`Empório UX: menu em grupos e topo sem o
  seletor de propriedades`).

### Tarefa 3: cabeçalho da tela e o (i)

**Agente:** `tela-pagina`.
**Arquivos:** `src/app/(dashboard)/emporio/_components/cabecalho-da-tela.tsx`
(novo), `src/app/(dashboard)/emporio/_components/ajuda-da-tela.tsx` (novo),
`src/app/(dashboard)/manual/_components/tarefa.tsx`.
**Depende-de:** nenhuma.

**Interfaces (produz):**
- `CabecalhoDaTela(props: { titulo: string; caminho?: { rotulo: string; href: string }[]; ajuda?: React.ReactNode; manual?: string; acoes?: React.ReactNode; children?: React.ReactNode })`:
  componente de servidor. `caminho` vira a linha clicável acima do título
  (`Dinheiro › A pagar`: cada passo é link, o título é o último e não é link);
  `ajuda` e `manual` viram o `AjudaDaTela` ao lado do título; `acoes` fica à
  direita (é onde hoje ficam os botões como "Nova venda"); `children` é o
  aviso que fica visível, abaixo do título. O único `<h1>` do Empório mora
  aqui, com as classes que as telas usam hoje (`text-2xl font-semibold
  text-texto`).
- `AjudaDaTela(props: { children: React.ReactNode; manual?: string; rotulo?: string })`:
  componente de cliente. Botão redondo "i" (`aria-label` = `rotulo`, padrão
  "Sobre esta tela"; `aria-expanded`; `aria-controls`), balão com o texto e,
  se houver `manual`, o link "Ver no manual" (abre na mesma aba).
  Comportamento: abre com o ponteiro do mouse em cima (`pointerType ===
  "mouse"`) e fecha ao sair, salvo se foi aberto por clique; clique e toque
  alternam; `Esc` fecha e devolve o foco ao botão; clique ou toque fora fecha.
  O balão não sai da tela no celular (largura máxima com margem da borda).
- `Subtitulo` do manual ganha `id?: string`, posto no `<h2>`, para o link
  `/manual/emporio/<parte>#<id>`.

- [ ] **Passo 1: escrever os dois componentes** e o `id` do `Subtitulo`.
- [ ] **Passo 2: rodar** `npx tsc --noEmit`, `npm run lint`, `npm run check`.
  Esperado: limpos. O comportamento do balão é provado no navegador na
  Tarefa 7.
- [ ] **Passo 3: relatar** os arquivos (commit:
  `Empório UX: cabeçalho da tela e o (i)`).

### Regras comuns às Tarefas 4a, 4b e 4c (telas no cabeçalho novo)

**Agente:** `tela-pagina` (três em paralelo). **Depende-de:** Tarefa 3.

Em cada `page.tsx` listada:

1. Troque o bloco de cabeçalho (o link cinza "Meu Empório", o `<h1>` e o `<p>`
   de apresentação) por `<CabecalhoDaTela>`. Os botões que hoje ficam ao lado
   do título vão para `acoes`.
2. O `<p>` de **apresentação** vira `ajuda`. Frase que **muda o que a pessoa
   faz** fica visível, como `children` (exemplos: "O recebimento abate das
   vendas mais antigas primeiro", em Fiado; "Os relatórios do dinheiro ...
   estão no Financeiro", em Relatórios). Na dúvida, fica visível.
3. **Caminho:** tela de detalhe aponta para a lista (`vendas/[id]`:
   `[{ rotulo: "Vendas", href: "/emporio/vendas" }]`); as telas de
   `financeiro/` (menos a raiz) apontam para
   `[{ rotulo: "Dinheiro", href: "/emporio/financeiro" }]`. As demais não têm
   caminho.
4. **"Estabelecimentos" vira "Lojas"** em todo texto visível do arquivo
   (título, cartão, estado vazio, rótulo). Identificadores, hrefs e nomes de
   função não mudam.
5. **Sem permissão:** linha `if (!veAPagina(...)) notFound();` (ou a recusa
   403 que leva a `notFound()`) vira `redirect("/emporio")`. O `notFound()` de
   registro inexistente (`res.status === 404`, `!res.ok` em tela de detalhe)
   **fica**.
6. Nada mais muda na tela (layout, dados, ações).

Ao fim de cada uma: `npx tsc --noEmit`, `npm run lint`, `npm run check`
limpos; relatar os arquivos. Commit da sessão principal por tarefa:
`Empório UX: cabeçalho novo nas telas de <grupo>`.

### Tarefa 4a: telas de venda

**Arquivos:** em `src/app/(dashboard)/emporio/`: `page.tsx` (título passa a
ser "Início"), `vender/page.tsx`, `vendas/page.tsx`, `vendas/[id]/page.tsx`,
`orcamentos/page.tsx`, `orcamentos/[id]/page.tsx`, `clientes/page.tsx`,
`clientes/[id]/page.tsx`, `fiado/page.tsx`, `franqueados/page.tsx`,
`franqueados/[id]/page.tsx`.

- [ ] **Passo 1:** aplicar as regras comuns a cada arquivo.
- [ ] **Passo 2:** rodar as conferências e relatar.

### Tarefa 4b: telas de estoque e de ajustes

**Arquivos:** em `src/app/(dashboard)/emporio/`: `produtos/page.tsx`,
`produtos/[id]/page.tsx`, `produtos/etiquetas/page.tsx` (caminho: Produtos),
`produtos/etiquetas/_dados.ts` (só o texto "Estabelecimentos"),
`estoque/page.tsx`, `compras/page.tsx`, `fornecedores/page.tsx`,
`fornecedores/[id]/page.tsx`, `transferencias/page.tsx`,
`estabelecimentos/page.tsx` (título "Lojas"), `equipe/page.tsx`,
`historico/page.tsx` (as duas linhas de `notFound()` por permissão viram
`redirect("/emporio")`), `configuracoes/page.tsx`.

- [ ] **Passo 1:** aplicar as regras comuns a cada arquivo.
- [ ] **Passo 2:** rodar as conferências e relatar.

### Tarefa 4c: telas de dinheiro e de números

**Arquivos:** em `src/app/(dashboard)/emporio/`: `financeiro/page.tsx`
(título "Hoje", sem caminho), `financeiro/pagar/page.tsx` ("A pagar"),
`financeiro/receber/page.tsx` ("A receber"), `financeiro/cobranca/page.tsx`
("Cobrança"), `financeiro/caixa/page.tsx` ("Posição de caixa"),
`financeiro/aprovacoes/page.tsx` ("Aprovações"),
`financeiro/projecao/page.tsx` ("Projeção"),
`financeiro/relatorios/page.tsx` ("Relatórios do dinheiro"),
`caixa/page.tsx`, `despesas/page.tsx`, `resultado/page.tsx`,
`relatorios/page.tsx`.

Nas oito de `financeiro/`, a linha `if (!veAPagina(papel, "/emporio/financeiro")) notFound();`
vira `redirect("/emporio")`. A barra de abas do Financeiro (`FinanceiroAbas`)
**continua** (spec §6: Posição de caixa e Cobrança só são alcançáveis por ela
até a onda 4).

- [ ] **Passo 1:** aplicar as regras comuns e as trocas acima.
- [ ] **Passo 2:** rodar as conferências e relatar.

### Tarefa 5: "Conferir com o banco"

**Agente:** `tela-pagina` (texto de action é só cópia; sem regra nova).
**Arquivos:** `src/app/(dashboard)/emporio/_components/carimbo-botao.tsx`,
`src/app/(dashboard)/emporio/_components/financeiro-extrato.tsx`,
`src/app/(dashboard)/emporio/_components/financeiro-hoje.tsx`,
`src/lib/actions/emporio-financeiro.ts`,
`src/lib/actions/emporio-antecipacao.ts`,
`scripts/m100-emporio-financeiro-acordo.test.ts`,
`scripts/m127-emporio-data-da-baixa.test.ts`,
`src/app/(dashboard)/manual/_conteudo/partes-tarefa-3.tsx`,
`src/app/(dashboard)/manual/_conteudo/indice.ts`.
**Depende-de:** Tarefa 3 (`AjudaDaTela`, `Subtitulo` com `id`).

Trocas exatas de texto (código, ação do Histórico e parâmetro de URL ficam):

| hoje | vira |
|---|---|
| Carimbar | Conferir com o banco |
| Carimbado em {data} | Conferido em {data} |
| Retirar (o carimbo) | Desfazer a conferência |
| coluna Carimbo | Conferência |
| só sem carimbo | só a conferir |
| Sem carimbo (cartão da aba Hoje) | A conferir com o banco |
| Ver as linhas sem carimbo | Ver as linhas a conferir |
| Sem carimbo no período | A conferir no período |
| Esta linha já tem carimbo. | Esta linha já foi conferida com o banco. |
| Esta linha não tem carimbo. | Esta linha ainda não foi conferida com o banco. |
| Só linha de conta bancária leva carimbo de conciliação. | Só linha de conta bancária é conferida com o banco. |
| ... Tire o carimbo das parcelas antes de desfazer. | ... Desfaça a conferência das parcelas antes de desfazer. |
| exigir: "carimbar o extrato" | "conferir o extrato com o banco" |
| exigir: "retirar o carimbo do extrato" | "desfazer a conferência do extrato" |

- [ ] **Passo 1: as suítes primeiro.** Em `m100` e `m127`, troque as frases
  esperadas pelas novas. Rode as duas (URL local inline) e veja falhar nas
  frases.
- [ ] **Passo 2: o texto** nas três telas e nas duas actions, pela tabela.
- [ ] **Passo 3: o (i)** ao lado do cartão "A conferir com o banco"
  (`financeiro-hoje.tsx`) e do título da coluna Conferência no extrato
  (`financeiro-extrato.tsx`), com `AjudaDaTela`: "Compare cada linha com o
  extrato do banco e clique em Conferir com o banco. O que não bate é PIX que
  não caiu ou valor lançado com erro." e
  `manual="/manual/emporio/financeiro-das-lojas#conferir-com-o-banco"`.
- [ ] **Passo 4: o manual.** O `Subtitulo` "Conferir o extrato com o carimbo"
  vira "Conferir o extrato com o banco", com `id="conferir-com-o-banco"`; os
  passos dele e o `resumo` da parte `financeiro-das-lojas` em `indice.ts`
  usam os nomes novos da tabela.
- [ ] **Passo 5: rodar** `test:m100`, `test:m127` (verdes agora), e
  `grep -rn "arimb" src/app` mostra só identificadores e o parâmetro de URL,
  nenhum texto visível; `npx tsc --noEmit`, `npm run lint`, `npm run check`.
- [ ] **Passo 6: relatar** os arquivos (commit:
  `Empório UX: carimbo vira Conferir com o banco`).

### Tarefa 6: trava do cabeçalho no `npm run check`

**Agente:** `prova-suite`.
**Arquivos:** `scripts/check-repo.ts`, `CLAUDE.md`.
**Depende-de:** 4a, 4b, 4c.

- [ ] **Passo 1: conferência 20, "Cabeçalho do Empório pelo componente".**
  Reprova (com arquivo e linha) todo `.tsx` em `src/app/(dashboard)/emporio/`
  que contenha `<h1`, menos `_components/cabecalho-da-tela.tsx`, e todo que
  contenha um `<Link>` cujo texto seja só `Meu Empório`. Sem linha de base: a
  onda deixa zero.
- [ ] **Passo 2: provar nos dois sentidos.** Ponha um `<h1>` num
  `page.tsx` do Empório e rode `npm run check`: reprova, nomeando o arquivo.
  Tire e rode: passa. Faça o mesmo com o link "Meu Empório".
- [ ] **Passo 3: `CLAUDE.md`.** "19 conferências" vira "20", e a lista ganha
  "tela do Empório com título fora do cabeçalho padrão".
- [ ] **Passo 4: relatar** (commit:
  `Check: conferência 20, cabeçalho do Empório pelo componente`).

### Tarefa 7: prova viva, roteiros e manual

**Agente:** `prova-viva`.
**Arquivos:** `scripts/navegador/emporio-ux-onda1.py` (novo); os roteiros de
`scripts/navegador/` que a onda quebrar (procuram "Meu Empório" como link,
"Estabelecimentos", "Carimbar", títulos "Financeiro: ..."); 
`src/app/(dashboard)/manual/_conteudo/figuras.ts`,
`src/app/(dashboard)/manual/_conteudo/animacoes.ts`; as figuras em
`public/manual/emporio/`.
**Depende-de:** todas as anteriores.

- [ ] **Passo 1: roteiro `emporio-ux-onda1`** (cenário
  `scripts/_cenario-manual-emporio.ts`; sessões dono, gestor, caixa e uma de
  financeiro). Confere, cada um com `confere(...)`:
  - dono: no menu, os subgrupos Vendas, Estoque, Dinheiro, Estatísticas e
    Ajustes; em `/emporio/vendas`, o subgrupo Vendas aberto e os outros
    fechados; abrir Estoque, recarregar, Estoque continua aberto;
  - caixa: menu plano com Início, Vender, Vendas, Clientes, Fiado e Caixa, e
    nenhum botão de subgrupo;
  - nenhuma tela do Empório tem o link "Meu Empório" acima do título;
  - `/emporio/financeiro/pagar` mostra o caminho "Dinheiro" e o título "A
    pagar";
  - o (i): passar o mouse abre o balão; `Esc` fecha e o foco volta ao botão;
    Tab chega ao link "Ver no manual" com o balão aberto pelo teclado;
  - o seletor de propriedades não aparece em `/emporio` e aparece em
    `/meu-dia` para o dono;
  - gestor em `/emporio/financeiro/pagar` termina em `/emporio`, sem "could
    not be found";
  - o menu diz "Lojas"; a posição de caixa diz "Conferir com o banco" e não
    "Carimbar";
  - celular (390 px): abrir o subgrupo Vendas na gaveta não fecha a gaveta.
- [ ] **Passo 2: provar nos dois sentidos.** Rode o roteiro com a Tarefa 2
  desfeita no working tree (`git stash` só dos arquivos dela): reprova no
  menu. Volte e rode: passa.
- [ ] **Passo 3: os roteiros existentes.** Rode todos os `emporio-*` e
  `manual-emporio`; ajuste os que quebraram só por rótulo ou título (nunca
  afrouxe o que eles provam). Liste no relato quais foram ajustados.
- [ ] **Passo 4: o manual.** Atualize `figuras.ts` e `animacoes.ts` onde
  citam rótulo ou título que mudou; regere as figuras com
  `npm run navegador -- manual-emporio` e os GIFs com
  `npm run navegador -- manual-gifs` e `python scripts/manual-gifs-montar.py`.
- [ ] **Passo 5: fotos** de Início, Vendas, A pagar e Posição de caixa, como
  dono e como caixa, computador e celular, para a sessão principal mostrar ao
  usuário.
- [ ] **Passo 6: relatar** arquivos, roteiros ajustados e o resultado de
  cada um (commit: `Empório UX: prova viva da onda 1 e o manual`).

### Tarefa 8: juiz e fechamento

**Agente:** `prova-juiz` (modelo da definição; o usuário prefere Sonnet
quando não pedir Opus), depois a sessão principal.
**Depende-de:** todas.

- [ ] **Passo 1:** o juiz recebe a spec e o range de commits da onda, sem os
  relatos dos implementadores, e julga por rubrica.
- [ ] **Passo 2:** a sessão principal corrige o que o juiz confirmar, roda
  `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:all`
  e reporta ao usuário o que passou e o que faltou, com as fotos da Tarefa 7.
- [ ] **Passo 3:** handoff atualizado; merge na `main` **só com autorização
  do usuário na conversa** (não há migração nesta onda).
