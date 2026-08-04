# Handoff compartilhado do Tibé

Este arquivo é a memória operacional curta e versionada do projeto. Codex,
Claude Code e qualquer outro agente devem lê-lo depois de `AGENTS.md` ou
`CLAUDE.md`.

## Protocolo de manutenção

- Atualize este arquivo ao encerrar cada módulo ou rodada significativa.
- Registre apenas fatos verificados, nunca planos tratados como concluídos.
- Informe estado, escopo entregue, validações, commit/deploy, pendências e
  próximo passo autorizado.
- Substitua a seção "Estado atual" a cada rodada. Mantenha no histórico apenas
  as cinco rodadas mais recentes, com uma linha por rodada.
- Não salve segredos, credenciais, transcrições da conversa ou detalhes que já
  estejam claros na spec, no código ou no commit.
- Toda tarefa concluída recebe commit automático na branch de trabalho, com o
  handoff incluído no mesmo commit sempre que possível.
- O push da branch de trabalho é permitido. Merge na `main`, push direto para
  a `main` e deploy exigem aprovação explícita do usuário.

## Estado atual

- Atualizado em: 2026-08-04
- Última rodada: **app mobile retomado**, em duas partes no mesmo dia. Parte
  1 (commit `acc89a5`, já enviado): telas de escrita em Financeiro, nome da
  fazenda, correções de cor/tipo, validado só via `expo start --web`. Parte
  2 (esta atualização, ainda sem commit): **testado ao vivo num Android
  físico via Expo Go**, achou e corrigiu 2 problemas reais que só
  apareceram em dispositivo de verdade (ver abaixo), e um tema claro/escuro
  de verdade (a cor de fundo ainda era o cinza genérico do template do
  Expo). **Login e as 3 telas confirmadas funcionando num celular real.**
- Produção: <https://tibe-agrogestao.vercel.app/> em `de693bf` (layout
  completo) + `acc89a5` (parte 1 do mobile, sem efeito em produção: só o
  ajuste dev-only de CORS em `next.config.mjs`, confirmado que não aparece
  com `NODE_ENV=production`). Esta rodada (parte 2) não tem nada pra fazer
  deploy: é só `apps/mobile/**`.
- Banco: nenhuma mudança de schema. O Postgres local (Docker `tibe-pg`)
  caiu sozinho durante a sessão (uso prolongado) e foi religado
  (`docker start tibe-pg`): não é um problema do código, é só o container
  local; mencionado aqui porque causou um "Erro inesperado" confuso no
  login pelo celular até ser diagnosticado.

### Entregue nesta rodada (app mobile: telas de escrita + correções)

- **Telas de escrita na tela Financeiro** (`apps/mobile`, plano de
  arquitetura item 10, "registro rápido"): "marcar como pago" por
  lançamento (`PATCH .../:id/pay`) e "novo lançamento"
  (`POST /api/v1/financial-entries`, formulário mínimo: categoria, valor,
  observação opcional, vencimento sempre hoje, sem date picker de
  propósito). Escondidas na UI pra `VISUALIZADOR`; a garantia real
  continua sendo `guard("financeiro","write")` no back-end.
  **Rebanho, Máquinas e Tarefas continuam fora do app e de
  `packages/contracts`** (decisão deliberada documentada em várias specs):
  não reaberta nesta rodada, fica pra uma rodada própria com o usuário.
- **Tela Início mostra o nome real da fazenda**: `GET /api/v1/tenant`
  (criada na Onda 4 especificamente pra isso) nunca tinha sido consumida
  pelo app até agora.
- **2 achados corrigidos de caminho**: `Brand` (cores do app mobile) ainda
  usava o placeholder verde genérico da Onda 2 (`#2E7D32`), nunca
  atualizado pra paleta oficial do cliente corrigida na Onda 4 (`#649721`
  etc.): o painel web já usava a certa, o mobile não. `RelatedModule` no
  mobile também estava sem `"maquinas"` (mesma classe de gap já achada
  2x nesta sessão no lado web).
- **`node_modules` de `apps/mobile` nunca tinham sido instalados** nesta
  máquina: `tsc`/`lint`/`expo-doctor`/`expo export` de rodadas anteriores
  reportados como "limpos" no README não podiam ter rodado de verdade
  sem isso. Rodado `npm install` (590 pacotes) antes de validar esta
  rodada; achado um gap real de tipo (`TS2882`, import de `global.css`
  sem declaração ambiente) só visível depois da instalação, corrigido
  (`src/global.d.ts`).
- **`expo-secure-store` não tem implementação pra web** (quebra em runtime
  com "is not a function", só descoberto testando de verdade no
  navegador): `auth-storage.ts` ganhou fallback pra `localStorage` só
  quando `Platform.OS === "web"` (sem criptografia, aceitável só pra essa
  finalidade de desenvolvimento local; iOS/Android continuam 100% Keychain/
  Keystore, sem mudança).
