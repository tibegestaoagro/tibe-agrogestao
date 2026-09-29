import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Ler, guardar e aplicar o workflow do agente no n8n, pela API pública.
 *
 * Existe porque os scripts que colocaram o canário no ar em 18/09 moravam no
 * scratchpad e sumiram com ele, junto com o caminho de volta (nota do cofre
 * `o-scratchpad-some-e-leva-o-voltar-atras`). O script mora aqui; o JSON do
 * fluxo NUNCA: ele carrega a chave da instância da Evolution, e o repositório
 * é público. As cópias vão para `~/.tibe/n8n-copias/`, fora do repositório e
 * fora de pasta temporária, e toda escrita salva uma antes de mudar.
 *
 *   npx tsx scripts/n8n-workflow.ts ler                     # resumo e lista do canário
 *   npx tsx scripts/n8n-workflow.ts salvar                  # cópia do fluxo atual
 *   npx tsx scripts/n8n-workflow.ts aplicar <arquivo.json>  # mostra o que muda
 *   npx tsx scripts/n8n-workflow.ts aplicar <arquivo.json> --confirmar
 *   npx tsx scripts/n8n-workflow.ts canario <tel> [<tel>...] [--confirmar]
 *   npx tsx scripts/n8n-workflow.ts canario --todos | --ninguem [--confirmar]
 *
 * `--homologacao` troca o alvo para a cópia da Fase 4. Sem ela, é PRODUÇÃO.
 *
 * Voltar atrás = `aplicar` com uma cópia de `~/.tibe/n8n-copias/`. Sem cópia,
 * o histórico de versões do editor do n8n, ou `canario --ninguem`, que manda
 * todo mundo de volta para o `execute-action`.
 *
 * ⚠️ O n8n é 2.x: salvar deixa em RASCUNHO, e produção roda a versão
 * PUBLICADA. Por isso, com o fluxo ativo, a escrita publica em seguida e
 * confere que `versionId` e `activeVersionId` ficaram iguais.
 */

const ALVOS = { producao: "UAAA96aJFiiFsQCL", homologacao: "ctGOlY9OXZWfjeby" } as const;
const NO_DESVIO = "Agente Novo?";
const PASTA_COPIAS = path.join(homedir(), ".tibe", "n8n-copias");

type No = { name: string; parameters?: Record<string, unknown> };
type Workflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: No[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  versionId?: string;
  activeVersionId?: string | null;
  updatedAt?: string;
};

const alvo = process.argv.includes("--homologacao") ? ALVOS.homologacao : ALVOS.producao;
const confirmar = process.argv.includes("--confirmar");

async function api(metodo: string, caminho: string, corpo?: unknown): Promise<Workflow> {
  const chave = process.env.N8N_API_KEY;
  if (!chave || !process.env.URL_N8N) throw new Error("URL_N8N e N8N_API_KEY precisam estar no .env.");
  const res = await fetch(`${new URL(process.env.URL_N8N).origin}/api/v1${caminho}`, {
    method: metodo,
    headers: { "X-N8N-API-KEY": chave, accept: "application/json", "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error(`n8n respondeu ${res.status} em ${metodo} ${caminho}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Workflow;
}

const lerWorkflow = () => api("GET", `/workflows/${alvo}`);

// O telefone nunca aparece inteiro na saída: ela vai para terminal e conversa.
const mascarar = (t: string) => `${t.slice(0, 4)}...${t.slice(-2)}`;

// A mesma regra da expressão: celular brasileiro de 12 dígitos ganha o nono.
function normalizarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4]) ? d.slice(0, 4) + "9" + d.slice(4) : d;
}

function expressaoDoDesvio(lista: string[] | "todos"): string {
  const retorno = lista === "todos" ? "true" : `${JSON.stringify(lista)}.includes(c)`;
  return `={{ (() => { const d = String($json.phone || '').replace(/\\D/g, ''); const c = d.length === 12 && d.startsWith('55') && /[6-9]/.test(d[4]) ? d.slice(0, 4) + '9' + d.slice(4) : d; return ${retorno}; })() }}`;
}

type CondicaoDoDesvio = { conditions: { conditions: { leftValue: string }[] } };

function condicaoDoDesvio(wf: Workflow): { leftValue: string } | null {
  const params = wf.nodes.find((n) => n.name === NO_DESVIO)?.parameters as CondicaoDoDesvio | undefined;
  return params?.conditions?.conditions?.[0] ?? null;
}

function listaDoCanario(wf: Workflow): string[] | "todos" | null {
  const expr = condicaoDoDesvio(wf)?.leftValue;
  if (!expr) return null;
  if (/return true; \}\)\(\) \}\}$/.test(expr)) return "todos";
  const m = expr.match(/return (\[[^\]]*\])\.includes\(c\)/);
  return m ? (JSON.parse(m[1]) as string[]) : null;
}

function descreverCanario(lista: string[] | "todos" | null): string {
  if (lista === null) return `nó "${NO_DESVIO}" ausente ou num formato que este script não reconhece`;
  if (lista === "todos") return "TODOS os telefones vão para a rota de turno";
  if (lista.length === 0) return "ninguém: todo mundo segue no execute-action";
  return `${lista.length} telefone(s): ${lista.map(mascarar).join(", ")}`;
}

function salvarCopia(wf: Workflow, motivo: string): string {
  mkdirSync(PASTA_COPIAS, { recursive: true });
  if (path.resolve(PASTA_COPIAS).startsWith(path.resolve(process.cwd()))) {
    throw new Error("A pasta de cópias caiu dentro do repositório, que é público. Recusando.");
  }
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const arquivo = path.join(PASTA_COPIAS, `${wf.id}-${carimbo}-${motivo}.json`);
  writeFileSync(arquivo, JSON.stringify(wf, null, 2));
  return arquivo;
}

