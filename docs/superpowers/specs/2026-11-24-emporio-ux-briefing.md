# Briefing: UX e UI do Meu Empório (ponto de partida da sessão nova)

Data: 2026-11-24. Branch: `ux-emporio`. Ainda não é spec: é o pedido do
usuário e o que já se sabe, para a sessão nova entrevistar, diagnosticar e só
então propor.

## O pedido, nas palavras do usuário (resumo fiel)

- A Agromax e a Central do Milho estão alinhando mudanças novas. O usuário quer
  aproveitar para trabalhar a UX e a UI do painel, **só do Empório**. O resto
  do Tibé não muda.
- Algumas partes estão confusas. Ele não vê muito "AI slop" visual: o problema
  é **usabilidade**, e **sub-módulos que poderiam se agrupar** para facilitar o
  uso do dia a dia.
- **Pensar no Empório como um sistema desconectado do Tibé.** Em breve ele vai
  sair como produto próprio, e o Tibé fica só com uma versão básica, para o
  produtor que quiser vender algo da sua produção.
- Ele quer ser **entrevistado** e passar sugestões de mudança.
- Usar o browser-harness para ver as telas, com as skills de web design e
  conceitos de design.

## Como conduzir (ordem proposta)

1. **Entrevista primeiro, uma pergunta por vez** (`AskUserQuestion`, skills
   `superpowers:brainstorming` ou `grilling`). Pontos a cobrir, no mínimo:
   - quem usa o Empório no dia (caixa, vendedor, gestor da loja, financeiro,
     dono da conta) e o que cada um faz na primeira hora do dia;
   - quais telas ele acha confusas, e por quê, com exemplo real;
   - as mudanças que a Agromax e a Central do Milho estão alinhando agora;
   - o que é "Empório sozinho": marca, menu, entrada, o que sai do Tibé.
2. **Ver as telas** no `next dev` local, no Chrome de testes
   (`npm run navegador`), nunca no Chrome do usuário. Fotografar cada tela por
   papel (gestor e vendedor de caixa, no mínimo). O cenário
   `scripts/_cenario-manual-emporio.ts` limpa a conta do seed e monta a
   demonstração; o roteiro `manual-emporio` já passa por quase todas as telas.
3. **Diagnóstico** com as skills `impeccable` (critique, audit, distill),
   `ui-ux-pro-max` e `web-design-guidelines`: arquitetura de informação,
   agrupamento do menu, fluxos do dia, carga cognitiva, estados vazios.
4. **Proposta** de agrupamento e de mudanças, mostrada ao usuário (página do
   Artifact ou mockup) e aprovada antes de qualquer código. Depois, spec e
   plano em `docs/superpowers/`, como nas frentes anteriores.

## O que já se sabe (fatos, não conclusões)

- O menu lateral vem de `src/lib/emporio/paginas.ts` (`PAGINAS_DO_EMPORIO`):
  **21 itens soltos**, sem grupo, na ordem Início, Vender, Vendas, Orçamentos,
  Fiado, Clientes, Caixa, Financeiro, Produtos, Estoque, Compras, Fornecedores,
  Franqueados, Transferências, Despesas, Resultado, Relatórios, Equipe, Lojas,
  Histórico, Configurações. Cada item tem a permissão que exige (`exige`), e o
  menu e os cartões do Início leem a mesma lista.
- O Financeiro tem mais **7 telas** dentro dele: Aprovações, Caixa, Cobrança,
  Pagar, Projeção, Receber, Relatórios.
- Há nomes repetidos em lugares diferentes: **Caixa** (`/emporio/caixa` e
  `/emporio/financeiro/caixa`) e **Relatórios** (`/emporio/relatorios` e
  `/emporio/financeiro/relatorios`). Conferir na entrevista se isso confunde.
- Telas em `src/app/(dashboard)/emporio/`. Spec do módulo:
  `docs/specs/module-39-meu-emporio.md` (decisões até a Q386). Manual público
  em `/manual`.
- A Agromax usa o Empório em produção na conta Da Mata, todo dia, com duas
  lojas. Mudança de navegação mexe na rotina de gente real: vale combinar a
  transição (por exemplo, o manual e os GIFs precisam acompanhar).

## Limites desta frente

- Só o Empório. Nada fora de `src/app/(dashboard)/emporio/`, dos componentes
  do Empório e de `src/lib/emporio/`, salvo o necessário para a navegação dele.
- Regra de negócio não muda nesta frente sem perguntar: é UX e UI.
- Kit e tokens (`components/ui/`, `globals.css`) são compartilhados com o
  Tibé: mudar ali afeta o resto. Se precisar, é conversa com o usuário.
- Nada se escreve na conta Da Mata. Merge, push na `main` e deploy, só com
  autorização na conversa, a cada vez.
