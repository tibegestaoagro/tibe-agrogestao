# Briefing: novo layout do painel (inspirado em `ID-visual-dashboard.jpeg`)

Documento de planejamento, não uma spec fechada. Pausa combinada com o usuário
antes de seguir para o app mobile (telas de escrita): revisar o layout do
painel web usando `docs/idVisual/ID-visual-dashboard.jpeg` como referência e
aplicar a paleta oficial (`docs/idVisual/paleta-de cores.png`, já viva em
`tailwind.config.ts` desde a Onda 4), com apoio do shadcn para montar as
telas. Este arquivo cobre: o que o mockup pede, o que existe hoje, o que o
shadcn consegue entregar neste projeto, e as decisões que faltam antes de
codificar.

## 1. Leitura do mockup

Referência visual completa em `docs/idVisual/ID-visual-dashboard.jpeg`.
Estrutura, de cima para baixo / esquerda para direita:

- **Sidebar fixa, verde escuro** (`tibe.dark`/`tibe.darkest`): logo "TIBÉ" no
  topo; navegação com **7 itens**: Início (ativo, destacado em
  `tibe.primary`), Minha Fazenda, Meu Dia, Calculadora Pecuária, Fazenda em
  Números, WhatsApp, e Configurações separado por espaço no fim; abaixo,
  um cartão fixo "trocador de fazenda" (ícone de casa + "Fazenda Boa Vista" /
  "João da Silva" + chevron); no rodapé, uma ilustração decorativa (árvores,
  gado, colinas) em tom mais escuro que o fundo.
- **Barra superior clara**: campo de busca "Buscar no TIBÉ...", um seletor de
  fazenda (ícone de casa + nome + chevron), sino de notificação com badge
  vermelho "3", avatar (foto) + nome "João da Silva" + chevron.
- **Saudação**: "Bom dia, João! 👋" + subtítulo "Hoje sua fazenda possui
  informações importantes para acompanhar."
- **4 cards de KPI** lado a lado: Rebanho Atual (1.248 cabeças, fundo
  verde-claro, variação "↑ 5,2% em relação ao mês anterior"), Valores a
  Receber (R$ 45.680,00, fundo verde-claro, "3 recebimentos previstos",
  botão circular verde), Valores a Pagar (R$ 18.230,00, fundo laranja-claro,
  "5 contas a pagar", botão circular laranja), Próximos Compromissos (7,
  fundo laranja-claro, botão circular laranja).
- **2 gráficos lado a lado**: "Evolução do rebanho" (área/linha verde,
  seletor "Últimos 6 meses") e "Receitas x Despesas" (barras agrupadas
  verde/laranja, seletor "Este ano", legenda com totais de Receitas/Despesas
  e "Saldo").
- **2 painéis lado a lado**: "Meu Dia" (lista: contas a pagar hoje,
  recebimento previsto, tarefas pendentes, vacinação do rebanho, cada item
  com valor/data e chevron) e um **calendário completo** "Julho de 2026"
  (navegação de mês, botão "Hoje", grade de dias com marcador de ponto nos
  dias com evento, dia atual destacado em círculo verde preenchido).
- **"Calculadora Pecuária"**: grade 2×6 de cards com ícone, um link "Ver
  todas as ferramentas →". As 12 ferramentas mostradas são **exatamente** as
  12 já construídas na Onda 3 (Cercas, Pastagens, Compra e Venda de Gado,
  Lotação Animal, Sal Mineral, Rações e Misturas, Água, Cochos, Adubação,
  Calagem, Mão de Obra, Máquinas).
- **Botão flutuante do WhatsApp**, verde (cor padrão do WhatsApp, não
  laranja), "Conversar com o TIBÉ", canto inferior direito.

## 2. O que já existe vs. o que o mockup pede

