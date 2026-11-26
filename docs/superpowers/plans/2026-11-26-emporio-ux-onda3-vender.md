# Onda 3 da UX do Empório: o Vender na ordem do balcão

> **Para agentes:** execute com a skill `orquestrar-ondas` (subagentes por time, a sessão principal commita) ou `superpowers:subagent-driven-development`. Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** o Vender vira duas colunas no computador (produtos à esquerda; cliente, vendedor, pagamento e total à direita), com o que é raro recolhido em "Mais opções", o Consumidor final já escolhido, o vendedor do Caixa em botões e a faixa do caixa no topo.

**Arquitetura:** mudança só de tela (§5.7: "o servidor já aceita o Consumidor final"). Nenhuma action, rota ou migração. O `VendaCampos` (`_components/venda-campos.tsx`, 1.173 linhas) é partido em blocos exportados: a troca (`trocar-form.tsx`) continua montando-os na ordem de hoje, e o balcão os monta no layout novo. As regras pequenas da tela (título de "Mais opções", texto da faixa, vendedor que vem escolhido) vão para um arquivo puro, testado pela suíte `m132`.

**Stack:** Next.js 16 (App Router), React 19, componentes do Empório, roteiros Python em `scripts/navegador/`.

**Spec:** [2026-11-24-emporio-ux-design.md](../specs/2026-11-24-emporio-ux-design.md), §5.7 (Q393), §3, §6, §8. Mockup: `docs/superpowers/specs/mockups/2026-11-24-emporio-ux/vender.html` (onde diverge do texto, vale o texto: a Caixa não é vendedora).

## Restrições globais

- Invariantes do `CLAUDE.md`: sem travessão (4), sem heredoc com escape (5), merge e push na `main` só com autorização na conversa (7), suíte verde não é validação (8).
- Arquivos: `src/app/(dashboard)/emporio/vender/`, `src/app/(dashboard)/emporio/_components/`, `src/lib/emporio/`, `scripts/`. Nada em `src/lib/actions/`, `src/app/api/`, `prisma/`. Kit e tokens (`components/ui/`, `globals.css`) não mudam.
- A troca (`trocar-form.tsx`) não muda de comportamento nem de aparência.
- O `ORDEM` do balcão segue a ordem VISUAL nova (o foco da recusa vai ao primeiro campo de cima). Todo campo do `ORDEM` continua num `<Field error=...>` (conferência 15 do `check`).
- Q169 e Q168 continuam: o Caixa escolhe o vendedor em toda venda, sem padrão, e nunca é o vendedor. A única exceção é a do desenho: loja com um vendedor só.
- Os atalhos são os configurados (`lerConfiguracoesAction().shortcuts`, padrões em `src/lib/emporio/atalhos.ts`), não teclas fixas.
- O manual NÃO muda nesta onda (onda 7). O que ficar defasado nele entra na lista da onda 7, no handoff.
- Nada se escreve na conta Da Mata.
- `npm run check` limpo em todo arquivo tocado.

## Decisões de quem constrói (o desenho deixa abertas)

Estas são minhas, como planejador. Vão ao usuário junto com o plano.

1. **Botões de vendedor só para o Caixa.** Gestor, vendedor e dono continuam com a lista de hoje, já na própria pessoa (o desenho diz "continua como hoje").
2. **F8 e o número:** os botões levam o número na frente ("1 Ana", "2 Bruno"). O F8 põe o foco no grupo, e o dígito de 1 a 9 escolhe. Dígito sem vendedor não faz nada.
3. **A faixa do caixa:**
   - caixa aberto hoje: "Caixa 1 aberto desde 08:02 · Loja da Rodovia";
   - aberto em dia anterior: "Caixa 1 aberto desde 25/11, 08:02 · Loja da Rodovia";
   - vários abertos e nenhum escolhido: "2 caixas abertos · Loja da Rodovia", e a escolha do caixa de hoje continua embaixo;
   - sem loja escolhida, ou no modo Orçamento: sem faixa.
