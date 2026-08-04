# Tibé Mobile

Esqueleto do aplicativo React Native (Expo) do Tibé (AgroGestão). Cliente
**standalone** do mesmo back-end que o painel web usa: sem regra de negócio
própria, sem banco, sem `tenant_id` guardado localmente. Toda decisão de
produto continua vivendo em `src/lib/actions/*` no back-end (raiz do repo);
este app só autentica, chama `/api/v1/*` e mostra o que a API devolve.

Contexto completo da decisão de arquitetura:
[`docs/arquitetura/plano-separacao-e-mobile.md`](../../docs/arquitetura/plano-separacao-e-mobile.md)
(seção 2.5, "seam de aplicativo").

## Escopo

- Login por email/senha contra `POST /api/v1/auth/token`.
- Sessão persistente: o refresh token (30 dias) fica no `expo-secure-store`
  (Keychain/Keystore); ao reabrir o app, uma renovação silenciosa troca esse
  refresh por um par novo (`POST /api/v1/auth/token/refresh`, uso único:
  o back-end invalida o token apresentado a cada renovação).
- Três telas: Início (saldo do mês + nome da fazenda), Rebanho (lista de
  animais, só leitura) e Financeiro (contas a pagar/a receber, com escrita:
  ver abaixo).
- **Telas de escrita** (retomada da pausa pro redesign do painel web,
  plano de arquitetura item 10, "registro rápido"): na tela Financeiro,
  "marcar como pago" por lançamento (`PATCH .../:id/pay`) e "novo
  lançamento" (`POST /api/v1/financial-entries`, formulário mínimo:
  categoria, valor, observação opcional, vencimento sempre hoje). Ambas
  escondidas pra quem só lê (`VISUALIZADOR`) na UI; a garantia de verdade
  continua sendo o `guard("financeiro", "write")` no back-end.
- **Rebanho, Máquinas e Tarefas (Meu Dia) continuam fora de escopo**, tanto
  aqui quanto em `packages/contracts` (decisão deliberada, documentada em
  várias specs de módulo): reabrir essa decisão fica pra uma rodada própria,
  com o usuário.
- Sem push nativo, sem qualquer cálculo/regra de negócio dentro do app (ver
  `src/lib/auth-context.tsx` e os comentários de cada tela para a
  justificativa e a rota exata usada por cada uma).

## Como rodar

```bash
cd apps/mobile
npm install
cp .env.example .env   # ajuste EXPO_PUBLIC_API_BASE_URL, ver comentários no arquivo
npm run start
```

Abra no Expo Go (celular físico) ou num simulador/emulador a partir do menu
que o `expo start` mostra no terminal.

**⚠️ Armadilha: versão do Expo Go instalada precisa suportar o SDK deste
projeto.** O app Expo Go da loja (Play Store/App Store) só entende UMA
janela de versões de SDK por vez (a mais recente que a Expo já liberou pra
ele); um projeto num SDK mais novo que o suportado abre em tela branca,
sem erro nenhum visível, mesmo com a rede e o backend 100% acessíveis
(confirmado ao vivo: SDK 57 → Expo Go só suportava até o 54 → tela branca,
Metro sem receber nenhum pedido do celular). Verifique em Expo Go →
perfil/configurações → "SDK version" antes de gastar tempo depurando rede.
Este projeto está fixado no **SDK 54** justamente por causa disso; ao
atualizar o `expo` no futuro, confira a compatibilidade do Expo Go
publicado antes de subir de versão de novo.

O back-end (`next dev`, na raiz do repo) precisa estar rodando e acessível a
partir de onde o app roda:

- Simulador iOS ou navegador (`npm run web`): `http://localhost:3000` funciona.
- Emulador Android: use `http://10.0.2.2:3000` (loopback do host visto de
  dentro do emulador).
- Celular físico (Expo Go): use o IP da máquina na rede local, ex.
  `http://192.168.0.10:3000`. `localhost` no celular aponta para o próprio
  celular, nunca para o computador.

