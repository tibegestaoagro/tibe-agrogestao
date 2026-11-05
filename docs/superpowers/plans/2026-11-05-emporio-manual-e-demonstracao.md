# Empório: o manual com as quatro entregas, e o cenário de demonstração com turno por dia. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O manual do Empório (`/manual/emporio`) passa a ensinar tudo o que entrou de 04/11 a 05/11 (configurações e impressão, caixa com turno e o papel Caixa, vendedor na venda e relatórios, orçamento), com figuras novas; e o cenário de demonstração passa a montar um turno por dia por loja, com Caixa, vendedor escolhido e orçamentos, para a demonstração da Da Mata ser refeita.

**Architecture:** O texto do manual vive em `src/app/(dashboard)/manual/_conteudo/` (partes por função, por tarefa e de consulta, com `<Tarefa>`, `<Chamada>` e `<Figura id>`), as figuras são capturadas pelo roteiro `scripts/navegador/manual-emporio.py` sobre o cenário de demonstração no banco local. O cenário (`scripts/cenario-demonstracao-emporio.ts`) usa só actions; para o turno ter a data do dia, as actions de turno ganham um relógio injetável interno (opção da action, nunca da rota).

**Tech Stack:** Next.js 16, Prisma 7, Postgres 17, Python (browser-harness) nos roteiros.

**Spec:** `docs/superpowers/specs/2026-11-04-emporio-orcamento-caixa-impressao-design.md` (as quatro entregas) e as decisões Q138 (manual) e Q150 a Q187 de `docs/specs/module-39-meu-emporio.md`. O manual descreve o que o sistema FAZ hoje: na dúvida, o código e a spec do módulo vencem.

## Global Constraints

- **As oito invariantes do `CLAUDE.md`.** Nunca travessão (U+2014); nada de heredoc para escrever arquivo; regra de negócio em `src/lib/actions`; teste verde não é validação (a prova do manual é o navegador).
- **Linguagem do manual:** português simples, frases curtas, voz ativa, para quem está no balcão. Use a skill `escrita-tecnica-simplificada`. Os rótulos citados são os da tela, exatamente como aparecem (botões, títulos, mensagens de recusa copiadas do código).
- **Nada de afirmação que o código não sustenta.** Cada passo citado é conferido na tela ou no código; mensagem de recusa citada é copiada da action.
- **Subagente não commita.** Deixa no working tree e relata os arquivos.
- **Banco local sempre:** URLs inline `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"`. O cenário de demonstração **escreve em qualquer banco** (ele não usa `exigirBancoLocal`): nesta branch, rodar só no Docker, com a URL inline, e nunca contra a conta da Da Mata em produção (isso é pedido do usuário, com autorização, depois do deploy).
- **`npm run check`** limpo (caminho citado que existe, sem cor crua, sem travessão); arquivo novo com `git add -N` antes.

## Review Focus

1. **Um passo do manual que a tela não tem** (rótulo errado, botão que não existe para aquele papel). A prova é o roteiro de figuras e a leitura do componente.
2. **O papel Caixa:** o manual não pode prometer a ele o que ele não abre (estoque, produtos, devolução, lista de orçamentos).
3. **O turno do cenário:** cada venda antiga cai num turno daquele dia e daquela loja; nenhum turno fica aberto, exceto o de hoje, se o cenário deixar um de propósito.
4. **O relógio injetável não vaza para a API:** nenhuma rota aceita data de abertura ou encerramento do turno.
5. **Figuras que dependem do mês ou do dado** (marcas de "Vencido", "estimativa", assentos) não podem reprovar o roteiro num mês diferente.

---

### Task 1: O cenário de demonstração com turno por dia, Caixa, vendedor e orçamentos

**Files:**
- Modify: `src/lib/actions/emporio-turno.ts` (`abrirTurnoAction`, `sangriaAction`, `encerrarTurnoAction`, `confirmarEntregaAction` ganham `opts?: { agora?: Date }`, só interno; as rotas não passam)
- Modify: `scripts/cenario-demonstracao-emporio.ts`
- Test: `scripts/m92-*.test.ts` (seção nova: o relógio injetável grava `opened_at`/`closed_at` na data dada, e a rota não aceita o campo)

Comportamento do cenário:
- Para cada loja de venda e cada dia dos 30: abrir o Caixa 1 de manhã (`agora` = o dia às 8h), as vendas do dia com `sold_at` dentro do turno, uma sangria em alguns dias, e encerrar às 18h com malote, que o Gestor confirma (alguns dias com diferença justificada). Hoje: deixar o turno aberto, para a demonstração começar com o caixa aberto.
- Um usuário com o papel Caixa na Loja Centro (`caixa.demo.emporio@example.com`, como os outros demo). Parte das vendas da Loja Centro feitas por ele, com `seller_user_id` de um vendedor da loja.
- Configurações: dados de cabeçalho das lojas (CNPJ, telefone, WhatsApp, endereço), validade do orçamento, rodapés e largura da bobina.
- Orçamentos: alguns abertos, um vencido, alguns faturados (pelo vendedor e pelo Caixa), um faturado e depois cancelado (volta a aberto).
- O plano impresso sem `--confirmar` muda o rótulo "Levar gaveta ao banco" para o caminho atual (gerência para o banco).
- Continua reexecutável (`operation_key` com prefixo `demo-emporio-`) e o `--apagar` continua só local.

