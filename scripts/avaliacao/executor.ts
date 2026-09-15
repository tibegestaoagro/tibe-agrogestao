import { classificarMensagem } from "@/lib/agente/classificar";
import { definirTransporteDoModelo, FalhaDoModelo, type Transporte } from "@/lib/agente/modelo";
import { executarTurno, FRASE_DE_FALHA, FRASE_DE_FALHA_PARCIAL } from "@/lib/actions/turno";
import { particaoDoCaso } from "./casos";
import { montarFazenda, contarLinhasDeNegocio } from "./fazenda";
import { custoDaChamada, OrcamentoEsgotado, type Uso } from "./medidor";
import { agregar, aprovar, pontuarMensagem, type Metricas, type NotaDeMensagem, type PedidoObtido } from "./pontuar";
import type { Caso, CasoConversa, CasoMensagem, Gravacao, PassoDeConversa } from "./tipos";

/**
 * Roda um modelo sobre os casos da avaliação (Fase 3): mensagem pela
 * classificação, conversa pelo turno inteiro numa fazenda de avaliação, com a
 * contagem de linhas de negócio antes e depois de cada passo.
 */

/** `falha_do_modelo`: a resposta foi a frase de falha do turno. */
export type PassoAvaliado = { texto: string; grava: Gravacao; linhas_novas: number; indevida: boolean; faltou: boolean; falha_do_modelo: boolean; respostas: string[]; ms: number };
export type ConversaAvaliada = { id: string; passos: PassoAvaliado[] };
export type Particao = "ajuste" | "final" | "todas";
export type NotaAvaliada = NotaDeMensagem & { texto: string; obtidos: PedidoObtido[]; ms: number; falha?: string; falha_detalhe?: string };
export type ResultadoDoModelo = {
  modelo: string;
  esforco: string | null;
  particao: Particao;
  notas: NotaAvaliada[];
  conversas: ConversaAvaliada[];
  metricas: Metricas;
  gravacoes_indevidas: number;
  confirmacoes_que_nao_gravaram: number;
  /** Passos cuja resposta foi a frase de falha do turno. */
  falhas_do_modelo: number;
  aprovacao: { aprovado: boolean; motivos: string[] };
  custo_usd: number;
  custo_por_mil_mensagens: number;
  latencia_p50_ms: number;
  latencia_p95_ms: number;
  interrompido: string | null;
};

/** Hoje fixo: os casos citam "ontem" e "dia 10" contra esta data. */
const HOJE_TEXTO = "2026-09-15";
const HOJE = new Date(2026, 8, 15, 12);
const PERFIS = ["fazenda", "prestador"];
const FRASES_DE_FALHA = new Set([FRASE_DE_FALHA, FRASE_DE_FALHA_PARCIAL]);

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
}

