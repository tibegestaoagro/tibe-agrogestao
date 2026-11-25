# Onda 2 da UX do Empório: o Início novo

> **Para agentes:** execute com a skill `orquestrar-ondas` (subagentes por time, a sessão principal commita) ou `superpowers:subagent-driven-development`. Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** o Início do Meu Empório mostra o que precisa de ação, os números do dia e os atalhos. O Caixa entra direto em Vender.

**Arquitetura:** uma leitura nova, `lerInicioAction`, junta as leituras que já existem (estoque, fiado, A pagar, aprovações, boletos, turnos, conferência), cada uma filtrada pelo papel e pelo alcance de lojas. Uma rota fina a expõe. A página do Início é refeita sobre ela. Não há regra de negócio nova nem migração.

**Stack:** Next.js 16 (App Router, server components), Prisma 7, roteiros Python em `scripts/navegador/`.

**Spec:** [2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md), §5.5 (Q391), §3, §7 e §8. Mockup: `docs/superpowers/specs/mockups/2026-11-24-emporio-ux/menu-inicio.html`.

## Restrições globais

- Invariantes do `CLAUDE.md`: regra de negócio só em `src/lib/actions/*` (6), sem travessão (4), sem heredoc com escape (5), merge e push na `main` só com autorização na conversa (7), suíte verde não é validação (8).
- Arquivos: `src/app/(dashboard)/emporio/`, `src/lib/emporio/`, `src/lib/actions/emporio-*`, `src/app/api/v1/emporio/`, `scripts/`. Kit e tokens (`components/ui/`, `globals.css`) não mudam.
- Leitura nova vai em `src/lib/actions/` e reaproveita as leituras que existem (§7). Nenhum número novo é gravado.
- Todo aviso conta só as lojas que a pessoa alcança hoje (`lojasDoAtor` e `pode(c, acao, loja)` por loja), para qualquer papel.
- "Gestor" e "financeiro" na tabela de avisos são as ações `gestor_da_loja` e `dinheiro`: quem tem as duas vê as duas colunas.
- O manual NÃO muda nesta onda (onda 7). O que ficar defasado nele entra na lista da onda 7.
- Nada se escreve na conta Da Mata.
- `npm run check` limpo em todo arquivo tocado.

## Decisões de quem constrói (o desenho deixa abertas)

Estas são minhas, como planejador. Vão ao usuário junto com o plano.

1. **Vendedor:** o desenho não o cita no Início. Ele vê os números das lojas dele e os atalhos que abre, sem o bloco "Precisa de você". Nenhuma coluna de aviso é dele.
2. **Comparação do mês:** o mês até hoje contra o mesmo trecho do mês anterior (do dia 1 ao mesmo dia). Comparar com o mês anterior inteiro faz todo começo de mês parecer queda.
3. **"Entra hoje" e "sai hoje"** usam o sentido da aba Hoje do Financeiro: o que vence hoje (fiado, boleto, cheque e cartão; contas a pagar). Só quem tem `dinheiro` vê os dois. Sem `dinheiro`, a fileira mostra só os dois números de venda.
4. **Atalho Estatísticas** aponta para `/emporio/relatorios` até a onda 5 criar a tela. **Nova compra** abre `/emporio/compras?nova=1`, com o painel de compra já aberto. **A receber** abre `/emporio/financeiro/receber`.
5. **Orçamento perto de vencer:** em aberto com validade de hoje até hoje mais 3 dias (a sugestão do §7 e do mockup).
6. **Caixa de dia anterior aberto:** turno com status aberto e abertura antes do começo de hoje, no fuso de São Paulo, como o resto do Empório já calcula o dia.
7. **Cheque vencido sem baixa:** cheque recebido ou depositado com `good_for` antes de hoje, como o `receivables_due.checks` da aba Hoje, mas só os anteriores a hoje.
8. **Menu do Caixa sem "Início"** (o mockup mostra Vender, Vendas, Clientes, Fiado e Caixa). Quem cai em `/emporio` sendo Caixa vai a `/emporio/vender`. As telas que hoje mandam o Caixa a `/emporio` passam a terminar em Vender, num redirecionamento encadeado, sem laço.

## Foco da revisão

Situações que nenhum teste de tarefa cobre de graça e que mais devem doer:

1. **Gestor de uma loja vendo a outra:** um gestor da AGROMAX não pode contar produto, orçamento nem caixa da AGROMAX MOC. Esperado: zero da loja que ele não alcança.
2. **O dia em São Paulo:** às 22h de Brasília já é outro dia em UTC. Esperado: "vendas hoje" e "caixa de dia anterior" seguem o dia de São Paulo.
3. **Sem nenhum aviso:** o bloco "Precisa de você" some inteiro, sem título vazio.
4. **Conta nova, sem loja:** os "Primeiros passos" aparecem, e nenhum número quebra (zeros, sem divisão por zero na comparação do mês).
5. **Mês anterior com zero de vendas:** a comparação não mostra "Infinity%" nem "NaN%". Esperado: a frase da comparação some.

---

### T1: a leitura do Início e a rota

**Time:** `servidor-acao`. **Arquivos:** `src/lib/emporio/inicio.ts` (novo, puro), `src/lib/actions/emporio-inicio.ts` (novo), `src/app/api/v1/emporio/inicio/route.ts` (novo), `scripts/test-m131-*.ts` (novo), `package.json`. **Depende de:** nada.

**Interfaces que produz:**
- `colunasDoInicio(c: PapelContexto): { gestor: boolean; dinheiro: boolean }` em `src/lib/emporio/inicio.ts`. O `gestor` passa se `pode(c, "gestor_da_loja", loja)` em alguma loja alcançada, e o `dinheiro` se `pode(c, "dinheiro")`.
- `type AvisoDoInicio = { chave: string; coluna: "gestor" | "dinheiro"; quantidade: number; valor: number | null; texto: string; href: string; acao: string }`. A `acao` é o rótulo do link ("Ver", "Cobrar", "Pagar", "Fechar", "Conferir"), como no mockup.
- `type NumerosDoDia = { vendas_hoje: { total: number; quantidade: number }; vendas_mes: { total: number; variacao_pct: number | null }; entra_hoje: { total: number; detalhe: string } | null; sai_hoje: { total: number; quantidade: number } | null }`.
- `lerInicioAction(db, ator, opts?: { agora?: Date }): Promise<Resultado<{ avisos: AvisoDoInicio[]; numeros: NumerosDoDia }>>`. O Caixa recebe 403 (`recusaDe`/`exigirUma`, como as outras leituras). O `agora` existe para a suíte fixar o relógio.
- `GET /api/v1/emporio/inicio`, um wrapper fino que segue `.claude/rules/api.md` e devolve o `data` acima.

**Avisos, fonte e quem vê** (a fonte é a leitura que já existe; não copie a consulta):

| chave | coluna | fonte |
|---|---|---|
| `estoque_baixo` (um aviso por loja) | gestor | `precisaReporAction` por loja alcançada como gestor |
| `orcamento_vencendo` | gestor | contagem de orçamentos em aberto com `valid_until` entre hoje e hoje+3, nas lojas do gestor (a situação "aberto" de `listarOrcamentosAction` é a referência) |
| `caixa_de_ontem` (um por turno) | gestor | `listarTurnosAction` com status aberto, filtrado por abertura antes de hoje |
| `fiado_vencido` | dinheiro | `lerResumoHojeAction().overdue_fiado` |
| `pagar_hoje` | dinheiro | `resumoDoAPagarAction().summary` (`overdue` + `due_today`) |
| `aprovacao_pendente` | dinheiro | `lerResumoHojeAction().pending_approvals` |
| `boleto_cheque_vencido` | dinheiro | `listarBoletosAction({status: "vencido"})` + cheques da decisão 7 |
| `conferir_banco` | dinheiro | `lerResumoHojeAction().unreconciled` |

Aviso com quantidade zero não entra na lista. A ordem é a da tabela do desenho.

- [ ] **Passo 1: suíte `test:m131` escrita pelo `prova-suite` a partir desta tarefa e do §5.5, antes do código.** Cobre:
  - dono vê as duas colunas;
  - gestor só a `gestor`;
  - um usuário só com `dinheiro` (papel `financeiro`) só a `dinheiro`;
  - vendedor nenhum aviso, mas recebe os números;
  - caixa recebe 403;
  - gestor de A com produto zerado e orçamento vencendo em B: zero de B;
  - orçamento com validade em hoje+3 entra, hoje+4 não, ontem não;
  - turno aberto ontem às 23h entra, turno aberto hoje às 00h05 não. O relógio é fixado em 25/11 às 22h30 de São Paulo, que já é 26/11 em UTC;
  - vendas no mês com o mês anterior em zero: `variacao_pct` é `null`;
  - a rota com dois tenants: um nunca vê o número do outro.