4. **A Loja** fica no topo da coluna da direita, acima do Cliente.
5. **A autorização do desconto** fica fora de "Mais opções", embaixo dos itens: o desconto do item também a pede.
6. **"Mais opções" abre sozinho** quando o servidor recusa um campo de dentro dele. Campo escondido não pode receber a recusa (regra de `ui.md`).
7. **Atalhos junto do que acionam:** a tecla aparece ao lado da busca, do "Trocar" do cliente, do Vendedor, do Pagamento e do "Fechar a venda". A legenda do rodapé sai. A configuração "mostrar legenda" passa a ligar e desligar essas teclas. Abaixo de 1024 px elas não aparecem (no celular não há teclado).
8. **Duas colunas a partir de 1024 px** (`lg`). Abaixo, uma coluna: produtos, depois a coluna da direita, com o total e "Fechar a venda" presos no rodapé. A página passa de `max-w-2xl` para `max-w-6xl`.
9. **Cheque, boleto ou fiado com o Consumidor final:** a linha do pagamento entra, a janela de clientes abre e o campo Cliente diz "Cheque precisa do cliente de verdade: escolha quem paga." (a forma muda na frase). Fechar a janela sem escolher deixa a linha, e a recusa de hoje vale.
10. **O Consumidor final também vem escolhido no modo Orçamento** (o orçamento já aceita), e volta depois de cada venda, orçamento salvo ou "Novo atendimento".
11. **O preço do item continua sem edição na linha.** O desenho diz "quantidade, preço, desconto do item e total, editáveis na linha". Hoje se editam a quantidade e o desconto. Deixar o preço editável mudaria a regra do limite de desconto e do PIN (Q329), e o desenho proíbe regra nova. O desconto continua sendo o caminho para mudar o preço.

## Foco da revisão

Situações que nenhum teste de tarefa cobre de graça e que mais devem doer:

1. **Recusa em campo recolhido:** o servidor recusa o frete, o crédito do franqueado ou o número do orçamento com "Mais opções" fechado. Esperado: a seção abre, a mensagem aparece embaixo do campo e o foco vai nele.
2. **Caixa aberto ontem:** a faixa mostra a data, e não só a hora, para ninguém vender num turno de ontem sem perceber.
3. **Pedido para entrega com o Consumidor final:** agora que ele vem escolhido, marcar "para entrega" mostra a falta e o "Trocar". Nada é enviado em silêncio.
4. **Depois da venda:** o cliente volta ao Consumidor final, e não ao cliente anterior nem a vazio. O vendedor do Caixa volta vazio, salvo na loja de um vendedor só.
5. **A troca, que nenhum roteiro cobre hoje:** depois de partir o `VendaCampos`, "Trocar mercadoria" na ficha da venda abre, aceita item e pagamento e registra a troca.

---

### T1: partir o `VendaCampos` em blocos, sem mudar nada na tela

**Time:** `tela-pagina`. **Arquivos:** `src/app/(dashboard)/emporio/_components/venda-campos.tsx`, e os novos `venda-campos-itens.tsx` e `venda-campos-pagamento.tsx` na mesma pasta. **Depende de:** nada.

**Interfaces que produz** (todos recebem `v`, `erros`, `idDe` e `limpar`, como o `VendaCampos` recebe hoje, e o estado local de cada um vai junto: `busca` e `semPrecoDe` para os itens, `semTaxaDeCartao` para o pagamento):
- `CampoDaLoja({ v, lojas, erros, idDe, limpar, aoEscolherLoja })`;
- `CamposDosItens({ v, produtos, erros, idDe, limpar, teclaDaBusca?: string })`: a busca e as linhas;
- `CampoDaAutorizacao({ v, erros, idDe, limpar, autorizacaoHerdada })`;
- `CampoDoDescontoNoTotal({ v, erros, idDe, limpar })`, só o campo, sem a linha "Itens, desconto, total";
- `CampoDoCliente({ v, consumidorFinal, erros, idDe, limpar, permitirCadastro, avisoDoCliente, aoEscolherCliente, clienteTravado, pedirTroca?: { n: number; motivo: string } | null })`;
- `CamposDoFrete({ v, erros, idDe, limpar, comOrigem: boolean })`;
- `CampoDoPagamento({ v, erros, idDe, limpar, creditoDoFiado, aoAdicionarForma?: (kind: string) => void, teclaDoPagamento?: string })`;
- `ResumoDoOrcamentoNaTela({ v })`, a lista "Itens, desconto, frete, total" do modo Orçamento.

`VendaCampos` passa a só compor esses blocos, na ordem e com as props de hoje. As props novas (`teclaDaBusca`, `pedirTroca`, `aoAdicionarForma`, `teclaDoPagamento`) são opcionais e, nesta tarefa, ninguém as passa.

- [ ] **Passo 1:** extrair os blocos, sem mudar classe, texto nem ordem.
- [ ] **Passo 2:** `tsc`, `lint`, `npm run check`.
- [ ] **Passo 3:** `emporio-balcao-rapido`, `emporio-f3a` e `emporio-desconto-pin` verdes, sem mudar o roteiro. Abrir "Trocar mercadoria" numa venda do seed e conferir à mão que o painel abre igual.
- [ ] **Passo 4:** a sessão principal faz o commit.