function motivoDaInterrupcao(e: unknown): string {
  return e instanceof OrcamentoEsgotado ? "orçamento" : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/**
 * Decide o que um passo de conversa conta. A frase de falha com a verba no teto é o sinal de que o
 * turno engoliu `OrcamentoEsgotado`: interrompe, e o passo sai da lista porque não foi avaliado,
 * MENOS quando gravou linha, porque gravação indevida nunca some. Verba no teto com resposta normal
 * não interrompe: o modelo que termina a última conversa exatamente no teto terminou.
 */
export function avaliarPasso(
  passo: PassoDeConversa,
  linhas_novas: number,
  respostas: string[],
  ms: number,
  orcamentoEsgotado: () => boolean,
): { passo: PassoAvaliado | null; interromper: boolean } {
  const falhou = respostas.some((t) => FRASES_DE_FALHA.has(t));
  const avaliado: PassoAvaliado = {
    texto: passo.texto,
    grava: passo.grava,
    linhas_novas,
    indevida: passo.grava === "nao" && linhas_novas > 0,
    faltou: passo.grava === "deve" && linhas_novas === 0,
    falha_do_modelo: falhou,
    respostas,
    ms,
  };
  if (falhou && orcamentoEsgotado()) return { passo: linhas_novas > 0 ? avaliado : null, interromper: true };
  return { passo: avaliado, interromper: false };
}

export async function avaliarModelo(opcoes: {
  modelo: string;
  esforco: string | null;
  casos: Caso[];
  particao: Particao;
  transporte: Transporte;
  concorrencia?: number;
  prefixo: string;
  /** O turno engole o erro do transporte: numa conversa, é por aqui que o executor sabe que a verba acabou. */
  orcamentoEsgotado?: () => boolean;
}): Promise<ResultadoDoModelo> {
  const casos = opcoes.particao === "todas" ? opcoes.casos : opcoes.casos.filter((c) => particaoDoCaso(c) === opcoes.particao);
  const mensagens = casos.filter((c): c is CasoMensagem => c.tipo === "mensagem");
  const conversasDoCaso = casos.filter((c): c is CasoConversa => c.tipo === "conversa");
  const esgotado = opcoes.orcamentoEsgotado ?? (() => false);

  // Custo só deste modelo, somado por fora do medidor (que acumula a rodada inteira).
  let custo = 0;
  const transporte: Transporte = async (corpo) => {
    const resposta = await opcoes.transporte(corpo);
    const uso = (resposta.json as { usage?: Uso } | null)?.usage;
    if (uso) custo += custoDaChamada(String(corpo.model), uso);
    return resposta;
  };

  const esforcoAnterior = process.env.AGENTE_ESFORCO;
  const modeloAnterior = process.env.AGENTE_MODELO;
  process.env.AGENTE_MODELO = opcoes.modelo;
  if (opcoes.esforco === null) delete process.env.AGENTE_ESFORCO;
  else process.env.AGENTE_ESFORCO = opcoes.esforco;
  definirTransporteDoModelo(transporte);

  const notasPorIndice: (NotaAvaliada | undefined)[] = [];
  const conversas: ConversaAvaliada[] = [];
  let interrompido: string | null = null;

  try {
    let proxima = 0;
    const trabalhador = async () => {
      while (interrompido === null && proxima < mensagens.length) {
        const indice = proxima++;
        const caso = mensagens[indice];
        const inicio = Date.now();
        try {
          const pedidos = await classificarMensagem({ texto: caso.texto, hoje: HOJE_TEXTO, perfis: PERFIS });
          const obtidos = pedidos.map((p) => ({ intent: p.intent, parameters: p.parameters }));
          notasPorIndice[indice] = { ...pontuarMensagem(caso, obtidos, HOJE), texto: caso.texto, obtidos, ms: Date.now() - inicio };
        } catch (e) {
          if (!(e instanceof FalhaDoModelo)) {
            interrompido ??= motivoDaInterrupcao(e);
            return;
          }
          notasPorIndice[indice] = { ...pontuarMensagem(caso, [], HOJE), texto: caso.texto, obtidos: [], ms: Date.now() - inicio, falha: e.motivo, falha_detalhe: e.message };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opcoes.concorrencia ?? 2) }, trabalhador));

    for (const caso of conversasDoCaso) {
      if (interrompido !== null) break;
      const avaliada: ConversaAvaliada = { id: caso.id, passos: [] };
      conversas.push(avaliada);
      let fazenda: Awaited<ReturnType<typeof montarFazenda>> | null = null;
      try {
        fazenda = await montarFazenda(`${opcoes.prefixo}-${caso.id}`);
        for (const [i, passo] of caso.passos.entries()) {
          const antes = await contarLinhasDeNegocio(fazenda.db);
          const inicio = Date.now();
          const saida = await executarTurno({ telefone: fazenda.telefone, texto: passo.texto, provider_message_id: `${opcoes.prefixo}-${caso.id}-${i}` });
          const ms = Date.now() - inicio;
          const linhas_novas = (await contarLinhasDeNegocio(fazenda.db)) - antes;
          const r = avaliarPasso(passo, linhas_novas, saida.mensagens.map((m) => m.texto), ms, esgotado);
          if (r.passo) avaliada.passos.push(r.passo);
          if (r.interromper) {
            interrompido = "orçamento";
            break;
          }
        }
      } catch (e) {
        interrompido = motivoDaInterrupcao(e);
      } finally {
        // Limpeza que quebra não pode jogar fora o resultado já pago do modelo.
        if (fazenda) {
          await fazenda.limpar().catch((e: unknown) => {
            console.warn(`avaliação: limpeza da fazenda ${caso.id} falhou: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
          });
        }
      }
    }
  } finally {
    definirTransporteDoModelo(null);
    if (modeloAnterior === undefined) delete process.env.AGENTE_MODELO;
    else process.env.AGENTE_MODELO = modeloAnterior;
    if (esforcoAnterior === undefined) delete process.env.AGENTE_ESFORCO;
    else process.env.AGENTE_ESFORCO = esforcoAnterior;
  }

  const notas = notasPorIndice.filter((n): n is NotaAvaliada => n !== undefined);
  const passos = conversas.flatMap((c) => c.passos);
  const metricas = agregar(notas);
  const gravacoes_indevidas = passos.filter((p) => p.indevida).length;
  const latencias = [...notas.map((n) => n.ms), ...passos.map((p) => p.ms)];
  const avaliados = notas.length + passos.length;
  const falhas_do_modelo = passos.filter((p) => p.falha_do_modelo).length;
  const { motivos } = aprovar(metricas, gravacoes_indevidas, { falhas: falhas_do_modelo, passos: passos.length });
  // Resultado parcial nunca aprova: os casos que faltaram podiam reprovar.
  if (interrompido !== null) motivos.push(`interrompido: ${interrompido}`);

  return {
    modelo: opcoes.modelo,
    esforco: opcoes.esforco,
    particao: opcoes.particao,
    notas,
    conversas,
    metricas,
    gravacoes_indevidas,
    confirmacoes_que_nao_gravaram: passos.filter((p) => p.faltou).length,
    falhas_do_modelo,
    aprovacao: { aprovado: motivos.length === 0, motivos },
    custo_usd: custo,
    custo_por_mil_mensagens: avaliados === 0 ? 0 : (custo / avaliados) * 1000,
    latencia_p50_ms: percentil(latencias, 50),
    latencia_p95_ms: percentil(latencias, 95),
    interrompido,
  };
}
