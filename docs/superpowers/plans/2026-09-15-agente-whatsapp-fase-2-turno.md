# Agente do WhatsApp, Fase 2: turno no Tibé. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Tibé passa a receber a mensagem crua, decidir o que o produtor quis dizer (cursor da conversa e classificação em duas etapas) e devolver as mensagens prontas, sem depender do n8n para nada além de transporte.

**Architecture:** uma rota interna `POST /api/internal/whatsapp/turno` identifica o contato, consulta o cursor da conversa (pergunta aberta), e só chama o modelo quando precisa: para decidir se uma resposta é o campo pedido ou assunto novo, e para classificar em duas etapas (domínio, depois intenção e campos daquele domínio) com JSON Schema estrito. Cada pedido passa pelo mesmo núcleo que o `execute-action` usa hoje, extraído para uma action. Nada é ligado ao n8n nesta fase: a Fase 4 troca o fluxo.

**Tech Stack:** Next.js 16 route handlers, Prisma 7 (uma migração), Redis (cursor e pendentes), `fetch` para a OpenAI Chat Completions com `response_format: json_schema` estrito (sem SDK novo), tsx para suítes com transporte do modelo substituível.

**Spec:** `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (seções "Desenho", "Fase 2: decisões de 15/09/2026" e a tabela de domínios)

## Global Constraints

- Suítes rodam contra Docker local: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"` inline, nunca o `.env`.
- Nenhuma suíte chama a OpenAI de verdade: o transporte do modelo é substituído no teste. A chamada real só acontece na Fase 3.
- Toda trava nova é vista falhando antes de passar.
- Regras vinculantes da Fase 1 continuam: handler nunca grava sem pendente GUARDADO e executa o guardado; recusa vence; com texto, a confirmação vem do texto (`detectConfirmation`); sim e resposta curta pertencem ao pedido mais recente; nunca inventar data; nunca escolher entre duas fazendas.
- O `execute-action` não muda de comportamento: `m42`, `m67` e as 12 suítes que o chamam continuam verdes.
- Regra de negócio em `src/lib/actions/*` e `src/lib/agente/*`; rotas finas.
- Modelo em `AGENTE_MODELO` (padrão `gpt-4o-mini`), chave em `OPENAI_API_KEY`. Modelo que começa com `gpt-5` ou `o` não recebe `temperature`.
- Falha do modelo ou do Tibé nunca vira silêncio: o turno devolve a frase `Não consegui entender agora. Pode mandar de novo daqui a pouco?`.
- Migração ANTES do push (invariante 3). Nunca travessão (U+2014). Commits em português. Nunca `git add -A`.

---

## Mapa de arquivos

| arquivo | responsabilidade |
|---|---|
| `src/lib/agente/intencoes/tipos.ts` | tipos do registro (`Dominio`, `CampoDef`, `IntencaoDef`) |
| `src/lib/agente/intencoes/<dominio>.ts` (13 arquivos) | definição das intenções de cada domínio |
| `src/lib/agente/intencoes/index.ts` | junta os domínios, `DOMINIOS`, `INTENCOES_POR_DOMINIO`, `buscarIntencao` |
| `src/lib/agente/modelo.ts` | chamada à OpenAI com schema estrito, tempo limite, uma nova tentativa, transporte substituível |
| `src/lib/agente/prompts.ts` | monta os prompts das três chamadas a partir do registro, `VERSAO_DO_PROMPT` |
| `src/lib/agente/classificar.ts` | `classificarMensagem` (duas etapas) e `classificarResposta` (resposta a pergunta aberta) |
| `src/lib/agente/trecho-literal.ts` | tira número que não aparece na mensagem |
| `src/lib/agente/cursor.ts` | cursor da conversa no Redis |
| `src/lib/actions/whatsapp-contato.ts` | identificação do contato, extraída de `resolve-contact` |
| `src/lib/actions/executar-intencao.ts` | núcleo extraído do `execute-action`: idempotência, permissão, log, roteamento |
| `src/lib/actions/turno.ts` | o turno inteiro |
| `src/app/api/internal/whatsapp/turno/route.ts` | rota fina |
| `scripts/m68-agente-turno.test.ts` | suíte da fase |

---

### Task 1: registro de intenções, estrutura e trava de cobertura

**Files:**
- Create: `src/lib/agente/intencoes/tipos.ts`, `src/lib/agente/intencoes/index.ts`, `src/lib/agente/intencoes/conversa.ts`, `src/lib/agente/intencoes/dia.ts`
- Create: `scripts/m68-agente-turno.test.ts`
- Modify: `package.json` (`test:m68` depois de `test:m67`)

**Interfaces:**
- Produces:

```ts
// src/lib/agente/intencoes/tipos.ts
import type { Intent } from "@/lib/whatsapp-intents";

export const DOMINIOS = [
  "rebanho", "confinamento", "eventos_e_permuta", "estoque", "lista_de_compra", "leite",
  "mao_de_obra", "servicos", "financeiro", "dia", "calculadoras", "prestador", "conversa",
] as const;
export type Dominio = (typeof DOMINIOS)[number];

/** Tipo que o modelo devolve; a interpretação fina fica com os parsers do handler. */
export type TipoDeCampo = "texto" | "numero" | "data" | "sim_nao" | "lista";

export type CampoDef = {
  /** Nome EXATO que o handler lê (o primeiro, se o handler aceita apelidos). */
  nome: string;
  tipo: TipoDeCampo;
  descricao: string;
  /** Para `lista`: campos de cada item (ex.: itens de rebanho com categoria e quantidade). */
  itens?: CampoDef[];
};

export type IntencaoDef = {
  intent: Intent;
  dominio: Dominio;
  /** Uma frase: o gesto do produtor, não o que o sistema faz. */
  descricao: string;
  campos: CampoDef[];
  /** Frases reais de produtor, com a origem na spec ou no documento do cliente quando houver. */
  exemplos: string[];
  /** Intenções com que é confundida, e o que distingue, em uma frase. */
  vizinhas?: string;
};

export type DominioDef = { dominio: Dominio; descricao: string };
```

