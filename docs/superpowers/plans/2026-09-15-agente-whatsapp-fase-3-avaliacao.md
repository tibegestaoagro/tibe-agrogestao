# Agente do WhatsApp, Fase 3: avaliação e escolha do modelo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** medir seis modelos da OpenAI contra ~300 casos escritos por autores sem contexto do código, ajustar os prompts sem vazar o gabarito, e escolher o modelo pelo critério decidido (zero gravação indevida, 95/85/90, depois custo e tempo).

**Architecture:** um executor em `scripts/avaliacao/` roda cada modelo sobre dois tipos de caso. Caso de **mensagem** passa só pela classificação (`classificarMensagem`) e é pontuado por intenção e campo. Caso de **conversa** passa pelo turno inteiro (`executarTurno`) contra uma fazenda de avaliação montada no Postgres local, e cada passo conta as linhas de negócio gravadas, que é como "gravação indevida" vira número. Um medidor embrulha o transporte HTTP do modelo, soma o custo real pelo `usage` da resposta e para no teto. A partição 70/30 separa o que se usa para ajustar prompt do que só dá a nota final.

**Tech Stack:** TypeScript, tsx, Prisma 7 (Postgres local), Redis local, OpenAI Chat Completions com `response_format: json_schema` estrito.

**Spec:** `docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md` (seções "Fase 2: decisões" e "Fase 3: decisões de 15/09/2026").

## Global Constraints

- Nenhuma suíte automatizada (`test:m68`, `test:m69`, `test:all`) chama a OpenAI: o transporte é substituído. Só `npm run avaliacao:rodar` faz chamada real, e só quando a tarefa manda.
- Teto de gasto: **US$ 30** somando todas as rodadas, controlado por `scripts/avaliacao/resultados/gasto.json`. O executor para sozinho no teto; a Task 9 precisa deixar pelo menos **US$ 8** para a rodada final.
- Modelos: `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-5-nano`, `gpt-5-mini`, `gpt-5.6-luna`, `gpt-5.6-terra` (teto de referência). Modelo que começa com `gpt-5` ou `o<dígito>` não recebe `temperature`; recebe `reasoning_effort` só quando `AGENTE_ESFORCO` está definido.
- Aprovação: zero gravação indevida (eliminatório); intenção certa em **95%** no geral; **85%** em cada intenção com pelo menos **5** ocorrências esperadas; campos certos em **90%**. Entre aprovados: menor custo por 1.000 mensagens, depois menor latência p95.
- Partição: `ajuste` (~70%) e `final` (~30%) por hash do `id` do caso. Ajuste de prompt olha só a partição `ajuste`; frase de caso nunca é copiada para exemplo do registro.
- Execução real sempre com banco e Redis locais inline: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379"`. O executor chama `exigirBancoLocal()` e `exigirRedisLocal()`.
- A chave `OPENAI_API_KEY` vem do `.env` e nunca é impressa, logada nem escrita em arquivo.
- Resultados brutos (`scripts/avaliacao/resultados/`) ficam fora do git; os relatórios em markdown (`docs/agents/agente-whatsapp/avaliacao-fase-3-*.md`) entram.
- Regras vinculantes da Fase 1 e da Fase 2 continuam; `test:m68` segue verde depois de todo ajuste de prompt.
- Nunca travessão (U+2014). Nunca heredoc para escrever conteúdo. Commits em português, `git add` só dos arquivos tocados.

---

### Task 1: esforço de raciocínio e transporte HTTP exportado

**Files:**
- Modify: `src/lib/agente/modelo.ts`
- Modify: `scripts/m68-agente-turno.test.ts` (seção 2)
- Modify: `.env.example` (`AGENTE_ESFORCO`)
- Modify: `docs/agents/pendencias-do-usuario.md` (item 11.4 feito)

**Interfaces:**
- Produces:

```ts
export async function transporteHttp(corpo: Record<string, unknown>): Promise<{ status: number; json: unknown }>;
```

`chamarModelo` passa a mandar `reasoning_effort: process.env.AGENTE_ESFORCO` para modelo de raciocínio quando a variável existe, e nunca para os outros.

- [ ] **Step 1: casos na seção 2 da m68**, logo depois do check `"gpt-5 não recebe temperature"` (o transporte que guarda `corpoVisto` ainda está ativo ali):

```ts
    process.env.AGENTE_MODELO = "gpt-5-mini";
    process.env.AGENTE_ESFORCO = "low";
    await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    check("modelo de raciocínio recebe reasoning_effort de AGENTE_ESFORCO", (corpoVisto as unknown as { reasoning_effort?: string }).reasoning_effort === "low");
    process.env.AGENTE_MODELO = "gpt-4o-mini";
    await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    check("gpt-4o-mini nunca recebe reasoning_effort", !("reasoning_effort" in (corpoVisto as unknown as object)));
    delete process.env.AGENTE_ESFORCO;
    const { transporteHttp } = await import("@/lib/agente/modelo");
    check("transporte HTTP exportado para o medidor da avaliação", typeof transporteHttp === "function");
```

- [ ] **Step 2: ver falhar** com `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run test:m68`.
- [ ] **Step 3: implementar** em `modelo.ts`: renomear `viaFetch` para `export async function transporteHttp` (mesmo corpo) e trocar a montagem do corpo:

```ts
/** Modelos de raciocínio recusam `temperature` (pesquisa de 14/09) e aceitam `reasoning_effort`. */
function ehModeloDeRaciocinio(modelo: string) {
  return /^(gpt-5|o\d)/.test(modelo);
}
```

```ts
    ...(ehModeloDeRaciocinio(modelo)
      ? process.env.AGENTE_ESFORCO
        ? { reasoning_effort: process.env.AGENTE_ESFORCO }
        : {}
      : { temperature: 0 }),
```

