# Empório: sobras das frentes B, C, D e H do GestãoClick (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar o que ficou das frentes B, C, D e H (dívidas 5.23, 5.24, 5.25 e 5.28) e que não depende de arquivo do GestãoClick, de equipamento nem da Agromax.

**Architecture:** duas mudanças de regra (o estorno da parcela conferida e a ordem da carteira de cheques), três ajustes de tela (link filtrado, frase do Hoje, aviso das barras), uma limpeza (filtro redundante do Caixa) e três frentes de prova (roteiros e corrida). Sem migração: nenhum campo novo.

**Tech Stack:** Next.js 16, Prisma 7, suítes `tsx` em `scripts/m1NN-*.test.ts`, roteiros Python em `scripts/navegador/`.

**Spec:** as decisões estão neste plano (seção abaixo, Q368 e Q369, do usuário em 19/11/2026); o contexto está em [../specs/2026-11-17-emporio-plano-gestaoclick.md](../specs/2026-11-17-emporio-plano-gestaoclick.md) e em `docs/agents/dividas.md` (5.23, 5.24, 5.25, 5.28).

**Branch:** `emporio-sobras-gestaoclick`, saindo da `main`.

## Decisões do usuário (19/11/2026)

| # | decisão | como o plano lê |
|---|---|---|
| Q368 | Venda cancelada depois de a parcela do cartão ser conferida: "no caso sim [o cancelamento desfaz a conferência], mas creio que precisa de algo que coloque como estorno" | O efeito da conferência no saldo é desfeito por um **estorno visível**, não apagado. O estorno sai pelo valor que caiu (`confirmed_net`), não pelo previsto. A conferência e a linha de ajuste ficam no extrato como história; a conta volta ao saldo de antes da venda; o Histórico ganha a linha "Estorno da parcela conferida". |
| Q369 | Ordem da carteira de cheques: "a hierarquia de 'bom para' ser acima desse que não tem número e por ordem de data de lançamento" | Três grupos, nesta ordem: (1) recebido **sem bom para**; (2) recebido **com** bom para mas sem número ou banco; (3) o resto (completos e depositados). Nos grupos 1 e 2, ordem de lançamento (`created_at` crescente); no grupo 3, a de hoje (`good_for` crescente, depois `created_at`). |

⚠️ A leitura da Q368 é a primeira coisa que o usuário confere neste plano. A alternativa descartada: limpar a conferência e apagar o ajuste no cancelamento (como o Desfazer faz), com o estorno pelo previsto. O saldo final é o mesmo, mas some o rastro de que a parcela foi conferida, e o usuário pediu "algo que coloque como estorno".

## Global Constraints

- Nunca travessão (U+2014) em código, documento ou commit.
- Regra de negócio só em `src/lib/actions/*`; rota e tela não decidem.
- Toda escrita do Empório chama `registrarNoHistorico`, e ação nova ganha rótulo em `ACOES_DO_HISTORICO` (`src/lib/emporio/historico.ts`), senão a conferência 19 do `npm run check` reprova.
- Suítes com a URL do Docker inline: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public"`.
- Roteiro só vale visto falhar: cada roteiro novo ou estendido roda uma vez com a correção desfeita.
- Subagente não commita; a sessão principal commita uma tarefa por vez.

## Review Focus

1. **Parcela conferida e antecipada (pontual) numa venda cancelada:** `confirmed_net` é igual ao `effective_net`; o estorno não pode sair em dobro nem pelo bruto. Teste na Tarefa 1, passo 1 (caso c).
2. **Venda com duas parcelas, uma conferida e outra futura:** a futura só é cancelada (sem estorno), a conferida estorna pelo conferido. Teste na Tarefa 1, passo 1 (caso b).
3. **Cheque sem bom para e também sem número:** é grupo 1, não aparece duas vezes nem no grupo 2. Teste na Tarefa 2, passo 1.
4. **`?cheques=a_completar` com loja filtrada e com `?ver=` junto:** o filtro dos cheques vence o `ver`, e a loja é preservada. Teste na Tarefa 3, passo 1.
5. **Corrigir e depositar o mesmo cheque ao mesmo tempo:** nenhum 500, e nunca "depositado com o número velho depois de a correção responder 2xx". Teste na Tarefa 8.

---

