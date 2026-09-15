# Agente do WhatsApp, Fase 1: fundação. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar a entrada do workflow, tornar confirmação e idempotência seguras, e corrigir os defeitos de handler que o WhatsApp expõe, antes de qualquer intenção nova ir ao ar.

**Architecture:** correções no Tibé, cada uma com caso na suíte nova `m67` chamando `POST /api/internal/whatsapp/execute-action` direto (o mesmo caminho do n8n), provado falhando antes da correção. No n8n, só a segurança da entrada, primeiro numa cópia de homologação criada pela API e depois, com aprovação, na produção.

**Tech Stack:** Next.js 16 route handlers, Prisma 7, Redis (pendentes), tsx para suítes, API REST do n8n (`X-N8N-API-KEY`).

**Spec:** `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md`

## Global Constraints

- Suítes rodam contra Docker local: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"` inline, nunca o `.env`.
- Toda trava nova é vista falhando antes de passar (desfazer a correção e rodar).
- Regra de negócio em `src/lib/actions/*`; a rota não ganha lógica.
- Número e data pelos parsers (`whatsapp-handlers/parsers.ts`, `src/lib/numero-br.ts`), nunca `Number()` ou `new Date()` cru.
- Nunca travessão (U+2014). Commits em português, `Área: descrição`.
- Workflow de produção do n8n, merge e push na `main`: só com aprovação do usuário a cada vez. Homologação e tenant BANCO DE PROVAS: livres.
- Nenhum detalhe de como explorar a entrada do workflow vai para o repositório antes de a correção estar em produção.

---

### Task 1: esqueleto da suíte `m67`

**Files:**
- Create: `scripts/m67-agente-fundacao.test.ts`
- Modify: `package.json` (entrada `test:m67` depois de `test:m66`)

**Interfaces:**
- Produces: `acao(intent, parameters, message_text?, extra?)` que devolve `{ status, data }` da rota; `db`, `tenant`, `owner`, `fazenda`, `pasto` para as tarefas seguintes; `check(nome, cond, detalhe?)`.

- [ ] **Step 1: escrever o esqueleto**

```ts
import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Agente do WhatsApp, Fase 1 (fundação). Spec:
 * docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md.
 * Chama a rota execute-action como o n8n chama. Roda: `npm run test:m67`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "m67-segredo";

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { POST } = await import("@/app/api/internal/whatsapp/execute-action/route");
  const { recordMovement } = await import("@/lib/actions/herd-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M67 ${stamp}`, document: `M67${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);
  try {
    await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
    const owner = await prisma.user.create({
      data: { tenant_id: tenant.id, name: "Dono M67", email: `m67-${stamp}@teste.local`, password_hash: "x", role: "OWNER", active: true },
    });
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M67" }) });
    const pasto = await db.pasture.create({ data: scoped({ property_id: fazenda.id, name: "Pasto M67", area_hectares: 10 }) });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 100,
      to: { category_id: "macho_25_36", property_id: fazenda.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
    });

    let seq = 0;
    const acao = async (
      intent: string,
      parameters: Record<string, unknown>,
      message_text?: string,
      extra: Record<string, unknown> = {},
    ) => {
      seq += 1;
      const res = await POST(
        new Request("http://localhost/api/internal/whatsapp/execute-action", {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET! },
          body: JSON.stringify({ tenant_id: tenant.id, user_id: owner.id, intent, parameters, message_text: message_text ?? null, ...extra }),
        }),
      );
      const corpo = await res.json();
      return { status: res.status, data: corpo.data ?? corpo, seq };
    };

    console.log("🤖 M67: agente do WhatsApp, fundação\n");
    // As seções das tarefas seguintes entram aqui, em ordem.
    void acao;
    void fazenda;
    void pasto;
  } finally {
    const { deleteTestTenants } = await import("./helpers/herd");
    await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
    await deleteTestTenants([tenant.id]);
  }
}

main()
  .then(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\n✅ M67: 0 falhas." : `\n❌ M67: ${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\n❌ M67 quebrou:", e);
    process.exit(1);
  });
