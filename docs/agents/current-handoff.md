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
- Última rodada: **app mobile retomado** (pausa desde o início da
  iniciativa de layout, que fechou com push/deploy aprovado em `de693bf`,
  já em produção). Usuário pediu telas de escrita e avisou que só vai
  validar no dia seguinte: esta rodada é código real, testado em navegador
  (via `expo start --web`, com um ajuste local pra viabilizar isso, ver
  abaixo), mas **ainda não testado em Android/iPhone físico/emulador**.
- Produção: <https://tibe-agrogestao.vercel.app/> em `de693bf` (layout
  completo). Esta rodada (app mobile) não tem nada pra fazer deploy (é um
  app separado, sem build/publicação nesta rodada) além do ajuste dev-only
  em `next.config.mjs`, que não muda o comportamento em produção
  (confirmado rodando `next start` com `NODE_ENV=production` e conferindo
  que o header CORS não aparece).
- Banco: nenhuma mudança de schema nesta rodada.

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
- **Não testado**: instalação/uso num Android ou iPhone real (Expo Go ou
  build nativo), pendência que já existia, continua.

### Pendências e próximo passo

- **Testar o app mobile num aparelho Android/iPhone real ou emulador**
  (Expo Go): nunca foi feito, nem nesta rodada nem nas anteriores.
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

- 2026-08-04: app mobile retomado: telas de escrita em Financeiro (marcar
  como pago, novo lançamento), nome da fazenda na tela Início, cores
  oficiais corrigidas, `expo-secure-store` com fallback web, CORS dev-only.
  Validado em navegador contra o back-end local; não testado em
  Android/iPhone reais. Commit desta rodada pendente.
- 2026-08-04: push/deploy aprovado pelo usuário: `git push origin main`
  levou as 3 rodadas de layout (`3b65490`/`07f5210`/`de693bf`) pra
  produção de uma vez (Módulo 28 já estava lá desde antes).
- 2026-08-04: seletor de propriedade no topo (filtra o app inteiro) + menu
  de conta (Perfil/Minha senha/Sair) + página Perfil. Commit `de693bf`.
- 2026-08-04: Fase 2+3 do layout (KPIs, gráficos, Meu Dia+calendário,
  calculadoras, "Fazenda em Números" real) + seed de demonstração de 2
  anos. Commit `07f5210`.
- 2026-08-04: Fase 1 do layout (sidebar escura + nova IA de navegação +
  topbar simplificada) implementada e validada. Commit `3b65490`.