### Tarefa 1: estorno da parcela conferida pelo valor que caiu (Q368)

**Files:**
- Modify: `src/lib/actions/emporio-vendas.ts` (laço das parcelas no cancelamento, perto da linha 2220)
- Modify: `src/lib/emporio/historico.ts` (`ACOES_DO_HISTORICO`)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx` (onde o cancelamento da venda é explicado, perto da linha 188)
- Test: `scripts/m121-emporio-conferir-cartao.test.ts` (seção 8)

**Interfaces:**
- Produces: ação de Histórico `"cartao.estorno_conferida"` com rótulo `"Estorno da parcela conferida"`.

- [ ] **Passo 1: reescrever a seção 8(a) da `m121` e somar os casos (b) e (c)**

Hoje a 8(a) só imprime, como informativo, se o ajuste ficou. Passa a afirmar:
- (a) parcela de R$ 97,50 prevista, conferida em R$ 94,50 (ajuste de -R$ 3,00), venda cancelada: `check("o estorno sai pelo valor conferido", estorno.amount === 94.5)`; `check("o ajuste da conferência fica no extrato", aj.length === 1)`; `check("a parcela segue conferida", p.reconciled_at !== null)`; `check("o saldo da conta volta ao de antes da venda", saldoDepois === saldoAntesDaVenda)`, lido como a seção 3 lê o saldo da Posição de caixa; `check("Histórico com cartao.estorno_conferida", ...)`, cujo `summary` contém "94,50"; `check("Desfazer a conferência depois do cancelamento: 409 VENDA_CANCELADA", ...)`.
- (b) venda de duas parcelas, a 1ª conferida sem diferença e a 2ª futura: só uma linha `estorno_cartao` (a da 1ª, pelo conferido); a 2ª com `canceled_at` preenchido.
- (c) parcela conferida por antecipação pontual: um estorno só, pelo `effective_net` (igual ao `confirmed_net`); a recusa `ANTECIPACAO_VENDA_CANCELADA` continua ao desfazer a antecipação.

- [ ] **Passo 2: rodar e ver falhar**

Run: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:m121`
Expected: FAIL em "o estorno sai pelo valor conferido" (hoje sai 97,50) e no Histórico.

- [ ] **Passo 3: implementar no laço do cancelamento**

No `cashMovement.create` do estorno, `amount` passa a ser `decToNum(parcela.confirmed_net) ?? decToNum(parcela.effective_net) ?? 0`. Quando `parcela.reconciled_at !== null`, gravar `registrarNoHistorico(tx, ator, { action: "cartao.estorno_conferida", establishment_id: parcela.establishment_id, target_type: "parcela_cartao", target_id: parcela.id, summary })`, com o summary `Estorno da parcela ${installment}/${installments} conferida (venda nº ${número}): sai ${dinheiro(conferido)}, o valor que caiu; previsto ${dinheiro(previsto)}`. Atualizar o comentário do bloco (Q94, Q261, Q368). Somar o rótulo em `ACOES_DO_HISTORICO`. No manual, uma frase: a parcela já conferida é estornada pelo valor que caiu e aparece como "Estorno de cartão" no extrato; a conferência fica na história.

- [ ] **Passo 4: rodar a `m121` e as suítes que cancelam venda com cartão**

Run: `DATABASE_URL=... npm run test:m121`, depois `grep -ln "estorno_cartao" scripts/m*.test.ts` e rodar cada suíte listada (uma que afirme o estorno pelo previsto numa parcela conferida está errada pela Q368: corrigir a afirmação, não o código).
Expected: PASS.

- [ ] **Passo 5: commit** (`git add -u` e a suíte; mensagem "Empório: estorno da parcela conferida pelo valor que caiu (Q368)")

### Tarefa 2: ordem da carteira de cheques (Q369)