```

- [ ] **Step 2: registrar e rodar**

`package.json`, depois de `"test:m66"`: `"test:m67": "tsx scripts/m67-agente-fundacao.test.ts",`

Run: `DATABASE_URL=... REDIS_URL=... npm run test:m67`
Expected: `✅ M67: 0 falhas.` (sem seções ainda). Se `deleteTestTenants` falhar por chave estrangeira, acrescentar o `deleteMany` da tabela que travou antes dele, como a `m66` faz.

- [ ] **Step 3: commit**

`git add scripts/m67-agente-fundacao.test.ts package.json && git commit -m "Agente: esqueleto da suite da fundacao (m67)"`

---

### Task 2: confirmação estrita

**Files:**
- Modify: `src/lib/actions/confirmation.ts` (lógica inteira de `detectConfirmation`)
- Test: `scripts/m67-agente-fundacao.test.ts` (seção 1, função pura, sem banco)

**Interfaces:**
- Produces: `detectConfirmation(text): "yes" | "no" | null`, mesma assinatura, regra nova.

A regra nova: **sim** só quando a mensagem é curta, começa por palavra de sim, não tem dígito e não tem palavra de recusa; **não** sempre que começa por palavra de recusa, em qualquer tamanho e com ou sem número (a recusa vence tudo: deixar de cancelar grava, cancelar por engano só repete a pergunta); qualquer conflito é `null` (o handler pergunta de novo). "para" e "parar" saem da lista de recusa: são preposição no português do produtor.

- [ ] **Step 1: escrever os casos (antes do `const tenant`, no topo de `main`)**

```ts
  const { detectConfirmation } = await import("@/lib/actions/confirmation");
  console.log("1. Confirmação estrita");
  const esperado: [string, "yes" | "no" | null][] = [
    ["sim", "yes"], ["Sim, pode", "yes"], ["pode sim", "yes"], ["ok", "yes"], ["isso mesmo", "yes"],
    ["confirmo a venda", "yes"], ["não", "no"], ["Não, deixa pra lá", "no"], ["cancela", "no"], ["esquece isso", "no"],
    ["pode lançar 500 de diesel", null], ["ok, anota 500 de diesel", null], ["para o João", null],
    ["para amanhã me lembra de vacinar", null], ["pode cancelar", null], ["isso aí não é boi", null],
    ["sim mas foram 30 e não 20", null], ["não sei quanto foi, uns 20", "no"], ["não, foram 30 e não 20", "no"], ["não, deixa pra lá, depois eu vejo isso", "no"],
  ];
  for (const [frase, resp] of esperado) {
    const r = detectConfirmation(frase);
    check(`"${frase}" -> ${resp}`, r === resp, String(r));
  }
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npm run test:m67` (com as URLs inline). Expected: falham ao menos "pode lançar 500 de diesel", "ok, anota 500 de diesel", "para o João", "para amanhã...", "pode cancelar", "isso aí não é boi".

- [ ] **Step 3: implementar**

Substituir as listas e a função em `src/lib/actions/confirmation.ts` (manter o comentário histórico do topo e acrescentar o porquê desta mudança):

```ts
const YES_WORDS = ["sim", "s", "confirmo", "confirmado", "confirma", "isso mesmo", "isso", "correto", "pode", "ok", "beleza", "positivo", "certo"];
const NO_WORDS = [
  "não", "nao", "n", "cancela", "cancelar", "cancelado", "errado", "negativo",
  "deixa pra la", "deixa pra lá", "deixa quieto", "esquece", "esquecer",
  "melhor nao", "melhor não", "nao quero", "não quero",
];
/** Palavra de recusa em QUALQUER posição: desempata "pode cancelar" e "isso aí não é". */
const NEGACAO_SOLTA = new Set(["não", "nao", "cancela", "cancelar", "errado", "esquece"]);
const MAX_PALAVRAS_SIM = 5;