e `const enviar = transporte ?? transporteHttp;`.
- [ ] **Step 4: ver passar**; `.env.example`, logo abaixo de `AGENTE_MODELO`: `# AGENTE_ESFORCO: esforço de raciocínio dos modelos gpt-5 (minimal, low, medium); vazio usa o padrão do modelo.` e `AGENTE_ESFORCO=`. Em `docs/agents/pendencias-do-usuario.md`, item 11.4: acrescentar no começo "**Feito em 15/09** (Vercel e `.env` local, com redeploy)." sem apagar o resto.
- [ ] **Step 5: commit** `Agente: esforco de raciocinio por variavel e transporte HTTP exportado para a avaliacao`.

---

### Task 2: medidor de custo com teto

**Files:**
- Create: `scripts/avaliacao/medidor.ts`
- Create: `scripts/m69-avaliacao.test.ts`
- Modify: `package.json` (`test:m69`), `.gitignore` (`scripts/avaliacao/resultados/`)

**Interfaces:**
- Consumes: `transporteHttp`, `Transporte` (Task 1, `@/lib/agente/modelo`).
- Produces:

```ts
export const PRECOS: Record<string, { entrada: number; cache: number; saida: number }>;
export const TETO_USD = 30;
export type Uso = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
export function custoDaChamada(modelo: string, uso: Uso): number;
export class OrcamentoEsgotado extends Error {}
export type Medidor = { transporte: Transporte; gastoTotal(): number; chamadas(): number };
export function criarMedidor(opcoes: { arquivo: string; teto?: number; enviar?: Transporte }): Medidor;
```

- [ ] **Step 1: suíte nova** `scripts/m69-avaliacao.test.ts`, no mesmo formato da `m68` (`import "dotenv/config"`, `exigirBancoLocal()`, `check`, `main()` com `process.exit`). Cabeçalho: "Avaliação do agente, Fase 3 (Módulo do agente WhatsApp). Nenhuma seção chama a OpenAI." Seção 1:

```ts
  console.log("1. Medidor de custo");
  {
    const os = await import("node:os");
    const path = await import("node:path");
    const { custoDaChamada, criarMedidor, OrcamentoEsgotado } = await import("./avaliacao/medidor");
    check("1M de entrada sem cache no gpt-4o-mini custa US$ 0,15", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, completion_tokens: 0 }) - 0.15) < 1e-9);
    check("entrada em cache cobra o preço de cache", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) - 0.075) < 1e-9);
    check("saída do gpt-5.6-terra custa US$ 12 por milhão", Math.abs(custoDaChamada("gpt-5.6-terra", { completion_tokens: 1_000_000 }) - 12) < 1e-9);
    let semPreco = false;
    try { custoDaChamada("modelo-inexistente", {}); } catch { semPreco = true; }
    check("modelo sem preço recusa em vez de contar zero", semPreco);

    const arquivo = path.join(os.tmpdir(), `gasto-m69-${Date.now()}.json`);
    fs.writeFileSync(arquivo, JSON.stringify({ total_usd: 29.99 }));
    let enviadas = 0;
    const medidor = criarMedidor({
      arquivo,
      enviar: async () => {
        enviadas += 1;
        return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
      },
    });
    await medidor.transporte({ model: "gpt-5.6-terra" });
    check("chamada abaixo do teto passa e soma o custo", enviadas === 1 && Math.abs(medidor.gastoTotal() - 30.19) < 1e-6, String(medidor.gastoTotal()));
    let parou = false;
    try { await medidor.transporte({ model: "gpt-5.6-terra" }); } catch (e) { parou = e instanceof OrcamentoEsgotado; }
    check("no teto, a chamada seguinte nem sai", parou && enviadas === 1);
    check("o gasto fica gravado no arquivo", JSON.parse(fs.readFileSync(arquivo, "utf8")).total_usd > 30);
    fs.rmSync(arquivo);
  }
```

(importar `fs` de `node:fs` no topo). Em `package.json`, ao lado de `test:m68`: `"test:m69": "tsx scripts/m69-avaliacao.test.ts"`. Em `.gitignore`: `scripts/avaliacao/resultados/`.
- [ ] **Step 2: ver falhar** (`npm run test:m69` com as URLs locais).
- [ ] **Step 3: implementar** `scripts/avaliacao/medidor.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { transporteHttp, type Transporte } from "@/lib/agente/modelo";

/** US$ por 1 milhão de tokens, página oficial de preços da OpenAI em 15/09/2026. */
export const PRECOS: Record<string, { entrada: number; cache: number; saida: number }> = {
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, saida: 0.6 },
  "gpt-4.1-mini": { entrada: 0.4, cache: 0.1, saida: 1.6 },
  "gpt-5-nano": { entrada: 0.05, cache: 0.005, saida: 0.4 },
  "gpt-5-mini": { entrada: 0.25, cache: 0.025, saida: 2 },
  "gpt-5.6-luna": { entrada: 0.2, cache: 0.02, saida: 1.2 },
  "gpt-5.6-terra": { entrada: 2, cache: 0.2, saida: 12 },
};

/** Decisão do usuário, 15/09: somando todas as rodadas. */
export const TETO_USD = 30;

export type Uso = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export function custoDaChamada(modelo: string, uso: Uso): number {
  const preco = PRECOS[modelo];
  if (!preco) throw new Error(`modelo sem preço na tabela da avaliação: ${modelo}`);
  const cache = uso.prompt_tokens_details?.cached_tokens ?? 0;
  const entrada = (uso.prompt_tokens ?? 0) - cache;
  // Tokens de raciocínio vêm dentro de completion_tokens e são cobrados como saída.
  return (entrada * preco.entrada + cache * preco.cache + (uso.completion_tokens ?? 0) * preco.saida) / 1_000_000;
}

export class OrcamentoEsgotado extends Error {
  constructor(total: number, teto: number) {
    super(`orçamento da avaliação esgotado: US$ ${total.toFixed(2)} de US$ ${teto}`);
    this.name = "OrcamentoEsgotado";
  }
}

export type Medidor = { transporte: Transporte; gastoTotal(): number; chamadas(): number };

export function criarMedidor(opcoes: { arquivo: string; teto?: number; enviar?: Transporte }): Medidor {
  const teto = opcoes.teto ?? TETO_USD;
  const enviar = opcoes.enviar ?? transporteHttp;
  let total = fs.existsSync(opcoes.arquivo) ? Number(JSON.parse(fs.readFileSync(opcoes.arquivo, "utf8")).total_usd) || 0 : 0;
  let chamadas = 0;

  const gravar = () => {
    fs.mkdirSync(path.dirname(opcoes.arquivo), { recursive: true });
    fs.writeFileSync(opcoes.arquivo, JSON.stringify({ total_usd: total, atualizado_em: new Date().toISOString() }, null, 2));
  };

  return {
    transporte: async (corpo) => {
      if (total >= teto) throw new OrcamentoEsgotado(total, teto);
      const resposta = await enviar(corpo);
      chamadas += 1;
      const uso = (resposta.json as { usage?: Uso } | null)?.usage;
      if (uso) {
        total += custoDaChamada(String(corpo.model), uso);
        gravar();
      }
      return resposta;
    },
    gastoTotal: () => total,
    chamadas: () => chamadas,
  };
}
```

