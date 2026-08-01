# Suporte a áudio e foto/PDF de recibo no agente WhatsApp (Plano de Implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente WhatsApp do Tibé passa a entender áudio (transcrito e
tratado como texto) e foto/PDF de recibo (extrai valor/categoria/fornecedor
e cria um lançamento financeiro após confirmação).

**Architecture:** Toda chamada de IA (transcrição, visão) acontece no N8N,
nunca no Tibé, o Tibé só ganha UMA intenção nova
(`registrar_lancamento_financeiro`) que segue o mesmo contrato HTTP e o
mesmo padrão de confirmação sim/não já usado por `registrar_movimento` e
`cadastrar_servico_ordem`. Áudio não toca o Tibé: vira texto antes de chegar
nele.

**Tech Stack:** Next.js/TypeScript (Tibé), N8N (workflow "Tibe - Atendimento
WhatsApp (Evolution)"), OpenAI (Whisper para áudio, GPT-4o/4o-mini vision
para recibo).

## Global Constraints

- Contrato de API do Tibé não muda: `POST /api/internal/whatsapp/execute-action`
  continua recebendo `{ tenant_id, user_id, intent, parameters, message_text?,
  confirmed? }` e devolvendo `{ reply_text, requires_confirmation,
  auxiliary_data, report_url }`.
- Categoria do lançamento só pode ser uma das
  `FINANCIAL_CATEGORIES` (`src/lib/category-suggestions.ts`): `Ração,
  Combustível, Mão de obra, Manutenção, Insumos, Veterinário, Outros`.
  Qualquer valor fora disso vira `"Outros"`.
- `registrar_lancamento_financeiro` **sempre** pede confirmação (não usa
  `CONFIRMATION_THRESHOLD`).
- Escopo: só despesa (`entry_type: "expense"`). Sem suporte a receita por
  foto, sem foto de animal/produção (fora de escopo desta spec).

---

## Task 1: Nova intenção `registrar_lancamento_financeiro`

**Files:**
- Modify: `src/lib/whatsapp-intents.ts`
- Modify: `src/lib/actions/whatsapp-router.ts`
- Test: `scripts/m11-financial-media-intent.test.ts`
- Modify: `package.json` (novo script `test:m11`)

**Interfaces:**
- Consumes: `createManualEntryAction(db, { entry_type, category, amount,
  due_date, notes }): Promise<ActionResult<{ id: string }>>` já existe em
  `src/lib/actions/financial-entries.ts`. `FINANCIAL_CATEGORIES` (readonly
  array de string) já existe em `src/lib/category-suggestions.ts`.
- Produces: intenção `"registrar_lancamento_financeiro"` disponível em
  `INTENTS`/`INTENT_ACCESS` (consumida pelo N8N na Task 2) e um novo `case`
  em `routeIntent` que qualquer chamador de `execute-action` pode usar
  passando `parameters: { amount: number, category?: string, vendor?:
  string, description?: string }`.

- [ ] **Step 1: Adicionar a intenção em `whatsapp-intents.ts`**

Em `src/lib/whatsapp-intents.ts`, adicione `"registrar_lancamento_financeiro"`
ao array `INTENTS` (antes de `"ambigua"`, que deve continuar por último) e
uma entrada em `INTENT_ACCESS`:

```ts
export const INTENTS = [
  "cadastrar_animal",
  "registrar_peso",
  "registrar_vacina",
  "registrar_movimento",
  "cadastrar_servico_ordem",
  "consultar_saldo",
  "consultar_animal",
  "consultar_cliente",
  "gerar_relatorio",
  "registrar_lancamento_financeiro",
  "ambigua",
] as const;
```

E em `INTENT_ACCESS` (mesmo arquivo), adicione antes da linha `ambigua:`:

```ts
  registrar_lancamento_financeiro: { module: "financeiro", action: "write" },
```

- [ ] **Step 2: Escrever o teste (vai falhar: case ainda não existe)**

Crie `scripts/m11-financial-media-intent.test.ts`:

