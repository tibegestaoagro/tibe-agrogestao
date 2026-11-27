# Onda 6 da UX do Empório: a loja no topo

> **Para agentes:** execute com a skill `orquestrar-ondas` (subagentes por time, a sessão principal commita) ou `superpowers:subagent-driven-development`. Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** um seletor **"Loja: Todas ▾"** no topo, no lugar onde ficava o seletor de propriedade. Ele vale para todas as telas do Empório que filtram por loja e substitui o filtro de loja que cada tela tem hoje.

**Arquitetura:**
- A escolha fica num cookie, como o seletor de propriedade do Tibé (`src/lib/active-property.ts` e `POST /api/v1/tenant/active-property`). Ela não é dado de negócio.
- O servidor confere o cookie a cada leitura contra as lojas que a pessoa alcança. Loja fora do alcance vira "Todas", sem erro.
- `?loja=` na URL vence o cookie. É por ele que um link antigo, do manual ou de uma folha de imprimir, continua mostrando a loja certa.
- Um helper só (`lerLojaDoTopo`) troca, em cada página, o par `listarEstabelecimentosAction` mais o "a loja da URL vale?" de hoje.
- No servidor entra uma leitura nova, aditiva: o Início aceita `establishment_id`. Não há migração.

**Stack:** Next.js 16 (App Router), React 19, componentes do Empório, roteiros Python em `scripts/navegador/`.

**Spec:** [2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md), §5.3 (Q389, segunda parte), §6 (onda 6), §7, §8. Mockup: `docs/superpowers/specs/mockups/2026-11-24-emporio-ux/menu-inicio.html` (o "Loja: Todas ▾" do topo).

## Restrições globais

- **Invariantes do `CLAUDE.md`:** tenant escopado (1), sem travessão (4), sem heredoc com escape (5), regra de negócio só em `src/lib/actions/` (6), merge e push na `main` só com autorização na conversa (7), suíte verde não é validação (8).
- **Ordem de entrega:** action, depois rota, só então tela (T1 e T2 antes de T3 a T6).
- **Desenho, literal:** "Lista só as lojas que a pessoa alcança; quem alcança uma só não vê seletor. Vender e Caixa continuam com a loja própria da operação."
- **Nenhuma permissão muda.** O seletor só estreita o que a pessoa já vê. "Todas" quer dizer "todas as minhas lojas" (`lojasDoAtor`).
- **O que não muda:** kit e tokens (`components/ui/`, `globals.css`); nada em `prisma/`; o manual (onda 7). O texto defasado do manual vai para a lista da onda 7, no handoff.
- **Nada se escreve na conta Da Mata.**
- **`npm run check` limpo**, inclusive as catracas de recusa engolida e de `<Field>` sem `error=`.

## Decisões

As de 1 a 4 são do usuário (27/11, nesta sessão). As outras são minhas, como planejador, e vão ao usuário junto com o plano.