| Elemento do mockup | Estado atual |
|---|---|
| Paleta de cores | ✅ já viva em `tailwind.config.ts` (`tibe.primary/dark/darkest/light/accent*`) desde a Onda 4 |
| Sidebar escura, com ícones, estado ativo, trocador de fazenda, ilustração | ❌ `src/components/layout/sidebar.tsx`: fundo branco, sem ícones, sem destaque de rota ativa, sem trocador, sem ilustração |
| Navegação com 7 itens agrupados | ❌ `(dashboard)/layout.tsx` monta **12 itens** hoje, lista plana (Início, Meu Dia, Rebanho, Máquinas, Lavoura, Prestador, Financeiro, Alertas, Calculadoras, Usuários, Assinatura, Minha senha) |
| Barra superior com busca, seletor de fazenda, notificações, avatar | ❌ `src/components/layout/dashboard-shell.tsx`: header só tem nome do tenant + nome/papel do usuário + botão sair |
| Cards de KPI com fundo colorido e botão circular de ação | 🟡 parcial: `dashboard/page.tsx` (Módulo 28) já tem 4 cards novos (compromissos, contas vencidas, manutenções, últimos lançamentos), mas sem o estilo visual do mockup (fundo tintado, botão circular, ícone grande) |
| Gráfico "Evolução do rebanho" | ❌ não existe (dashboard atual tem outro gráfico, a confirmar qual) |
| Gráfico "Receitas x Despesas" com saldo | 🟡 provavelmente já existe alguma versão financeira; precisa comparar com o que o Módulo 28 entregou |
| Painel "Meu Dia" embutido no dashboard | ❌ hoje é uma página própria (`/meu-dia`), não um card no dashboard |
| Calendário completo no dashboard | ❌ não existe em nenhuma tela hoje |
| Grade "Calculadora Pecuária" no dashboard | ❌ existe como página própria (`/calculadoras`), não embutida no dashboard |
| Notificações in-app (sino com contagem) | ❌ não existe: hoje "Alertas" é uma página, e a entrega é por WhatsApp/e-mail (Módulo 4), não um centro de notificação in-app |
| Busca global | ❌ não existe |
| Avatar de foto do usuário | ❌ não existe upload/armazenamento de foto de perfil |
| Seletor de fazenda no topo | ❓ ambíguo: hoje "fazenda" = `Tenant`, e um usuário só pertence a um tenant. Um seletor sugere múltiplas propriedades (`Property`, já existe como modelo) ou é decoração do mockup |

## 3. Achados técnicos: shadcn neste projeto

Testado ao vivo nesta sessão (`npx shadcn@latest add <componente>`), depois
revertido por ainda não ter aprovação de implementação:

- **`init` trava** (achado antigo, confirmado): fica esperando prompt
  interativo, não roda neste ambiente de agente.
- **`add <componente> --yes` funciona bem** para componentes novos sem
  conflito de arquivo: testado com `avatar`, `dropdown-menu`, `popover`,
  os três instalaram limpo, cada um com sua dependência `@radix-ui/react-*`.
- **`add <componente> --yes` TRAVA** quando o componente depende de um
  arquivo que já existe no projeto (ex: `calendar` depende de `button.tsx`,
  que já é um arquivo nosso, escrito à mão): fica esperando confirmação de
  sobrescrita, mesmo com `--yes`.
- **`add <componente> --yes --overwrite` resolve o travamento, mas
  sobrescreve destrutivamente** o arquivo existente com o template genérico
  do shadcn. Reproduzido ao vivo: `calendar --overwrite` substituiu nosso
  `button.tsx` (perdeu as variantes de marca `bg-tibe-primary`/
  `bg-tibe-accent`) por um `button.tsx` genérico. Revertido na hora
  (`git checkout`), nunca chegou a ser commitado.
- **Achado mais importante: os componentes gerados pelo shadcn hoje usam
  sintaxe `bg-oklch(...)` sem colchetes**, que depende de Tailwind v4 +
  variáveis CSS de tema. Este projeto é **Tailwind v3.4** com
  `cssVariables: false` (`components.json`) e tokens em hex
  (`tibe.primary`, etc.). Isso apareceu até no `avatar.tsx` **sem nenhum
  conflito de sobrescrita envolvido**: ou seja, é um descompasso estrutural
  entre o registry atual do shadcn e a configuração deste projeto, não um
  problema pontual de um componente específico.

**Conclusão técnica**: dá para usar `shadcn add` como ponto de partida (economiza
escrever a estrutura Radix + acessibilidade do zero), mas **todo componente
novo precisa de uma passada manual** trocando as classes `oklch(...)` pelos
tokens reais do projeto (`tibe.*`, `gray-*` do Tailwind padrão) antes de
entrar no código. Não dá para rodar `add` e usar o resultado direto.

## 4. Mapeamento de cor proposto

Usando a paleta já viva (`tailwind.config.ts`), sem inventar tom novo:

