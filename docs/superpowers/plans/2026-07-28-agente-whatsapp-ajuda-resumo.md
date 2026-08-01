# Agente WhatsApp: ajuda e resumo (Plano de Implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente WhatsApp ganha duas intenções novas, `ajuda` (resposta
fixa de como usar cada recurso) e `resumo` (funil de perguntas que termina
em dado real do rebanho/lavoura/prestador/financeiro), e o fallback
`ambigua` fica menos robótico.

**Architecture:** Mesmo padrão das 11 intenções existentes
(`whatsapp-intents.ts` + `whatsapp-router.ts`, classificadas pelo LLM no
N8N). `ajuda` devolve texto fixo de uma tabela. `resumo` reusa as mesmas
queries Prisma que já alimentam `/dashboard`, sem action nova (mesmo
padrão de `src/app/(dashboard)/dashboard/page.tsx`, que já consulta
`db.animal.count`/`db.plot.count`/etc. direto, sem passar por
`src/lib/actions/*`). O funil de perguntas do `resumo` não usa estado
novo, reusa o mecanismo já existente de o LLM reconstruir a intenção a
partir de `recent_history` na próxima mensagem (mesmo mecanismo da
confirmação sim/não e do "qual das suas propriedades?").

**Tech Stack:** TypeScript, Prisma 7, tsx (scripts de teste).

## Global Constraints

- Contrato HTTP de `POST /api/internal/whatsapp/execute-action` não muda.
- `resumo` e `ajuda`: `INTENT_ACCESS` com `module: null, action: "read"`
  (sem perfil obrigatório no nível da intenção, a checagem de perfil
  acontece dentro do handler, por tópico/escopo).
- Categorias fixas do `resumo`: nível 1 = `rebanho`(fazenda) /
  `lavoura`(fazenda) / `prestador`(prestador) / `financeiro`(sempre);
  nível 2 (só sob `prestador`) = `clientes` / `agendamentos` /
  `contas_a_receber`.
- Nenhum estado de conversa novo no Tibé, toda a lógica de "já
  perguntei, não pergunto de novo" fica no prompt do LLM (N8N), não no
  router.

---

## Task 1: Intenções `ajuda` e `resumo` em `whatsapp-intents.ts`

**Files:**
- Modify: `src/lib/whatsapp-intents.ts`

**Interfaces:**
- Produces: `"ajuda"` e `"resumo"` como membros válidos de `Intent`,
  reconhecidos por `isIntent()`. `INTENT_ACCESS["ajuda"]` e
  `INTENT_ACCESS["resumo"]` = `{ module: null, action: "read" }`.

- [ ] **Step 1: Adicionar as duas intenções**

Em `src/lib/whatsapp-intents.ts`, altere `INTENTS` (adicione antes de
`"ambigua"`, que continua por último):

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
  "ajuda",
  "resumo",
  "ambigua",
] as const;
```

E em `INTENT_ACCESS`, adicione antes da linha `ambigua:`:

```ts
  ajuda: { module: null, action: "read" },
  resumo: { module: null, action: "read" },
```

- [ ] **Step 2: `tsc --noEmit` só pra confirmar que compila**

```powershell
npx tsc --noEmit
```

Esperado: sem erros (nada mais no código usa essas intenções ainda, é só
o tipo `Intent` crescendo).

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp-intents.ts
git commit -m "Adiciona intencoes ajuda e resumo ao contrato do agente WhatsApp"
```

---

## Task 2: Handlers `ajuda` e `resumo` em `whatsapp-router.ts`

**Files:**
- Modify: `src/lib/actions/whatsapp-router.ts`
- Test: `scripts/m12-ajuda-resumo.test.ts`
- Modify: `package.json` (novo script `test:m12`)

**Interfaces:**
- Consumes: `listUpcomingVaccinations(db, days)` de
  `src/lib/actions/animals.ts` (já existe, retorna
  `{ ear_tag: string|null, days_remaining: number, ... }[]`).
  `getBalanceAction(db, period)` de `src/lib/actions/financial-summary.ts`
  (já existe, `ActionResult<{ balance: number; ... }>`). `db.plot.count`,
  `db.serviceClient.count`, `db.serviceOrder.count`,
  `db.serviceOrder.aggregate` (Prisma direto, `db: TenantPrismaClient` já
  disponível em `routeIntent`). `decToNum` de `@/lib/serialize` (já
  importado no arquivo).