- [ ] **Step 4: ver passar**; `npx tsc --noEmit`, `npm run check`.
- [ ] **Step 5: commit** `Agente: medidor de custo da avaliacao com teto de 30 dolares`.

---

### Task 3: formato dos casos, validação, partição e pontuação

**Files:**
- Create: `scripts/avaliacao/tipos.ts`, `scripts/avaliacao/casos.ts`, `scripts/avaliacao/pontuar.ts`, `scripts/avaliacao/validar.ts` (CLI)
- Create: `scripts/avaliacao/casos/.gitkeep`
- Modify: `scripts/m69-avaliacao.test.ts` (seção 2), `package.json` (`avaliacao:validar`)

**Interfaces:**
- Consumes: `INTENCOES`, `buscarIntencao`, `INTENCOES_FORA_DO_CLASSIFICADOR`, `CampoDef` (`@/lib/agente/intencoes`); `lerNumeroBr` (`@/lib/numero-br`); `interpretarData` (`@/lib/actions/whatsapp-handlers/parsers`); `normalizarTermo` (`@/lib/actions/whatsapp-handlers/shared`).
- Produces:

```ts
// tipos.ts
export const AUTORES = ["produtor", "adversarial", "audio", "conversa", "cliente"] as const;
export type Autor = (typeof AUTORES)[number];
export type ValorEsperado = string | number | boolean | Record<string, string | number | boolean>[];
export type PedidoEsperado = { intent: string; campos?: Record<string, ValorEsperado> };
export type CasoMensagem = { id: string; autor: Autor; tipo: "mensagem"; texto: string; esperado: PedidoEsperado[]; nota?: string };
/** "nao": este passo não pode gravar nada; "pode": pede registro e o assistente pode perguntar antes; "deve": confirmação explícita de algo que o assistente acabou de mostrar. */
export type Gravacao = "nao" | "pode" | "deve";
export type PassoDeConversa = { texto: string; grava: Gravacao; nota?: string };
export type CasoConversa = { id: string; autor: Autor; tipo: "conversa"; passos: PassoDeConversa[]; nota?: string };
export type Caso = CasoMensagem | CasoConversa;

// casos.ts
export function validarCasos(casos: unknown[]): string[];              // lista de erros legíveis, vazia se ok
export function carregarCasos(pasta?: string): Caso[];                // lê todo casos/*.json (cada um é um array)
export function particao(id: string): "ajuste" | "final";
export function coberturaPorIntencao(casos: Caso[]): Map<string, number>;

// pontuar.ts
export type PedidoObtido = { intent: string; parameters: Record<string, unknown> };
export type NotaDeMensagem = { id: string; pedidos_certos: number; pedidos_total: number; por_intencao: { intent: string; certo: boolean }[]; campos_certos: number; campos_total: number; erros: string[] };
export function compararCampo(campo: CampoDef, esperado: ValorEsperado, obtido: unknown, hoje: Date): boolean;
export function pontuarMensagem(caso: CasoMensagem, obtidos: PedidoObtido[], hoje: Date): NotaDeMensagem;
export type Metricas = { intencao_geral: number; por_intencao: Record<string, { certos: number; total: number }>; campos: number; mensagens: number };
export function agregar(notas: NotaDeMensagem[]): Metricas;
export function aprovar(m: Metricas, gravacoesIndevidas: number): { aprovado: boolean; motivos: string[] };
```