| Elemento do mockup | Token |
|---|---|
| Fundo da sidebar | `tibe.darkest` (`#09241B`), decidido e aplicado na Fase 1 (o outro verde próximo, `tibe.dark`, ficou reservado pra outros usos) |
| Item de navegação ativo | `tibe.primary` (`#649721`) |
| Cards "positivos" (rebanho, a receber) | fundo tintado claro de `tibe.primary` (ex: `tibe.primary/10`) |
| Cards "atenção" (a pagar, compromissos) | `tibe.accentLight` (`#FCEFE2`), ícone/botão em `tibe.accent` (`#E97D0F`) |
| Fundo geral / cartões neutros | `tibe.light` (`#FCF8F5`) no lugar do `bg-gray-50` atual |
| Botão flutuante WhatsApp | verde padrão do WhatsApp (`#25D366`), não é cor de marca Tibé, é cor de canal: mantém como está nas outras telas |

## 5. O que o mockup implica que NÃO é só estilo

Quatro elementos do mockup pressupõem funcionalidade que não existe hoje e
precisam de decisão de escopo, não só de CSS:

1. **Notificações in-app** (sino com contagem): hoje `Alert` só é entregue
   por WhatsApp/e-mail (Módulo 4) e visto na página `/alertas`. Um sino no
   topo pede um contador de não-lidos, no mínimo.
2. **Busca global**: não existe hoje nenhuma busca cross-módulo (animal,
   lançamento, cliente, ordem de serviço).
3. **Avatar de foto**: não existe upload/armazenamento de foto de usuário no
   schema nem em nenhum módulo.
4. **Seletor de fazenda no topo**: hoje 1 usuário = 1 tenant. Isso ou é
   decorativo no mockup (o cliente ilustrou com uma fazenda só) ou aponta
   pra alternar entre `Property` (múltiplas propriedades dentro do mesmo
   tenant, modelo que já existe). Preciso confirmar qual.

## 6. Reabre a reestruturação de navegação (adiada 3 vezes)

Onda 1 (A3/A4) e Onda 3 (C2/C3) deferiram deliberadamente qualquer mudança
de navegação: "pertence a uma rodada própria". O mockup mostra uma IA nova
de 7 itens onde hoje existem 12 (lista plana). Isso não dá pra aplicar só
como "pele" (cor/ícone): **agrupar Rebanho + Máquinas + Lavoura sob "Minha
Fazenda"**, por exemplo, muda rotas, breadcrumbs e onde Financeiro/Alertas/
Prestador/Usuários/Assinatura ficam. Essa é a decisão de maior raio de
impacto deste briefing.

## 7. Decisões fechadas com o usuário (2026-08-04)

1. **Reestruturar a navegação como o mockup.** Os 12 itens atuais viram
   grupos sob 7 entradas. Como o mockup não detalha exatamente quais páginas
   caem em qual grupo, proposta de mapeamento (ajustável, não é ambiguidade
   nova, é detalhe de execução da decisão já aprovada):
   - **Início** → `/dashboard`
   - **Minha Fazenda** (grupo, expansível) → Rebanho, Máquinas, Lavoura,
     Prestador, Financeiro, Alertas (a página de listagem, não a de
     preferência)
   - **Meu Dia** → `/meu-dia`
   - **Calculadora Pecuária** → `/calculadoras`
   - **Fazenda em Números** → desabilitado, "em breve" (decisão 2)
   - **WhatsApp** → desabilitado, "em breve": não existe hoje nenhum número
     de contato configurado em lugar nenhum do código (nem no site público)
     para linkar um `wa.me` de verdade. Mesmo tratamento de "Fazenda em
     Números", não é uma decisão nova, é a mesma simplificação (decisão 4)
     aplicada a este item.
   - **Configurações** (grupo, expansível) → Usuários, Assinatura, Minha
     senha, Categorias financeiras, Preferências de alerta
2. **"Fazenda em Números" fica desabilitado/"em breve" nesta rodada.**
3. **shadcn como scaffold**, com correção manual de cor (`oklch` →
   `tibe.*`/tokens do projeto) antes de qualquer componente entrar no
   código.
4. **Fatiar em fases entregáveis**, cada uma testada e commitada antes da
   próxima:
   - **Fase 1** (esta rodada): sidebar nova (fundo escuro, ícones, estado
     ativo, grupos expansíveis, ilustração decorativa leve, cartão de
     conta no rodapé com o usuário/tenant substituindo o texto que hoje
     fica no header) + nova IA de navegação (mapeamento acima) + topbar
     simplificada (sem busca/sino/seletor de fazenda, avatar com iniciais
     no lugar do texto atual).
   - **Fase 2** (próxima): cards de KPI do dashboard com o estilo do
     mockup (fundo tintado, ícone grande, botão circular de ação),
     aplicados aos cards que o Módulo 28 já criou.
   - **Fase 3** (depois): calendário completo + "Meu Dia" embutidos no
     dashboard, grade "Calculadora Pecuária" embutida no dashboard.
   - Sem prazo definido: notificações in-app, busca global, avatar de foto,
     seletor de propriedade, cada uma é uma decisão de produto própria,
     fora desta iniciativa de layout.