1. **Onde o seletor aparece.** Só nas telas que filtram por loja. Nas outras ele some, e a escolha fica guardada para quando a pessoa voltar a uma tela que filtra. *(Usuário.)*
2. **Estoque segue o topo.** Os botões de loja da tela saem. Com o topo em "Todas", o Estoque soma as lojas (`estoqueConsolidadoAction` na aba Tudo, `precisaReporAction` sem loja na aba Precisa repor, com a coluna Loja). **Troca a avisar:** hoje a tela abre na primeira loja. *(Usuário.)*
3. **Fiado segue o topo**, em Vendas › Fiado e na aba Fiado do A receber (`listarFiadoAction` já aceita `establishment_id`). *(Usuário.)*
4. **Formulários com loja já vêm com a loja do topo marcada:** Nova compra, Conta avulsa (A pagar) e Nova transferência (a origem, se a loja do topo for uma origem possível). A pessoa troca no formulário. Com "Todas", o formulário fica como hoje. *(Usuário.)*
5. **Cookie** `tibe_emporio_loja`, `path: "/"`, um ano, `sameSite: "lax"`, como o da propriedade. Sem cookie quer dizer "Todas". Escolher "Todas" apaga o cookie.
6. **A URL vence o cookie.** `?loja=<id>` válido vale para aquela página, e o seletor mostra essa loja. Trocar no seletor grava o cookie e tira `loja` e `pagina` da URL (a página 3 de uma loja não faz sentido na outra).
7. **As telas deixam de escrever `loja` nos próprios links** (paginação, abas, filtros, período): o cookie já leva a loja. **Exceção:** os links para as folhas de imprimir e para as planilhas continuam levando `?loja=` explícito, porque abrem noutra aba e precisam sair com a loja que a tela mostra.
8. **As telas que obedecem** (lista fechada, em `TELAS_COM_LOJA_NO_TOPO`): `/emporio` (Início), `/emporio/vendas`, `/emporio/orcamentos`, `/emporio/fiado`, `/emporio/estoque`, `/emporio/compras`, `/emporio/transferencias`, `/emporio/financeiro` (Hoje), `/emporio/financeiro/receber`, `/emporio/financeiro/pagar`, `/emporio/estatisticas`, `/emporio/historico`. Só o caminho exato: as fichas (`/emporio/vendas/<id>` e afins) não obedecem, porque a venda já tem loja.
9. **Rótulos.** Botão: "Loja: Todas" ou "Loja: <nome>". Itens: "Todas as lojas", depois as lojas em ordem de nome. No celular, o mesmo lugar do seletor de propriedade.
10. **Quem alcança uma loja só** não vê o seletor, e a tela fica como hoje. No Estoque isso quer dizer a loja dele, sem a coluna Loja (como `lojaDoResultado` já faz nas Estatísticas).
11. **O Início obedece** (o mockup mostra o seletor nele): avisos e números do dia só da loja escolhida.
12. **Histórico:** o campo Loja do formulário sai. `?establishment_id=` de um link antigo vale como a URL da decisão 6.

---

### Task 1: a loja do topo no servidor (cookie, conferência e rota)

**Time:** `servidor-acao`. **Depende-de:** nada. **Arquivos:**
- Criar: `src/lib/emporio/loja-do-topo.ts` (puro, sem `next/headers`)
- Criar: `src/lib/emporio/loja-do-topo-servidor.ts`
- Criar: `src/lib/actions/emporio-loja-do-topo.ts`
- Criar: `src/app/api/v1/emporio/loja-do-topo/route.ts`
- Criar: `scripts/m135-emporio-loja-do-topo.test.ts`; Modificar: `package.json` (`test:m135`)

**Interfaces:**
- Produz, em `loja-do-topo.ts`:
  - `export const LOJA_DO_TOPO_COOKIE = "tibe_emporio_loja"`
  - `export const TELAS_COM_LOJA_NO_TOPO: readonly string[]` (a lista da decisão 8)
  - `export function seletorDeLojaVale(pathname: string): boolean` (caminho exato, ignora barra final)
  - `export function escolherLojaDoTopo(a: { daUrl?: string; doCookie?: string; lojas: { id: string }[] }): string`: devolve o id válido (URL antes de cookie) ou `""` ("Todas")
- Produz, em `loja-do-topo-servidor.ts`:
  - `export async function lerLojaDoTopo(db: TenantPrismaClient, ator: Ator, daUrl?: string): Promise<{ lojas: { id: string; name: string }[]; loja: string }>`: lê o cookie, usa `listarEstabelecimentosAction` e `escolherLojaDoTopo`. Memoizado por request (`perRequestCache`), como `getActivePropertyId`.
- Produz, na action: `export async function escolherLojaDoTopoAction(db: TenantPrismaClient, ator: Ator, establishmentId: string | null): Promise<ActionResult<{ establishment_id: string | null }>>`. `null` sempre passa. Um id fora de `lojasDoAtor` devolve `NAO_ACHADO("Estabelecimento", "establishment_id")`, como `listarVendasAction`. O Caixa passa: escolher não mostra nada novo.
- Produz a rota `POST /api/v1/emporio/loja-do-topo`, corpo `{ establishment_id: string | null }`, guard `guardEmporio("read")`. Com `ok`, grava ou apaga o cookie (decisão 5) na resposta, como a rota da propriedade. Recusa do Zod por `apiErroDeZod`.