Regras de pontuação (vinculantes):
- Pedidos alinhados pela ordem. `pedidos_total = max(esperados, obtidos)`: pedido a mais (a etapa de domínio cortou uma ação em duas) conta como erro com a mensagem `pedido a mais: <intent>`; pedido a menos também.
- `por_intencao` só tem os pedidos ESPERADOS (certo quando o obtido no mesmo índice tem a mesma intenção).
- Campos só são conferidos no pedido cuja intenção acertou. Cada campo esperado soma 1 em `campos_total`. Campo `numero` que veio no obtido e NÃO estava no esperado soma 1 em `campos_total`, não soma em `campos_certos`, e registra `número inventado: <campo>`.
- `compararCampo` por `campo.tipo`: `numero` compara `lerNumeroBr(obtido) === lerNumeroBr(esperado)`; `data` compara o dia civil de `interpretarData(String(x), hoje)` dos dois lados e, se o esperado não é legível por `interpretarData`, compara `normalizarTermo` igual; `texto` aceita quando um `normalizarTermo` contém o outro ("no pasto da baixada" e "pasto da baixada"); `sim_nao` lê `true`/"sim" como verdadeiro e `false`/"nao"/"não" como falso; `lista` exige o mesmo tamanho e, item a item na ordem, cada chave do item esperado comparada pelo subcampo de `campo.itens`.
- `agregar`: `intencao_geral = soma(pedidos_certos) / soma(pedidos_total)`; `campos = soma(campos_certos) / soma(campos_total)` (1 quando o total é 0).
- `aprovar`: motivo para cada limite violado: `gravações indevidas: N`, `intenção geral X% < 95%`, `<intent> X% < 85% (N casos)` só para intenção com `total >= 5`, `campos X% < 90%`.
- `validarCasos` recusa: `id` repetido ou fora de `/^[a-z0-9-]+$/`; `autor` fora de `AUTORES`; mensagem sem `texto` ou sem `esperado`; `intent` que não é `"ambigua"` nem está em `INTENCOES`; intenção de `INTENCOES_FORA_DO_CLASSIFICADOR`; campo que a intenção não declara; subchave de item de lista que o subcampo não declara; conversa com menos de 2 passos ou `grava` fora de `nao|pode|deve`.
- `particao`: primeiro byte do `sha1(id)` menor que 179 é `ajuste`, senão `final`.

- [ ] **Step 1: seção 2 da m69** com estes casos (todos precisam aparecer):

```ts
  console.log("\n2. Casos, partição e pontuação");
  {
    const { validarCasos, particao } = await import("./avaliacao/casos");
    const { pontuarMensagem, agregar, aprovar, compararCampo } = await import("./avaliacao/pontuar");
    const { buscarIntencao } = await import("@/lib/agente/intencoes");
    const hoje = new Date(2026, 8, 15, 12);

    check("caso válido passa", validarCasos([{ id: "p-1", autor: "produtor", tipo: "mensagem", texto: "quantos animais eu tenho", esperado: [{ intent: "consultar_rebanho" }] }]).length === 0);
    check("intenção inexistente é recusada", validarCasos([{ id: "p-2", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "vender_fazenda" }] }]).length === 1);
    check("intenção legada é recusada", validarCasos([{ id: "p-3", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "registrar_lote_animal" }] }]).length === 1);
    check("campo que a intenção não declara é recusado", validarCasos([{ id: "p-4", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "consultar_rebanho", campos: { valor: 10 } }] }]).length === 1);
    check("id repetido é recusado", validarCasos([
      { id: "p-5", autor: "produtor", tipo: "mensagem", texto: "a", esperado: [{ intent: "ajuda" }] },
      { id: "p-5", autor: "produtor", tipo: "mensagem", texto: "b", esperado: [{ intent: "ajuda" }] },
    ]).length === 1);
    check("conversa com grava inválido é recusada", validarCasos([{ id: "c-1", autor: "conversa", tipo: "conversa", passos: [{ texto: "a", grava: "talvez" }, { texto: "b", grava: "nao" }] }]).length === 1);
    check("partição é estável", particao("p-1") === particao("p-1"));
    const ids = Array.from({ length: 1000 }, (_, i) => `caso-${i}`);
    const noAjuste = ids.filter((id) => particao(id) === "ajuste").length;
    check("partição fica perto de 70/30", noAjuste > 640 && noAjuste < 760, String(noAjuste));

    const negocio = buscarIntencao("registrar_negocio_gado")!;
    const campo = (nome: string) => negocio.campos.find((c) => c.nome === nome)!;
    check("60 mil casa com 60000", compararCampo(campo("valor"), 60000, "60 mil", hoje));
    check("texto com preposição casa", compararCampo(campo("contato"), "João", "do João", hoje));
    check("dia 10 casa com 10/09/2026", compararCampo(campo("vencimento"), "dia 10", "10/09/2026", hoje));
    check("itens comparados item a item", compararCampo(campo("itens"), [{ categoria: "bezerro", quantidade: 20 }], [{ categoria: "bezerros", quantidade: "20" }], hoje));

    const caso = { id: "p-9", autor: "produtor" as const, tipo: "mensagem" as const, texto: "comprei 20 bezerros do João por 60 mil, pago dia 10", esperado: [{ intent: "registrar_negocio_gado", campos: { tipo: "compra", valor: 60000, vencimento: "dia 10" } }] };
    const certa = pontuarMensagem(caso, [{ intent: "registrar_negocio_gado", parameters: { tipo: "compra", valor: "60 mil", vencimento: "dia 10" } }], hoje);
    check("classificação certa pontua tudo", certa.pedidos_certos === 1 && certa.pedidos_total === 1 && certa.campos_certos === 3 && certa.campos_total === 3, JSON.stringify(certa));
    const cortada = pontuarMensagem(caso, [
      { intent: "registrar_negocio_gado", parameters: { tipo: "compra" } },
      { intent: "ambigua", parameters: {} },
    ], hoje);
    check("ação cortada em dois pedidos é erro e perde os campos", cortada.pedidos_certos === 1 && cortada.pedidos_total === 2 && cortada.campos_certos === 1 && cortada.erros.some((e) => e.startsWith("pedido a mais")), JSON.stringify(cortada));
    const inventada = pontuarMensagem(caso, [{ intent: "registrar_negocio_gado", parameters: { tipo: "compra", valor: 60000, vencimento: "dia 10", parcelas: 3 } }], hoje);
    check("número inventado conta como campo errado", inventada.campos_total === 4 && inventada.campos_certos === 3 && inventada.erros.includes("número inventado: parcelas"), JSON.stringify(inventada));

    const m = agregar([certa, cortada]);
    check("agrega intenção geral", Math.abs(m.intencao_geral - 2 / 3) < 1e-9, String(m.intencao_geral));
    check("gravação indevida reprova mesmo com nota cheia", aprovar(agregar([certa]), 1).aprovado === false);
    check("nota cheia sem gravação indevida aprova", aprovar(agregar([certa]), 0).aprovado === true);
  }
```