### T2: as regras puras da tela e a suíte `m132`

**Time:** `prova-suite` escreve a suíte a partir desta tarefa e do §5.7, antes do código. Depois, `tela-pagina` implementa. **Arquivos:** `src/lib/emporio/balcao-tela.ts` (novo, sem React e sem import de servidor), `scripts/m132-emporio-vender.test.ts` (novo), `package.json` (`test:m132`). **Depende de:** nada (corre junto com a T1).

**Interfaces que produz:**
- `type MaisOpcoesPreenchidas = { descontoNoTotalCent: number; freteCent: number; origem: OrigemDaVenda; paraEntrega: boolean; franqueadoNome: string | null; creditoDoFranqueadoCent: number; orcamentoNumero: string | null }`.
- `algoNasMaisOpcoes(p: MaisOpcoesPreenchidas): boolean`. Origem `"balcao"` conta como vazio.
- `tituloDasMaisOpcoes(p: MaisOpcoesPreenchidas): string`. Sem nada, `"Mais opções"`. Com algo, `"Mais opções (" + partes.join(", ") + ")"`, nesta ordem: `"desconto " + reaisBr`, `"frete " + reaisBr`, `"e-commerce"`, `"para entrega"`, `"franqueado " + nome`, `"crédito " + reaisBr`, `"orçamento nº " + numero`.
- `CAMPOS_DAS_MAIS_OPCOES: readonly string[]`: `order_discount_amount`, `freight_amount`, `origin`, `for_delivery`, os `delivery_*`, `franchisee_id`, `franchisee_credit`, `number`, `quote_id`.
- `type FaixaDoCaixa = { tom: "aberto" | "fechado"; texto: string }`.
- `faixaDoCaixa(a: { escolhido: { nome: string; aberto_em: string } | null; abertos: number; lojaNome: string; agora: Date }): FaixaDoCaixa`. Hora e data no fuso de São Paulo. Fechado (`abertos === 0`): `"Dá para montar a venda; para fechar, abra o caixa"`. Os outros textos estão na decisão 3.
- `vendedorQueVemEscolhido(a: { vendedores: { id: string }[]; ehCaixa: boolean; usuarioId: string; escolhido: string }): string`. A escolha que ainda está na lista; senão, quem não é Caixa e vende na loja cai em si mesmo; senão, o Caixa numa loja de um vendedor só recebe esse; senão, `""`.
- `vendedorPelaTecla(vendedores: { id: string }[], tecla: string): string | null`. `"1"` a `"9"` dão o n-ésimo; o resto, `null`.
- `formaPedeClienteDeVerdade(kind: string): boolean`: `cheque`, `boleto` e `fiado`.

- [ ] **Passo 1: a suíte cobre:**
  - título vazio; só frete de R$ 30 dá `"Mais opções (frete " + reaisBr(30) + ")"`; frete e entrega juntos, na ordem; origem balcão não conta;
  - faixa de caixa aberto hoje às 08:02 (só a hora); fechada; dois abertos sem escolha;
  - o caso que separa o fuso: relógio em 26/11 às 01h30 de São Paulo e turno aberto em 25/11 às 23h50 de São Paulo. Esperado: `"... desde 25/11, 23:50 · ..."`. Em UTC os dois caem em 26/11, e a versão errada mostraria só a hora;
  - Caixa com um vendedor recebe ele, Caixa com dois recebe `""`, gestor recebe a si mesmo, escolha fora da lista é descartada;
  - tecla `"3"` com dois vendedores dá `null`, e tecla `"a"` também;
  - `formaPedeClienteDeVerdade` para as sete formas do balcão (`FORMAS_DO_BALCAO`).
- [ ] **Passo 2:** rodar `npm run test:m132` e ver falhar (o arquivo não existe).
- [ ] **Passo 3:** implementar `balcao-tela.ts`.
- [ ] **Passo 4:** `test:m132`, `tsc`, `npm run check`. A sessão principal faz o commit.

### T3: as duas colunas, "Mais opções" e os atalhos junto do que acionam

**Time:** `tela-pagina`. **Arquivos:** `src/app/(dashboard)/emporio/_components/balcao.tsx`, `src/app/(dashboard)/emporio/_components/balcao-mais-opcoes.tsx` (novo), `src/app/(dashboard)/emporio/_components/atalhos-do-balcao.tsx`, `src/app/(dashboard)/emporio/vender/page.tsx`. **Depende de:** T1 e T2.