```ts
import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

/**
 * Teste da intenção registrar_lancamento_financeiro (spec 2026-07-28: mídia
 * no agente WhatsApp, extração de recibo por imagem/PDF). Roda: `npm run test:m11`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

const SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

async function callExecute(input: {
  tenant_id: string;
  user_id: string;
  intent: string;
  parameters?: Record<string, unknown>;
  message_text?: string;
  confirmed?: boolean;
}) {
  const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify({ parameters: {}, ...input }),
  });
  const res = await executeAction(req);
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log("🔒 M11, registrar_lancamento_financeiro (recibo por mídia)\n");

  const tenant = await prisma.tenant.create({
    data: { name: "M11 Tenant", document: "M11A000000001", plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const owner = await db.user.create({
      data: scoped({
        name: "Owner M11",
        email: "m11-owner@test.local",
        password_hash: "x",
        role: "OWNER",
        phone: "5511900000099",
      }),
    });

    // ── amount ausente: pede pra informar, não grava nada ──────────
    const eMissing = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { category: "Combustível" },
    });
    assert(
      /valor/i.test(eMissing.body.data.reply_text) && eMissing.body.data.requires_confirmation === false,
      "amount ausente pede pra informar o valor, sem confirmação pendente",
    );
    const countAfterMissing = await db.financialEntry.count();
    assert(countAfterMissing === 0, "nenhum lançamento criado quando falta o valor");

    // ── pede confirmação, não grava antes de confirmar ──────────────
    const eAsk = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 450.5, category: "Combustível", vendor: "Posto XX" },
    });
    assert(eAsk.body.data.requires_confirmation === true, "pede confirmação mesmo com valor baixo (sempre confirma)");
    assert(
      /450[,.]50/.test(eAsk.body.data.reply_text) && /Combustível/.test(eAsk.body.data.reply_text),
      "resumo de confirmação mostra valor e categoria",
    );
    const countBeforeConfirm = await db.financialEntry.count();
    assert(countBeforeConfirm === 0, "nenhum lançamento criado antes de confirmar");

    // ── explicitNo cancela sem gravar ────────────────────────────────
    const eNo = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 450.5, category: "Combustível", vendor: "Posto XX" },
      message_text: "não",
    });
    assert(/cancelado/i.test(eNo.body.data.reply_text), "resposta 'não' cancela o lançamento");
    const countAfterNo = await db.financialEntry.count();
    assert(countAfterNo === 0, "nenhum lançamento criado após cancelar");

    // ── confirma: cria o FinancialEntry ──────────────────────────────
    const eConfirm = await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 450.5, category: "Combustível", vendor: "Posto XX" },
      message_text: "sim",
    });
    assert(
      eConfirm.body.data.requires_confirmation === false && /registrado/i.test(eConfirm.body.data.reply_text),
      "'sim' confirma e a resposta indica sucesso",
    );
    const entry = await db.financialEntry.findFirst({ where: { related_module: "geral", category: "Combustível" } });
    assert(!!entry, "FinancialEntry foi criado");
    assert(entry?.entry_type === "expense", "entry_type é despesa");
    assert(Number(entry?.amount) === 450.5, "amount gravado corretamente");
    assert(entry?.notes === "Posto XX", "vendor vai pro campo notes");
    assert(entry?.status === "pending", "nasce pending, igual qualquer lançamento manual");

    // ── categoria fora da lista fixa cai em "Outros" ─────────────────
    await callExecute({
      tenant_id: tenant.id,
      user_id: owner.id,
      intent: "registrar_lancamento_financeiro",
      parameters: { amount: 100, category: "categoria-inventada" },
      message_text: "sim",
    });
    const entryOutros = await db.financialEntry.findFirst({ where: { related_module: "geral", amount: 100 } });
    assert(entryOutros?.category === "Outros", "categoria fora da lista fixa vira 'Outros'");
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  }

  console.log("");
  if (failures === 0) console.log("✅ M11: 0 falhas.");
  else console.error(`❌ M11: ${failures} falha(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Adicione em `package.json`, na seção `scripts`, logo após `"test:m10"`:

```json
    "test:m11": "tsx scripts/m11-financial-media-intent.test.ts"
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m11
```

Esperado: falha (a intenção cai no `default: "ambigua"` porque o `case`
ainda não existe, as respostas não vão bater com os `assert`).

- [ ] **Step 4: Implementar o handler em `whatsapp-router.ts`**

No topo do arquivo, adicione aos imports existentes:

```ts
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { FINANCIAL_CATEGORIES } from "@/lib/category-suggestions";
```

Dentro do `switch (intent)`, adicione o `case` novo, pode ir logo depois do
`case "cadastrar_servico_ordem": { ... }` e antes de `case "consultar_saldo"`:

```ts
    case "registrar_lancamento_financeiro": {
      const amount = num(parameters.amount);
      const categoryRaw = str(parameters.category);
      const vendor = str(parameters.vendor);
      const description = str(parameters.description);

      if (amount == null) {
        return ask("Não consegui identificar o valor do lançamento. Pode informar quanto foi?");
      }

      const category = (FINANCIAL_CATEGORIES as readonly string[]).includes(categoryRaw ?? "")
        ? (categoryRaw as string)
        : "Outros";

      if (explicitNo) {
        return {
          reply_text: "Lançamento cancelado.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "registrar_lancamento_financeiro:cancelado",
        };
      }

      if (!confirmed) {
        return {
          reply_text: `Entendi: R$ ${amount.toFixed(2)}, categoria ${category}${vendor ? `, ${vendor}` : ""}. Confirma o lançamento?`,
          requires_confirmation: true,
          auxiliary_data: { amount, category, vendor, description },
          report_url: null,
          action_taken: "registrar_lancamento_financeiro:aguardando_confirmacao",
        };
      }

      const result = await createManualEntryAction(db, {
        entry_type: "expense",
        category,
        amount,
        due_date: new Date(),
        notes: vendor ?? description ?? null,
      });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Lançamento registrado: R$ ${amount.toFixed(2)}, ${category}${vendor ? `, ${vendor}` : ""}.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `registrar_lancamento_financeiro:${result.data.id}`,
      };
    }
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m11
```

Esperado: `✅ M11: 0 falhas.`

- [ ] **Step 6: Rodar `tsc --noEmit` e a suíte completa (garantir zero regressão)**

```powershell
npx tsc --noEmit
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation; npm run test:m1; npm run test:m2; npm run test:m3; npm run test:m4; npm run test:m5; npm run test:m6; npm run test:m7; npm run test:m9; npm run test:m10; npm run test:m11
```

Esperado: todos `0 falhas`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/whatsapp-intents.ts src/lib/actions/whatsapp-router.ts scripts/m11-financial-media-intent.test.ts package.json
git commit -m "Nova intenção registrar_lancamento_financeiro no agente WhatsApp"
```

---

## Task 2: Workflow N8N, áudio (Whisper) e recibo (visão)

**Files:** nenhum arquivo deste repositório, mudança inteiramente no
workflow "Tibe - Atendimento WhatsApp (Evolution)" hospedado no N8N
(Railway), via API REST do N8N.

**Interfaces:**
- Consumes: a intenção `registrar_lancamento_financeiro` da Task 1 (o ramo
  de recibo do N8N precisa enviar exatamente esse nome de intenção e os
  parâmetros `amount`/`category`/`vendor`/`description` pro
  `execute-action`). Credencial "OpenAI API Key" e "Tibe Internal Secret"
  já configuradas no N8N.
- Produces: nada consumido por outra task deste plano.

**Pré-requisito:** esta task precisa da URL base do N8N e de uma API key de
gerenciamento do N8N (`X-N8N-API-KEY`) pra ler/gravar o workflow via API
REST (`GET/PUT /api/v1/workflows/:id`), não estão nas variáveis de
ambiente deste projeto (N8N é infra externa). **Pausar e pedir esse acesso
ao usuário antes de iniciar esta task**, a menos que as credenciais já
estejam disponíveis na sessão atual.

- [ ] **Step 1: Buscar a definição atual do workflow**

```bash
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows/<workflow_id>" > /tmp/workflow-current.json
```

Ler o node "Normalizar e Filtrar" (Code node) pra entender exatamente como
o payload da Evolution é parseado hoje (campo `message.conversation` vs.
`message.audioMessage`/`message.imageMessage`/`message.documentMessage`), usar como base real pros próximos steps, não assumir o formato.

- [ ] **Step 2: Adicionar branch de áudio**

No node "Normalizar e Filtrar" (ou um IF logo depois dele), detectar
`message.audioMessage` presente. Quando presente:
1. Extrair o base64 (`message.audioMessage.base64` ou campo equivalente
   confirmado no Step 1).
2. Node HTTP Request → `POST https://api.openai.com/v1/audio/transcriptions`,
   `multipart/form-data` com `file` (o áudio decodificado) e `model:
   whisper-1`, autenticado com a credencial "OpenAI API Key" já existente.
3. Sucesso: usar o campo `text` da resposta como se fosse
   `message.conversation`, reconectar no MESMO caminho que já existe hoje
   pra mensagem de texto (entra em "Resolve Contact" → ... →
   "Classificar Intenção").
4. Falha na transcrição: node de resposta direta (POST
   `/api/internal/whatsapp/send-message`) com texto "Não consegui entender
   o áudio, pode tentar de novo ou digitar sua mensagem?", sem passar pelo
   resto do fluxo.

- [ ] **Step 3: Adicionar branch de recibo (imagem/PDF)**

Branch paralelo ao do Step 2: quando `message.imageMessage` presente OU
`message.documentMessage` com `mimetype: application/pdf`:
1. Extrair o base64 da mídia.
2. Se for PDF: renderizar a primeira página como imagem antes do próximo
   passo (node de conversão, escolher a ferramenta disponível no N8N na
   hora; se não houver nó nativo, usar um HTTP Request pra um serviço de
   conversão, ou pular PDF nesta primeira versão e cobrir só imagem, decisão de implementação, registrar no changelog do commit se PDF ficar
   de fora nesta rodada).
3. Node HTTP Request → OpenAI Chat Completions
   (`https://api.openai.com/v1/chat/completions`), modelo com visão
   (`gpt-4o-mini` ou `gpt-4o`, testar os dois com uma nota fiscal real e
   escolher o que ler melhor), mensagem com a imagem em base64 (`image_url`
   com `data:image/...;base64,...`) e um prompt de extração:

   ```
   Você recebe a foto ou digitalização de uma nota fiscal, cupom ou recibo
   de uma compra ou serviço contratado numa fazenda/prestadora de serviço
   agropecuária. Extraia os dados em JSON, exatamente neste formato, sem
   texto fora do JSON:

   { "amount": <número, valor total em reais, ou null se ilegível>,
     "category": <uma destas strings, a que melhor descreve a compra:
       "Ração", "Combustível", "Mão de obra", "Manutenção", "Insumos",
       "Veterinário", "Outros">,
     "vendor": <nome do fornecedor/estabelecimento, ou null>,
     "description": <descrição curta do que foi comprado, ou null> }
   ```

4. Parse do JSON retornado (Code node). Se `amount` vier `null`: node de
   resposta direta pedindo foto mais nítida ou lançamento manual, sem
   acionar `execute-action`.
5. Se `amount` veio ok: montar o body do `execute-action` com `intent:
   "registrar_lancamento_financeiro"` e `parameters: { amount, category,
   vendor, description }`, reusando o MESMO node "Execute Action" que já
   existe pro fluxo de texto (mesma URL, mesma credencial "Tibe Internal
   Secret"), não duplicar o node, só rotear pra ele.

- [ ] **Step 4: Salvar o workflow**

```bash
# Body: só {name, nodes, connections, settings}, a API rejeita campos
# read-only como id/createdAt/active/versionCounter (mesma armadilha já
# documentada no CLAUDE.md desta sessão).
curl -s -X PUT -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  -d @/tmp/workflow-updated.json \
  "$N8N_BASE_URL/api/v1/workflows/<workflow_id>"
```

- [ ] **Step 5: Testar de ponta a ponta**

Com o workflow publicado/ativo:
1. Mandar um áudio real pro número de teste ("...5522999745449" ou o número
   de teste configurado) perguntando algo simples (ex: "qual meu saldo?").
   Confirmar que a resposta bate com `consultar_saldo`.
2. Mandar uma foto de um recibo/nota real (ou printada). Confirmar que a
   resposta pede confirmação com valor/categoria corretos, responder "sim",
   e conferir no painel (`/financeiro`) que o lançamento foi criado com
   `related_module: geral`, status `pending`.
3. Reportar ao usuário os dois resultados (com prints/transcrição da
   conversa, já que não há teste automatizado pra esta parte, mudança é
   só no N8N).

- [ ] **Step 6: Documentar**

Atualizar `docs/n8n-whatsapp-workflow.md` com os dois novos ramos (áudio e
recibo), no mesmo nível de detalhe do resto do documento (nó a nó). Atualizar
`CLAUDE.md`/`AGENTS.md` na seção do agente WhatsApp mencionando que áudio e
recibo por imagem/PDF agora são suportados, e commitar.