(Se algum nome de campo acima não bater com `src/lib/agente/intencoes/rebanho.ts`, confira no registro e use o nome real; o caso precisa continuar provando a mesma regra.)
- [ ] **Step 2: ver falhar.**
- [ ] **Step 3: implementar** os três arquivos conforme as regras, e `validar.ts` como CLI: carrega `scripts/avaliacao/casos/*.json`, imprime os erros com o arquivo, imprime a tabela de cobertura (intenção, total, ajuste, final) marcando `POUCO` onde o total é menor que 5, e sai com código 1 se houver erro. `package.json`: `"avaliacao:validar": "tsx scripts/avaliacao/validar.ts"`.
- [ ] **Step 4: ver passar**; `npx tsc --noEmit`, `npm run check`.
- [ ] **Step 5: commit** `Agente: formato, particao e pontuacao dos casos de avaliacao`.

---

### Task 4: fazenda de avaliação e o briefing dos autores

**Files:**
- Create: `scripts/avaliacao/fazenda.ts`, `scripts/avaliacao/briefing.ts` (CLI)
- Modify: `scripts/m69-avaliacao.test.ts` (seção 3), `package.json` (`avaliacao:briefing`)
- Generated and committed: `scripts/avaliacao/briefing/fazenda.md`, `scripts/avaliacao/briefing/catalogo.md`

**Interfaces:**
- Consumes: actions do app (use as mesmas que as telas usam para criar cada coisa; ache com grep em `src/lib/actions/`), `deleteTestTenants` (`scripts/helpers/herd.ts`), `TENANT_SCOPED_MODELS` (`@/lib/prisma`), `INTENCOES`, `DESCRICAO_DOS_DOMINIOS`.
- Produces:

```ts
export const FAZENDA: DadosDaFazenda; // o objeto abaixo, tipado
export type FazendaMontada = { tenantId: string; userId: string; telefone: string; db: TenantPrismaClient; limpar(): Promise<void> };
export async function montarFazenda(sufixo: string): Promise<FazendaMontada>;
export async function contarLinhasDeNegocio(db: TenantPrismaClient): Promise<number>;
export function descreverFazenda(): string;   // markdown para os autores
export function descreverCatalogo(): string;  // markdown: domínios, intenções, descrição e campos (SEM exemplos nem vizinhas)
```

Conteúdo da fazenda (valores exatos; o briefing mostra estes nomes aos autores):
- Tenant com perfis `fazenda` e `prestador`, dono com telefone único por montagem e **`WhatsAppContact` já criado** (senão o primeiro passo da conversa recebe só a saudação).
- Fazendas: **Fazenda Boa Vista** (pastos **Pasto da Sede** 20 ha, **Pasto da Baixada** 35 ha, **Piquete 3** 5 ha) e **Sítio São José** (pasto **Pasto do Rio** 15 ha).
- Rebanho no Pasto da Sede: 30 `femea_36_mais`, 25 `femea_13_24`, 20 `macho_25_36`, 15 bezerros machos de 0 a 7 meses (use o id real de `src/lib/herd/categories.ts`). No Pasto do Rio: 12 `femea_36_mais`.
- Um animal individual com brinco **1234** (vaca) e o catálogo de vacinas com **Aftosa** e **Brucelose**.
- Confinamento **Confinamento Boa Vista** com lote aberto de 10 `macho_25_36`.
- Estoque: **Sal mineral** 20 sacas, **Ração de engorda** 50 sacas, **Diesel** 500 litros, **Ivermectina** 10 frascos.
- Contatos de negócio: **João do Leilão**, **Frigorífico Bom Boi**.
- Mão de obra: **Pedro** (diarista) e **Zé Carlos** (mensalista), com os valores que a tela exigir.
- Prestador: cliente **Agropecuária Santa Fé**, serviço **Gradagem** por hectare, máquina **Trator New Holland**.
- Leite: o grupo/local mínimo que `registrar_producao_leite` precisa para aceitar "tirei 120 litros hoje".
- Lista de compra: **Arame farpado**.
- Financeiro: conta a pagar **Energia** R$ 480 com vencimento no dia 20 do mês corrente.

`contarLinhasDeNegocio` soma `count()` de todo model de `TENANT_SCOPED_MODELS` exceto: `TenantProfile`, `User`, `WhatsAppContact`, `AgentConversationLog`, `AgentRequest`, `AgentFlowState`, `Alert`, `AlertPreference`, `EmailLog`, `PasswordResetCode`, `RefreshToken`, `PushSubscription`, `Subscription` (delegate = nome com a primeira letra minúscula).

- [ ] **Step 1: seção 3 da m69** (usa banco local):

```ts
  console.log("\n3. Fazenda de avaliação");
  {
    const { montarFazenda, contarLinhasDeNegocio, descreverFazenda, descreverCatalogo } = await import("./avaliacao/fazenda");
    const fazenda = await montarFazenda(`m69-${Date.now()}`);
    try {
      const { db } = fazenda;
      check("duas fazendas", (await db.property.count()) === 2);
      check("quatro pastos", (await db.pasture.count()) === 4);
      check("produto Sal mineral existe", (await db.product.count({ where: { name: "Sal mineral" } })) === 1);
      check("contato do WhatsApp já existe (não é primeiro contato)", (await db.whatsAppContact.count()) === 1);
      const antes = await contarLinhasDeNegocio(db);
      await db.shoppingItem.create({ data: (await import("@/lib/prisma")).scoped({ description: "Teste M69" }) as never });
      check("uma linha de negócio nova é contada", (await contarLinhasDeNegocio(db)) === antes + 1);
      check("briefing da fazenda cita o Pasto da Baixada", descreverFazenda().includes("Pasto da Baixada"));
      check("catálogo cita registrar_negocio_gado e não cita exemplos", descreverCatalogo().includes("registrar_negocio_gado") && !descreverCatalogo().includes("(§"));
    } finally {
      await fazenda.limpar();
    }
  }
```