- [ ] **Passo 1:** a busca de produto recebe o foco ao abrir a tela, e de novo depois de "Novo atendimento" e de cada venda gravada.
- [ ] **Passo 2:** o layout:
  - acima das colunas, como hoje: a aba Venda e Orçamento (`SeletorDeModo`), os avisos de edição e de `refazer`, e os resumos da venda e do orçamento gravados;
  - coluna da esquerda: `CamposDosItens` e `CampoDaAutorizacao`;
  - coluna da direita: `CampoDaLoja`, o orçamento a faturar só quando já está carregado, `CampoDoCliente`, o Vendedor, `CampoDoPagamento`, "Mais opções", a observação (só no modo Orçamento), o resumo do total e o botão;
  - "Mais opções" é um `<details>` (o padrão de `periodo-filtro.tsx`) com o título `tituloDasMaisOpcoes`. Dentro: `CampoDoDescontoNoTotal`, `CamposDoFrete` (com origem só na venda), o pedido para entrega, `FranquiaCampos` e o campo do número do orçamento a faturar (`OrcamentoNaVenda`, só na venda);
  - no modo Orçamento, o franqueado e o frete também ficam dentro dele.
- [ ] **Passo 3:** "Mais opções" começa aberto quando `algoNasMaisOpcoes` vale e a tela veio de `edicao`, `refazer` ou `orcamentoInicial`. Abre sozinho quando `err.erros` tem uma chave de `CAMPOS_DAS_MAIS_OPCOES`, antes de o foco ir ao campo.
- [ ] **Passo 4:** reordenar o `ORDEM`: `cash_register_id`, `items`, `discount_authorization`, `establishment_id`, `customer_id`, `seller_user_id`, `payments`, `acquirer_id`, e depois os campos de `CAMPOS_DAS_MAIS_OPCOES` na ordem de dentro da seção, e `notes`.
- [ ] **Passo 5:** atalhos. Um `<TeclaDoAtalho acao>` (um `kbd` com a tecla de `atalhos[acao]`) ao lado da busca, do "Trocar" do cliente, do rótulo Vendedor, do rótulo Pagamento e do botão de fechar, com `hidden lg:inline-flex` e só quando `legendaDosAtalhos` vale. `LegendaDosAtalhos` sai do rodapé e do arquivo.
- [ ] **Passo 6:** no celular (390 px), uma coluna sem rolagem lateral, com total e botão presos no rodapé.
- [ ] **Passo 7:** `tsc`, `lint`, `npm run check`, `test:m132`, `emporio-balcao-rapido` e `emporio-frete-ecommerce` (ajustar só o caminho até os campos que entraram em "Mais opções"). A sessão principal faz o commit.

### T4: o Consumidor final já escolhido, o vendedor em botões e a faixa do caixa

**Time:** `tela-pagina`. **Arquivos:** `src/app/(dashboard)/emporio/_components/balcao.tsx`, `src/app/(dashboard)/emporio/_components/balcao-vendedor.tsx` (novo), `src/app/(dashboard)/emporio/_components/balcao-faixa-do-caixa.tsx` (novo), `src/app/(dashboard)/emporio/_components/caixas-da-loja.ts`, `src/app/(dashboard)/emporio/_components/escolher-cliente.tsx`, `src/app/(dashboard)/emporio/_components/venda-campos-pagamento.tsx` (o aviso do cheque e do boleto). **Depende de:** T3.

- [ ] **Passo 1: Consumidor final.** O balcão passa `clienteInicial: consumidorFinalEscolhido(consumidorFinal)` ao `useVenda`, nos dois modos. O `reiniciar` já volta a ele. A edição, o `refazer` e o orçamento carregado continuam trazendo o cliente deles.
- [ ] **Passo 2: forma que pede cliente.** `aoAdicionarForma` no balcão: se `formaPedeClienteDeVerdade(kind)` e `v.cliente?.fixed`, sobe o `pedirTroca` (`{ n: n + 1, motivo }`, com o texto da decisão 9). `EscolherCliente` ganha a prop `pedirTroca` e abre a janela quando o `n` muda, mostrando o motivo no campo. Os avisos "O cheque precisa de um cliente: escolha acima." e "O boleto precisa de um cliente: escolha acima." passam a valer também com `v.cliente.fixed`.
- [ ] **Passo 3: vendedor.** `balcao-vendedor.tsx` exporta `VendedorDoBalcao`:
  - para o Caixa (sem `vendedorTravado`), um `role="radiogroup"` com `aria-label="Vendedor"`, que recebe o `id` do `Field` (o F8 o foca), com um botão `role="radio"` por vendedor, `aria-checked` e o texto `"<n> <nome>"`;
  - o dígito, com o foco no grupo, escolhe por `vendedorPelaTecla`;
  - para os outros papéis, o `Select` de hoje;
  - o balcão troca o cálculo de `vendedor` por `vendedorQueVemEscolhido`.