```ts
// src/lib/agente/intencoes/index.ts
export { DOMINIOS, type Dominio, type IntencaoDef, type CampoDef } from "./tipos";
export const DESCRICAO_DOS_DOMINIOS: Record<Dominio, string>;
export const INTENCOES: IntencaoDef[];               // todas, de todos os domínios
export function intencoesDoDominio(d: Dominio): IntencaoDef[];
export function buscarIntencao(intent: string): IntencaoDef | null;
/** As duas legadas que o agente não emite mais (decisão 8 da spec). */
export const INTENCOES_FORA_DO_CLASSIFICADOR: readonly Intent[]; // ["registrar_lote_animal", "registrar_movimento", "ambigua"]
```

- [ ] **Step 1: escrever a trava (suíte m68, seção 1, sem banco)**

```ts
import "dotenv/config";
import fs from "node:fs";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Agente do WhatsApp, Fase 2 (turno no Tibé). Spec:
 * docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md.
 * Nenhuma seção chama a OpenAI: o transporte do modelo é substituído.
 * Roda: `npm run test:m68`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  const { INTENTS } = await import("@/lib/whatsapp-intents");
  const { INTENCOES, INTENCOES_FORA_DO_CLASSIFICADOR, DOMINIOS, intencoesDoDominio } = await import("@/lib/agente/intencoes");

  console.log("1. Registro de intenções cobre o Tibé inteiro");
  const registradas = new Set(INTENCOES.map((i) => i.intent));
  for (const intent of INTENTS) {
    if (INTENCOES_FORA_DO_CLASSIFICADOR.includes(intent)) continue;
    check(`${intent} tem definição`, registradas.has(intent));
  }
  check("nenhuma intenção registrada duas vezes", registradas.size === INTENCOES.length);
  for (const d of DOMINIOS) check(`domínio ${d} tem ao menos uma intenção`, intencoesDoDominio(d).length > 0);

  // Cada campo declarado precisa aparecer, pelo nome, no arquivo do handler que atende a intenção.
  // O mapa intenção -> arquivo sai de whatsapp-router.ts (import dos handlers).
  const router = fs.readFileSync("src/lib/actions/whatsapp-router.ts", "utf8");
  for (const def of INTENCOES) {
    const handler = localizarHandler(router, def.intent);
    check(`${def.intent}: handler localizado`, handler !== null, "adicione o mapeamento em localizarHandler");
    if (!handler) continue;
    const fonte = fs.readFileSync(handler, "utf8");
    for (const campo of def.campos) {
      check(`${def.intent}.${campo.nome} é lido pelo handler`, fonte.includes(campo.nome));
    }
    check(`${def.intent}: tem ao menos 2 exemplos`, def.exemplos.length >= 2);
  }
}

/**
 * Descobre o arquivo do handler de uma intenção lendo o roteador: a tabela
 * `intent -> função` e os imports `from "./whatsapp-handlers/<arquivo>"` ou
 * `from "@/lib/actions/whatsapp-handlers/<arquivo>"`.
 */
function localizarHandler(router: string, intent: string): string | null {
  const linhaDaTabela = router.split("\n").find((l) => new RegExp(`\\b${intent}\\s*:`).test(l));
  const funcao = linhaDaTabela?.match(/:\s*([A-Za-z0-9_]+)/)?.[1];
  if (!funcao) return null;
  const imp = router.match(new RegExp(`import\\s*\\{[^}]*\\b${funcao}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`));
  if (!imp) return null;
  const caminho = imp[1].replace("@/", "src/").replace(/^\.\//, "src/lib/actions/");
  return fs.existsSync(`${caminho}.ts`) ? `${caminho}.ts` : null;
}

main()
  .then(() => {
    console.log(falhas === 0 ? "\n✅ M68: 0 falhas." : `\n❌ M68: ${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\n❌ M68 quebrou:", e);
    process.exit(1);
  });
```

Antes de escrever `localizarHandler`, abra `src/lib/actions/whatsapp-router.ts` e confira como a tabela de handlers e os imports estão escritos de verdade; ajuste só a extração, mantendo a regra (cada campo declarado aparece no arquivo do handler).

- [ ] **Step 2: registrar `test:m68` e ver falhar** (`@/lib/agente/intencoes` não existe).

- [ ] **Step 3: implementar `tipos.ts`, `index.ts`, `conversa.ts` e `dia.ts`**

`index.ts` importa os 13 arquivos de domínio; nesta tarefa só `conversa.ts` e `dia.ts` existem, e os outros 11 exportam `export const INTENCOES_<DOMINIO>: IntencaoDef[] = [];` para a trava listar o que falta.

`DESCRICAO_DOS_DOMINIOS` (texto fixo, é o que a etapa 1 lê):

```ts
export const DESCRICAO_DOS_DOMINIOS: Record<Dominio, string> = {
  rebanho: "animais da fazenda: quantos tem, nasceu, morreu, mudou de pasto ou de categoria, comprou ou vendeu gado, cadastro por brinco, peso, vacina",
  confinamento: "animais no confinamento ou no boitel: entrada, envio ao boitel, trato e ração do lote, saída, venda ou morte no confinamento",
  eventos_e_permuta: "gado mandado para leilão, feira ou evento e o resultado dele; troca de animais por outra coisa (permuta)",
  estoque: "insumos e produtos (sal, ração, vermífugo, adubo, diesel): compra, venda, uso, contagem, quanto tem",
  lista_de_compra: "lista do que precisa comprar: anotar, ver, tirar, marcar que comprou",
  leite: "produção de leite do dia e quantas vacas estão dando leite (entrou, secou, total)",
  mao_de_obra: "trabalhador fixo da fazenda: cadastro, pagamento, adiantamento",
  servicos: "serviço com máquina ou empreita: diária de gente contratada, serviço contratado, serviço prestado para cliente, começar, produção, combustível e terminar o serviço",
  financeiro: "dinheiro solto: despesa ou receita avulsa, recibo, saldo do mês, relatório financeiro",
  dia: "agenda: o que tem para hoje, amanhã ou na semana, e criar lembrete ou tarefa",
  calculadoras: "contas de planejamento sem gravar nada: cerca, sementes, sal mineral, ração",
  prestador: "para quem presta serviço: ordem de serviço para cliente e dados de cliente",
  conversa: "pergunta de como usar o Tibé ou pedido de ver o que já está cadastrado",
};
```

`conversa.ts` (`ajuda` com campo `topic`, `resumo` com campo `scope`) e `dia.ts` (`consultar_meu_dia`, `consultar_amanha`, `consultar_semana` sem campos, `criar_tarefa` com `title` e `due_date`) seguem o formato abaixo; os nomes e o comportamento vêm dos handlers (`whatsapp-handlers/ajuda.ts`, `resumo.ts`, `meu-dia.ts`, `tarefas.ts`) e do catálogo `docs/agents/agente-whatsapp/catalogo-estoque-dia.md`:

```ts
import type { IntencaoDef } from "./tipos";