(ajuste o `create` do `shoppingItem` aos campos obrigatórios reais do model; o caso precisa criar exatamente uma linha de negócio.)
- [ ] **Step 2: ver falhar.** **Step 3: implementar** `fazenda.ts` e o CLI `briefing.ts`, que grava os dois markdowns em `scripts/avaliacao/briefing/`. `package.json`: `"avaliacao:briefing": "tsx scripts/avaliacao/briefing.ts"`. Rodar e commitar os dois arquivos gerados.
- [ ] **Step 4: ver passar**, rodar a seção duas vezes seguidas (a limpeza precisa deixar o banco pronto para a próxima), `npx tsc --noEmit`, `npm run check`.
- [ ] **Step 5: commit** `Agente: fazenda de avaliacao e briefing dos autores de casos`.

---

### Task 5: executor e relatório

**Files:**
- Create: `scripts/avaliacao/executor.ts`, `scripts/avaliacao/rodar.ts` (CLI), `scripts/avaliacao/relatorio.ts` (CLI)
- Modify: `scripts/m69-avaliacao.test.ts` (seção 4), `package.json` (`avaliacao:rodar`, `avaliacao:relatorio`)

**Interfaces:**
- Consumes: Tasks 2 a 4; `classificarMensagem` (`@/lib/agente/classificar`); `executarTurno` (`@/lib/actions/turno`); `definirTransporteDoModelo`, `FalhaDoModelo`, `Transporte` (`@/lib/agente/modelo`).
- Produces:

```ts
export type PassoAvaliado = { texto: string; grava: Gravacao; linhas_novas: number; indevida: boolean; faltou: boolean; respostas: string[]; ms: number };
export type ConversaAvaliada = { id: string; passos: PassoAvaliado[] };
export type ResultadoDoModelo = {
  modelo: string; esforco: string | null; particao: "ajuste" | "final" | "todas";
  notas: (NotaDeMensagem & { texto: string; obtidos: PedidoObtido[]; ms: number; falha?: string })[];
  conversas: ConversaAvaliada[];
  metricas: Metricas; gravacoes_indevidas: number; confirmacoes_que_nao_gravaram: number;
  aprovacao: { aprovado: boolean; motivos: string[] };
  custo_usd: number; custo_por_mil_mensagens: number; latencia_p50_ms: number; latencia_p95_ms: number;
  interrompido: string | null;
};
export async function avaliarModelo(opcoes: { modelo: string; esforco: string | null; casos: Caso[]; particao: "ajuste" | "final" | "todas"; transporte: Transporte; concorrencia?: number; prefixo: string }): Promise<ResultadoDoModelo>;
```

Comportamento vinculante de `avaliarModelo`:
- Define `process.env.AGENTE_MODELO`, e `AGENTE_ESFORCO` quando `esforco` não é null (senão apaga), e `definirTransporteDoModelo(transporte)`; no fim, `definirTransporteDoModelo(null)`.
- Filtra os casos pela partição (`todas` não filtra).
- Mensagens: `classificarMensagem({ texto, hoje: "2026-09-15", perfis: ["fazenda", "prestador"] })` com até `concorrencia` (padrão 4) em paralelo; `FalhaDoModelo` vira nota com `obtidos: []` e `falha: "<motivo>"` (pontuada como erro, não interrompe).
- Conversas, uma por vez: `montarFazenda(`${prefixo}-${caso.id}`)`; para cada passo, conta linhas antes, chama `executarTurno({ telefone, texto, provider_message_id: `${prefixo}-${caso.id}-${i}` })`, conta depois; `indevida = grava === "nao" && linhas_novas > 0`; `faltou = grava === "deve" && linhas_novas === 0`; `limpar()` no `finally`.
- `OrcamentoEsgotado` (ou qualquer erro que não seja `FalhaDoModelo`) interrompe o modelo: devolve o resultado parcial com `interrompido` preenchido.
- Latência por mensagem e por passo; `custo_por_mil_mensagens = custo / (mensagens + passos) * 1000`.

`rodar.ts`: chama `exigirBancoLocal()` e `exigirRedisLocal()` (de `scripts/_banco-local.ts`) antes de tudo. Argumentos: `--rodada <nome>` (obrigatório), `--modelos a,b` (padrão os seis), `--particao ajuste|final|todas` (padrão `todas`), `--limite N` (os N primeiros casos, para fumaça). Esforço: `low` para modelo `gpt-5*`, null para os outros. Antes de cada modelo, uma chamada de sondagem (`classificarMensagem` com "quantos animais eu tenho"): HTTP 400 com esforço tenta de novo sem esforço e registra; 400 sem esforço pula o modelo com o motivo. Um `criarMedidor({ arquivo: "scripts/avaliacao/resultados/gasto.json" })` único para a rodada inteira. Grava `scripts/avaliacao/resultados/<rodada>/<modelo>.json` e imprime uma linha por modelo com aprovação, custo e gasto acumulado. Sai com código 2 se o orçamento acabou.

`relatorio.ts`: `--rodada <nome>` e `--particao ajuste|final|todas` (filtra as notas mostradas: na rodada de ajuste, casos da partição `final` nunca aparecem no relatório). Gera `docs/agents/agente-whatsapp/avaliacao-fase-3-<rodada>.md` com: tabela por modelo (aprovado, gravações indevidas, intenção geral, pior intenção com ≥5 casos, campos, US$ por 1.000 mensagens, p50, p95), a lista de TODA gravação indevida (caso, passo, texto, linhas novas, respostas), os 25 erros de intenção mais frequentes (texto, esperado, obtido) e a ordem de preferência (aprovados por custo, depois p95; não aprovados depois).