- Produces: `case "ajuda"` e `case "resumo"` dentro do `switch (intent)`
  de `routeIntent`, cada um devolvendo `RouterResult` (mesmo tipo dos
  outros `case`s).

- [ ] **Step 1: Escrever o teste (vai falhar: os `case`s ainda não existem)**

Crie `scripts/m12-ajuda-resumo.test.ts`:

```ts
import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

/**
 * Teste das intenções ajuda e resumo (spec 2026-07-28). Roda: `npm run test:m12`
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
  console.log("🔒 M12, ajuda e resumo\n");

  // ── Tenant A: os dois perfis (fazenda + prestador) ──────────────────
  const tenantA = await prisma.tenant.create({
    data: { name: "M12 Tenant A", document: "M12A00000001", plan: "grupo" },
  });
  const dbA = prismaForTenant(tenantA.id);

  // ── Tenant B: só fazenda ─────────────────────────────────────────────
  const tenantB = await prisma.tenant.create({
    data: { name: "M12 Tenant B", document: "M12B00000002", plan: "fazenda" },
  });
  const dbB = prismaForTenant(tenantB.id);

  try {
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });
    await dbA.tenantProfile.create({ data: scoped({ profile_type: "prestador" }) });
    await dbB.tenantProfile.create({ data: scoped({ profile_type: "fazenda" }) });

    const ownerA = await dbA.user.create({
      data: scoped({ name: "Owner A", email: "m12-owner-a@test.local", password_hash: "x", role: "OWNER" }),
    });
    const ownerB = await dbB.user.create({
      data: scoped({ name: "Owner B", email: "m12-owner-b@test.local", password_hash: "x", role: "OWNER" }),
    });

    // ── dados reais pro resumo ────────────────────────────────────────
    const propA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    const animal = await dbA.animal.create(
      { data: scoped({ ear_tag: "M12-1", breed: "Nelore", sex: "male", property_id: propA.id }) },
    );
    const vaccine = await dbA.vaccine.create({ data: scoped({ name: "Aftosa M12" }) });
    await dbA.animalVaccination.create({
      data: scoped({
        animal_id: animal.id,
        vaccine_id: vaccine.id,
        applied_at: new Date(),
        next_due_at: new Date(Date.now() + 5 * 86_400_000),
      }),
    });

    const client = await dbA.serviceClient.create({ data: scoped({ name: "Cliente M12" }) });
    const service = await dbA.service.create(
      { data: scoped({ name: "Diária M12", pricing_type: "fixed", unit_price: 100 }) },
    );
    await dbA.serviceOrder.create({
      data: scoped({
        service_client_id: client.id,
        service_id: service.id,
        quantity: 1,
        total_value: 100,
        status: "scheduled",
      }),
    });
    await dbA.serviceOrder.create({
      data: scoped({
        service_client_id: client.id,
        service_id: service.id,
        quantity: 1,
        total_value: 250.5,
        status: "completed",
        performed_at: new Date(),
      }),
    });

    // ── ajuda: tópico específico ──────────────────────────────────────
    const helpAnimal = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "ajuda",
      parameters: { topic: "cadastrar_animal" },
    });
    assert(/brinco/i.test(helpAnimal.body.data.reply_text), "ajuda cadastrar_animal explica o brinco");

    // ── ajuda: tópico de perfil não-ativo (tenant B só tem fazenda) ────
    const helpOrdemSemPerfil = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "ajuda",
      parameters: { topic: "cadastrar_servico_ordem" },
    });
    assert(
      /não est[aá] habilitado/i.test(helpOrdemSemPerfil.body.data.reply_text),
      "ajuda sobre tópico de perfil não-ativo avisa que não está disponível",
    );

    // ── ajuda: geral (sem topic), lista só o disponível pro perfil ─────
    const helpGeralB = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "ajuda",
      parameters: {},
    });
    assert(
      /cadastro de animais/i.test(helpGeralB.body.data.reply_text) &&
        !/ordens de serviço/i.test(helpGeralB.body.data.reply_text),
      "ajuda geral do tenant só-fazenda não menciona ordens de serviço",
    );

    // ── resumo: escopo vazio, tenant com os dois perfis → pergunta nível 1
    const resumoAskA = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: {},
    });
    assert(
      /Rebanho/.test(resumoAskA.body.data.reply_text) &&
        /Prestador/.test(resumoAskA.body.data.reply_text) &&
        /Financeiro/.test(resumoAskA.body.data.reply_text),
      "resumo sem escopo (2 perfis) pergunta as 4 categorias",
    );

    // ── resumo: escopo vazio, tenant só fazenda → não pergunta sobre prestador
    const resumoAskB = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "resumo",
      parameters: {},
    });
    assert(
      /Rebanho/.test(resumoAskB.body.data.reply_text) && !/Prestador/.test(resumoAskB.body.data.reply_text),
      "resumo sem escopo (só fazenda) não oferece Prestador",
    );

    // ── resumo: rebanho (folha, dado real) ─────────────────────────────
    const resumoRebanho = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "rebanho" },
    });
    assert(/1 animal/i.test(resumoRebanho.body.data.reply_text), "resumo rebanho mostra 1 animal ativo");
    assert(/5 dia/.test(resumoRebanho.body.data.reply_text), "resumo rebanho mostra a próxima vacina em 5 dias");

    // ── resumo: prestador (nível 2, pergunta) ──────────────────────────
    const resumoPrestador = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "prestador" },
    });
    assert(
      /Clientes/.test(resumoPrestador.body.data.reply_text) &&
        /Agendamentos/.test(resumoPrestador.body.data.reply_text) &&
        /Contas a receber/.test(resumoPrestador.body.data.reply_text),
      "resumo prestador pergunta o nível 2",
    );

    // ── resumo: clientes (folha nível 2, dado real) ────────────────────
    const resumoClientes = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "clientes" },
    });
    assert(/1 cliente/i.test(resumoClientes.body.data.reply_text), "resumo clientes mostra 1 cliente cadastrado");

    // ── resumo: contas_a_receber (soma total_value das completed) ──────
    const resumoContas = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "contas_a_receber" },
    });
    assert(
      /1 ordem/i.test(resumoContas.body.data.reply_text) && /250[,.]50/.test(resumoContas.body.data.reply_text),
      "resumo contas_a_receber soma corretamente (1 ordem completed, R$ 250,50)",
    );

    // ── resumo: agendamentos (só a scheduled) ──────────────────────────
    const resumoAgendamentos = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "resumo",
      parameters: { scope: "agendamentos" },
    });
    assert(/1 ordem/i.test(resumoAgendamentos.body.data.reply_text), "resumo agendamentos mostra 1 ordem scheduled");

    // ── resumo: escopo de prestador sem o perfil ativo (tenant B) ──────
    const resumoClientesSemPerfil = await callExecute({
      tenant_id: tenantB.id,
      user_id: ownerB.id,
      intent: "resumo",
      parameters: { scope: "clientes" },
    });
    assert(
      /não est[aá] habilitado/i.test(resumoClientesSemPerfil.body.data.reply_text),
      "resumo clientes sem perfil prestador avisa que não está disponível",
    );

    // ── ambigua: texto novo, menos robótico ─────────────────────────────
    const ambigua = await callExecute({
      tenant_id: tenantA.id,
      user_id: ownerA.id,
      intent: "ambigua",
      parameters: {},
    });
    assert(
      /cadastrado/i.test(ambigua.body.data.reply_text) && /o que você faz/i.test(ambigua.body.data.reply_text),
      "ambigua convida a perguntar 'o que você faz?' em vez de só pedir pra reformular",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ M12: 0 falhas.");
  else console.error(`❌ M12: ${failures} falha(s).`);
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

Adicione em `package.json`, na seção `scripts`, logo após `"test:m11"`:

```json
    "test:m12": "tsx scripts/m12-ajuda-resumo.test.ts"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m12