- [ ] **Passo 4: faixa.** `CaixaDaLoja` ganha `aberto_em: string | null` (de `turno_aberto.aberto_em`). `FaixaDoCaixa` fica no topo do formulário, só no modo Venda e com loja escolhida, verde (`bg-sucesso-suave text-sucesso-tinta`) ou laranja (`bg-atencao-suave text-atencao-tinta`), com o texto de `faixaDoCaixa`. Fechado, ela traz o botão "Abrir o caixa", que usa o `AbrirTurnoForm` de hoje, com a mesma lógica de `retomar`. A faixa é o `Field` de `cash_register_id`, com o rótulo "Caixa" só para leitor de tela, e a recusa aparece nela. A escolha entre vários caixas abertos (`CaixaDaOperacao`) fica embaixo dela, como hoje.
- [ ] **Passo 5:** `tsc`, `lint`, `npm run check`, `test:m132`. A sessão principal faz o commit.

### T5: a prova viva e o fim da onda

**Time:** `prova-viva`. **Arquivos:** `scripts/navegador/emporio-ux-onda3.py` (novo), `scripts/_cenario-emporio-ux-onda3.ts` (novo), `scripts/navegador/_lib.py` (o `escolher` aceita um `radiogroup` de botões), e os roteiros que a varredura apontar. **Depende de:** T4.

- [ ] **Passo 1: o cenário.** Loja A com dois vendedores e um Caixa, com o caixa fechado. Loja B com um vendedor só e o caixa aberto ontem às 23h50. Um produto com preço nas duas lojas e um cliente de verdade.
- [ ] **Passo 2: o roteiro `emporio-ux-onda3`:**
  - o Caixa na loja A vê a faixa laranja e monta a venda; "Fechar a venda" sem vendedor recusa no campo; F8 e o "2" escolhem o segundo vendedor; "Abrir o caixa" deixa a faixa verde, e a venda segue;
  - na loja B, o vendedor único já vem escolhido, e a faixa mostra a data de ontem;
  - o cliente vem como Consumidor final; "+ Cheque" abre a janela de clientes com o motivo;
  - "Mais opções" fechado mostra "Mais opções"; com frete de R$ 30, mostra o título com o frete;
  - uma recusa plantada do servidor no frete (frete negativo pela API ou pelo campo) abre "Mais opções" e põe a recusa embaixo do campo;
  - depois da venda, o cliente volta ao Consumidor final, e o vendedor do Caixa volta vazio;
  - editar uma venda com frete abre "Mais opções" já aberto;
  - "Trocar mercadoria" na ficha de uma venda registra a troca;
  - 390 px sem rolagem lateral, e o total preso no rodapé.
- [ ] **Passo 3:** provar nos dois sentidos. Desfazer (a) a escolha automática do vendedor único, (b) a abertura de "Mais opções" na recusa e (c) a janela de clientes no cheque, e ver o roteiro falhar em cada um. Refazer e ver passar.
- [ ] **Passo 4:** fotos do Vender por papel (dono, gestor, caixa), no computador e no celular, fora do git, para o usuário.
- [ ] **Passo 5:** a rotina de fim de onda (`orquestrar-ondas`, seção 3):
  - `npm run textos-defasados`;
  - corrigir os roteiros e as suítes, com a regra "texto mudado de propósito pelo §5.7, senão o defeito é da tela";
  - rodar todos os `emporio-*` com o cenário limpo, em blocos de primeiro plano.

  O defasado do manual vai para a lista da onda 7. Pontos já esperados:
  - quem procura "Escolher cliente" no Vender;
  - quem espera "Escolha o vendedor" no campo do Caixa;
  - quem lê a legenda `ul[aria-label="Atalhos do teclado"]`.
- [ ] **Passo 6:** juiz (`prova-juiz`) sobre o range da onda, as correções dele e `test:all`.

Para os roteiros, o servidor sobe com `NODE_OPTIONS="--max-old-space-size=4096" npx next dev --disable-source-maps`, e a passada longa vai em blocos de primeiro plano, religando o servidor a cada uns 15 roteiros.

## Ondas de despacho

| onda | tarefas | por quê |
|---|---|---|
| 1 | T1 e T2 | arquivos disjuntos, nenhuma depende da outra |
| 2 | T3 | usa os blocos da T1 e as regras da T2 |
| 3 | T4 | mexe no mesmo `balcao.tsx` da T3 |
| 4 | T5 | prova o que as anteriores entregaram |