- [ ] **Passo 1: a suíte `m135`, puro e action, falhando.** Casos:
  - `seletorDeLojaVale`: `true` para `/emporio`, `/emporio/estoque` e `/emporio/financeiro/pagar/`; `false` para `/emporio/vender`, `/emporio/caixa`, `/emporio/produtos`, `/emporio/vendas/abc` e `/rebanho`.
  - `escolherLojaDoTopo({ daUrl: "B", doCookie: "A", lojas: [{id:"A"},{id:"B"}] }) === "B"`; `({ daUrl: "X", doCookie: "A", ... }) === "A"`; `({ doCookie: "X", ... }) === ""`; `({ lojas: [] }) === ""`.
  - `escolherLojaDoTopoAction`: loja da conta ao alcance do Dono passa; loja de outra loja que o Gestor não alcança devolve `NAO_ACHADO`; id de outro tenant devolve `NAO_ACHADO`; `null` passa.
- [ ] **Passo 2:** `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m135`. Esperado: falha por módulo inexistente.
- [ ] **Passo 3:** implementar os quatro arquivos.
- [ ] **Passo 4:** `test:m135` verde; `npm run test:docs-api` verde (a rota nova aparece em `/docs/api`); `npm run test:isolation` verde.
- [ ] **Passo 5:** a sessão principal commita: `Onda 6 T1: a loja do topo no servidor (cookie, conferência e rota)`.

### Task 2: o Início por loja

**Time:** `servidor-acao`. **Depende-de:** T1 (as duas escrevem na mesma suíte). **Arquivos:**
- Modificar: `src/lib/actions/emporio-inicio.ts` (`lerInicioAction`)
- Modificar: `src/app/api/v1/emporio/inicio/route.ts`
- Modificar: `scripts/m135-emporio-loja-do-topo.test.ts` (acrescenta casos)

**Interfaces:**
- `lerInicioAction(db, ator, opts: { agora?: Date; establishment_id?: string } = {})`. Com `establishment_id` ao alcance, avisos e números contam só essa loja. Fora do alcance: `NAO_ACHADO("Estabelecimento", "establishment_id")`. Sem ele, como hoje.
- `GET /api/v1/emporio/inicio?establishment_id=<id>` (aditivo, documentar no comentário da rota).

- [ ] **Passo 1: casos na `m135`, falhando.** Conta com duas lojas e uma venda hoje em cada uma (R$ 100,00 e R$ 30,00): sem filtro, vendas hoje = 130; com a loja 2, = 30; produto abaixo do mínimo só na loja 1 gera aviso sem filtro e não gera com a loja 2; Gestor só da loja 1 pedindo a loja 2 recebe `NAO_ACHADO`.
- [ ] **Passo 2:** rodar e ver falhar nos casos com filtro.
- [ ] **Passo 3:** implementar. Estreitar o `visiveis` de `lojasDoAtor` à loja pedida, e as leituras reaproveitadas (financeiro, A pagar, boletos) recebem a mesma loja.
- [ ] **Passo 4:** `test:m135` verde; a suíte do Início da onda 2 continua verde (procure-a com `grep -l lerInicioAction scripts/test-m*.ts`).
- [ ] **Passo 5:** commit `Onda 6 T2: o Início aceita a loja`.

### Task 3: o seletor no topo

**Time:** `tela-pagina`. **Depende-de:** T1. **Arquivos:**
- Criar: `src/components/emporio/loja-do-topo-seletor.tsx` (cliente)
- Modificar: `src/components/layout/dashboard-shell.tsx:77-80`
- Modificar: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consome: `seletorDeLojaVale`, `lerLojaDoTopo` e `LOJA_DO_TOPO_COOKIE` (T1), `POST /api/v1/emporio/loja-do-topo`.
- Produz: `LojaDoTopoSeletor({ lojas: { id: string; name: string }[]; lojaDoCookie: string })`. O layout só busca as lojas quando `hasEmporio && seletorDeLojaVale(pathname)` e passa ao shell um `lojaDoTopo?: { lojas; lojaDoCookie }`. O shell mostra o seletor no lugar do `PropertySelector`, só nas telas do Empório e só com `lojas.length > 1`.

- [ ] **Passo 1:** o componente segue o `property-selector.tsx`: `useDropdown`, `apiPost`, `useAviso` para a recusa (nunca engolir: é o mesmo defeito comentado no seletor de propriedade). Loja mostrada: `escolherLojaDoTopo({ daUrl: useSearchParams().get("loja") ?? undefined, doCookie: lojaDoCookie, lojas })`. Ao escolher: POST; com `ok`, se a URL tem `loja` ou `pagina`, `router.replace` sem os dois; depois `router.refresh()`.
- [ ] **Passo 2:** `npx tsc --noEmit` e `npm run lint` limpos; `npm run check` limpo.
- [ ] **Passo 3:** no `next dev`, com o Dono do seed (duas lojas): o seletor aparece no Início e no Estoque, some em Produtos e em Vender. Trocar a loja recarrega e mantém o nome no botão depois de navegar pelo menu.
- [ ] **Passo 4:** commit `Onda 6 T3: o seletor de loja no topo do Empório`.