```

Esperado: falha (os `case`s `ajuda`/`resumo` ainda caem no `default:
"ambigua"` do switch, então nenhuma das respostas bate com os `assert`).

- [ ] **Step 3: Implementar os handlers**

No topo de `src/lib/actions/whatsapp-router.ts`, adicione ao import
existente de `@/lib/actions/animals.ts` a função `listUpcomingVaccinations`:

```ts
import {
  createAnimalAction,
  findAnimalByEarTag,
  addWeightLogAction,
  addVaccinationAction,
  findVaccineByName,
  addMovementAction,
  getAnimalSummaryAction,
  listUpcomingVaccinations,
} from "@/lib/actions/animals";
```

Depois das constantes existentes (`MOVEMENT_LABEL`, `SEX_LABEL`,
`STATUS_LABEL`, `REPORT_TYPE_MODULE`), adicione:

```ts
const HELP_TEXT: Record<string, { text: string; profile?: ProfileType; label: string }> = {
  cadastrar_animal: {
    label: "cadastro de animais",
    profile: "fazenda",
    text: "Pra cadastrar um animal, me manda o brinco, a raça e o sexo (macho ou fêmea). Se tiver mais de uma propriedade, diz também em qual delas. Exemplo: 'cadastra o boi 1234, nelore, macho'.",
  },
  registrar_peso: {
    label: "pesagens",
    profile: "fazenda",
    text: "Pra registrar o peso, me manda o brinco do animal e o peso em kg. Exemplo: 'pesei o boi 1234, deu 280 quilos'.",
  },
  registrar_vacina: {
    label: "vacinas",
    profile: "fazenda",
    text: "Pra registrar uma vacina, me manda o brinco do animal e o nome da vacina (o custo é opcional). Exemplo: 'vacinei o boi 1234 contra aftosa'.",
  },
  registrar_movimento: {
    label: "compra/venda/transferência de animais",
    profile: "fazenda",
    text: "Pra compra, venda, transferência ou morte de um animal, me manda o brinco e o tipo. Se for venda ou compra, pode dizer o valor também. Se for transferência, me diz pra qual propriedade. Exemplo: 'vendi o boi 1234 por 8000 reais'.",
  },
  cadastrar_servico_ordem: {
    label: "ordens de serviço",
    profile: "prestador",
    text: "Pra registrar uma ordem de serviço, me manda o nome do cliente e o serviço prestado. Exemplo: 'fiz uma diária de trator pro cliente João'.",
  },
  consultar_saldo: {
    label: "consulta de saldo",
    text: "É só perguntar! Pode pedir o saldo do mês atual ou de um mês específico. Exemplo: 'qual meu saldo de junho'.",
  },
  consultar_animal: {
    label: "consulta de animal",
    profile: "fazenda",
    text: "Me manda o brinco do animal que você quer consultar. Exemplo: 'como está o boi 1234'.",
  },
  consultar_cliente: {
    label: "consulta de cliente",
    profile: "prestador",
    text: "Me manda o nome do cliente que você quer consultar. Exemplo: 'quanto o João me deve'.",
  },
  gerar_relatorio: {
    label: "relatório financeiro",
    text: "Posso te mandar o relatório financeiro em PDF, é só pedir. (Relatórios de rebanho, lavoura e prestador ainda não estão disponíveis por aqui.)",
  },
  registrar_lancamento_financeiro: {
    label: "lançar despesas (inclusive por foto de recibo)",
    text: "Pra lançar uma despesa, me conta o valor e do que se trata: ou, mais fácil, me manda uma foto ou PDF da nota que eu leio pra você.",
  },
};