- [ ] **Step 1: seção 4 da m69**, com transporte substituído que responde por nome de schema e pela mensagem do usuário:
  - duas mensagens: "quantos animais eu tenho" (esperado `consultar_rebanho`, o transporte acerta) e "comprei 20 bezerros do João por 60 mil" (esperado `registrar_negocio_gado` com `valor: 60000`, o transporte devolve `valor: null`): `metricas.intencao_geral === 1`, `campos < 1`;
  - uma conversa com três passos na fazenda de avaliação: "usei 2 sacas de sal mineral" com `grava: "nao"` (o transporte classifica `registrar_uso_estoque` com `produto: "Sal mineral", quantidade: 2`, e o handler grava sem confirmar), "quantos animais eu tenho" com `grava: "nao"`, "sim" com `grava: "deve"`: `gravacoes_indevidas === 1` (o primeiro passo) e `aprovacao.aprovado === false`;
  - um transporte que lança `new OrcamentoEsgotado(30, 30)` na primeira chamada: `interrompido` preenchido e nenhuma exceção escapa.
- [ ] **Step 2: ver falhar.** **Step 3: implementar.** **Step 4: ver passar**; rodar a m69 inteira duas vezes seguidas; `npx tsc --noEmit`; `npm run check`.
- [ ] **Step 5: fumaça real, a única chamada paga desta tarefa**: `DATABASE_URL=... REDIS_URL=... npm run avaliacao:rodar -- --rodada fumaca --modelos gpt-4o-mini --limite 3` com três casos temporários num arquivo `scripts/avaliacao/casos/fumaca.json` (duas mensagens e uma conversa, escritos pelo implementador a partir do briefing); conferir `resultados/fumaca/gpt-4o-mini.json`, gerar `npm run avaliacao:relatorio -- --rodada fumaca`, e APAGAR `casos/fumaca.json` e o relatório da fumaça antes do commit. Custo esperado: menos de US$ 0,05.
- [ ] **Step 6: commit** `Agente: executor e relatorio da avaliacao de modelos`.

---

### Task 6: extrações em paralelo

**Files:**
- Modify: `src/lib/agente/classificar.ts` (`classificarMensagem`)
- Modify: `scripts/m68-agente-turno.test.ts` (seção 3b)

A latência é critério de desempate, e hoje cada pedido espera a extração do anterior.

- [ ] **Step 1: caso na seção 3b da m68**: transporte cuja resposta de domínio tem três pedidos de domínios diferentes e cuja extração espera 300 ms (`await new Promise((r) => setTimeout(r, 300))`) antes de responder; `classificarMensagem` termina em menos de 700 ms e devolve os três na ordem da etapa de domínio.
- [ ] **Step 2: ver falhar.**
- [ ] **Step 3: implementar**: `Promise.all(resposta.pedidos.map(...))`, com o pedido `nenhum` virando `ambigua` dentro do `map`; a ordem do array de saída é a ordem da etapa de domínio.
- [ ] **Step 4: ver passar**; `test:m68`, `npx tsc --noEmit`.
- [ ] **Step 5: commit** `Agente: extracoes de uma mensagem rodam em paralelo`.

---

### Task 7: o conjunto de casos (controlador)

Não é código: o controlador despacha autores e um juiz, e decide as disputas.

**Files:**
- Create: `scripts/avaliacao/briefing/autores.md`, `scripts/avaliacao/casos/{produtor,audio,cliente,adversarial,conversa}.json`, `scripts/avaliacao/casos/revisao-do-juiz.md`

- [ ] **Step 1: escrever `briefing/autores.md`** com: o que é o Tibé em três linhas (gestão de fazenda; o produtor fala pelo WhatsApp); o formato JSON exato de `tipos.ts`; a regra do `grava` ("nao" em consulta, recusa, correção, pergunta, sim sem nada perguntado; "pode" em pedido de registro; "deve" só no "sim" logo depois de o assistente mostrar o que vai gravar); que nomes de lugar, produto e pessoa vêm de `briefing/fazenda.md` e intenções e campos de `briefing/catalogo.md`; que o gabarito registra só o que a frase disse (sem inventar valor) e número como número; que é proibido ler `src/`; e a encomenda de cada autor:

| autor | casos | foco |
|---|---|---|
| produtor | 90 mensagens | fala comum de fazenda, todos os domínios, uma ou duas ações por mensagem |
| audio | 60 mensagens | transcrição de áudio: sem pontuação, sem acento às vezes, número por extenso, "é... tipo assim", frase longa |
| cliente | 40 mensagens | frases dos documentos do cliente em `docs/` (grep por exemplos de WhatsApp nas specs e documentos de módulo), citando a origem em `nota` |
| adversarial | 30 mensagens e 25 conversas | recusa, correção no meio ("não, eram 30"), sim fora de hora, pergunta que parece registro, duas ações misturadas, valor dito duas vezes, fazenda ambígua |
| conversa | 35 conversas | 3 a 6 passos: pedido, pergunta do assistente, resposta curta, confirmação, outro assunto no meio |

- [ ] **Step 2: despachar os cinco autores em paralelo** (subagentes `general-purpose`, modelo `sonnet`, sem nenhum contexto além de `briefing/`): cada um escreve só o próprio arquivo e roda `npm run avaliacao:validar` até passar. Ids com prefixo do autor (`prod-`, `aud-`, `cli-`, `adv-`, `conv-`).
- [ ] **Step 3: cobertura**: `npm run avaliacao:validar`; para toda intenção marcada `POUCO`, despachar um autor `produtor` extra com a lista, até cada intenção ter pelo menos 5 ocorrências.
- [ ] **Step 4: juiz** (subagente `opus`, sem contexto do código): confere cada gabarito contra `catalogo.md` e `fazenda.md` e escreve `casos/revisao-do-juiz.md` com uma linha por disputa (id, o que está errado, correção proposta). O controlador decide cada linha no ledger e corrige os JSON.
- [ ] **Step 5**: `npm run avaliacao:validar` verde; registrar no ledger a contagem por autor e por partição.
- [ ] **Step 6: commit** `Agente: conjunto de casos da avaliacao, cinco autores e revisao do juiz`.