### Task 4: o grupo Vendas segue o topo

**Time:** `tela-pagina`. **Depende-de:** T1. **Arquivos:**
- `src/app/(dashboard)/emporio/vendas/page.tsx`, `_components/vendas-filtro.tsx`
- `src/app/(dashboard)/emporio/orcamentos/page.tsx`, `orcamentos/_components/orcamentos-filtro.tsx`
- `src/app/(dashboard)/emporio/fiado/page.tsx`

- [ ] **Passo 1:** em cada página, `lerLojaDoTopo(db, user, sp.loja)` no lugar de `listarEstabelecimentosAction` mais a conferência local. O campo Loja sai de `VendasFiltro` e de `OrcamentosFiltro`. Os `href` deixam de levar `loja` (decisão 7). O texto "Mude o filtro para ver outras." continua valendo quando há loja escolhida.
- [ ] **Passo 2:** Fiado passa `establishment_id: loja || undefined` a `listarFiadoAction`, e a lista de lojas do recebimento fica só com a loja escolhida, como o A receber já faz (`lojasDoRecebimento`).
- [ ] **Passo 3:** `tsc`, `lint` e `check` limpos.
- [ ] **Passo 4:** commit `Onda 6 T4: Vendas, Orçamentos e Fiado seguem a loja do topo`.

### Task 5: o grupo Estoque segue o topo

**Time:** `tela-pagina`. **Depende-de:** T1. **Arquivos:**
- `src/app/(dashboard)/emporio/estoque/page.tsx`
- `src/app/(dashboard)/emporio/compras/page.tsx`, `_components/compras-filtro.tsx`, `_components/compra-form.tsx`
- `src/app/(dashboard)/emporio/transferencias/page.tsx`, `_components/transferencias-filtro.tsx`, e o formulário de transferência

- [ ] **Passo 1: Estoque.** Saem a `nav` de botões de loja e a sentinela `__todas__`. Loja efetiva: a do topo; com `""` e uma loja só ao alcance, essa loja (decisão 10); com `""` e várias, a visão somada (decisão 2). `?loja=__todas__` de link antigo vale como "Todas".
- [ ] **Passo 2:** Compras e Transferências como na T4 (campo Loja sai dos filtros, `href` sem `loja`).
- [ ] **Passo 3: formulários.** `CompraForm` ganha `lojaInicial?: string`, usada só se estiver em `lojas`. O formulário de transferência ganha o mesmo para a origem, só se estiver em `origens`. A página passa a loja do topo.
- [ ] **Passo 4:** `tsc`, `lint` e `check` limpos.
- [ ] **Passo 5:** commit `Onda 6 T5: Estoque, Compras e Transferências seguem a loja do topo`.

### Task 6: Dinheiro, Estatísticas, Histórico e Início seguem o topo

**Time:** `tela-pagina`. **Depende-de:** T1 e T2. **Arquivos:**
- `src/app/(dashboard)/emporio/financeiro/page.tsx` (Hoje), `_components/financeiro-hoje.tsx`
- `src/app/(dashboard)/emporio/financeiro/receber/page.tsx`, `_components/financeiro-cobranca.tsx`
- `src/app/(dashboard)/emporio/financeiro/pagar/page.tsx`, `_components/conta-avulsa-form.tsx`
- `src/app/(dashboard)/emporio/estatisticas/page.tsx`, `_components/estatisticas-filtro.tsx`
- `src/app/(dashboard)/emporio/historico/page.tsx`
- `src/app/(dashboard)/emporio/page.tsx` (Início)
- Apagar: `_components/loja-filtro.tsx`, quando não restar quem o use