- [ ] **Passo 2:** rodar a suíte e ver falhar (a action não existe).
- [ ] **Passo 3:** implementar `inicio.ts`, `emporio-inicio.ts` e a rota.
- [ ] **Passo 4:** `test:m131`, `test:isolation`, `test:docs-api` (a rota nova aparece em `/docs/api`), `tsc`, `npm run check`. Tudo verde.
- [ ] **Passo 5:** a sessão principal faz o commit.

### T2: a tela do Início, o Caixa em Vender e o menu

**Time:** `tela-pagina`. **Arquivos:** `src/app/(dashboard)/emporio/page.tsx`, componentes novos em `src/app/(dashboard)/emporio/_components/inicio-*.tsx`, `src/app/(dashboard)/emporio/compras/page.tsx` e `src/app/(dashboard)/emporio/_components/compra-form.tsx` (só o `?nova=1`), `src/lib/emporio/menu.ts`, a suíte `m130` (o menu do Caixa sem Início). **Depende de:** T1.

- [ ] **Passo 1:** `/emporio` com papel exatamente `caixa` (`papelDoEmporio(...).papel === "caixa"`) e `veAPagina(papel, "/emporio/vender")` faz `redirect("/emporio/vender")`.
- [ ] **Passo 2:** a página, de cima para baixo, no desenho do mockup:
  - o cabeçalho com "Bom dia, <nome>" (ou "Boa tarde" ou "Boa noite", no fuso de São Paulo), pelo `CabecalhoDaTela`, com o (i): "O que precisa de você hoje nas suas lojas, os números do dia e os atalhos mais usados.";
  - "Precisa de você": um item por aviso, com o texto, a etiqueta da coluna e o link da `acao`. Sem aviso, o bloco some;
  - os números do dia: quatro cartões, ou dois sem `dinheiro`, com valor em `reaisBr` e a linha de apoio (quantidade de vendas, "N% acima/abaixo de <mês>", o detalhe de entra e a quantidade de contas);
  - os atalhos que o papel abre (`veAPagina`), na ordem Estatísticas, Produtos, Estoque, Nova compra, A receber;
  - os "Primeiros passos", como hoje, na mesma condição.
- [ ] **Passo 3:** a grade de cartões antiga sai, e as leituras que só ela usava saem junto.
- [ ] **Passo 4:** `/emporio/compras?nova=1` abre o painel de compra, para quem pode lançar. Para quem não pode, a tela abre normal.
- [ ] **Passo 5:** `menuDoEmporio` não põe "Início" para o papel `caixa`. A `m130` passa a afirmar o menu do Caixa sem Início (vista falhando antes da mudança).
- [ ] **Passo 6:** `tsc`, `lint`, `npm run check`, `test:m130`, `test:m131`. A sessão principal faz o commit.

### T3: a prova viva e o fim da onda

**Time:** `prova-viva`. **Arquivos:** `scripts/navegador/emporio-ux-onda2.py` (novo), `scripts/navegador/emporio-ux-onda1.py` (o Caixa agora termina em `/emporio/vender`, sem Início no menu), outros roteiros que a varredura apontar, `scripts/_cenario-manual-emporio.ts` (um usuário Financeiro, se faltar). **Depende de:** T2.

- [ ] **Passo 1:** um roteiro novo, `emporio-ux-onda2`, com um usuário por papel:
  - dono vê avisos das duas colunas, e cada link de aviso abre a tela certa (destino exato);
  - gestor só vê a coluna dele, e só das lojas dele;
  - financeiro só vê a coluna `dinheiro`;
  - o Caixa entra em `/emporio` e termina em `/emporio/vender`, e o menu dele não tem Início;
  - os números batem com as telas de origem (Vendas de hoje, A pagar);
  - sem aviso, o bloco some (cenário limpo);
  - 390 px sem rolagem lateral.
- [ ] **Passo 2:** provar nos dois sentidos: desfazer o redirecionamento do Caixa e um filtro de alcance, e ver o roteiro falhar; refazer e ver passar.
- [ ] **Passo 3:** fotos do Início por papel (dono, gestor, financeiro, caixa), no computador e no celular, fora do git.
- [ ] **Passo 4:** a rotina de fim de onda (`orquestrar-ondas`, seção 3): `npm run textos-defasados`, corrigir roteiros e suítes, rodar todos os `emporio-*` com cenário limpo. O defasado do manual vai para a lista da onda 7, registrada no handoff.
- [ ] **Passo 5:** juiz (`prova-juiz`) sobre o range da onda e `test:all`.

Para os roteiros, o servidor sobe com `NODE_OPTIONS="--max-old-space-size=3072" npx next dev --disable-source-maps`. Sem isso, ele passa de 5 GB e é derrubado por falta de memória.