**Files:**
- Modify: `src/lib/emporio/cheque.ts`
- Modify: `src/lib/actions/emporio-caixa.ts` (`listarChequesAction`, perto da linha 1884, e a carteira da posição de caixa, perto da linha 1491)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-tarefa-2.tsx` (a frase do "A completar", perto da linha 546)
- Test: `scripts/m122-emporio-cheque-duas-etapas.test.ts` (seções 1 e 3)

**Interfaces:**
- Produces: `export function grupoNaCarteira(c: { status: string; number: string | null; bank: string | null; good_for: Date | string | null }): 1 | 2 | 3` e `export function ordenarCarteira<T extends { status: string; number: string | null; bank: string | null; good_for: Date | null; created_at: Date }>(cheques: T[]): T[]` (devolve cópia; não muda a entrada).

- [ ] **Passo 1: testes**

Seção 1 (pura): `grupoNaCarteira` de recebido sem bom para e sem número é `1`; com bom para e sem banco é `2`; completo é `3`; depositado sem número é `3`. `ordenarCarteira` de cinco cheques fora de ordem devolve: os dois do grupo 1 por `created_at`, depois o do grupo 2, depois os dois do grupo 3 por `good_for`. Seção 3 (rota): a lista da carteira pela rota vem nessa mesma ordem, e um cheque do grupo 2 lançado antes de um do grupo 1 aparece depois dele.

- [ ] **Passo 2: rodar e ver falhar** (`npm run test:m122` com a URL inline; FAIL em "grupoNaCarteira não exportada" e na ordem do grupo 2)

- [ ] **Passo 3: implementar**

As duas funções em `cheque.ts`, ao lado de `chequeIncompleto` (o grupo 3 cobre tudo o que não é recebido). Nas duas consultas, `orderBy` fica `[{ created_at: "asc" }, { id: "asc" }]` e a ordem final vem de `ordenarCarteira` sobre as linhas cruas, antes do `map` para a view (a `ChequeView` não leva `created_at`). Atualizar o comentário "O A completar (sem data) vai ao topo". No manual: "Na carteira, primeiro os cheques sem bom para, depois os que têm a data mas falta número ou banco, cada grupo na ordem em que foi lançado".

- [ ] **Passo 4: rodar** a `m122` e a `m120` (a carteira aparece na ficha do cliente). Expected: PASS.

- [ ] **Passo 5: commit** ("Empório: carteira de cheques com os sem bom para no topo e depois os sem número (Q369)")

### Tarefa 3: o "Ver os cheques" do Hoje abre só os cheques a completar

**Files:**
- Modify: `src/app/(dashboard)/emporio/financeiro/receber/page.tsx` (ler `cheques` do `searchParams`)
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-receber.tsx` (prop nova)
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-hoje.tsx` (link do cartão "Cheques a completar", perto da linha 87)
- Test: `scripts/navegador/emporio-cheque-duas-etapas.py` e o cenário `scripts/_cenario-emporio-cheque-duas-etapas.ts` (se faltar cheque completo ou fiado para o contraste)

**Interfaces:**
- Consumes: `chequeIncompleto` de `src/lib/emporio/cheque.ts`.
- Produces: `?cheques=a_completar` no A receber; prop `soACompletar: boolean` em `FinanceiroReceber`.

O filtro é um parâmetro próprio, não um valor do `?ver=`: assim a faixa de recortes, o fiado e o cartão não mudam (era o receio da 5.24).

- [ ] **Passo 1: estender o roteiro**

No Hoje do Financeiro, clicar "Ver os cheques": `confere("o link leva ao filtro", "cheques=a_completar" in caminho_com_busca())`; `confere("só os incompletos", ...)` (as linhas da tabela de cheques têm todas o selo "A completar" e o cheque completo do cenário não aparece); `confere("fiado e cartão fora", ...)`; `confere("a frase do filtro", tem("Mostrando só os cheques a completar"))`; clicar "Ver tudo o que receber" e conferir que o cheque completo volta. Com `?loja=` e `?ver=hoje` na mesma URL, o filtro dos cheques vence e a loja continua.

- [ ] **Passo 2: rodar e ver falhar** (`npm run navegador -- emporio-cheque-duas-etapas`, com o `npm run dev` de pé; FAIL em "o link leva ao filtro")

- [ ] **Passo 3: implementar**

Página: `const soACompletar = chequesDaUrl === "a_completar"`. Componente: com `soACompletar`, renderizar só a seção dos cheques, com `dados.checks.filter(chequeIncompleto)`, a frase "Mostrando só os cheques a completar." e o link "Ver tudo o que receber" para o mesmo endereço sem `cheques`, mantendo a loja. Hoje: o `href` do cartão vira `enderecoDaAba("/emporio/financeiro/receber", loja)` mais `cheques=a_completar`, com `?` ou `&` como o `enderecoSemCarimbo` faz.

- [ ] **Passo 4: rodar o roteiro (PASS) e desfazer o `href` uma vez para ver falhar**

- [ ] **Passo 5: commit**

### Tarefa 4: o "Conferir as parcelas" diz que traz as de dias anteriores

**Files:**
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-hoje.tsx` (cartão "Cartão a conferir")
- Modify: `src/app/(dashboard)/emporio/_components/financeiro-receber.tsx` (seção dos cartões com `ver === "hoje"`)
- Test: `scripts/navegador/emporio-conferir-cartao.py` (passo 8)

