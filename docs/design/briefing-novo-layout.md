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
