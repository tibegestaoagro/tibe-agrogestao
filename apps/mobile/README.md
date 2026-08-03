# Tibé Mobile

Esqueleto do aplicativo React Native (Expo) do Tibé (AgroGestão). Cliente
**standalone** do mesmo back-end que o painel web usa: sem regra de negócio
própria, sem banco, sem `tenant_id` guardado localmente. Toda decisão de
produto continua vivendo em `src/lib/actions/*` no back-end (raiz do repo);
este app só autentica, chama `/api/v1/*` e mostra o que a API devolve.

Contexto completo da decisão de arquitetura:
[`docs/arquitetura/plano-separacao-e-mobile.md`](../../docs/arquitetura/plano-separacao-e-mobile.md)
(seção 2.5, "seam de aplicativo").

## Escopo desta rodada (Onda 2, agente B2)

- Login por email/senha contra `POST /api/v1/auth/token`.
- Sessão persistente: o refresh token (30 dias) fica no `expo-secure-store`
  (Keychain/Keystore); ao reabrir o app, uma renovação silenciosa troca esse
  refresh por um par novo (`POST /api/v1/auth/token/refresh`, uso único:
  o back-end invalida o token apresentado a cada renovação).
- Três telas de leitura: Início (saldo do mês), Rebanho (lista de animais) e
  Financeiro (contas a pagar/a receber).
- Sem telas de escrita, sem push nativo, sem qualquer cálculo/regra de
  negócio dentro do app (ver `src/lib/auth-context.tsx` e os comentários de
  cada tela para a justificativa e a rota exata usada por cada uma).

## Como rodar

```bash
cd apps/mobile
npm install
cp .env.example .env   # ajuste EXPO_PUBLIC_API_BASE_URL, ver comentários no arquivo
npm run start
```

Abra no Expo Go (celular físico) ou num simulador/emulador a partir do menu
que o `expo start` mostra no terminal.

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
      index.tsx           Início: usuário logado + saldo do mês
      rebanho.tsx          lista de animais
      financeiro.tsx        contas a pagar / a receber (alternador local)
  lib/
    config.ts           resolve EXPO_PUBLIC_API_BASE_URL
    auth-storage.ts      wrapper do expo-secure-store (refresh token + cache de usuário)
    api-client.ts         fetch cru + tipos de erro (ApiError, AuthExpiredError)
    auth-context.tsx       seam de identidade: login, refresh com rotação, logout, authedFetch
    format.ts             formatação de moeda/data (sem regra de negócio)
  types/
    api.ts               tipos que espelham o contrato real das rotas consumidas
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
| Início (saldo do mês) | `GET /api/v1/financial/cash-flow?group_by=month` | sem `start`/`end`: o back-end já aplica o mês corrente por padrão |
| Rebanho | `GET /api/v1/animals` | exige perfil "fazenda" ativo no tenant |
| Financeiro (a pagar) | `GET /api/v1/financial-entries?status=pending&entry_type=expense` | |
| Financeiro (a receber) | `GET /api/v1/financial-entries?status=pending&entry_type=income` | |

## Gaps conhecidos desta rodada

- **Não existe rota `/api/v1` que devolva o nome da fazenda/tenant.** O
  painel web busca isso direto no Prisma dentro de um Server Component
  (`(dashboard)/layout.tsx`), não por HTTP. Como o escopo desta rodada é
  só `apps/mobile/**`, a tela Início mostra apenas o nome de quem logou
  (devolvido pelo próprio login), não o nome da fazenda. Resolver isso
  exigiria uma rota nova e aditiva no back-end (ex.: `GET /api/v1/tenant`
  passando a aceitar `GET` além do `PATCH` que já existe hoje), fora do
  escopo de arquivos desta rodada.
- **Sem notificação push** (decisão 9 do briefing: depende de credencial
  Apple/Google, ainda não provisionada).
- **Sem telas de escrita.**
- **Sem teste automatizado dentro do app** (não há Jest configurado nesta
  rodada): a validação desta entrega foi manual/end-to-end contra o
  back-end real, mais `tsc --noEmit`, `expo lint` e `expo-doctor` limpos, e
  um `expo export --platform web` bem-sucedido como prova de que todo o
  grafo de módulos resolve e empacota sem erro.