- [ ] **Passo 1:** no passo 8 do roteiro, `confere("o A receber diz que traz as anteriores", tem("também as parcelas de dias anteriores que ainda esperam conferência"))` depois de clicar "Conferir as parcelas".
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** no A receber, com `ver === "hoje"` e alguma parcela A conferir de data anterior a hoje, a frase acima da tabela dos cartões: "Vence hoje mostra também as parcelas de dias anteriores que ainda esperam conferência." No Hoje, o rótulo do link passa a "Conferir as parcelas (hoje e anteriores)".
- [ ] **Passo 4:** rodar (PASS).
- [ ] **Passo 5:** commit.

### Tarefa 5: aviso quando as barras não cabem na etiqueta

**Files:**
- Create: `src/lib/emporio/etiqueta-medidas.ts`
- Modify: `src/components/emporio/impresso/etiquetas-papel.tsx` (usa o módulo novo; a conta sai de dentro de `Etiqueta`)
- Modify: `src/app/(dashboard)/emporio/configuracoes/_components/balcao-etiquetas-form.tsx` (aviso embaixo das duas alturas)
- Modify: `src/app/(dashboard)/emporio/produtos/etiquetas/_dados.ts`, `page.tsx` e `_components/etiquetas-escolha.tsx` (aviso no formato escolhido)
- Test: `scripts/m123-emporio-balcao-rapido.test.ts` (seção pura nova) e `scripts/navegador/emporio-balcao-rapido.py`

**Interfaces:**
- Produces: `export const ALTURA_MINIMA_DAS_BARRAS_MM = 5`; `export function alturaDasBarras(largura: number, altura: number): number` (a conta que hoje vive em `Etiqueta`, sem mudar o resultado); `export function cabemBarras(largura: number, altura: number): boolean`; `export function alturaMinimaComBarras(largura: number): number | null` (menor altura, em passos de 0,5 mm entre 10 e 100, em que `cabemBarras` é verdadeiro; `null` se nenhuma).
- Prop nova em `EtiquetasEscolha`: `semBarras: { a4: boolean; rolo: boolean }`.

- [ ] **Passo 1:** seção pura na `m123`: `cabemBarras(40, 15) === false`; `cabemBarras(40, 25) === true`; `const m = alturaMinimaComBarras(40)`, com `cabemBarras(40, m) === true` e `cabemBarras(40, m - 0.5) === false`; `alturaDasBarras(63.5, 38.1)` igual ao valor que a conta atual dá (fixar o número calculado antes de mexer, para provar que a extração não mudou o desenho). No roteiro: Configurações com o rolo em 40 x 15 mostra "as barras não cabem"; em 40 x 25 não mostra; a tela de etiquetas no formato rolo mostra o mesmo aviso.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar. Texto do aviso: "Nessa altura o código de barras não cabe e a etiqueta sai só com nome, apresentação e preço. Para sair com barras, use pelo menos {N} mm." (sem o `N` quando `alturaMinimaComBarras` dá `null`). Na escolha, o aviso aparece só se algum item marcado tem código.
- [ ] **Passo 4:** rodar `m123` e o roteiro (PASS).
- [ ] **Passo 5:** commit.

### Tarefa 6: tirar o filtro redundante das entregas no Caixa

**Files:**
- Modify: `src/app/(dashboard)/emporio/caixa/page.tsx:132-134`

- [ ] **Passo 1:** conferir em `listarEntregasAction` (`src/lib/actions/emporio-turno.ts`) que o filtro pela loja do gestor está no `where`; se não estiver, parar e relatar (a remoção mostraria entrega de outra loja).
- [ ] **Passo 2:** trocar o `.filter(...)` pela lista direta, com o comentário de que a action já filtra.
- [ ] **Passo 3:** `npm run test:m125` (a seção das entregas do gestor) e `npm run navegador -- emporio-caixa-vendas`. Expected: PASS.
- [ ] **Passo 4:** commit.