const RESUMO_TOP_LEVEL: { scope: string; label: string; profile?: ProfileType }[] = [
  { scope: "rebanho", label: "Rebanho", profile: "fazenda" },
  { scope: "lavoura", label: "Lavoura", profile: "fazenda" },
  { scope: "prestador", label: "Prestador", profile: "prestador" },
  { scope: "financeiro", label: "Financeiro" },
];
const RESUMO_SECOND_LEVEL = ["Clientes", "Agendamentos", "Contas a receber"];
```

Dentro do `switch (intent)`, adicione os dois `case`s novos logo antes de
`case "ambigua":`:

```ts
    case "ajuda": {
      const topic = str(parameters.topic);
      const entry = topic ? HELP_TEXT[topic] : undefined;
      if (entry) {
        if (entry.profile && !activeProfiles.includes(entry.profile)) {
          const label = entry.profile === "fazenda" ? "Fazenda" : "Prestador de Serviço";
          return {
            reply_text: `Esse recurso requer o perfil "${label}" ativo, que não está habilitado para sua empresa.`,
            requires_confirmation: false,
            auxiliary_data: null,
            report_url: null,
            action_taken: "ajuda:perfil_inativo",
          };
        }
        return {
          reply_text: entry.text,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: `ajuda:${topic}`,
        };
      }

      const available = Object.values(HELP_TEXT).filter(
        (e) => !e.profile || activeProfiles.includes(e.profile),
      );
      const menu = available.map((e) => e.label).join(", ");
      return {
        reply_text: `Posso te ajudar com: ${menu}. Sobre qual desses você quer saber mais? Ou me conta direto o que você quer fazer que eu tento entender.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "ajuda:geral",
      };
    }

    case "resumo": {
      const scope = str(parameters.scope);
      const availableTopLevel = RESUMO_TOP_LEVEL.filter((o) => !o.profile || activeProfiles.includes(o.profile));

      if (scope === "rebanho" && availableTopLevel.some((o) => o.scope === "rebanho")) {
        const [count, upcoming] = await Promise.all([
          db.animal.count({ where: { status: "active" } }),
          listUpcomingVaccinations(db, 15),
        ]);
        const next = upcoming[0];
        const vaccineText = next
          ? `Próxima vacina: brinco ${next.ear_tag ?? "?"} em ${next.days_remaining} dia(s).`
          : "Nenhuma vacina prevista.";
        return {
          reply_text: `🐄 Rebanho: ${count} animal(is) ativo(s). ${vaccineText}`,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "resumo:rebanho",
        };
      }

      if (scope === "lavoura" && availableTopLevel.some((o) => o.scope === "lavoura")) {
        const count = await db.plot.count({
          where: { cycles: { some: { status: { in: ["planted", "growing"] } } } },
        });
        return {
          reply_text: `🌱 Lavoura: ${count} talhão(ões) com ciclo ativo.`,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "resumo:lavoura",
        };
      }

      if (scope === "financeiro") {
        const [balance, alerts] = await Promise.all([
          getBalanceAction(db, null),
          db.alert.count({ where: { status: "pending" } }),
        ]);
        const balanceText = balance.ok ? `R$ ${balance.data.balance.toFixed(2)}` : "indisponível";
        return {
          reply_text: `💰 Financeiro: saldo do mês ${balanceText}. ${alerts} alerta(s) pendente(s).`,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "resumo:financeiro",
        };
      }

      if (scope === "prestador" && availableTopLevel.some((o) => o.scope === "prestador")) {
        return {
          reply_text: `Quer saber sobre ${RESUMO_SECOND_LEVEL.join(", ")}?`,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "resumo:prestador:aguardando_escopo",
        };
      }

      if (scope === "clientes" || scope === "agendamentos" || scope === "contas_a_receber") {
        if (!activeProfiles.includes("prestador")) {
          return {
            reply_text: `Esse recurso requer o perfil "Prestador de Serviço" ativo, que não está habilitado para sua empresa.`,
            requires_confirmation: false,
            auxiliary_data: null,
            report_url: null,
            action_taken: "resumo:perfil_inativo",
          };
        }
        if (scope === "clientes") {
          const count = await db.serviceClient.count();
          return {
            reply_text: `🧾 Você tem ${count} cliente(s) cadastrado(s).`,
            requires_confirmation: false,
            auxiliary_data: null,
            report_url: null,
            action_taken: "resumo:clientes",
          };
        }
        if (scope === "agendamentos") {
          const count = await db.serviceOrder.count({ where: { status: "scheduled" } });
          return {
            reply_text: `📅 Você tem ${count} ordem(ns) de serviço agendada(s) (ainda não realizadas).`,
            requires_confirmation: false,
            auxiliary_data: null,
            report_url: null,
            action_taken: "resumo:agendamentos",
          };
        }
        const [count, agg] = await Promise.all([
          db.serviceOrder.count({ where: { status: "completed" } }),
          db.serviceOrder.aggregate({ where: { status: "completed" }, _sum: { total_value: true } }),
        ]);
        const total = decToNum(agg._sum.total_value) ?? 0;
        return {
          reply_text: `💵 Você tem ${count} ordem(ns) concluída(s) aguardando fatura, totalizando R$ ${total.toFixed(2)}.`,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "resumo:contas_a_receber",
        };
      }

      // scope null/não reconhecido/indisponível: pergunta nível 1. O N8N
      // decide (via recent_history) quando desistir de perguntar e manda
      // "ambigua" em vez de "resumo" de novo (ver Task 3).
      return {
        reply_text: `Sobre o que você quer saber: ${availableTopLevel.map((o) => o.label).join(", ")}?`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "resumo:aguardando_escopo",
      };
    }
```

Por fim, troque o texto do `case "ambigua": default:` (mantém a mesma
estrutura de retorno, só o `reply_text`):

```ts
    case "ambigua":
    default:
      return {
        reply_text:
          "Não entendi. Posso cadastrar novas informações ou te contar o que já está cadastrado: me diga o que você precisa, ou pergunte 'o que você faz?' que eu te mostro as opções.",
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "ambigua",
      };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```powershell
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"; npm run test:m12
```

Esperado: `✅ M12: 0 falhas.`

- [ ] **Step 5: `tsc --noEmit` e suíte completa (zero regressão)**

```powershell
npx tsc --noEmit
$env:DATABASE_URL="postgresql://tibe:tibe@localhost:55432/tibe_dev?schema=public"
npm run test:isolation; npm run test:m1; npm run test:m2; npm run test:m3; npm run test:m4; npm run test:m5; npm run test:m6; npm run test:m7; npm run test:m9; npm run test:m10; npm run test:m11; npm run test:m12
```

Esperado: todos `0 falhas`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/whatsapp-router.ts scripts/m12-ajuda-resumo.test.ts package.json
git commit -m "Adiciona intencoes ajuda e resumo (funil de dados) ao agente WhatsApp"
```

---

## Task 3: Prompt do classificador (N8N), ajuda, resumo, e "não pergunte 2x"

**Files:** nenhum arquivo deste repositório, mudança no node
`Classificar Intenção (OpenAI)` do workflow "Tibe - Atendimento WhatsApp
(Evolution)", via API REST do N8N (mesmo mecanismo já usado nas sessões
anteriores: `GET`/`PUT /api/v1/workflows/:id`, credenciais em `.env` como
`URL_N8N`/`N8N_API_KEY`, workflow id `UAAA96aJFiiFsQCL`).

**Interfaces:**
- Consumes: intenções `ajuda`/`resumo` da Task 1/2, o prompt precisa
  listar exatamente esses nomes e os parâmetros que o handler espera
  (`topic` pra `ajuda`; `scope` pra `resumo`, com os valores exatos
  `rebanho`/`lavoura`/`prestador`/`financeiro`/`clientes`/
  `agendamentos`/`contas_a_receber`).
- Produces: nada consumido por outra task deste plano.

- [ ] **Step 1: Buscar o workflow atual**

```bash
N8N_URL=$(grep -oE "https://[a-zA-Z0-9.-]+\.up\.railway\.app" .env | head -1)
N8N_KEY=$(grep "^N8N_API_KEY" .env | sed 's/^N8N_API_KEY: *//')
curl -s -H "X-N8N-API-KEY: $N8N_KEY" "$N8N_URL/api/v1/workflows/UAAA96aJFiiFsQCL" > /tmp/wf.json
```

- [ ] **Step 2: Adicionar as duas intenções e a regra de "não repetir pergunta" ao prompt**

No node `Classificar Intenção (OpenAI)`, o `system` prompt lista as
intenções com um bullet cada (`- nome_intencao: {parametros}`). Adicione,
antes do bullet `- ambigua:`, estes dois:

```
- ajuda: {topic?}, o usuário está perguntando COMO usar um recurso (ex: "como cadastro um animal?", "quais campos tem?"), não tentando executar a ação. topic é o nome de uma das intenções acima (cadastrar_animal, registrar_peso, registrar_vacina, registrar_movimento, cadastrar_servico_ordem, consultar_saldo, consultar_animal, consultar_cliente, gerar_relatorio, registrar_lancamento_financeiro) se a pergunta for sobre algo específico, ou omitido se for uma pergunta geral tipo "o que você faz?"/"me ajuda".
- resumo: {scope?}, o usuário quer saber o que já está cadastrado (ex: "me mostra o que eu tenho", "quantos animais eu tenho"). scope é um destes valores exatos, conforme o que a mensagem OU o histórico recente indicam: "rebanho", "lavoura", "prestador", "financeiro" (nível 1), ou "clientes"/"agendamentos"/"contas_a_receber" (nível 2, só depois do assistente ter perguntado sobre "prestador"). Omita scope se a pessoa ainda não especificou.
```

Logo depois do bullet `- ambigua:` já existente, adicione esta regra
(mesmo parágrafo de "Regras" que já existe pra confirmação, adicione como
mais um item da lista):

```
- Se o histórico recente mostra que o assistente já fez uma pergunta de esclarecimento sobre "resumo" (perguntando qual categoria: rebanho/lavoura/prestador/financeiro ou clientes/agendamentos/contas_a_receber) e a mensagem atual do usuário NÃO indica claramente uma dessas opções, classifique como "ambigua" em vez de "resumo" de novo, não repita a pergunta.
```

- [ ] **Step 3: Publicar (só os 4 campos aceitos pela API)**

```bash
node -e "
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('/tmp/wf.json', 'utf-8'));
const out = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
fs.writeFileSync('/tmp/wf-out.json', JSON.stringify(out));
"
curl -s -X PUT -H "X-N8N-API-KEY: $N8N_KEY" -H "Content-Type: application/json" \
  --data @/tmp/wf-out.json \
  "$N8N_URL/api/v1/workflows/UAAA96aJFiiFsQCL"
```

Esperado: resposta com `"id": "UAAA96aJFiiFsQCL"` e `nodes` com a mesma
contagem de antes (só o `jsonBody` do node de classificação mudou).

- [ ] **Step 4: Testar via webhook sintético (payload Evolution simulado)**

Repetir o padrão já usado nas sessões anteriores (`curl` direto pro
`$N8N_URL/webhook/atendimento` com um payload `messages.upsert` de texto,
telefone de um usuário de teste real já cadastrado), inspecionando a
execução via `GET $N8N_URL/api/v1/executions/:id?includeData=true`:

1. Mensagem "como eu cadastro um animal?" → `Classificar Intenção`
   devolve `{"intent":"ajuda","parameters":{"topic":"cadastrar_animal"}}`
   → resposta final bate com o texto de `HELP_TEXT.cadastrar_animal`.
2. Mensagem "me mostra o que eu tenho" (tenant com os 2 perfis) →
   `resumo` sem `scope` → resposta pergunta as 4 categorias.
3. Mensagem seguinte "prestador" (mesmo contato, pra reconstruir do
   histórico) → `resumo` com `scope: "prestador"` → resposta pergunta
   Clientes/Agendamentos/Contas a receber.
4. Mensagem seguinte "clientes" → `resumo` com `scope: "clientes"` →
   resposta com contagem real.
5. (Opcional, se der tempo) simular uma resposta solta no lugar do passo
   3 (ex: "não sei", sem relação com as categorias) → confirmar que a
   PRÓXIMA classificação vira `ambigua`, não `resumo` de novo.

- [ ] **Step 5: Atualizar a documentação**

Em `docs/n8n-whatsapp-workflow.md`, seção 4 (tabela de intenções):
adicionar linhas pra `ajuda` e `resumo` (mesmo formato das outras linhas
da tabela, descrevendo `topic`/`scope`). Seção 6 (checklist manual):
adicionar os itens:

```
- [ ] "como eu cadastro um animal?" → recebe o texto de ajuda certo, sem tentar cadastrar nada
- [ ] "me mostra o que eu tenho" → pergunta a categoria; responder "prestador" pergunta o nível 2; responder "clientes" mostra o dado real
- [ ] Responder algo solto no meio do funil de resumo → assistente para de perguntar e explica o que pode fazer, em vez de insistir
```

Também atualize `CLAUDE.md`/`AGENTS.md` (seção do agente WhatsApp): uma
linha mencionando que `ajuda` e `resumo` existem, com o mesmo nível de
detalhe das outras intenções já documentadas ali.

- [ ] **Step 6: Commit da documentação**

```bash
git add docs/n8n-whatsapp-workflow.md CLAUDE.md AGENTS.md
git commit -m "Documenta as intencoes ajuda e resumo (funil) no agente WhatsApp"
git push origin main
```