export const INTENCOES_DIA: IntencaoDef[] = [
  {
    intent: "criar_tarefa",
    dominio: "dia",
    descricao: "o produtor pede um lembrete ou anota algo para fazer, com ou sem dia",
    campos: [
      { nome: "title", tipo: "texto", descricao: "o que precisa ser feito, nas palavras do produtor" },
      { nome: "due_date", tipo: "data", descricao: "o dia, como o produtor falou (amanhã, quinta, dia 10); vazio se não disse" },
    ],
    exemplos: ["me lembra de comprar sal na quinta", "anota aí consertar a porteira"],
    vizinhas: "adicionar_item_lista quando é algo para COMPRAR; consultar_meu_dia quando pergunta o que tem",
  },
  // consultar_meu_dia, consultar_amanha, consultar_semana (campos: [])
];
```

- [ ] **Step 4: rodar e ver a seção 1 passar só para `conversa` e `dia`**, com as outras falhando por falta de definição (esperado nesta tarefa). Registrar no relatório a lista das que faltam.

- [ ] **Step 5: commit** `git add src/lib/agente/intencoes scripts/m68-agente-turno.test.ts package.json` e `git commit -m "Agente: registro de intencoes com trava de cobertura, dominios conversa e dia"`

---

### Task 2: registro, domínios de rebanho, confinamento, eventos e permuta

**Files:**
- Modify: `src/lib/agente/intencoes/rebanho.ts`, `confinamento.ts`, `eventos_e_permuta.ts`

**Interfaces:**
- Consumes: `IntencaoDef`, `CampoDef` (Task 1). Fonte do conteúdo: handlers `whatsapp-handlers/herd.ts`, `rebanho.ts`, `negociacao.ts`, `confinamento.ts`, `evento.ts`, `permuta.ts`, e o prompt do n8n arquivado em `docs/agents/agente-whatsapp/auditoria-n8n-2026-09-14.md` para os exemplos que já funcionavam.

Intenções: rebanho (`consultar_rebanho`, `consultar_animal`, `registrar_movimentacao_rebanho`, `registrar_negocio_gado`, `cadastrar_animal`, `registrar_peso`, `registrar_vacina`, `registrar_previsao_vacina`); confinamento (`registrar_entrada_confinamento`, `registrar_envio_boitel`, `registrar_alimentacao_confinamento`, `encerrar_confinamento`); eventos_e_permuta (`registrar_remessa_evento`, `encerrar_remessa_evento`, `registrar_permuta`).

Regras de conteúdo que a revisão cobra:
- `campos` só com nomes que o handler lê; quando o handler aceita apelidos (`categoria` ou `category`), declare o primeiro que ele testa.
- `registrar_movimentacao_rebanho` e `registrar_negocio_gado` usam `itens` como `lista` com `categoria` e `quantidade`; o `movement_type` da movimentação sai do VERBO ("tenho" = saldo_inicial, "nasceu" = nascimento, "morreu" = morte, "passe" = transferência ou mudança de categoria, "ajuste" com `sentido`), e compra ou venda é SEMPRE `registrar_negocio_gado`.
- `vizinhas` escrita para cada uma, com a fronteira em uma frase (ex.: "encerrar_confinamento quando a venda cita confinamento ou boitel").
- Os exemplos incluem os do documento do cliente quando o catálogo os traz.

- [ ] **Step 1:** rodar `test:m68` e registrar as falhas destes três domínios.
- [ ] **Step 2:** escrever as 15 definições.
- [ ] **Step 3:** rodar `test:m68`: os três domínios passam na seção 1.
- [ ] **Step 4:** commit `git commit -m "Agente: registro dos dominios de rebanho, confinamento, eventos e permuta"` com os três arquivos por caminho.

---

### Task 3: registro, domínios de estoque, lista de compra, leite, mão de obra e serviços

**Files:**
- Modify: `src/lib/agente/intencoes/estoque.ts`, `lista_de_compra.ts`, `leite.ts`, `mao_de_obra.ts`, `servicos.ts`

**Interfaces:**
- Consumes: `IntencaoDef` (Task 1). Fontes: `whatsapp-handlers/estoque.ts`, `lista-de-compra.ts`, `leite.ts`, `mao-de-obra.ts`, `servico.ts`; catálogos `docs/agents/agente-whatsapp/catalogo-estoque-dia.md` e `catalogo-leite-servicos.md`.

Intenções: estoque (4), lista de compra (4), leite (4), mão de obra (3), serviços (7), conforme a tabela de domínios da spec.

Regras de conteúdo: as mesmas da Task 2, mais:
- `registrar_servico_prestado` declara `concluido` (sim_nao) e `data` (data), que a Fase 1 passou a ler.
- `registrar_movimentacao_rebanho` NÃO entra aqui; "gastei diesel no trator" pertence a `registrar_combustivel_servico` quando há serviço em andamento e a `registrar_lancamento_financeiro` quando é despesa solta: escreva as `vizinhas` de `registrar_uso_estoque` dizendo isso (achado do roteiro de 15/09).
- `lerNumeroBr` recusa texto junto do número ("480 litros"): a `descricao` de todo campo `numero` diz "só o número, como o produtor falou (60 mil, 480)".

- [ ] **Step 1:** rodar `test:m68` e registrar as falhas destes cinco domínios.
- [ ] **Step 2:** escrever as 22 definições.
- [ ] **Step 3:** rodar `test:m68`: os cinco domínios passam.
- [ ] **Step 4:** commit `git commit -m "Agente: registro dos dominios de estoque, lista, leite, mao de obra e servicos"`.

---

### Task 4: registro, domínios de financeiro, calculadoras e prestador

**Files:**
- Modify: `src/lib/agente/intencoes/financeiro.ts`, `calculadoras.ts`, `prestador.ts`

**Interfaces:**
- Consumes: `IntencaoDef` (Task 1). Fontes: `whatsapp-handlers/financeiro.ts`, `calculadora.ts`, `prestador.ts`; catálogo `catalogo-estoque-dia.md`.

Intenções: financeiro (`registrar_lancamento_financeiro` com `amount`, `category`, `vendor`, `description`, `tipo`; `consultar_saldo` e `gerar_relatorio` com `period`), calculadoras (4), prestador (`cadastrar_servico_ordem`, `consultar_cliente`).

- [ ] **Step 1:** rodar `test:m68` e ver só estes três domínios faltando.
- [ ] **Step 2:** escrever as 9 definições.
- [ ] **Step 3:** rodar `test:m68`: a seção 1 passa inteira (todas as intenções fora as legadas e `ambigua`).
- [ ] **Step 4:** commit `git commit -m "Agente: registro dos dominios de financeiro, calculadoras e prestador"`.

---

### Task 5: cliente do modelo com schema estrito

**Files:**
- Create: `src/lib/agente/modelo.ts`
- Modify: `scripts/m68-agente-turno.test.ts` (seção 2), `.env.example` (`OPENAI_API_KEY`, `AGENTE_MODELO`)

**Interfaces:**
- Produces:

```ts
export type PedidoAoModelo = {
  etapa: "dominio" | "extracao" | "resposta";
  sistema: string;
  usuario: string;
  nomeDoSchema: string;
  schema: Record<string, unknown>;   // JSON Schema estrito: additionalProperties false, todos os campos em required, opcionais como tipo com "null"
};
export type Transporte = (corpo: Record<string, unknown>) => Promise<{ status: number; json: unknown }>;
export function definirTransporteDoModelo(t: Transporte | null): void; // null volta ao fetch real
export class FalhaDoModelo extends Error { constructor(readonly motivo: "tempo" | "http" | "formato", mensagem: string) }
export async function chamarModelo<T>(pedido: PedidoAoModelo): Promise<T>;
```

- [ ] **Step 1: casos (seção 2 da m68)**

```ts
  console.log("\n2. Cliente do modelo");
  {
    const { chamarModelo, definirTransporteDoModelo, FalhaDoModelo } = await import("@/lib/agente/modelo");
    let corpoVisto: Record<string, unknown> | null = null;
    let chamadas = 0;
    definirTransporteDoModelo(async (corpo) => {
      corpoVisto = corpo;
      chamadas += 1;
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] } };
    });
    process.env.AGENTE_MODELO = "gpt-4o-mini";
    const r = await chamarModelo<{ ok: boolean }>({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    check("devolve o JSON do conteúdo", r.ok === true);
    const rf = (corpoVisto as unknown as { response_format: { type: string; json_schema: { strict: boolean } } }).response_format;
    check("pede json_schema estrito", rf.type === "json_schema" && rf.json_schema.strict === true);
    check("gpt-4o-mini recebe temperature 0", (corpoVisto as unknown as { temperature?: number }).temperature === 0);

    process.env.AGENTE_MODELO = "gpt-5.6-luna";
    await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    check("gpt-5 não recebe temperature", !("temperature" in (corpoVisto as object)));

    chamadas = 0;
    definirTransporteDoModelo(async () => {
      chamadas += 1;
      return { status: 503, json: {} };
    });
    let erro: unknown = null;
    try { await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }); } catch (e) { erro = e; }
    check("503 tenta de novo uma vez e desiste", chamadas === 2 && erro instanceof FalhaDoModelo);

    definirTransporteDoModelo(async () => ({ status: 200, json: { choices: [{ message: { content: "não é json" } }] } }));
    erro = null;
    try { await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }); } catch (e) { erro = e; }
    check("conteúdo que não é JSON vira FalhaDoModelo de formato", erro instanceof FalhaDoModelo && (erro as InstanceType<typeof FalhaDoModelo>).motivo === "formato");
    definirTransporteDoModelo(null);
    process.env.AGENTE_MODELO = "gpt-4o-mini";
  }