- **CORS dev-only** (`next.config.mjs`, raiz do repo): `expo start --web`
  roda em origem diferente (`localhost:8081`) da API (`localhost:3000`);
  sem isso a tela de login nem conectava ("Não foi possível conectar ao
  servidor"). Cabeçalho só existe quando `NODE_ENV !== "production"`:
  confirmado que não vaza pra produção.
- Validado com navegador real, backend local, sessão logada de verdade:
  login, saldo do mês, nome da fazenda, lista de Rebanho (com as 2
  propriedades da Onda de layout), marcar como pago (item some da lista),
  novo lançamento (aparece na lista). `tsc --noEmit`, `expo lint`,
  `expo-doctor` (20/20) e `expo export --platform web` limpos.
- **Testado nesta rodada num Android físico** (não mais pendência): login,
  Início, Rebanho e Financeiro (incluindo marcar como pago) confirmados
  funcionando de ponta a ponta contra o back-end local.

### Entregue na parte 2 (teste em dispositivo real + correções)

- **Downgrade do Expo SDK 57 → 54** (`apps/mobile/package.json` e todas as
  dependências `expo-*`/React/React Native alinhadas via
  `npx expo install --fix` + reinstalação limpa): o Expo Go publicado nas
  lojas (Play Store/App Store) só suporta até o SDK 54 hoje, um projeto
  num SDK mais novo abre em **tela branca, sem erro nenhum visível**,
  mesmo com rede/back-end 100% acessíveis (só descoberto testando de
  verdade no celular; confirmado olhando "SDK version" no próprio Expo
  Go). Documentado como armadilha no README do app pra não se repetir.
  Efeito colateral do downgrade: `useColorScheme()` do React Native não
  tem mais o valor `"unspecified"` (só existia na versão mais nova);
  `use-theme.ts` corrigido pra usar `?? "light"` em vez de comparar com
  essa string.
- **Tema claro/escuro de verdade** (`constants/theme.ts`, `Colors`): a cor
  de fundo/texto ainda era o cinza genérico do template do Expo (preto
  puro no escuro), nunca trocada pela paleta do Tibé, mesmo depois de
  `Brand` (botões/destaques) já ter sido corrigido na parte 1. O painel
  web não tem modo escuro definido (só existe versão clara); o escuro do
  app mobile reusa a mesma paleta verde-escura já usada na barra lateral
  do painel (`tibe.darkest`/`tibe.dark`), não é uma cor nova inventada.
- **Achado, não é bug do código**: o Postgres local (Docker `tibe-pg`)
  caiu sozinho por uso prolongado da máquina durante a sessão; religado.
  Nada a corrigir no projeto.
- Validado com Expo Go num Android físico de verdade, contra o back-end
  local: login (inclusive o cenário de erro real do Postgres caído, que
  ajudou a confirmar que a mensagem de erro do app está correta), Início
  com nome da fazenda, Rebanho, Financeiro com "marcar como pago". `tsc
  --noEmit`, `expo lint`, `expo-doctor` (18/18 no SDK 54) e
  `expo export --platform web` limpos depois do downgrade.
- **Não testado ainda**: iPhone real (só Android testado até agora).

### Pendências e próximo passo

- Usuário quer **continuar dando funcionalidade ao app mobile**: próximo
  passo é decidir COM o usuário qual recurso vem a seguir (não assumir
  sozinho), incluindo se é hora de reabrir Rebanho/Máquinas/Tarefas pro
  mobile (ver ponto abaixo) ou aprofundar o que já existe (Financeiro,
  Início).
- Decidir com o usuário se/quando reabrir Rebanho, Máquinas e Tarefas
  para o app mobile e `packages/contracts` (decisão deliberada de ficarem
  de fora, documentada em specs de módulo; a extração de contrato de
  rebanho especificamente só devia acontecer depois de mudança de schema
  daquele domínio, que já aconteceu no Módulo 25, então a janela pra
  reabrir isso está tecnicamente aberta).
- Confirmações ainda pendentes da Agromax: modelo de rebanho por categoria
  (Módulo 25, sem confirmação formal), destino da Lavoura.
- Validação técnica das 3 calculadoras de confiança média (água, calagem,
  mão de obra) antes de uso real com clientes.
- Verificação do negócio na Meta: ainda não iniciada, item de maior prazo.
- Testar instalação do PWA (web) em Android/iPhone reais.
- **Achado, não corrigido, fora do escopo** (herdado da rodada anterior): o
  aviso de instalação do PWA sobrepõe o rodapé da sidebar no mobile
  (painel WEB, não o app `apps/mobile`).

## Histórico recente

- 2026-08-04: app mobile testado ao vivo num Android físico via Expo Go;
  downgrade pro SDK 54 (Expo Go da loja não suportava o 57 ainda, achado
  testando de verdade) e tema claro/escuro com a paleta oficial. Commit
  desta rodada pendente.
- 2026-08-04: app mobile: telas de escrita em Financeiro (marcar como
  pago, novo lançamento), nome da fazenda, cores oficiais corrigidas,
  `expo-secure-store` com fallback web, CORS dev-only. Commit `acc89a5`,
  enviado a pedido do usuário.
- 2026-08-04: push/deploy aprovado pelo usuário: `git push origin main`
  levou as 3 rodadas de layout (`3b65490`/`07f5210`/`de693bf`) pra
  produção de uma vez (Módulo 28 já estava lá desde antes).
- 2026-08-04: seletor de propriedade no topo (filtra o app inteiro) + menu
  de conta (Perfil/Minha senha/Sair) + página Perfil. Commit `de693bf`.
- 2026-08-04: Fase 2+3 do layout (KPIs, gráficos, Meu Dia+calendário,
  calculadoras, "Fazenda em Números" real) + seed de demonstração de 2
  anos. Commit `07f5210`.