Credenciais de teste (seed do projeto, ver `CLAUDE.md`/`AGENTS.md` na raiz):
`owner@damata.com.br` / `tibe123`.

## Estrutura

```
src/
  app/
    _layout.tsx        raiz: decide (tabs) vs login a partir do AuthProvider
    login.tsx           tela de login (fora do grupo autenticado)
    (tabs)/
      _layout.tsx        navegação por abas
      index.tsx           Início: usuário logado + nome da fazenda + saldo do mês
      rebanho.tsx          lista de animais (só leitura)
      financeiro.tsx        contas a pagar / a receber (alternador local) + escrita
  components/
    financeiro/
      new-entry-form.tsx    formulário de "registro rápido" (novo lançamento)
  lib/
    config.ts           resolve EXPO_PUBLIC_API_BASE_URL
    auth-storage.ts      wrapper do expo-secure-store (refresh token + cache de usuário)
    api-client.ts         fetch cru + tipos de erro (ApiError, AuthExpiredError)
    auth-context.tsx       seam de identidade: login, refresh com rotação, logout, authedFetch
    format.ts             formatação de moeda/data (sem regra de negócio)
  types/
    api.ts               tipos que espelham o contrato real das rotas consumidas
  global.d.ts             declaração ambiente pro import de efeito colateral de global.css
```

Nenhuma dependência de `packages/contracts` nesta rodada (decisão explícita
do briefing desta onda): os tipos em `src/types/api.ts` são declarados aqui
mesmo, lidos direto do código-fonte das rotas (não uma versão idealizada do
contrato).

## Rotas da API consumidas

| Tela / fluxo | Rota | Observação |
|---|---|---|
| Login | `POST /api/v1/auth/token` | `{ email, password }` → par de tokens + usuário |
| Renovação silenciosa | `POST /api/v1/auth/token/refresh` | uso único, rotaciona os dois tokens |
| Logout | `POST /api/v1/auth/token/revoke` | melhor esforço, não bloqueia o logout local |
| Início (nome da fazenda) | `GET /api/v1/tenant` | criada na Onda 4 especificamente pra suprir este gap; só passou a ser consumida aqui nesta rodada |
| Início (saldo do mês) | `GET /api/v1/financial/cash-flow?group_by=month` | sem `start`/`end`: o back-end já aplica o mês corrente por padrão |
| Rebanho | `GET /api/v1/animals` | exige perfil "fazenda" ativo no tenant |
| Financeiro (a pagar) | `GET /api/v1/financial-entries?status=pending&entry_type=expense` | |
| Financeiro (a receber) | `GET /api/v1/financial-entries?status=pending&entry_type=income` | |
| Financeiro (marcar como pago) | `PATCH /api/v1/financial-entries/:id/pay` | `guard("financeiro", "write")`: sem efeito para `VISUALIZADOR` |
| Financeiro (novo lançamento) | `POST /api/v1/financial-entries` | sempre `related_module: geral`, mesma regra do painel web |

## Gaps conhecidos

- **Sem notificação push** (decisão 9 do briefing: depende de credencial
  Apple/Google, ainda não provisionada).
- **Rebanho, Máquinas e Tarefas continuam só leitura ou inexistentes**
  (decisão deliberada, ver seção "Escopo" acima).
- **Sem seletor de data no formulário de novo lançamento**: vencimento é
  sempre "hoje" (sem dependência de date picker nesta rodada, de propósito:
  "registro rápido" é registrar o que já aconteceu, não agendar pro
  futuro). Se precisar registrar uma conta com vencimento futuro, siga
  usando o painel web.
- **Sem teste automatizado dentro do app** (não há Jest configurado): a
  validação de cada rodada é manual/end-to-end contra o back-end real, mais
  `tsc --noEmit`, `expo lint` e `expo-doctor` limpos, e um
  `expo export --platform web` bem-sucedido como prova de que todo o grafo
  de módulos resolve e empacota sem erro.
