export type PedidoAoModelo = {
  etapa: "dominio" | "extracao" | "resposta";
  sistema: string;
  usuario: string;
  nomeDoSchema: string;
  schema: Record<string, unknown>;
};

export type Transporte = (corpo: Record<string, unknown>) => Promise<{ status: number; json: unknown }>;

export class FalhaDoModelo extends Error {
  constructor(readonly motivo: "tempo" | "http" | "formato", mensagem: string) {
    super(mensagem);
    this.name = "FalhaDoModelo";
  }
}

const URL_OPENAI = "https://api.openai.com/v1/chat/completions";
const TEMPO_LIMITE_MS = 15_000;

let transporte: Transporte | null = null;

export function definirTransporteDoModelo(t: Transporte | null) {
  transporte = t;
}

export async function transporteHttp(corpo: Record<string, unknown>) {
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

/** Modelos de raciocínio recusam `temperature` (pesquisa de 14/09) e aceitam `reasoning_effort`. */
function ehModeloDeRaciocinio(modelo: string) {
  return /^(gpt-5|o\d)/.test(modelo);
}

// Padrão: modelo aprovado na medição fora da amostra da Fase 3 (97,7% de
// intenção, 95,7% de campos, zero gravação indevida). Detalhe em
// docs/agents/agente-whatsapp/avaliacao-fase-3-foradaamostra.md.
export async function chamarModelo<T>(pedido: PedidoAoModelo): Promise<T> {
  const modelo = process.env.AGENTE_MODELO || "gpt-5.6-luna";
  const corpo: Record<string, unknown> = {
    model: modelo,
    messages: [
      { role: "system", content: pedido.sistema },
      { role: "user", content: pedido.usuario },
    ],
    response_format: { type: "json_schema", json_schema: { name: pedido.nomeDoSchema, strict: true, schema: pedido.schema } },
    ...(ehModeloDeRaciocinio(modelo)
      ? { reasoning_effort: process.env.AGENTE_ESFORCO || "low" }
      : { temperature: 0 }),
  };
  const enviar = transporte ?? transporteHttp;
  // Uma segunda tentativa para 5xx, 429 e falha de rede; tempo esgotado não,
  // porque seriam mais 15 s com o produtor esperando.
  const tentar = () =>
    enviar(corpo).catch((e: unknown) => {
      if (e instanceof FalhaDoModelo && e.motivo === "http") return null;
      throw e;
    });
  let resposta = await tentar();
  if (!resposta || resposta.status >= 500 || resposta.status === 429) resposta = await enviar(corpo);
  if (resposta.status !== 200) throw new FalhaDoModelo("http", `o modelo respondeu HTTP ${resposta.status}`);
  const conteudo = (resposta.json as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]?.message?.content;
  try {
    return JSON.parse(conteudo ?? "") as T;
  } catch {
    throw new FalhaDoModelo("formato", "o modelo não devolveu JSON");
  }
}