5. **Notificações in-app, busca global, avatar de foto e seletor de
   fazenda: simplificados/removidos do layout por agora.** Avatar vira
   iniciais (sem upload); sem busca; sem sino; sem seletor (1 usuário = 1
   tenant continua como é, sem mudança de modelo).

## 8. Escopo exato da Fase 1 (a implementar agora)

Arquivos: `src/components/layout/sidebar.tsx`, `dashboard-shell.tsx`,
`src/app/(dashboard)/layout.tsx` (construção de `navLinks`). Sem migração de
banco, sem nova action, sem nova rota de API: é só camada visual +
reagrupamento de links que já existem.

## 9. Fase 1: entregue (2026-08-04)

- Sidebar: fundo `tibe.darkest`, ícones lucide por item, estado ativo em
  `tibe.primary`, grupos "Minha Fazenda" e "Configurações" expansíveis
  (abrem sozinhos quando a rota ativa está dentro deles, clique não fecha o
  drawer mobile), "Fazenda em Números" e "WhatsApp" desabilitados com selo
  "em breve", cartão de conta no rodapé (tenant + usuário + atalho pra
  Minha senha + Sair) substituindo o texto que antes ficava só no header,
  ilustração decorativa leve (SVG inline, sem imagem).
- "Configurações da conta" aponta pro hub `/configuracoes` já existente
  (ADMIN+) em vez de duplicar os links de Usuários/Assinatura/Categorias/
  Alertas na sidebar: mesmo controle de acesso de sempre
  (`hasMinRole(role, "ADMIN")` reproduz exatamente o que
  `canAccess(role, "usuarios"/"assinatura")` já fazia), sem duplicar a
  checagem em dois lugares.
  "Minha senha" continua direto na sidebar (todo papel precisa alcançar).
- Topbar: sem busca/sino/seletor de fazenda (decisão 5). Avatar com
  iniciais substitui o texto de nome/papel; nome/papel completo continua
  visível ao lado em telas ≥ sm.
  `bg-gray-50` → `bg-tibe-light` no fundo da área de conteúdo.
- Validado com navegador real (`next dev` local): login, expandir/colapsar
  os 2 grupos, navegação para filho de grupo (Rebanho) com destaque
  correto, hub de Configurações, atalhos de senha/logout no rodapé,
  drawer mobile (390×844) com o mesmo comportamento. `npm run build` limpo
  (lint + tsc + todas as rotas) e `test:isolation` sem regressão (não há
  teste automatizado de sidebar: mudança é só de camada visual/nav).
- **Achado, não corrigido nesta rodada** (fora do escopo de Fase 1): o
  aviso de instalação do PWA (`src/components/pwa/install-invite.tsx`,
  `fixed inset-x-0 bottom-0 z-50`) sobrepõe o novo cartão de rodapé da
  sidebar no mobile quando o drawer está aberto. Já sobrepunha conteúdo
  antes (é `inset-x-0`, cobre a tela toda), só ficou mais perceptível
  agora que o rodapé da sidebar tem conteúdo de verdade. Ajustar isso é
  uma tarefa separada (mexe em z-index/posicionamento de um componente
  que não é do escopo de layout), não bloqueia a Fase 1.
- Próximo: Fase 2 (cards de KPI com o estilo do mockup) e Fase 3
  (calendário + Meu Dia + grade de calculadoras embutidos no dashboard),
  cada uma com sua própria rodada de validação.

## 10. Correções pedidas após a Fase 1 (2026-08-04)

Feedback do usuário ao ver a Fase 1 em produção local: faltava o laranja da
paleta (só aparecia depois que os KPIs coloridos existissem, ou seja, Fase
2), "Fazenda em Números" não é um placeholder e sim uma área de
inteligência que centraliza os relatórios, e o pedido explícito de ir o
mais perto possível do mockup, com dado de demonstração realista (2 anos)
para validar visualmente em vez de telas zeradas. As duas fases (2 e 3 do
plano original) foram tratadas juntas nesta rodada, porque no mockup elas
formam uma composição visual única (separar a entrega deixaria o dashboard
visualmente incoerente por uma rodada inteira).