---

### Task 8: rodada 1, os seis modelos (controlador)

- [ ] **Step 1**: `DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" REDIS_URL="redis://127.0.0.1:56379" npm run avaliacao:rodar -- --rodada r1` (seis modelos, todas as partições). Se o `gpt-5.6-terra` for passar de US$ 12 nesta rodada pela projeção dos primeiros 30 casos, interromper e rodá-lo só na partição `final`.
- [ ] **Step 2**: `npm run avaliacao:relatorio -- --rodada r1 --particao ajuste` (o que a Task 9 pode ler) e registrar no ledger, por modelo: aprovado, gravações indevidas, intenção geral, campos, custo, p95, e o gasto acumulado.
- [ ] **Step 3: toda gravação indevida vira investigação antes do ajuste de prompt**: se o turno gravou num passo `nao`, o defeito é de código (handler, roteador, cursor, turno) e não de modelo; corrigir com teste na `m68` (ver falhar antes), como nas fases anteriores.
- [ ] **Step 4**: escolher os **dois baratos** mais bem colocados (fora o `gpt-5.6-terra`) para a Task 9 e registrar no ledger.
- [ ] **Step 5: commit** do relatório `docs/agents/agente-whatsapp/avaliacao-fase-3-r1.md`: `Agente: rodada 1 da avaliacao dos seis modelos`.

---

### Task 9: ajuste de prompt na partição de ajuste (controlador + implementador)

Até **três** iterações, só com os dois modelos escolhidos, só na partição `ajuste`, e parando quando os dois aprovarem ou quando o gasto acumulado passar de **US$ 22**.

Cada iteração:
- [ ] **Step 1**: agrupar os erros do relatório de ajuste por causa (etapa de domínio cortou ou juntou ações; domínio errado; intenção errada dentro do domínio; campo perdido; número inventado; data convertida) e escrever no ledger a hipótese e a mudança.
- [ ] **Step 2**: implementar a mudança só em `src/lib/agente/prompts.ts` ou nas descrições, `vizinhas` e exemplos do registro (`src/lib/agente/intencoes/*.ts`). Exemplo novo é escrito do zero, nunca copiado de um caso. Casos sabidos da fumaça que precisam melhorar: "comprei 20 bezerros do João por 60 mil, pago dia 10" não pode virar dois pedidos; "o que tenho a pagar?" não pode ser `ambigua`.
- [ ] **Step 3**: `test:m68` verde (ajustar conferência de texto de prompt só se a regra que ela prova continuar provada).
- [ ] **Step 4**: `npm run avaliacao:rodar -- --rodada r2-<n> --modelos <os dois> --particao ajuste`, relatório com `--particao ajuste`, ledger com o antes e depois.
- [ ] **Step 5: commit** `Agente: ajuste de prompt <n> da avaliacao` com o relatório da iteração.

---

### Task 10: rodada final, escolha e fechamento (controlador)

- [ ] **Step 1**: `npm run avaliacao:rodar -- --rodada final --modelos <os dois>,gpt-5.6-terra --particao final` e `npm run avaliacao:relatorio -- --rodada final --particao final`.
- [ ] **Step 2: escolha pelo critério da spec**: entre os aprovados na partição `final`, o de menor custo por 1.000 mensagens, e em empate de custo (diferença menor que 20%), o de menor p95. Se nenhum barato aprovar, PARAR e levar ao usuário o relatório com as opções (o teto aprovou? quanto custa? o que falta aos baratos?).
- [ ] **Step 3**: spec, seção "Fase 3: decisões", ganha a linha `modelo escolhido` com o modelo, o esforço, a nota final e o custo por 1.000 mensagens.
- [ ] **Step 4**: `npm run test:all -- --sem-redis` com as URLs locais, `npx tsc --noEmit`, `npm run lint`, `npm run check`.
- [ ] **Step 5**: `docs/agents/current-handoff.md` (estado da Fase 3, gasto total, modelo escolhido, próximo passo Fase 4) e `docs/agents/pendencias-do-usuario.md` (definir `AGENTE_MODELO` e, se for `gpt-5*`, `AGENTE_ESFORCO` na Vercel e fazer redeploy).
- [ ] **Step 6**: commit, pedir ao usuário a aprovação de merge e push (a Fase 3 não tem migração).

---

## Self-review

- Cobertura da spec (Fase 3): seis modelos (T8, T10); ~300 casos de cinco autores sem contexto e juiz (T4 briefing, T7); partição 70/30 sem vazar o gabarito (T3 `particao`, T5 relatório por partição, T9 regras); zero gravação indevida medida no turno inteiro contra banco (T4 `contarLinhasDeNegocio`, T5 conversas); 95/85/90 (T3 `aprovar`); teto de US$ 30 (T2, T5, T8, T9); custo e tempo como desempate (T5 métricas, T6 latência, T10 escolha). Achados da fumaça viram metas do ajuste (T9).
- Fica para a Fase 4: workflow fino no n8n chamando o turno e homologação no segundo número. Fase 5: intenções novas.
- Tipos conferidos entre tarefas: `transporteHttp` (T1) em T2; `criarMedidor`/`OrcamentoEsgotado` (T2) em T5; `Caso`/`Gravacao`/`particao`/`pontuarMensagem`/`agregar`/`aprovar` (T3) em T5; `montarFazenda`/`contarLinhasDeNegocio` (T4) em T5; `ResultadoDoModelo` (T5) em T8 a T10.