- [ ] **Passo 1:** Hoje, A receber e A pagar: `lerLojaDoTopo` e sai o `LojaFiltro`. O `preservar` e os `extras` do `PeriodoFiltro` deixam de levar `loja`. Os links de imprimir e de planilha **continuam** com `loja` (decisão 7).
- [ ] **Passo 2:** `ContaAvulsaForm` ganha `lojaInicial?: string` (como a T5).
- [ ] **Passo 3:** Estatísticas: a loja sai do `EstatisticasFiltro` (fica o período); `lojaDoResultado` e os links de "Relatórios para imprimir" seguem com a loja efetiva.
- [ ] **Passo 4:** Histórico: o campo Loja sai do formulário; a loja vem de `lerLojaDoTopo(db, user, sp.establishment_id)` (decisão 12).
- [ ] **Passo 5:** Início: `lerInicioAction(db, user, { establishment_id: loja || undefined })`.
- [ ] **Passo 6:** `grep -rn "loja-filtro" src` vazio, então apagar o arquivo. `tsc`, `lint` e `check` limpos.
- [ ] **Passo 7:** commit `Onda 6 T6: Dinheiro, Estatísticas, Histórico e Início seguem a loja do topo`.

### Task 7: prova viva

**Time:** `prova-viva`. **Depende-de:** T3 a T6. **Arquivos:**
- Criar: `scripts/navegador/emporio-ux-onda6.py` e o cenário "U6 " (duas lojas; um Gestor só da loja 1; vendas, compras, fiado e contas nas duas)
- Modificar: os roteiros `emporio-*` que procuram o filtro de loja local (procure por `Filtrar por loja`, `Todas as lojas` e `loja=` em `scripts/navegador/`)

- [ ] **Passo 1:** o roteiro confere, no Chrome de testes:
  - o Dono troca a loja no Início e os números mudam; navega pelo menu até Vendas, Estoque e A pagar e a loja escolhida continua no botão e na lista;
  - o seletor não aparece em Vender, Caixa, Produtos nem numa ficha de venda;
  - o Gestor só da loja 1 não vê o seletor, e o Estoque dele mostra a loja dele sem a coluna Loja;
  - `/emporio/vendas?loja=<loja 2>` mostra a loja 2 e o botão diz o nome dela; trocar no seletor tira `loja` da URL;
  - um cookie com id de loja fora do alcance (posto por `document.cookie`) mostra "Todas";
  - na página 2 de Vendas, trocar a loja volta à página 1;
  - com a loja 2 no topo, Nova compra abre com a loja 2 marcada;
  - "Imprimir ou PDF" das Estatísticas com a loja 2 abre a folha da loja 2.
- [ ] **Passo 2: provar nos dois sentidos.** Desfazer, uma por vez: a conferência de alcance do `escolherLojaDoTopo`, o `router.replace` sem `pagina`, e a `loja` nos links de imprimir. O roteiro reprova em cada uma e passa com a correção.
- [ ] **Passo 3:** a passada dos `emporio-*`, em blocos (memória `next-dev-sem-source-maps`). Ajustar os que procuram o filtro local.
- [ ] **Passo 4:** fotos do topo por papel (Dono, Gestor de uma loja, Financeiro, Caixa), no computador e no celular, para o usuário.
- [ ] **Passo 5:** commit `Onda 6 T7: roteiro da loja no topo e roteiros ajustados`.

### Task 8: juiz e fechamento

- [ ] `prova-juiz` sobre o range da onda, com esta spec e este plano, sem o relato de quem implementou. Tratar cada achado.
- [ ] `npm run textos-defasados` limpo; `npm run test:all` (com `--sem-redis` se o lock do dia já passou).
- [ ] Acrescentar à lista da onda 7, no handoff: o manual que cita o filtro de loja de cada tela, os botões de loja do Estoque e o campo Loja do Histórico.
- [ ] Handoff atualizado. Merge na `main` só com autorização do usuário na conversa.

## Foco de revisão

O que a spec implica e nenhum teste unitário pega, do mais provável ao menos. Cada linha tem o seu teste no roteiro da T7.

1. **Link antigo com `?loja=`** (manual, e-mail, folha): mostra aquela loja, e o botão do topo diz o nome dela, não o do cookie.
2. **Loja que saiu do alcance** (Gestor tirado de uma loja com o cookie dela gravado): vira "Todas", sem erro e sem tela vazia.
3. **Trocar de loja fora da página 1:** volta à página 1, sem lista vazia.
4. **Folha e planilha abertas noutra aba:** saem com a loja que a tela mostra, mesmo quando a loja veio do cookie.
5. **Quem alcança uma loja só:** nenhuma tela muda para essa pessoa, nem o Estoque (sem a coluna Loja, sem a visão somada).
