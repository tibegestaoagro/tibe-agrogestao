---
paths:
  - "src/app/api/**"
  - "src/lib/actions/**"
  - "src/lib/serializers.ts"
  - "src/lib/serialize.ts"
---
<!-- Carrega sozinho ao ler um arquivo que casa com os globs acima.
     Contrato de resposta, onde a regra de negocio mora e como serializar. Sao as tres coisas que um endpoint novo erra quando ninguem lembra delas. -->

## Padrões de API

- Sucesso: `{ data, meta }`. Erro: `{ error: { code, message } }`. Helpers em
  `src/lib/api.ts` (`apiOk`, `apiError`, `ApiErrors`).
- Rotas de negócio (`/api/v1/*`) autenticam por **sessão**: use o guard
  padrão:

  ```ts
  import { guard, readJson } from "@/lib/api-guard";

  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;
  // g.db (client escopado) e g.user disponíveis
  ```

  `guard(module, "read"|"write", { profile? })` checa sessão + permissão por
  role (matriz do PRD §5.2, em `src/lib/permissions.ts`) + perfil de tenant
  ativo (fazenda/prestador), tudo de uma vez.

- Rotas internas (`/api/internal/*`, chamadas pelo N8N) autenticam por
  **secret no header** (`x-internal-secret` contra `INTERNAL_API_SECRET`), não
  por sessão: `src/lib/internal-guard.ts` (`requireInternalSecret`). Dentro
  delas, a *role* do usuário é sempre **relida do banco** a partir de
  `user_id`+`tenant_id`; nunca confie em role vinda do caller.
- Rotas de webhook (`/api/webhooks/*`) seguem a mesma ideia (token no header,
  não sessão). Só existe `POST /api/webhooks/asaas` (M5): o webhook do
  WhatsApp vai para o N8N, não para o Tibé (ver seção do agente abaixo), então
  `/api/webhooks/whatsapp` continua não existindo (seria código morto).

---

## Lógica de negócio: `src/lib/actions/*`

Toda regra de negócio (criar animal, registrar pesagem, calcular GMD, gerar
`FinancialEntry` de uma venda, etc.) vive em `src/lib/actions/*.ts`, **não**
dentro do route handler. As rotas HTTP (`/api/v1/...`) são wrappers finos:
validam com Zod, chamam a action, serializam a resposta. O agente WhatsApp
(`/api/internal/whatsapp/execute-action`) chama as **mesmas** actions
diretamente. Isso foi um refactor deliberado no Módulo 3 (a pedido do usuário,
"deixar liso para trazer modificações depois"): ao adicionar/editar uma
regra de negócio, mude na action, não duplique lógica na rota.

Padrão de retorno (`src/lib/actions/types.ts`):

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };
```

Arquivos principais: `animals.ts`, `service-orders.ts`, `service-clients.ts`,
`properties.ts`, `financial-summary.ts`, `billing.ts` (M5, assinatura Asaas),
`users.ts` (M5, convite/role/ativação). Lançamentos financeiros automáticos
sempre passam por `createLinkedEntry()` (`src/lib/financial.ts`): nunca crie
`FinancialEntry` manualmente fora dela nas actions existentes.

---

## Serialização

Prisma devolve `Decimal` e `Date`; os contratos de API usam `number` e string
ISO8601. Use sempre `decToNum()` / `isoOrNull()` (`src/lib/serialize.ts`) e os
serializers prontos em `src/lib/serializers.ts`: não formate objetos Prisma à
mão numa resposta de API.

---