## 11. Fase 2+3 (KPIs, gráficos, Meu Dia+calendário, calculadoras, Fazenda em Números): entregue (2026-08-04)

- **Dado de demonstração**: `scripts/seed-demo-data.ts` (`npm run seed:demo`,
  recusa rodar fora do Postgres local/Docker). Gera ~2 anos de histórico
  para o tenant Da Mata Sementes: ~230 animais ativos (Property "Fazenda
  Boa Vista", mesmo nome do mockup), vendas/mortes com `AnimalMovement` +
  `FinancialEntry` ligado, pesagens, vacinações (algumas com próximo reforço
  em ≤20 dias, pra alimentar alerta/KPI de verdade), 5 máquinas com
  manutenções (2 propositalmente dentro da janela de "próximas"), 3 talhões
  com ciclos de 2 anos (1 ativo por talhão), 6 clientes/30 ordens de
  serviço, ~85 tarefas (Meu Dia), 24 meses de despesas recorrentes com uma
  fatia pending/vencida de propósito. Todo lançamento financeiro ligado
  segue byte a byte o formato de `createLinkedEntry` (mesma categoria,
  mesmo `related_module`, mesmo mapeamento due_date/paid_at por status) das
  actions reais (`animals.ts`, `machines.ts`, rota de faturamento de
  ordem), pra não ensinar convenção diferente da que o app realmente usa.
  Escala da receita da lavoura foi calibrada pra não dominar o gráfico de 6
  meses (pecuária é o negócio principal desta fazenda-demo).
- **`getHerdEvolution()`** (`src/lib/actions/animals.ts`): série mensal do
  rebanho ativo, sem snapshot gravado: reconstrói por diferença (animais
  cadastrados até o fim do mês, menos saída por venda/morte até lá), mesmo
  espírito de status computado (não armazenado) já usado em `Task`/
  `FinancialEntry`.
- **Dashboard redesenhado** (`(dashboard)/dashboard/page.tsx`): 4 KPIs
  hero no estilo do mockup (`src/components/dashboard/kpi-card.tsx`, verde
  = positivo/informativo, laranja = atenção), indicadores secundários
  mantidos (nenhum removido), 2 gráficos (`herd-evolution-chart.tsx` área
  verde, `revenue-expense-chart.tsx` barras verde/laranja com legenda de
  totais + saldo), painel Meu Dia + calendário do mês
  (`mini-calendar.tsx`, navegação própria, marcador só em tarefa/conta/
  vacina **pendente**, evita poluir o calendário com histórico já
  resolvido), grade "Calculadora Pecuária" embutida
  (`calculadora-grid.tsx`).
- **Catálogo de calculadoras extraído** (`src/lib/calculadoras/catalog.ts`):
  antes vivia hand-rolled só dentro de `/calculadoras/page.tsx`; agora é a
  fonte única, reusada também na grade do dashboard.
- **`MODULE_LABEL` consolidado** (`src/lib/related-modules.ts`): estava
  duplicado em `financeiro/page.tsx` e `generate-financial-pdf.ts`, e as
  duas cópias já tinham divergido (a do PDF estava sem `"maquinas"`, bug
  real e silencioso: o relatório em PDF mostraria "undefined" pra
  lançamento de máquina). Corrigido consolidando numa fonte só, mesma
  categoria de gap já registrada no projeto (`RelatedModule` duplicado,
  Módulo 26).
- **"Fazenda em Números" saiu de "em breve" pra link real** (`/relatorios`,
  nova página): central de relatórios que reusa `getDre`/`getCashFlow`/
  `getHerdEvolution` já existentes (nenhum cálculo novo), com resultado do
  mês por módulo, 2 gráficos de 12 meses, produtividade da lavoura e
  faturamento do prestador. "WhatsApp" continua "em breve": nenhum número
  de contato existe configurado em lugar nenhum do código ainda, mesma
  situação de antes.
- **Marca real na sidebar**: logo do Tibé (`docs/idVisual/id-visual-marca.jpeg`)
  simplificado em SVG inline (não um `<img>`: fica nítido em qualquer
  tamanho, sem asset extra pra servir), ilustração do rodapé ganhou
  silhueta de árvores além das colinas.
- Validado com navegador real, sessão logada, dado semeado: dashboard,
  `/relatorios`, `/calculadoras`, `/financeiro`, mobile (390×844). `npm run
  build` limpo e suíte ampla (`isolation`, `m1`-`m5`, `m17`, `m25`-`m29`)
  sem regressão.
- **Achado, não é bug**: em telas capturadas por automação logo após um
  clique programático (sem o intervalo natural de interação humana), os
  gráficos Recharts podem aparecer momentaneamente em branco até o
  `ResizeObserver` interno assentar; num carregamento normal (humano) isso
  não é perceptível. Não mexido, não é regressão de produto.

## 12. Seletor de propriedade + menu de conta no topo: entregue (2026-08-04)

Feedback do usuário sobre a Fase 2/3: gostou do seletor de propriedade do
mockup (topbar, ícone de casa + nome + chevron) e pediu um menu de conta no
topo com Perfil/Minha senha/Sair. Investigado antes de implementar: o app
não tinha nenhum conceito de "propriedade ativa" (só Rebanho filtrava por
propriedade, via parâmetro de URL sem persistência; Máquinas e Lavoura
sempre somavam tudo do tenant; Dashboard também). Perguntado ao usuário a
profundidade: **"Completo" foi a escolha** (propriedade ativa filtra o app
inteiro), não a opção mais leve (só mostrar/trocar, sem filtrar).

- **`src/lib/active-property.ts`**: propriedade ativa é cookie
  (`tibe_active_property_id`), não campo no banco: qual propriedade estou
  olhando agora não é dado de negócio. `getActivePropertyId(db)` sempre
  revalida contra o tenant atual (cookie de outra sessão/propriedade
  arquivada vira "todas as propriedades", nunca erro).
- **`POST /api/v1/tenant/active-property`**: troca a propriedade ativa,
  `guard("rebanho", "read")` (toda role tem pelo menos leitura de rebanho;
  trocar o que estou vendo não é uma escrita de negócio).
- **Filtro aplicado em**: Rebanho (parâmetro de URL explícito continua
  vencendo; sem ele, cai pra propriedade ativa), Máquinas e Lavoura
  (ganharam filtro que não tinham, com aviso "Filtrado por: X" no cabeçalho,
  já que essas páginas não têm seletor próprio), Dashboard (KPIs de rebanho/
  talhões/máquinas/vacinas/calendário) e "Fazenda em Números" (evolução do
  rebanho e produtividade da lavoura). **Financeiro/Prestador ficam de
  fora**: `FinancialEntry` e `ServiceOrder` não têm `property_id` no schema
  (nunca tiveram), não há o que filtrar.
- **`getHerdEvolution`/`listUpcomingVaccinations`** (`animals.ts`) ganharam
  `propertyId` opcional, mantendo compatibilidade com quem já chamava sem
  esse parâmetro.
- **Menu de conta no topo** (`user-menu.tsx`): avatar + nome + chevron →
  Perfil, Minha senha, Sair. Os atalhos de senha/logout continuam TAMBÉM no
  rodapé da sidebar (Fase 1): os dois coexistem no mockup, não são
  redundância por descuido.
- **Página "Perfil" nova** (`/configuracoes/perfil`): só o nome é editável
  (`updateOwnNameAction`, `auth-self.ts`); email fica de fora de propósito
  (identificador de login, globalmente único, trocar exigiria
  reverificação, fora de escopo aqui). Sem gate de papel, mesmo motivo de
  "Minha senha": todo usuário precisa alcançar isso.
- **Dropdown escrito à mão** (`use-dropdown.ts`, hook compartilhado:
  trigger + clique fora + Escape fecham): não o Radix DropdownMenu do
  shadcn, pelo mesmo motivo já registrado na Fase 1 (classes `oklch(...)`
  incompatíveis com este projeto).
- **Seed de demonstração ganhou uma 2ª propriedade** ("Sítio Recanto", ~20%
  do rebanho/máquinas/lavoura) especificamente pra dar o que testar no
  filtro: sem uma segunda propriedade de verdade, o seletor não tinha como
  ser validado ponta a ponta.
- Validado com navegador real: troca de propriedade filtrando Dashboard/
  Máquinas de verdade (rebanho 232→44 cabeças, talhões 3→1, manutenções
  2→1, financeiro inalterado como esperado), menu de conta, edição de nome
  no Perfil. `npm run build` limpo e suíte ampla (`isolation`, `m1`-`m5`,
  `m17`, `m19`, `m25`-`m29`) sem regressão.