```

- [ ] **Step 2: ver falhar.**
- [ ] **Step 3: implementar**

```ts
const URL_OPENAI = "https://api.openai.com/v1/chat/completions";
const TEMPO_LIMITE_MS = 15_000;

export class FalhaDoModelo extends Error {
  constructor(readonly motivo: "tempo" | "http" | "formato", mensagem: string) {
    super(mensagem);
    this.name = "FalhaDoModelo";
  }
}

let transporte: Transporte | null = null;
export function definirTransporteDoModelo(t: Transporte | null) {
  transporte = t;
}

async function viaFetch(corpo: Record<string, unknown>) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const res = await fetch(URL_OPENAI, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") throw new FalhaDoModelo("tempo", "o modelo não respondeu a tempo");
    throw new FalhaDoModelo("http", "falha de rede ao chamar o modelo");
  } finally {
    clearTimeout(timer);
  }
}

/** Modelos de raciocínio recusam `temperature` (pesquisa de 14/09). */
function aceitaTemperatura(modelo: string) {
  return !/^(gpt-5|o\d)/.test(modelo);
}

export async function chamarModelo<T>(pedido: PedidoAoModelo): Promise<T> {
  const modelo = process.env.AGENTE_MODELO || "gpt-4o-mini";
  const corpo: Record<string, unknown> = {
    model: modelo,
    messages: [
      { role: "system", content: pedido.sistema },
      { role: "user", content: pedido.usuario },
    ],
    response_format: { type: "json_schema", json_schema: { name: pedido.nomeDoSchema, strict: true, schema: pedido.schema } },
    ...(aceitaTemperatura(modelo) ? { temperature: 0 } : {}),
  };
  const enviar = transporte ?? viaFetch;
  let resposta = await enviar(corpo);
  if (resposta.status >= 500 || resposta.status === 429) resposta = await enviar(corpo);
  if (resposta.status !== 200) throw new FalhaDoModelo("http", `o modelo respondeu HTTP ${resposta.status}`);
  const conteudo = (resposta.json as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
  try {
    return JSON.parse(conteudo ?? "") as T;
  } catch {
    throw new FalhaDoModelo("formato", "o modelo não devolveu JSON");
  }
}
```

(Com `transporte` de teste, o tempo limite não se aplica: é responsabilidade do `viaFetch`.)

- [ ] **Step 4: ver passar**; acrescentar ao `.env.example`, perto de `URL_N8N`, as linhas `OPENAI_API_KEY=` e `AGENTE_MODELO=gpt-4o-mini`, com um comentário de uma linha cada.
- [ ] **Step 5: commit** `git commit -m "Agente: cliente do modelo com schema estrito, sem temperature nos modelos de raciocinio"`.

---

### Task 6: prompts gerados do registro e classificação em duas etapas

**Files:**
- Create: `src/lib/agente/prompts.ts`, `src/lib/agente/classificar.ts`, `src/lib/agente/trecho-literal.ts`
- Modify: `scripts/m68-agente-turno.test.ts` (seção 3)

**Interfaces:**
- Consumes: registro (Tasks 1 a 4), `chamarModelo` (Task 5).
- Produces:

```ts
// prompts.ts
export function promptDeDominio(): { sistema: string; schema: Record<string, unknown> };
export function promptDeExtracao(dominio: Dominio): { sistema: string; schema: Record<string, unknown> };
export function promptDeResposta(): { sistema: string; schema: Record<string, unknown> };
/** sha256 dos três prompts de todos os domínios, 12 primeiros caracteres. Muda quando o registro muda. */
export const VERSAO_DO_PROMPT: string;

// trecho-literal.ts
/** Remove campo numérico cujo número não aparece no texto (anti-alucinação). Devolve os parâmetros limpos e os nomes removidos. */
export function conferirTrechoLiteral(parameters: Record<string, unknown>, texto: string, campos: CampoDef[]): { parameters: Record<string, unknown>; removidos: string[] };

// classificar.ts
export type PedidoClassificado = { intent: Intent; parameters: Record<string, unknown>; trecho: string };
export async function classificarMensagem(input: { texto: string; hoje: string; perfis: string[] }): Promise<PedidoClassificado[]>;
export type LeituraDaResposta = { tipo: "responde" | "outro_assunto" };
export async function classificarResposta(input: { texto: string; pergunta: string; intent: Intent; campo: string }): Promise<LeituraDaResposta>;
```

Desenho das três chamadas:
- **Domínio** (`etapa: "dominio"`): o sistema lista `DESCRICAO_DOS_DOMINIOS` e manda separar a mensagem em pedidos, na ordem dita, cada um com o `dominio` e o `trecho` literal da mensagem. Schema: `{ pedidos: [{ dominio: enum DOMINIOS | "nenhum", trecho: string }] }`. "nenhum" vira `ambigua`.
- **Extração** (`etapa: "extracao"`), uma chamada por pedido: o sistema lista as intenções do domínio (descrição, campos, exemplos, vizinhas) e as regras gerais (extrair só o que foi dito; repassar número e data como o produtor falou; nunca inventar brinco, cliente ou valor; `current_date` para datas relativas). Schema: `{ intent: enum (intenções do domínio + "ambigua"), parametros: { <cada nome de campo do domínio>: string|number|boolean|array|null } }`, com `additionalProperties: false` e todos os campos em `required`. Depois da chamada: tirar os `null`, aplicar `conferirTrechoLiteral` no `trecho`, e manter só os campos da intenção escolhida.
- **Resposta** (`etapa: "resposta"`): recebe a pergunta aberta (texto que o Tibé mostrou), a intenção, o campo esperado e a mensagem; decide `responde` (a mensagem é a resposta daquele campo) ou `outro_assunto` (pedido novo). Schema: `{ tipo: enum ["responde", "outro_assunto"] }`.

`conferirTrechoLiteral`: para campo `numero`, extrair os dígitos do valor (`"60 mil"` → `60`; `1200` → `1200`) e manter só se a sequência de dígitos aparece em `texto` depois de tirar separadores (`"1.200"` casa com `1200`); valores por extenso ("sessenta mil") são mantidos quando o valor não tem dígito.

- [ ] **Step 1: casos (seção 3 da m68)** com transporte substituído que responde por `etapa` e pelo texto do usuário:

```ts
  console.log("\n3. Classificação em duas etapas");
  {
    const { definirTransporteDoModelo } = await import("@/lib/agente/modelo");
    const { classificarMensagem, classificarResposta } = await import("@/lib/agente/classificar");
    const { conferirTrechoLiteral } = await import("@/lib/agente/trecho-literal");
    const { VERSAO_DO_PROMPT, promptDeExtracao } = await import("@/lib/agente/prompts");

    const vistos: { etapa: string; sistema: string; usuario: string }[] = [];
    definirTransporteDoModelo(async (corpo) => {
      const msgs = corpo.messages as { role: string; content: string }[];
      const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
      vistos.push({ etapa: nome, sistema: msgs[0].content, usuario: msgs[1].content });
      let conteudo: unknown;
      if (nome === "dominio") {
        conteudo = { pedidos: [{ dominio: "rebanho", trecho: "quantos animais eu tenho" }, { dominio: "financeiro", trecho: "o que tenho a pagar" }] };
      } else if (nome.startsWith("extracao_rebanho")) {
        conteudo = { intent: "consultar_rebanho", parametros: { categoria: null, fazenda: null } };
      } else if (nome.startsWith("extracao_financeiro")) {
        conteudo = { intent: "consultar_saldo", parametros: { period: null, amount: 999 } };
      } else {
        conteudo = { tipo: "responde" };
      }
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
    });

    const pedidos = await classificarMensagem({ texto: "quantos animais eu tenho e o que tenho a pagar", hoje: "2026-09-15", perfis: ["fazenda"] });
    check("dois pedidos, na ordem", pedidos.length === 2 && pedidos[0].intent === "consultar_rebanho" && pedidos[1].intent === "consultar_saldo");
    check("campo de outra intenção não vaza para o pedido", !("amount" in pedidos[1].parameters));
    check("nulls não viram parâmetro", Object.keys(pedidos[0].parameters).length === 0);
    check("a extração do rebanho só lista intenções do rebanho", vistos.some((v) => v.etapa.startsWith("extracao_rebanho") && v.sistema.includes("registrar_negocio_gado") && !v.sistema.includes("registrar_producao_leite")));
    check("o prompt de extração não oferece as intenções legadas", !promptDeExtracao("rebanho").sistema.includes("registrar_lote_animal"));
    check("versão do prompt tem 12 caracteres", VERSAO_DO_PROMPT.length === 12);

    const limpo = conferirTrechoLiteral({ valor: "60 mil", quantidade: 20, comissao: 2000 }, "comprei 20 bezerros por 60 mil", [
      { nome: "valor", tipo: "numero", descricao: "" }, { nome: "quantidade", tipo: "numero", descricao: "" }, { nome: "comissao", tipo: "numero", descricao: "" },
    ]);
    check("número que não está na mensagem é removido", limpo.removidos.join() === "comissao" && limpo.parameters.valor === "60 mil" && limpo.parameters.quantidade === 20);
    check("1.200 casa com 1200", conferirTrechoLiteral({ valor: 1200 }, "paguei 1.200 no sal", [{ nome: "valor", tipo: "numero", descricao: "" }]).removidos.length === 0);

    const r = await classificarResposta({ texto: "Pasto da Sede", pergunta: "De qual pasto?", intent: "registrar_movimentacao_rebanho", campo: "pasto" });
    check("resposta ao campo aberto", r.tipo === "responde");
    definirTransporteDoModelo(null);
  }
```

(O nome do schema de extração é `extracao_<dominio>`; do domínio, `dominio`; da resposta, `resposta`.)

- [ ] **Step 2: ver falhar.** **Step 3: implementar** conforme o desenho. **Step 4: ver passar.**
- [ ] **Step 5: commit** `git commit -m "Agente: classificacao em duas etapas gerada do registro, com conferencia do trecho literal"`.

---

### Task 7: núcleo `executarIntencao` extraído do `execute-action`

**Files:**
- Create: `src/lib/actions/executar-intencao.ts`
- Modify: `src/app/api/internal/whatsapp/execute-action/route.ts` (vira rota fina que chama o núcleo)
- Modify: `src/lib/actions/whatsapp-router.ts` (`routeIntent` devolve `intent_final`)
- Modify: `src/lib/actions/whatsapp-handlers/shared.ts` (`RouterResult` ganha `intent_final?: Intent`)

**Interfaces:**
- Produces:

```ts
export type EntradaDaIntencao = {
  db: TenantPrismaClient;
  tenant_id: string;
  user: { id: string; role: AppUserRole };
  contato_id: string | null;
  activeProfiles: ProfileType[];
  intent: Intent;
  parameters: Record<string, unknown>;
  message_text: string | null;
  confirmed_do_corpo: boolean | null;
  provider_message_id: string | null;
  /** O turno registra a entrada uma vez só, antes de executar os pedidos. */
  registrar_entrada: boolean;
};
export type SaidaDaIntencao = {
  reply_text: string;
  requires_confirmation: boolean;
  auxiliary_data: Record<string, unknown> | null;
  report_url: string | null;
  action_taken: string;
  intent_final: Intent;
  replay: boolean;
};
export async function executarIntencao(e: EntradaDaIntencao): Promise<SaidaDaIntencao>;
```

Tudo o que a rota faz hoje depois de achar o usuário (idempotência por `wamid#intenção`, log de entrada, `detectConfirmation` com a regra do texto, `routeIntent`, log de saída, gravação do `AgentRequest`) passa para o núcleo sem mudar uma vírgula de comportamento, com os comentários junto. A rota mantém autenticação, validação do corpo, conferência tenant x usuário e a busca do usuário, contato e perfis.

`routeIntent` ganha `intent_final`: todo `return` dentro dela passa a devolver `{ ...resultado, intent_final: intent }` com a variável `intent` do ponto do retorno (depois dos desvios). Use uma função local `const comIntencao = (r: RouterResult): RouterResult => ({ ...r, intent_final: intent });` e aplique em cada retorno.

- [ ] **Step 1: caso (seção 4 da m68)** com o tenant de teste (criar como a `m67` cria: tenant, perfil fazenda, dono, fazenda, pasto, saldo de 20 `macho_25_36`, confinamento com lote aberto de 5):

```ts
  console.log("\n4. Núcleo e intenção final");
  {
    const r = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_negocio_gado", parameters: { tipo: "venda", categoria: "boi", quantidade: 2, valor: 9000 }, message_text: "vendi 2 bois do confinamento por 9 mil", confirmed_do_corpo: null, provider_message_id: null, registrar_entrada: false });
    check("a venda que cita o confinamento sai com intent_final encerrar_confinamento", r.intent_final === "encerrar_confinamento", r.intent_final);
    const s = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "consultar_rebanho", parameters: {}, message_text: "quantos animais", confirmed_do_corpo: null, provider_message_id: "W1", registrar_entrada: false });
    const replay = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "consultar_rebanho", parameters: {}, message_text: "quantos animais", confirmed_do_corpo: null, provider_message_id: "W1", registrar_entrada: false });
    check("replay pelo núcleo", replay.replay === true && replay.reply_text === s.reply_text);
  }
```

- [ ] **Step 2: ver falhar.** **Step 3: implementar.** **Step 4: ver passar**, e rodar `test:m42`, `test:m67`, `test:m36`, `test:m38`, `test:m11` (nenhuma pode mudar).
- [ ] **Step 5: commit** `git commit -m "Agente: nucleo executarIntencao extraido do execute-action, e o roteador diz a intencao final"`.

---

### Task 8: cursor da conversa

**Files:**
- Create: `src/lib/agente/cursor.ts`
- Modify: `src/lib/actions/pending-store.ts` (exporta `pedidosAbertos`)
- Modify: `src/lib/actions/executar-intencao.ts` (atualiza o cursor depois de rotear)

**Interfaces:**
- Consumes: registro de chaves `CHAVES_POR_PREFIXO` (Fase 1), `executarIntencao` (Task 7).
- Produces:

```ts
// pending-store.ts
export async function pedidosAbertos(tenantId: string, userId: string): Promise<{ prefixo: string; aguardando: string; salvo_em: number }[]>;

// cursor.ts
export type Cursor = { intent: Intent; aguardando: string; pergunta: string; salvo_em: number };
export async function carregarCursor(tenantId: string, userId: string): Promise<Cursor | null>;
export async function limparCursor(tenantId: string, userId: string): Promise<void>;
/** Chamada depois de cada roteamento. Grava o cursor se algum pedido foi guardado nesta chamada; apaga se não sobrou pedido aberto. */
export async function atualizarCursor(input: { tenantId: string; userId: string; intentFinal: Intent; resposta: string; inicio: number; db: TenantPrismaClient }): Promise<void>;
```

Regras:
- Chave `tibe:cursor:<tenant>:<user>`, TTL 15 minutos (o mesmo dos pendentes).
- Pedido guardado nesta chamada = algum `pedidosAbertos` com `salvo_em >= inicio`, OU um `AgentFlowState` do usuário com `updated_at >= inicio` (cadastro assistido, com `aguardando` = `pending_field` e `intent` = `cadastrar_animal`). O cursor recebe o `aguardando` desse pedido, `intentFinal` e `resposta` como `pergunta`.
- Nenhum pedido guardado nesta chamada e nenhum pedido aberto em lugar nenhum: apaga o cursor.
- Redis fora do ar: não quebra (mesma política do `pending-store`).

- [ ] **Step 1: casos (seção 5 da m68)**: (a) `registrar_movimentacao_rebanho` com `movement_type: "morte"` e `itens: [{ categoria: "novilha", quantidade: 2 }]` (termo ambíguo: o handler pergunta a faixa e GUARDA o pedido no campo `categoria`) grava cursor com `aguardando: "categoria"` e a `intent` da movimentação (sem itens o handler pergunta sem guardar, e não serve para este caso); (b) a resposta `{ categoria: "Fêmea - 13 a 24 meses" }` leva à confirmação, e o `"sim"` com `confirmed_do_corpo: null` apaga o cursor; (c) `registrar_negocio_gado` venda do confinamento grava cursor com `intent: "encerrar_confinamento"`; (d) `consultar_rebanho` sem pedido aberto não grava cursor.
- [ ] **Step 2: ver falhar.** **Step 3: implementar.** **Step 4: ver passar**; rodar `test:m67`.
- [ ] **Step 5: commit** `git commit -m "Agente: cursor da conversa gravado depois de cada roteamento"`.

---

### Task 9: identificação do contato extraída

**Files:**
- Create: `src/lib/actions/whatsapp-contato.ts`
- Modify: `src/app/api/internal/whatsapp/resolve-contact/route.ts` (chama a action, mesma resposta)

**Interfaces:**
- Produces:

```ts
export type ContatoIdentificado =
  | { identificado: false; resposta_sugerida: string | null }
  | { identificado: true; primeiro_contato: boolean; resposta_sugerida: string | null; tenant_id: string; user: { id: string; name: string; role: AppUserRole }; contato_id: string; activeProfiles: ProfileType[]; historico: { direction: string; content: string | null; created_at: Date }[] };
export async function identificarContato(telefone: string): Promise<ContatoIdentificado>;
```

Move a lógica inteira da rota (normalização do telefone, criação do `WhatsAppContact` no primeiro contato, `last_interaction_at`, saudação, histórico das 5 últimas) para a action; a rota converte para o JSON de hoje sem mudar campo nenhum.

- [ ] **Step 1:** rodar `grep -ln "resolve-contact" scripts/*.test.ts` e registrar as suítes; acrescentar à m68 (seção 6) um caso que chama `identificarContato` com o telefone do dono de teste (criar `phone` no usuário) e confere `identificado`, `primeiro_contato: true` na primeira chamada e `false` na segunda.
- [ ] **Step 2: ver falhar.** **Step 3: implementar.** **Step 4: ver passar** e rodar as suítes do Step 1.
- [ ] **Step 5: commit** `git commit -m "Agente: identificacao do contato extraida para action"`.

---

### Task 10: migração da versão do prompt no log

**Files:**
- Modify: `prisma/schema.prisma` (`AgentConversationLog.prompt_version String?`)
- Create: `prisma/migrations/20260915120000_log_versao_do_prompt/migration.sql`
- Modify: `src/lib/actions/conversation-log.ts` (`logInbound` e `logOutbound` aceitam `prompt_version?: string | null`)

- [ ] **Step 1:** acrescentar o campo com o comentário `/// Fase 2 do agente: qual versão do prompt gerou esta leitura. Nula no caminho antigo (execute-action).`
- [ ] **Step 2:** `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, salvar só o `ALTER TABLE` (remover qualquer `DROP INDEX` dos dois índices parciais), `npm run db:deploy` com a URL local, `npx prisma generate`.
- [ ] **Step 3:** `npm run test:drift` se existir no `package.json`, `npx tsc --noEmit`, `npm run check`.
- [ ] **Step 4: commit** `git commit -m "Agente: log de conversa guarda a versao do prompt"`. Registrar no relatório que a migração precisa ir ao Neon antes do push.

---

### Task 11: o turno

**Files:**
- Create: `src/lib/actions/turno.ts`, `src/app/api/internal/whatsapp/turno/route.ts`
- Modify: `src/app/(public)/docs/api/endpoints.ts` (entrada da rota nova), `.claude/rules/whatsapp.md` (parágrafo curto do turno)

**Interfaces:**
- Consumes: `identificarContato` (Task 9), `carregarCursor` (Task 8), `executarIntencao` (Task 7), `classificarMensagem`, `classificarResposta` (Task 6), `VERSAO_DO_PROMPT`, `FalhaDoModelo` (Task 5), `detectConfirmation`.
- Produces:

```ts
export type EntradaDoTurno = {
  telefone: string;
  texto: string;
  provider_message_id: string | null;
  /** Recibo lido por imagem no n8n: vai direto para o lançamento, sem classificar. */
  recibo?: { amount: number; category?: string | null; vendor?: string | null; description?: string | null } | null;
  agora?: Date;
};
export type MensagemDoTurno = { texto: string; pode_humanizar: boolean; report_url: string | null };
export type SaidaDoTurno = { mensagens: MensagemDoTurno[]; replay: boolean };
export async function executarTurno(e: EntradaDoTurno): Promise<SaidaDoTurno>;
```

Fluxo, nesta ordem:
1. Replay do turno inteiro: com `provider_message_id`, procurar `AgentRequest` com chave `` `${wamid}#turno` ``; existindo, devolver as mensagens guardadas com `replay: true`.
2. `identificarContato`. Não identificado: uma mensagem com `resposta_sugerida` (ou a frase padrão de número não cadastrado). Primeiro contato: uma mensagem com a saudação, e para.
3. Log de entrada uma vez, com `prompt_version: VERSAO_DO_PROMPT`.
4. Com `recibo`: um pedido `registrar_lancamento_financeiro` com os campos do recibo.
5. Sem recibo, com cursor aberto:
   - `detectConfirmation(texto)` é `"yes"` ou `"no"`: um pedido na `intent` do cursor com `parameters: {}` (a confirmação e a recusa saem do texto no núcleo).
   - Senão, `classificarResposta`; `responde`: um pedido na `intent` do cursor com `parameters: { [cursor.aguardando]: texto }`; `outro_assunto`: segue para o passo 6.
6. `classificarMensagem`: os pedidos, na ordem.
7. Cada pedido vai para `executarIntencao` com `registrar_entrada: false` (o núcleo já atualiza o cursor depois de rotear; o turno não chama `atualizarCursor` de novo).
8. Cada resposta vira `MensagemDoTurno` com `pode_humanizar = !/\d/.test(texto) && !requires_confirmation && !action_taken.includes("aguardando")`.
9. Grava o `AgentRequest` `` `${wamid}#turno` `` com as mensagens e devolve.
10. `FalhaDoModelo` em qualquer ponto: uma mensagem `Não consegui entender agora. Pode mandar de novo daqui a pouco?` com `pode_humanizar: false`, log de saída com `action_taken: "turno:falha_do_modelo:<motivo>"`, sem gravar `AgentRequest` (para o reenvio poder tentar de novo).

Rota: `requireInternalSecret`, Zod (`telefone` string min 3, `texto` string, `provider_message_id` nullish, `recibo` objeto nullish com `amount` número positivo), `executarTurno`, `apiOk({ mensagens, replay })`. Erro de validação por `apiErroDeZod`.

- [ ] **Step 1: casos (seção 7 da m68)** com o transporte substituído e o dono de teste com telefone:
  - (a) "quantos animais eu tenho e o que tenho a pagar" devolve duas mensagens, a primeira com o total do rebanho;
  - (b) "morreram 2 novilhas" (transporte de extração devolve a movimentação com categoria "novilha") devolve a pergunta da faixa com `pode_humanizar: false`; em seguida "Fêmea - 13 a 24 meses" (transporte de resposta devolve `responde`) chega à confirmação sem chamar a etapa de domínio (conferir pela lista de chamadas do transporte); "não" cancela sem chamar o modelo;
  - (c) com o cursor aberto, "quanto tenho de sal?" (transporte de resposta devolve `outro_assunto`) é classificado de novo e responde o estoque;
  - (d) replay do mesmo `provider_message_id` devolve as mesmas mensagens sem chamar o transporte;
  - (e) transporte lançando HTTP 503 duas vezes devolve a frase de falha e não grava `AgentRequest` do turno;
  - (f) `recibo` com `amount: 150` vai para a confirmação do lançamento sem chamar o modelo;
  - (g) o log de entrada tem `prompt_version` igual a `VERSAO_DO_PROMPT`.
- [ ] **Step 2: ver falhar.** **Step 3: implementar a action e a rota.** **Step 4: ver passar**, rodar `test:docs-api`, `test:m42`, `test:m67`, `npx tsc --noEmit`, `npm run check`.
- [ ] **Step 5: commit** `git commit -m "Agente: turno no Tibe, com cursor, duas etapas e mensagens marcadas para o humanizador"`.

---

### Task 12: fechamento da fase

- [ ] **Step 1:** `npx tsc --noEmit`, `npm run lint`, `npm run check`, `npm run test:all -- --sem-redis` com as URLs locais. Tudo verde (a `m17` só pode falhar entre 00h e 03h UTC, dívida conhecida).
- [ ] **Step 2:** quebrar de propósito o cursor (não gravar) e a conferência do trecho literal (não remover), ver a `m68` falhar, restaurar.
- [ ] **Step 3:** atualizar `docs/agents/current-handoff.md` (estado da Fase 2, a migração `20260915120000_log_versao_do_prompt` que precisa ir ao Neon antes do push, a pendência `OPENAI_API_KEY` na Vercel) e `docs/agents/pendencias-do-usuario.md` (a chave na Vercel).
- [ ] **Step 4:** pedir ao usuário a migração no Neon (comando `npx prisma migrate status` e `npm run db:deploy`) e, depois dela, merge e push.

---

## Self-review

- Cobertura da spec (Fase 2): cursor da conversa (T8); rota de turno (T11); classificação em duas etapas com formato estrito (T6); registro de intenções gerando os prompts com trava no `check`/suíte (T1 a T4, a trava roda na `m68`, que o `test:all` inclui); normalização em código e conferência do trecho literal (T6); versão do prompt no log (T10, T11); mensagens com valor marcadas para não humanizar (T11); `execute-action` intacto até a Fase 7 (T7); legado fora do classificador (T1, `INTENCOES_FORA_DO_CLASSIFICADOR`).
- Fica para a Fase 3: modelo escolhido por avaliação e chamada real. Fase 4: fluxo do n8n chamando o turno. Fase 5: intenções novas.
- Tipos conferidos entre tarefas: `IntencaoDef`/`CampoDef`/`Dominio` (T1) usados em T2 a T6; `chamarModelo`/`definirTransporteDoModelo`/`FalhaDoModelo` (T5) em T6 e T11; `executarIntencao`/`SaidaDaIntencao.intent_final` (T7) em T8 e T11; `Cursor`/`atualizarCursor` (T8) em T11; `identificarContato` (T9) em T11; `prompt_version` (T10) em T11.