export function detectConfirmation(text?: string | null): "yes" | "no" | null {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(/[.,;:!?…]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const palavras = t.split(" ");
  const comeca = (lista: string[]) => lista.some((w) => t === w || t.startsWith(`${w} `));
  const temDigito = /\d/.test(t);
  const temNegacao = palavras.some((p) => NEGACAO_SOLTA.has(p));

  if (comeca(NO_WORDS)) return "no";
  if (comeca(YES_WORDS) && !temNegacao && !temDigito && palavras.length <= MAX_PALAVRAS_SIM) return "yes";
  return null;
}
```

- [ ] **Step 4: rodar e ver passar; rodar as suítes que dependem de confirmação**

Run: `npm run test:m67`, depois `npm run test:m36`, `test:m34`, `test:m51`, `test:m65`.
Expected: todas verdes. Se uma suíte antiga usava frase longa como confirmação ("sim, pode registrar a venda dos bois"), trocar a frase do teste por uma curta e anotar no commit: a regra mudou de propósito.

- [ ] **Step 5: commit**

`git commit -am "Agente: confirmacao so por resposta curta, sem digito e sem negacao"`

---

### Task 3: idempotência por intenção

**Files:**
- Modify: `src/app/api/internal/whatsapp/execute-action/route.ts` (bloco do `providerMessageId`, leitura e gravação)
- Test: `scripts/m67-agente-fundacao.test.ts` (seção 2)

**Interfaces:**
- Produces: a chave gravada em `AgentRequest.provider_message_id` passa a ser `` `${wamid}#${intent}` ``. Sem migração: a coluna é texto e o índice único continua `(tenant_id, provider_message_id)`.

- [ ] **Step 1: escrever o caso**

```ts
    console.log("\n2. Idempotência por intenção");
    {
      const wamid = `WAMID-${stamp}`;
      const a = await acao("consultar_rebanho", {}, "quantos animais e o que tenho a pagar", { provider_message_id: wamid });
      const b = await acao("resumo", { scope: "contas_a_pagar" }, "quantos animais e o que tenho a pagar", { provider_message_id: wamid });
      check("a segunda intenção da mesma mensagem EXECUTA", b.data.action_taken !== a.data.action_taken, `${a.data.action_taken} / ${b.data.action_taken}`);
      const c = await acao("consultar_rebanho", {}, "quantos animais e o que tenho a pagar", { provider_message_id: wamid });
      check("a mesma intenção repetida devolve a resposta anterior", c.data.reply_text === a.data.reply_text);
      const gravados = await db.agentRequest.count({ where: { provider_message_id: { startsWith: wamid } } });
      check("duas chaves gravadas, uma por intenção", gravados === 2, String(gravados));
    }
```

- [ ] **Step 2: ver falhar**

Expected: "a segunda intenção da mesma mensagem EXECUTA" falha (a rota devolve a resposta da primeira).

- [ ] **Step 3: implementar**

Na rota, logo depois de `const providerMessageId = ...`:

```ts
  // A chave inclui a intenção: uma mensagem com duas intenções chega em duas
  // chamadas com o mesmo wamid, e a segunda recebia a resposta da primeira.
  const chaveIdempotencia = providerMessageId ? `${providerMessageId}#${intent}` : null;
```

Trocar `providerMessageId` por `chaveIdempotencia` no `findFirst` e no `create`, e o `if (providerMessageId)` dos dois blocos por `if (chaveIdempotencia)`.

- [ ] **Step 4: ver passar**, e rodar `npm run test:isolation`.

- [ ] **Step 5: commit** `git commit -am "Agente: idempotencia por intencao, para mensagem com dois pedidos"`

---

### Task 4: ajuste de rebanho pelo WhatsApp

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/herd.ts` (`registrarMovimentacaoRebanho`, montagem de origem e destino)
- Test: `scripts/m67-agente-fundacao.test.ts` (seção 3)

**Interfaces:**
- Consumes: regra do livro-razão em `src/lib/actions/herd-ledger.ts`: `ajuste` exige origem OU destino, nunca os dois.
- Produces: `registrar_movimentacao_rebanho` com `movement_type: "ajuste"` aceita `sentido: "entrada" | "saida"` (aliases `direcao`); sem sentido, pergunta "Esse ajuste aumenta ou diminui o rebanho?" guardando pendente no campo `sentido`.

- [ ] **Step 1: escrever o caso**

```ts
    console.log("\n3. Ajuste de rebanho");
    {
      const antes = (await db.herdMovement.count({ where: { movement_type: "ajuste" } }));
      const p = { movement_type: "ajuste", itens: [{ categoria: "macho_25_36", quantidade: 2 }], pasto: "Pasto M67", sentido: "saida" };
      await acao("registrar_movimentacao_rebanho", p, "tinha 2 bois a menos na contagem");
      const r = await acao("registrar_movimentacao_rebanho", p, "sim", { confirmed: true });
      const depois = await db.herdMovement.count({ where: { movement_type: "ajuste" } });
      check("o ajuste confirmado grava", depois === antes + 1, `${r.data.action_taken}: ${r.data.reply_text}`);
      const semSentido = await acao("registrar_movimentacao_rebanho", { movement_type: "ajuste", itens: [{ categoria: "macho_25_36", quantidade: 1 }] }, "ajusta 1 boi");
      check("sem sentido, pergunta se aumenta ou diminui", /aumenta ou diminui/i.test(semSentido.data.reply_text), semSentido.data.reply_text);
    }
```

- [ ] **Step 2: ver falhar** (a gravação é recusada pelo livro-razão).
- [ ] **Step 3: implementar.** No handler, quando `movement_type === "ajuste"`: ler `sentido`/`direcao` (`"entrada"`, `"entrou"`, `"a mais"` => entrada; `"saida"`, `"saiu"`, `"a menos"` => saída); sem valor reconhecido, `await guardar("sentido")` e perguntar a frase acima; com valor, montar só `to` (entrada) ou só `from` (saída) com a mesma posição que o handler já calcula. Acrescentar `sentido` aos campos pendentes do domínio `herd`.
- [ ] **Step 4: ver passar**; rodar `npm run test:m32` e as suítes de rebanho do WhatsApp (`grep -l registrar_movimentacao_rebanho scripts/*.test.ts`).
- [ ] **Step 5: commit** `git commit -am "Rebanho: ajuste pelo WhatsApp grava com um lado so, e pergunta o sentido"`

---

### Task 5: receita no lançamento financeiro

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/financeiro.ts` (as duas chamadas com `entry_type: "expense"`, linhas ~112 e ~133)
- Test: `scripts/m67-agente-fundacao.test.ts` (seção 4)

**Interfaces:**
- Produces: `registrar_lancamento_financeiro` aceita `tipo` (`"receita"`, `"recebi"`, `"income"` => income; `"despesa"`, `"paguei"`, `"gastei"`, `"expense"` => expense). Sem `tipo`, continua despesa (compatível com o recibo por foto). A confirmação diz "receita" ou "despesa" explicitamente.

- [ ] **Step 1: caso**

```ts
    console.log("\n4. Receita pelo WhatsApp");
    {
      const p = { amount: 1500, category: "Aluguel", tipo: "receita", description: "aluguel do pasto" };
      const pergunta = await acao("registrar_lancamento_financeiro", p, "recebi 1500 de aluguel do pasto");
      check("a confirmação diz que é receita", /receita|receber|recebi/i.test(pergunta.data.reply_text), pergunta.data.reply_text);
      await acao("registrar_lancamento_financeiro", p, "sim", { confirmed: true });
      const entrada = await db.financialEntry.findFirst({ where: { amount: 1500, category: "Aluguel" } });
      check("grava como receita", entrada?.entry_type === "income", String(entrada?.entry_type));
    }
```

- [ ] **Step 2: ver falhar.** **Step 3:** ler `tipo` com a tabela acima e passar `entry_type` às duas chamadas; ajustar o texto da confirmação. **Step 4:** ver passar; `npm run test:m12` e a suíte do recibo (`grep -l registrar_lancamento_financeiro scripts/*.test.ts`). **Step 5:** `git commit -am "Financeiro: lancamento pelo WhatsApp distingue receita de despesa"`

---

### Task 6: serviço prestado nasce agendado quando não foi feito

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/servico.ts` (`registrarServicoPrestado`, a partir da linha ~584, e o ponto que grava `status: "concluido"`, linha ~928)
- Test: `scripts/m67-agente-fundacao.test.ts` (seção 5)

**Interfaces:**
- Produces: `registrar_servico_prestado` aceita `concluido` (via `interpretarSim`) e `data` (via `lerData`). `concluido` falso, ou `data` futura, grava `agendado` e SEM produção; `concluido` verdadeiro ou data passada/ausente com verbo no passado grava como hoje. A quantidade dita num agendado vira `quantidade_prevista`, não produção realizada.

- [ ] **Step 1: caso** (antes, criar a máquina e o contato que o handler exige, lendo `servico.ts` para os campos mínimos):

```ts
    console.log("\n5. Serviço prestado agendado e depois iniciado");
    {
      await db.machine.create({ data: scoped({ name: "Trator M67", property_id: fazenda.id }) });
      const p = { servico: "gradagem", maquina: "Trator M67", quem: "Joao M67", valor: 2000, quantidade: 8, unidade: "hectare", concluido: false };
      await acao("registrar_servico_prestado", p, "vou fazer gradagem de 8 hectares pro Joao por 2 mil");
      await acao("registrar_servico_prestado", p, "sim", { confirmed: true });
      const job = await db.serviceJob.findFirst({ where: { description: { contains: "gradagem" } } });
      check("nasce agendado", job?.status === "agendado", String(job?.status));
      const inicio = await acao("iniciar_servico", { quem: "Joao M67" }, "comecei a gradagem do Joao");
      check("iniciar_servico o encontra", !/não achei|não encontrei|nenhum/i.test(inicio.data.reply_text), inicio.data.reply_text);
    }
```

- [ ] **Step 2: ver falhar.** **Step 3:** implementar a regra da interface; se o schema de `ServiceJob` não tiver campo de quantidade prevista, guardar a quantidade na observação do serviço e registrar no commit (sem migração nesta fase). **Step 4:** ver passar; `npm run test:m58` e suítes de serviço (`grep -l registrar_servico_prestado scripts/*.test.ts`). **Step 5:** `git commit -am "Servicos: prestado que ainda nao foi feito nasce agendado"`

---

### Task 7: combustível sem saldo responde em vez de quebrar

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/servico.ts` (`registrarCombustivelServico`, linha ~813)
- Test: `scripts/m67-agente-fundacao.test.ts` (seção 6)

- [ ] **Step 1: caso**

```ts
    console.log("\n6. Diesel sem saldo");
    {
      await db.product.create({ data: scoped({ name: "Diesel M67", unit: "litro" }) });
      const p = { quem: "Joao M67", produto: "Diesel M67", quantidade: 50 };
      await acao("iniciar_servico", { quem: "Joao M67" }, "sim", { confirmed: true });
      await acao("registrar_combustivel_servico", p, "gastei 50 litros de diesel na gradagem");
      const r = await acao("registrar_combustivel_servico", p, "sim", { confirmed: true });
      check("responde 200 com frase, não 500", r.status === 200 && typeof r.data.reply_text === "string", `${r.status}`);
      check("a frase fala de saldo", /saldo|estoque|tem só|não tem/i.test(r.data.reply_text ?? ""), r.data.reply_text);
    }
```

- [ ] **Step 2: ver falhar** (status 500). **Step 3:** envolver a gravação que lança em `try/catch` só para a recusa de saldo do estoque (a mesma classe/código que `stock-ledger.ts` usa) e devolver `failReply` com a mensagem; qualquer outro erro continua subindo. **Step 4:** ver passar. **Step 5:** `git commit -am "Servicos: diesel sem saldo vira resposta, nao erro 500"`

---

### Task 8: pagamento de trabalhador guarda o nome ao perguntar o valor

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/mao-de-obra.ts` (`registrarPagamentoTrabalhador`, bloco `if (valor === null)`, linha ~325)
- Test: seção 7

- [ ] **Step 1: caso**

```ts
    console.log("\n7. Pagamento sem valor previsto");
    {
      await acao("registrar_trabalhador", { nome: "Pedro M67", tipo: "fixo" }, "cadastra o Pedro como fixo");
      await acao("registrar_trabalhador", { nome: "Pedro M67", tipo: "fixo" }, "sim", { confirmed: true });
      const pergunta = await acao("registrar_pagamento_trabalhador", { nome: "Pedro M67" }, "paguei o Pedro");
      check("pergunta o valor", /valor|quanto/i.test(pergunta.data.reply_text), pergunta.data.reply_text);
      const resposta = await acao("registrar_pagamento_trabalhador", { valor: 2500 }, "2500");
      check("a resposta só com o valor lembra do Pedro", /Pedro/.test(resposta.data.reply_text), resposta.data.reply_text);
    }
```

- [ ] **Step 2: ver falhar.** **Step 3:** antes do `return ask(...)` do valor ausente, `await guardar("valor")` com os parâmetros atuais (o nome resolvido incluso), no mesmo mecanismo que o handler já usa para os outros campos. **Step 4:** ver passar; `npm run test:m55` e suítes de mão de obra. **Step 5:** `git commit -am "Mao de obra: pagamento sem valor previsto guarda quem foi pago"`

---

### Task 9: o "sim" vai para o pedido mais recente, de qualquer domínio

**Files:**
- Modify: `src/lib/actions/whatsapp-router.ts` (bloco "Sim com compra de estoque pendente", linha ~431)
- Modify: `src/lib/actions/whatsapp-handlers/leite.ts` (fábrica de lactação, linha ~311: o pendente guarda o `gesto` e só o mesmo gesto consome o "sim")
- Test: seção 8

- [ ] **Step 1: caso**

```ts
    console.log("\n8. O sim pertence ao pedido mais recente");
    {
      await db.product.create({ data: scoped({ name: "Sal M67", unit: "saca" }) });
      await acao("registrar_negocio_produto", { tipo: "compra", produto: "Sal M67", quantidade: 10, valor: 1200 }, "comprei 10 sacas de sal por 1200");
      await new Promise((r) => setTimeout(r, 20));
      await acao("definir_vacas_em_lactacao", { quantidade: 32, fazenda: "Fazenda M67" }, "estou com 32 vacas dando leite");
      await acao("registrar_entrada_lactacao", {}, "sim", { confirmed: true });
      const compras = await db.stockMovement.count({ where: { movement_type: "compra" } });
      check("o sim NÃO gravou a compra de sal, que era mais antiga", compras === 0, String(compras));
      const entradas = await db.milkLactationEntry.count({ where: { entry_type: "entrada" } });
      check("nem uma ENTRADA de lactação onde se perguntou a contagem", entradas === 0, String(entradas));
    }
```

(Conferir no `schema.prisma` o nome real do model e do campo de lactação e do tipo de movimento de compra de estoque antes de rodar; ajustar só os nomes.)

- [ ] **Step 2: ver falhar.** **Step 3:** no roteador, só desviar o "sim" para o estoque quando o pendente de estoque for o MAIS RECENTE entre todos os domínios (usar `salvo_em`, como o desvio de resposta curta já faz); no leite, o pendente de lactação carrega o `gesto` e o handler de outro gesto não consome o "sim". **Step 4:** ver passar; `npm run test:m44` (estoque), `test:m52`, `test:m53`, `test:m54`. **Step 5:** `git commit -am "Agente: o sim confirma o pedido mais recente, e lactacao nao troca de gesto"`

---

### Task 10: cadastro assistido não engole assunto novo e pergunta a fazenda

**Files:**
- Modify: `src/lib/actions/whatsapp-router.ts` (`INTERRUPTING`)
- Modify: `src/lib/actions/whatsapp-flow-bridge.ts` (linha ~179, `props[0]`)
- Test: seção 9

- [ ] **Step 1: caso**

```ts
    console.log("\n9. Cadastro assistido");
    {
      await db.property.create({ data: scoped({ name: "Fazenda B M67" }) });
      const abre = await acao("cadastrar_animal", { count: 1 }, "quero cadastrar um boi");
      check("com duas fazendas, pergunta qual", /qual fazenda|em qual/i.test(abre.data.reply_text), abre.data.reply_text);
      const outro = await acao("consultar_meu_dia", {}, "o que tenho pra hoje");
      check("assunto novo com gesto próprio não vira resposta de campo", !/brinco|raça|macho ou fêmea/i.test(outro.data.reply_text), outro.data.reply_text);
    }
```

- [ ] **Step 2: ver falhar.** **Step 3:** trocar a lista fixa `INTERRUPTING` pela regra "toda intenção diferente de `ambigua` e de `cadastrar_animal` interrompe, e o formulário continua depois"; no bridge, com mais de uma propriedade ativa e sem `property_name`, perguntar "Em qual fazenda?" com a lista antes de abrir o fluxo. **Step 4:** ver passar; `npm run test:m3`, `test:m25`. **Step 5:** `git commit -am "Agente: cadastro assistido pergunta a fazenda e deixa assunto novo passar"`

---

### Task 11: compra da lista pede confirmação

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/lista-de-compra.ts` (`comprei_item_lista`)
- Test: seção 10

- [ ] **Step 1: caso**

```ts
    console.log("\n10. Comprei item da lista");
    {
      await acao("adicionar_item_lista", { item: "Arame M67", quantidade: 2, unidade: "rolo" }, "anota 2 rolos de arame");
      await acao("adicionar_item_lista", { item: "Arame M67", quantidade: 2, unidade: "rolo" }, "sim", { confirmed: true });
      const r = await acao("comprei_item_lista", { item: "Arame M67", valor: 380 }, "comprei o arame por 380");
      check("pergunta antes de gravar a compra com valor", r.data.requires_confirmation === true, r.data.reply_text);
      const lanc = await db.financialEntry.count({ where: { amount: 380 } });
      check("e não lançou ainda", lanc === 0, String(lanc));
    }
```

- [ ] **Step 2: ver falhar.** **Step 3:** com valor informado, guardar pendente em `confirmacao` e devolver o resumo ("Comprou 2 rolos de Arame por R$ 380,00? Vou lançar a despesa e tirar da lista."); o "sim" executa o guardado; sem valor, comportamento atual. **Step 4:** ver passar; `npm run test:m62` (lista). **Step 5:** `git commit -am "Lista de compra: comprei com valor confirma antes de lancar"`

---

### Task 12: período em `consultar_saldo` e `gerar_relatorio`

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/financeiro.ts` (`consultarSaldo`, `gerarRelatorio`)
- Modify: `src/lib/actions/whatsapp-handlers/parsers.ts` (novo `lerMes`)
- Test: seção 11

**Interfaces:**
- Produces: `lerMes(v: unknown, agora = new Date()): { ano: number; mes: number } | null`, aceitando `"2026-08"`, `"08/2026"`, `"agosto"`, `"agosto de 2026"`, `"mes passado"`, `"este mes"`.

- [ ] **Step 1: caso** (função pura)

```ts
    console.log("\n11. Período");
    {
      const { lerMes } = await import("@/lib/actions/whatsapp-handlers/parsers");
      const ref = new Date("2026-09-14T15:00:00Z");
      const casos: [string, string | null][] = [
        ["2026-08", "2026-8"], ["08/2026", "2026-8"], ["agosto", "2026-8"], ["agosto de 2025", "2025-8"],
        ["mes passado", "2026-8"], ["este mês", "2026-9"], ["qualquer coisa", null],
      ];
      for (const [t, e] of casos) {
        const r = lerMes(t, ref);
        check(`lerMes("${t}")`, (r ? `${r.ano}-${r.mes}` : null) === e, JSON.stringify(r));
      }
    }
```

- [ ] **Step 2: ver falhar** (função não existe). **Step 3:** implementar `lerMes` com a tabela de meses sem acento; `consultarSaldo` e `gerarRelatorio` usam `lerMes(parameters.period)` e, quando `null` com texto presente, perguntam "De qual mês?" em vez de cair no mês atual calado. **Step 4:** ver passar; suíte do relatório (`grep -l gerar_relatorio scripts/*.test.ts`). **Step 5:** `git commit -am "Financeiro: saldo e relatorio entendem o mes dito pelo produtor"`

---

### Task 13: rebanho só pelo livro-razão, e venda do confinamento sai do lote

**Files:**
- Modify: `src/lib/actions/whatsapp-handlers/rebanho.ts` (`cadastrarAnimal`: sem categoria, perguntar em vez de "Não classificado")
- Modify: `src/lib/actions/whatsapp-router.ts` (`desempatarIntencao`)
- Test: seção 12

- [ ] **Step 1: caso**

```ts
    console.log("\n12. Livro-razão e confinamento");
    {
      const semCat = await acao("cadastrar_animal", { ear_tag: "M67-1", breed: "Nelore", sex: "male", property_name: "Fazenda M67" }, "cadastra o boi M67-1 nelore macho");
      check("sem categoria, pergunta a categoria", /categoria/i.test(semCat.data.reply_text), semCat.data.reply_text);

      const { createConfinementSite, openConfinementStay } = await import("@/lib/actions/confinement");
      const site = await createConfinementSite(db, { name: "Conf M67", type: "proprio", property_id: fazenda.id });
      if (site.ok) await openConfinementStay(db, { confinement_site_id: site.data.id, category_id: "macho_25_36", quantity: 10, pasture_id: pasto.id });
      const r = await acao("registrar_negocio_gado", { tipo: "venda", categoria: "boi", quantidade: 5, valor: 25000 }, "vendi 5 bois do confinamento por 25 mil");
      check("a venda que cita o confinamento vira saída do lote", /confinamento/i.test(r.data.reply_text) && r.data.action_taken?.startsWith("encerrar_confinamento"), `${r.data.action_taken}: ${r.data.reply_text}`);
    }
```

- [ ] **Step 2: ver falhar.** **Step 3:** em `cadastrarAnimal`, sem `category` resolvível pelas 12 categorias, perguntar "Qual a categoria? (ex: bezerro, novilha de 13 a 24 meses, vaca, boi, garrote, touro)" e não criar o lote; em `desempatarIntencao`, `registrar_negocio_gado` com venda e `message_text` contendo "confinamento" ou "boitel", com lote aberto no tenant, vira `encerrar_confinamento` mapeando `quantidade` e `valor`. **Step 4:** ver passar; `npm run test:m3`, `test:m36`, `test:m51`, `test:m66`. **Step 5:** `git commit -am "Rebanho: cadastro pede categoria, e venda do confinamento sai do lote"`

---

### Task 14: segurança da entrada do workflow

**Files:**
- n8n (API): cópia de homologação do workflow `UAAA96aJFiiFsQCL`, depois o de produção
- Modify: `docs/n8n-whatsapp-workflow.md` (tirar a URL da instância da linha 15)
- Create: `C:\Users\dilto\AppData\Local\Temp\...\scratchpad\n8n\` backup do JSON antes de qualquer PUT (fora do repositório)

- [ ] **Step 1: backup** do JSON atual de produção (o script `n8n-export.mjs` já existe no scratchpad); confirmar que o arquivo tem 36 nós.
- [ ] **Step 2: criar a homologação** com `POST /api/v1/workflows` a partir do JSON exportado: nome `Tibe - Atendimento WhatsApp (homologacao)`, webhook `atendimento-homologacao`, `pinData` vazio, inativo; ativar com `POST /api/v1/workflows/{id}/activate`.
- [ ] **Step 3: nó de guarda** logo depois do Webhook, na homologação: um nó Code que descarta (retorna `[]`) quando `body.instance` ou `body.apikey` não batem com os valores esperados da instância, e quando o `remoteJid` termina em `@g.us` ou é `status@broadcast`. Os valores esperados ficam só dentro do nó, no n8n, nunca no repositório.
- [ ] **Step 4: provar nos dois sentidos** na homologação: POST sem `apikey` não gera execução que chegue ao Resolve Contact (conferir em `GET /api/v1/executions?workflowId=...`); POST com o corpo válido chega.
- [ ] **Step 5: pedir aprovação ao usuário** para aplicar o mesmo nó e limpar o `pinData` no workflow de produção (PUT), e aplicar só com o "sim".
- [ ] **Step 6: provar em produção** com uma chamada sem chave (não deve chegar ao Tibé) e um `npm run wa diga "quantos animais eu tenho"` pelo banco de provas (deve responder). Se o `npm run wa` usar corpo sem `apikey`, ajustar `scripts/whatsapp-e2e.ts` para mandar o formato da Evolution com a chave lida do `.env`.
- [ ] **Step 7: docs** tirar a URL da instância de `docs/n8n-whatsapp-workflow.md`; commit `git commit -am "Agente: entrada do workflow confere a instancia e descarta o resto"`. Só depois disso a auditoria técnica pode entrar em `docs/agents/agente-whatsapp/`.

---

### Task 15: fechamento da fase

- [ ] **Step 1:** `npx tsc --noEmit`, `npm run lint`, `npm run check`, `npm run test:all -- --sem-redis` com as URLs inline. Tudo verde.
- [ ] **Step 2:** quebrar de propósito duas correções (confirmação e idempotência) e ver a `m67` falhar; restaurar.
- [ ] **Step 3:** `npm run wa` pelo banco de provas, um roteiro curto com: recusa ("não, deixa pra lá"), "pode lançar 500 de diesel" (não pode gravar sem pergunta), mensagem com dois pedidos. Colar a conversa no handoff.
- [ ] **Step 4:** atualizar `docs/agents/current-handoff.md` (estado da fase, pendência do chip de homologação) e `docs/agents/dividas.md` se algo ficou de fora.
- [ ] **Step 5:** pedir ao usuário merge e push na `main`.

---

## Self-review

- Cobertura da spec (Fase 1): segurança da entrada (T14), confirmação estrita (T2), idempotência por intenção (T3), defeitos 1 (T4), 2 (T5), 3 (T6), 4 (T7), 5 (T8), 6 e 7 (T9), 8 (T10), 9 (T11), 10 (T12), 11 e 12 (T13). O legado sai do classificador na Fase 2, quando o registro de intenções nasce.
- Nomes de model e campo que não conferi linha a linha (lactação, compra de estoque, máquina, produto) estão marcados para conferência no próprio passo, sem mudar a regra do teste.