function resumo(wf: Workflow): string {
  const publicado = wf.versionId === wf.activeVersionId ? "publicada" : `RASCUNHO (publicada: ${wf.activeVersionId ?? "nenhuma"})`;
  return [
    `${wf.name} (${wf.id})`,
    `  ativo: ${wf.active} | nós: ${wf.nodes.length} | atualizado: ${wf.updatedAt}`,
    `  versão ${wf.versionId}, ${publicado}`,
    `  canário: ${descreverCanario(listaDoCanario(wf))}`,
  ].join("\n");
}

function diferenca(antes: Workflow, depois: Workflow): string[] {
  const porNome = (wf: Workflow) => new Map(wf.nodes.map((n) => [n.name, JSON.stringify(n)]));
  const a = porNome(antes);
  const d = porNome(depois);
  const linhas: string[] = [];
  for (const nome of d.keys()) if (!a.has(nome)) linhas.push(`  + ${nome}`);
  for (const nome of a.keys()) if (!d.has(nome)) linhas.push(`  - ${nome}`);
  for (const [nome, json] of d) if (a.has(nome) && a.get(nome) !== json) linhas.push(`  ~ ${nome}`);
  if (JSON.stringify(antes.connections) !== JSON.stringify(depois.connections)) linhas.push("  ~ ligações entre nós");
  return linhas;
}

async function escrever(atual: Workflow, novo: Workflow) {
  const mudancas = diferenca(atual, novo);
  console.log(`Alvo: ${atual.name} (${atual.id})${alvo === ALVOS.producao ? "  <- PRODUÇÃO" : ""}`);
  console.log(`Canário hoje:  ${descreverCanario(listaDoCanario(atual))}`);
  console.log(`Canário novo:  ${descreverCanario(listaDoCanario(novo))}`);
  console.log(mudancas.length ? `Nós que mudam:\n${mudancas.join("\n")}` : "Nenhum nó muda.");
  if (!mudancas.length) return;
  if (!confirmar) {
    console.log("\n(nada foi escrito; repita com --confirmar para aplicar)");
    return;
  }

  console.log(`\nCópia do fluxo atual: ${salvarCopia(atual, "antes")}`);
  // A API pública recusa campo fora destes, e só aceita estas chaves em settings.
  const settings = Object.fromEntries(
    Object.entries(novo.settings ?? {}).filter(([k]) =>
      ["executionOrder", "callerPolicy", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions", "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone"].includes(k),
    ),
  );
  await api("PUT", `/workflows/${alvo}`, {
    name: novo.name,
    nodes: novo.nodes,
    connections: novo.connections,
    settings,
    staticData: novo.staticData ?? null,
  });
  if (atual.active) await api("POST", `/workflows/${alvo}/activate`);

  const final = await lerWorkflow();
  console.log(`\n${resumo(final)}`);
  if (atual.active && final.versionId !== final.activeVersionId) {
    throw new Error("Salvou, mas a versão nova NÃO está publicada: produção segue rodando a anterior. Publique no editor.");
  }
  if (diferenca(novo, final).length) console.log("⚠️ O fluxo lido de volta difere do enviado nos nós acima: confira no editor.");
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  if (comando === "ler") {
    const wf = await lerWorkflow();
    console.log(resumo(wf));
    // `canario` reescreve a expressão inteira pelo modelo acima. Se o nó foi
    // editado à mão e divergiu, ela levaria junto a edição, e é aqui que se vê.
    const lista = listaDoCanario(wf);
    if (lista !== null && expressaoDoDesvio(lista) !== condicaoDoDesvio(wf)!.leftValue) {
      console.log(`⚠️ A expressão do "${NO_DESVIO}" não bate com o modelo deste script: \`canario\` mudaria mais do que a lista.`);
    }
    return;
  }

  if (comando === "salvar") {
    const wf = await lerWorkflow();
    console.log(`${resumo(wf)}\n\nCópia: ${salvarCopia(wf, "manual")}`);
    return;
  }

  if (comando === "aplicar") {
    if (!resto[0]) throw new Error("Diga o arquivo: aplicar <arquivo.json>");
    const novo = JSON.parse(readFileSync(resto[0], "utf-8")) as Workflow;
    // Aplicar a cópia da homologação em produção, ou o contrário, é o erro mais barato de cometer.
    if (novo.id && novo.id !== alvo) throw new Error(`O arquivo é do workflow ${novo.id}, e o alvo é ${alvo}. Recusando.`);
    await escrever(await lerWorkflow(), novo);
    return;
  }

  if (comando === "canario") {
    const todos = process.argv.includes("--todos");
    const ninguem = process.argv.includes("--ninguem");
    if (!todos && !ninguem && !resto.length) throw new Error("Diga os telefones, ou --todos, ou --ninguem.");
    const lista = todos ? "todos" : ninguem ? [] : [...new Set(resto.map(normalizarTelefone))];
    if (lista !== "todos" && lista.some((t) => t.length !== 13)) throw new Error("Telefone precisa ter 13 dígitos depois de normalizado (55 + DDD + 9 dígitos).");

    const atual = await lerWorkflow();
    if (!condicaoDoDesvio(atual)) throw new Error(`O nó "${NO_DESVIO}" não existe neste workflow, ou mudou de formato.`);
    const novo = structuredClone(atual);
    condicaoDoDesvio(novo)!.leftValue = expressaoDoDesvio(lista);
    await escrever(atual, novo);
    return;
  }

  console.log("Comandos: ler | salvar | aplicar <arquivo.json> | canario <tel...>|--todos|--ninguem. Leia o topo do arquivo.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
