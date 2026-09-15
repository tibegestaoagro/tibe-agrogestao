import type { Intent } from "@/lib/whatsapp-intents";
import { buscarIntencao, type Dominio } from "./intencoes";
import { chamarModelo } from "./modelo";
import { camposDoDominio, MOLDE_CURRENT_DATE, MOLDE_PERFIS_ATIVOS, promptDeDominio, promptDeExtracao, promptDeResposta } from "./prompts";
import { conferirTrechoLiteral } from "./trecho-literal";

/**
 * Classificação em duas etapas: domínio primeiro (separa a mensagem em
 * pedidos), depois extração por domínio (intenção e campos). "ambigua" nunca
 * chama extração: ela já sai pronta da etapa de domínio.
 */

export type PedidoClassificado = { intent: Intent; parameters: Record<string, unknown>; trecho: string };

type RespostaDominio = { pedidos: { dominio: Dominio | "nenhum"; trecho: string }[] };
type RespostaExtracao = { intent: string; parametros: Record<string, unknown> };

/** Tira `null`, string vazia (ou só espaço) e lista vazia; dentro de item de lista, tira subcampo vazio e o item que fica vazio. */
function limpar(valor: unknown): unknown {
  if (valor === null) return undefined;
  if (typeof valor === "string" && valor.trim() === "") return undefined;
  if (Array.isArray(valor)) {
    const itens = valor
      .map((item) => {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const limpo: Record<string, unknown> = {};
          for (const [chave, v] of Object.entries(item as Record<string, unknown>)) {
            const vl = limpar(v);
            if (vl !== undefined) limpo[chave] = vl;
          }
          return Object.keys(limpo).length > 0 ? limpo : undefined;
        }
        return limpar(item);
      })
      .filter((item) => item !== undefined);
    return itens.length > 0 ? itens : undefined;
  }
  return valor;
}

function limparParametros(parametros: Record<string, unknown>): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(parametros)) {
    const vl = limpar(valor);
    if (vl !== undefined) limpo[chave] = vl;
  }
  return limpo;
}

function normalizarParaComparar(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** O trecho às vezes não é um recorte real da mensagem (o modelo alucina); nesse caso a conferência usa a mensagem inteira, não o trecho torto. */
function trechoOuMensagemInteira(trecho: string, mensagemOriginal: string): string {
  return normalizarParaComparar(mensagemOriginal).includes(normalizarParaComparar(trecho)) ? trecho : mensagemOriginal;
}

async function extrairPedido(dominio: Dominio, trecho: string, hoje: string, mensagemOriginal: string): Promise<PedidoClassificado> {
  const { sistema, schema } = promptDeExtracao(dominio);
  const usuario = `${MOLDE_CURRENT_DATE}${hoje}\nmensagem: ${trecho}`;
  const resposta = await chamarModelo<RespostaExtracao>({
    etapa: "extracao",
    sistema,
    usuario,
    nomeDoSchema: `extracao_${dominio}`,
    schema,
  });

  if (resposta.intent === "ambigua") return { intent: "ambigua", parameters: {}, trecho };

  const limpo = limparParametros(resposta.parametros);
  const textoParaConferencia = trechoOuMensagemInteira(trecho, mensagemOriginal);
  const { parameters } = conferirTrechoLiteral(limpo, textoParaConferencia, camposDoDominio(dominio));

  const intencao = buscarIntencao(resposta.intent);
  const finais: Record<string, unknown> = {};
  if (intencao) {
    for (const campo of intencao.campos) {
      if (campo.nome in parameters) finais[campo.nome] = parameters[campo.nome];
    }
  }

  return { intent: resposta.intent as Intent, parameters: finais, trecho };
}

export async function classificarMensagem(input: { texto: string; hoje: string; perfis: string[] }): Promise<PedidoClassificado[]> {
  const { sistema, schema } = promptDeDominio();
  const usuario = `${MOLDE_PERFIS_ATIVOS}${input.perfis.join(", ")}\nmensagem: ${input.texto}`;
  const resposta = await chamarModelo<RespostaDominio>({ etapa: "dominio", sistema, usuario, nomeDoSchema: "dominio", schema });

  // Sem pedido nenhum é ambígua, nunca lista vazia: quem chama sempre tem algo para responder ao produtor.
  if (resposta.pedidos.length === 0) return [{ intent: "ambigua", parameters: {}, trecho: input.texto }];

  const pedidos: PedidoClassificado[] = [];
  for (const pedido of resposta.pedidos) {
    if (pedido.dominio === "nenhum") {
      pedidos.push({ intent: "ambigua", parameters: {}, trecho: pedido.trecho });
      continue;
    }
    pedidos.push(await extrairPedido(pedido.dominio, pedido.trecho, input.hoje, input.texto));
  }
  return pedidos;
}

export type LeituraDaResposta = { tipo: "responde" | "outro_assunto" };

export async function classificarResposta(input: {
  texto: string;
  pergunta: string;
  intent: Intent;
  campo: string;
}): Promise<LeituraDaResposta> {
  const { sistema, schema } = promptDeResposta();
  const usuario = [
    `pergunta feita ao produtor: ${input.pergunta}`,
    `intent em aberto: ${input.intent}`,
    `campo esperado: ${input.campo}`,
    `mensagem do produtor: ${input.texto}`,
  ].join("\n");
  return chamarModelo<LeituraDaResposta>({ etapa: "resposta", sistema, usuario, nomeDoSchema: "resposta", schema });
}