### Tarefa 7: roteiros que faltam e o `eh_404` que confunde número de venda

**Files:**
- Modify: `scripts/navegador/_lib.py` (`eh_404`)
- Modify: `scripts/navegador/emporio-conferir-cartao.py` e `emporio-cheque-duas-etapas.py` (trocar `nao_achada()` por `eh_404()` e apagar a cópia local)
- Modify: `scripts/navegador/emporio-conferir-cartao.py` e `scripts/_cenario-emporio-conferir-cartao.ts` (passos novos)

- [ ] **Passo 1: `eh_404`**: passa a procurar só `could not be found` (a frase da página 404 do Next). Rodar os seis roteiros que o chamam (`emporio-f0`, `emporio-financeiro-casa`, `emporio-impressao`, `emporio-informacao-amarrada`, `emporio-relatorios-exportacao`, `manual-animacoes`) e os dois que tinham a cópia. Prova do lado que faltava: uma `confere` no `emporio-conferir-cartao` abre uma venda cujo número contém "404" (o cenário grava uma venda com `number: 4043`) e espera `not eh_404()`; com a regex antiga, reprova.
- [ ] **Passo 2: passos novos no roteiro do cartão**, cada um visto falhar uma vez:
  - no extrato da conta, "Retirar" na linha de cartão conferida: a linha volta a sem carimbo e a parcela a A conferir; "Carimbar" de novo: volta a Conferida pelo carimbo (Q352);
  - antecipação pontual de uma parcela Prevista: a parcela aparece Conferida, com o valor conferido igual ao líquido antecipado e sem linha de ajuste;
  - venda cancelada depois de conferida (Tarefa 1): no extrato, a linha "Estorno de cartão" com o valor conferido, a linha do ajuste continua, e o saldo da conta volta ao de antes da venda.
- [ ] **Passo 3:** rodar o roteiro inteiro (PASS) e commit.

### Tarefa 8: corrida entre completar ou corrigir e depositar o cheque

**Files:**
- Test: `scripts/m122-emporio-cheque-duas-etapas.test.ts` (seção 8 nova)

- [ ] **Passo 1:** seção 8, em 10 rodadas cada:
  - (a) cheque completo: `Promise.all([PATCH corrigindo o número para "N-rodada", POST depositar])`. Afirma: nenhuma resposta 500; se o depósito deu 2xx e a correção 2xx, o número final é "N-rodada" (a correção veio antes e ficou); se o depósito deu 2xx e a correção não, a correção foi 409; o status final é `depositado` se e só se o depósito deu 2xx.
  - (b) cheque sem banco: `Promise.all([PATCH completando o banco, POST depositar])`. Afirma: nenhuma resposta 500; se o depósito deu 2xx, o banco final não é nulo; senão, o depósito foi 409 `CHEQUE_INCOMPLETO`.
- [ ] **Passo 2:** rodar. Se passar de primeira, provar a trava: trocar por um instante o `updateMany` com `status: "recebido"` do completar por um `update` sem a condição e ver a (a) reprovar em alguma rodada; se não reprovar em 10, subir para 30 e registrar na dívida que a corrida não se reproduz localmente. Desfazer a troca.
- [ ] **Passo 3:** commit.

### Tarefa 9: fechar a frente

- [ ] `npm run check`, `npx tsc --noEmit`, `npm run lint` e `npm run test:all -- --sem-redis` (com as URLs inline). Expected: tudo verde.
- [ ] Juiz (`prova-juiz`) sobre o range da branch, com este plano como spec.
- [ ] `docs/agents/dividas.md`: tirar das 5.23, 5.24, 5.25 e 5.28 o que esta frente fechou; o que sobrar fica (equipamento, extrato da Stone, `m123` instável, Turbopack, feriado móvel, padrões copiados das etiquetas, movimentos do caixa e o seletor das Aprovações).
- [ ] Rotas que mudaram de resposta: nenhuma. Se o juiz achar uma, atualizar `src/app/(public)/docs/api/endpoints.ts` e rodar `npm run test:docs-api`.
- [ ] Handoff atualizado; merge na `main` só com autorização do usuário na conversa.