- [ ] Step 1: teste do relógio injetável na m92, falhando; implementar; m92 verde.
- [ ] Step 2: reescrever a parte de caixa e vendas do cenário; rodar no Docker numa conta de teste local (`--conta <tenant local> --confirmar`), conferir por consulta: nenhum turno aberto antes de hoje, toda venda com `cash_session_id` de um turno do mesmo dia e loja, vendas do Caixa com vendedor, orçamentos nas quatro situações.
- [ ] Step 3: rodar de novo (idempotente: nada duplica) e `--apagar` (limpa tudo).
- [ ] Step 4: m84, m87, m89, m91, m92, m93, m94, `tsc`, `check` verdes. Relatar arquivos.

### Task 2: O texto do manual por função, a consulta e o guia para imprimir

**Files:**
- Modify: `src/app/(dashboard)/manual/_conteudo/indice.ts` (parte nova `caixa-papel`: "Sou Caixa", grupo "Por função", depois de "Sou Vendedor")
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-funcao.tsx` (`ParteDono`, `ParteGestor`, `ParteVendedor`, nova `ParteCaixa`), `conteudos.tsx`
- Modify: `src/app/(dashboard)/manual/_components/tabela-de-permissoes.tsx` (coluna Caixa e as linhas novas: orçamento, lista de orçamentos, relatórios, configurações, operar o caixa, confirmar entrega)
- Modify: `src/app/(dashboard)/manual/_conteudo/partes-consulta.tsx` (glossário: Caixa (papel), Turno, Troco inicial, Reforço, Sangria, Malote, Com a gerência, Aguardando o gerente, Orçamento, Validade, Consumidor final, Vendedor da venda; revisar "Só da loja" e "Gaveta". Perguntas: caixa fechado, "Escolha o vendedor que atendeu.", Consumidor final sem fiado e cheque, cadastro do cliente, orçamento vencido, orçamento já faturado, desconto acima do limite no faturamento)
- Modify: `src/app/(dashboard)/manual/emporio/vendedor-imprimir/page.tsx` (blocos: escolher cliente e vendedor, imprimir, orçamento, sangria; recusas novas)

- [ ] Step 1: ler as actions e telas de cada coisa citada para copiar rótulos e mensagens.
- [ ] Step 2: escrever; `tsc`, `lint`, `check`.
- [ ] Step 3: abrir as páginas no `next dev` (sessão sem senha) e conferir que renderizam. Relatar arquivos.

### Task 3: O texto do manual por tarefa

**Files:**
- Modify: `src/app/(dashboard)/manual/_conteudo/indice.ts` (partes novas: `orcamento` "Orçamento", depois de "Vender no balcão"; `relatorios` "Relatórios", depois de "Resultado"; `configuracoes` "Configurações e impressão", depois de "Primeiros passos"), `conteudos.tsx`
- Modify: `partes-tarefa-1.tsx` (primeiros-passos com Configurações; equipe com o papel Caixa; produtos com metro e CNPJ alfanumérico do fornecedor), `partes-tarefa-2.tsx` (vender: caixa aberto, cliente com cadastro, vendedor, "Venda nº", imprimir A4 e cupom; devolver: o Caixa não devolve; fiado: cadastro e turno; caixa: abrir conferindo o troco, reforço, sangria, conferir, encerrar com malote e relatório, confirmar entrega, mais de um caixa; resultado: aponta para Relatórios), e as partes novas (onde couber, um arquivo novo `partes-tarefa-3.tsx`)
- `<Figura id>` só com ids que a Task 4 declara (lista na interface abaixo)

**Interfaces (ids de figura novos, declarados na Task 4):** `configuracoes-loja`, `configuracoes-impressao`, `caixa-abrir`, `caixa-sangria`, `caixa-encerrar`, `caixa-entregas`, `balcao-cliente-vendedor`, `venda-impressa`, `orcamento-balcao`, `orcamento-salvo`, `orcamentos-lista`, `orcamento-faturar`, `relatorios-periodo`, `equipe-caixa`.

- [ ] Step 1: ler as telas e actions para copiar rótulos; seguir o formato `Tarefa` (para que serve, passos, problemas).
- [ ] Step 2: escrever; `tsc`, `lint`, `check`; abrir as páginas no `next dev`. Relatar arquivos.

### Task 4: As figuras

**Files:**
- Modify: `src/app/(dashboard)/manual/_conteudo/figuras.ts` (`PapelDaFigura` ganha `"caixa"`; as 14 figuras novas da Task 3 com legenda, alt e marcas; revisar as antigas cuja tela mudou: `balcao-venda`, `balcao-pagamento`, `caixa-gaveta`, `caixa-conferir`, `equipe-cadastrar`, `venda-detalhe`)
- Modify: `scripts/navegador/manual-emporio.py` (sessão do Caixa; `estado_*` das telas novas; as marcas das figuras novas), `scripts/_cenario-manual-emporio.ts` (religar também o usuário Caixa)
- Create/replace: `public/manual/emporio/*.png`

- [ ] Step 1: declarar as figuras e os estados; rodar o cenário de demonstração no Docker e `npm run navegador -- manual-emporio`, todas as figuras geradas (computador e celular), 0 falhas.
- [ ] Step 2: corrigir as falhas conhecidas: marcas que dependem do mês ou do dado viram conferências que não dependem do calendário; a imagem do celular do preço por loja em branco.
- [ ] Step 3: abrir `/manual/emporio/<parte>` das partes novas e conferir que nenhuma mostra "Imagem em preparação". Relatar arquivos e o tamanho total de `public/manual/emporio/`.

### Task 5: Spec e handoff

- [ ] Step 1: `docs/specs/module-39-meu-emporio.md`: uma decisão nova (Q188 em diante) para o relógio injetável do turno e para o que o manual cobre.
- [ ] Step 2: `docs/agents/current-handoff.md`: a seção desta rodada (branch, o que contém, provas, e que o cenário em produção só roda com autorização do usuário). Relatar arquivos.
