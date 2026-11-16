import { getRedisConnection } from "@/lib/redis";

/**
 * Busca de endereço pelo CEP (Q337 a Q339, spec 2026-11-16). Só os 8 números saem para
 * fora: nenhum cabeçalho nem dado do tenant, do usuário ou do cliente.
 */

export type EnderecoDoCep = {
  cep: string;
  street: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export type ResultadoDoCep =
  | { tipo: "achado"; endereco: EnderecoDoCep }
  | { tipo: "inexistente" }
  | { tipo: "fora" };

export type FetchCep = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const LIMITE_POR_SERVICO_MS = 3000;
const CACHE_ACHADO_SEG = 30 * 24 * 3600;
const CACHE_INEXISTENTE_SEG = 24 * 3600;

/** Só os dígitos; devolve os 8 números ou null quando o CEP não tem exatamente 8. */
export function normalizarCep(entrada: string): string | null {
  const digitos = String(entrada ?? "").replace(/\D/g, "");
  return digitos.length === 8 ? digitos : null;
}

function textoOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Chama o serviço com limite de tempo; o limite vale também para a leitura do corpo. */
async function chamar(
  fetchImpl: FetchCep,
  url: string,
): Promise<{ status: number; json: unknown }> {
  const controle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeita) => {
    timer = setTimeout(() => {
      controle.abort();
      rejeita(new Error("tempo esgotado"));
    }, LIMITE_POR_SERVICO_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const resp = await fetchImpl(url, { signal: controle.signal });
        let json: unknown = null;
        if (resp.status !== 404) json = await resp.json();
        return { status: resp.status, json };
      })(),
      limite,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function viaCep(fetchImpl: FetchCep, cep: string): Promise<ResultadoDoCep> {
  const { status, json } = await chamar(fetchImpl, `https://viacep.com.br/ws/${cep}/json/`);
  if (status < 200 || status >= 300 || typeof json !== "object" || json === null) {
    throw new Error(`ViaCEP ${status}`);
  }
  const d = json as Record<string, unknown>;
  if (d.erro) return { tipo: "inexistente" };
  return {
    tipo: "achado",
    endereco: {
      cep,
      street: textoOuNull(d.logradouro),
      district: textoOuNull(d.bairro),
      city: textoOuNull(d.localidade),
      state: textoOuNull(d.uf),
    },
  };
}

async function brasilApi(fetchImpl: FetchCep, cep: string): Promise<ResultadoDoCep> {
  const { status, json } = await chamar(fetchImpl, `https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (status === 404) return { tipo: "inexistente" };
  if (status < 200 || status >= 300 || typeof json !== "object" || json === null) {
    throw new Error(`BrasilAPI ${status}`);
  }
  const d = json as Record<string, unknown>;
  return {
    tipo: "achado",
    endereco: {
      cep,
      street: textoOuNull(d.street),
      district: textoOuNull(d.neighborhood),
      city: textoOuNull(d.city),
      state: textoOuNull(d.state),
    },
  };
}

function chaveDoCache(cep: string): string {
  return `tibe:cep:${cep}`;
}

async function lerCache(cep: string): Promise<ResultadoDoCep | null> {
  try {
    const bruto = await getRedisConnection().get(chaveDoCache(cep));
    if (!bruto) return null;
    const v = JSON.parse(bruto) as { inexistente?: boolean; endereco?: EnderecoDoCep };
    if (v.inexistente) return { tipo: "inexistente" };
    if (v.endereco) return { tipo: "achado", endereco: v.endereco };
    return null;
  } catch {
    return null;
  }
}

async function gravarCache(cep: string, r: ResultadoDoCep): Promise<void> {
  try {
    if (r.tipo === "achado") {
      await getRedisConnection().set(
        chaveDoCache(cep),
        JSON.stringify({ endereco: r.endereco }),
        "EX",
        CACHE_ACHADO_SEG,
      );
    } else if (r.tipo === "inexistente") {
      await getRedisConnection().set(
        chaveDoCache(cep),
        JSON.stringify({ inexistente: true }),
        "EX",
        CACHE_INEXISTENTE_SEG,
      );
    }
  } catch {
    // Redis fora não quebra a busca: só não guarda.
  }
}

/**
 * Consulta o CEP (já com 8 números): cache, depois ViaCEP e, se ele falhar ou demorar, BrasilAPI.
 * `fetchImpl` é injetável para a suíte rodar sem rede.
 */
export async function consultarCep(
  cep: string,
  fetchImpl: FetchCep = fetch as FetchCep,
): Promise<ResultadoDoCep> {
  const guardado = await lerCache(cep);
  if (guardado) return guardado;

  let resultado: ResultadoDoCep;
  try {
    resultado = await viaCep(fetchImpl, cep);
  } catch {
    try {
      resultado = await brasilApi(fetchImpl, cep);
    } catch {
      return { tipo: "fora" };
    }
  }
  await gravarCache(cep, resultado);
  return resultado;
}
