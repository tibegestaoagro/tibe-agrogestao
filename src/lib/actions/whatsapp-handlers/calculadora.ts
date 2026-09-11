import { calcularCerca } from "@/lib/calculadoras/cerca";
import { calcularSementes, TAXAS_SUGERIDAS } from "@/lib/calculadoras/sementes";
import { calcularSalMineral } from "@/lib/calculadoras/sal-mineral";
import { calcularMistura, type IngredienteEntrada } from "@/lib/calculadoras/mistura";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { ask, str, normalizarTermo, type Handler, type RouterResult } from "./shared";

/**
 * A Calculadora pelo WhatsApp (§40 do documento do cliente).
 *
 * As quatro conversas que o §40 escreve: cerca, sementes, sal e racao. Sao as
 * unicas em que o produtor pergunta de boca, e nao sentado na frente da tela.
 *
 * ⚠️ **O classificador do n8n ainda NAO emite estas intencoes**, como acontece
 * com as da Lista de Compra, do evento e da permuta. Elas ficam roteadas e
 * testadas, esperando a rodada em que o agente for atualizado. Decisao do
 * usuario em 11/09: construir agora, descongelar depois.
 *
 * ⚠️ **Nada aqui grava nada.** O §4 diz que o calculo e simulacao, e o §26
 * repete para a venda. Se um handler deste arquivo importar uma action de
 * escrita, o desenho saiu do trilho.
 *
 * ⚠️ **Pergunta so o que falta** (§3.2 e §40): "vou fazer 1.000 metros de cerca
 * com 5 fios" ja trouxe dois dos tres parametros, e repetir os tres seria o
 * assistente ignorando o que acabou de ouvir.
 */

/** Resposta sem confirmacao: calcular nao muda nada, entao nao ha o que confirmar. */
function responder(texto: string, acao: string): RouterResult {
  return {
    reply_text: texto,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: acao,
  };
}

/** O numero como o produtor fala, aceitando nome alternativo de campo. */
function numeroDe(parameters: Record<string, unknown>, ...chaves: string[]): number | null {
  for (const chave of chaves) {
    const valor = lerNumeroBr(parameters[chave]);
    if (valor !== null) return valor;
  }
  return null;
}

export const calcularCercaWhatsapp: Handler = async ({ parameters }) => {
  const comprimento = numeroDe(parameters, "comprimento", "metros", "tamanho");
  const fios = numeroDe(parameters, "fios", "numero_fios", "quantidade_fios");
  const espacamento = numeroDe(parameters, "espacamento", "distancia_mouroes", "distancia");

  if (comprimento === null) return ask("Quantos metros de cerca voce vai fazer?");
  if (fios === null) return ask("Quantos fios de arame essa cerca vai ter?");
  if (espacamento === null) return ask("Qual a distancia entre os mouroes, em metros?");

  const r = calcularCerca({
    comprimentoMetros: comprimento,
    numeroFios: fios,
    espacamentoMetros: espacamento,
    metrosPorRoloArame: numeroDe(parameters, "metros_por_rolo") ?? undefined,
  });
  if (!r.ok) return ask(r.error);

  const rolos =
    r.data.rolosDeArameNecessarios !== null
      ? ` (${r.data.rolosDeArameNecessarios} rolos)`
      : "";

  return responder(
    `Para ${comprimento} metros de cerca com ${fios} fios e mouroes a cada ${espacamento} metros, voce vai precisar de aproximadamente:\n` +
      `- ${r.data.mouroesNecessarios} mouroes\n` +
      `- ${r.data.metrosDeArameNecessarios} metros de arame${rolos}\n` +
      `- ${r.data.gramposKg} kg de grampos`,
    "calcular_cerca",
  );
};

export const calcularSementesWhatsapp: Handler = async ({ parameters }) => {
  const area = numeroDe(parameters, "area", "hectares", "area_hectares");
  if (area === null) return ask("Quantos hectares voce vai plantar?");

  const variedadeDita = str(parameters.variedade) ?? str(parameters.capim) ?? str(parameters.produto);
  const sugerida = variedadeDita
    ? TAXAS_SUGERIDAS.find((t) => normalizarTermo(t.variedade).includes(normalizarTermo(variedadeDita)))
    : undefined;

  const taxa = numeroDe(parameters, "taxa", "kg_por_hectare", "taxa_kg_ha") ?? sugerida?.kgPorHectare ?? null;
  if (taxa === null) {
    return ask(
      variedadeDita
        ? `Quantos quilos de semente por hectare voce quer usar no ${variedadeDita}?`
        : "Quantos quilos de semente por hectare voce quer usar?",
    );
  }

  const pesoSaca = numeroDe(parameters, "peso_saca", "peso_embalagem", "kg_por_saca") ?? undefined;
  const r = calcularSementes({ areaHectares: area, taxaKgPorHectare: taxa, pesoEmbalagemKg: pesoSaca });
  if (!r.ok) return ask(r.error);

  /*
   * A referencia usada aparece na resposta, como o §40 e o §45 pedem: o
   * produtor precisa saber que aqueles 12 kg/ha sao sugestao de partida, e nao
   * um numero que o sistema descobriu sobre a terra dele.
   */
  const origemDaTaxa = sugerida && numeroDe(parameters, "taxa", "kg_por_hectare", "taxa_kg_ha") === null
    ? ` Usei ${taxa} kg/ha, que e a referencia para ${sugerida.variedade}; se o seu tecnico indicou outra taxa, e so me dizer.`
    : "";

  const sacas =
    r.data.sacas !== null
      ? `, o que da ${r.data.sacas} sacas de ${pesoSaca} kg` + (r.data.sobraKg ? ` (sobram ${r.data.sobraKg} kg)` : "")
      : "";

  return responder(
    `Para ${area} hectares voce vai precisar de aproximadamente ${r.data.totalKg} kg de semente${sacas}.${origemDaTaxa}`,
    "calcular_sementes",
  );
};

export const calcularSalWhatsapp: Handler = async ({ parameters }) => {
  const animais = numeroDe(parameters, "animais", "quantidade", "numero_animais", "cabecas");
  if (animais === null) return ask("Quantos animais vao comer esse sal?");

  const dias = numeroDe(parameters, "dias", "periodo", "dias_periodo");
  if (dias === null) return ask("Por quantos dias voce quer calcular?");

  const consumo = numeroDe(parameters, "consumo", "gramas_por_animal", "consumo_dia");
  const peso = numeroDe(parameters, "peso", "peso_medio") ?? 450;

  const r = calcularSalMineral({
    numeroAnimais: animais,
    diasPeriodo: dias,
    pesoMedioKg: peso,
    consumoGDiaPorAnimal: consumo ?? undefined,
    pesoSacaKg: numeroDe(parameters, "peso_saca", "kg_por_saca") ?? undefined,
  });
  if (!r.ok) return ask(r.error);

  const sacas = r.data.sacas !== null ? ` Isso da ${r.data.sacas} sacas.` : "";

  /*
   * Sem consumo informado a resposta sai em FAIXA, e diz o peso que assumiu.
   * Numero unico esconderia que a estimativa depende do peso do animal, e o
   * §45 manda apresentar referencia como referencia.
   */
  if (r.data.consumoInformado) {
    return responder(
      `${animais} animais consumindo ${consumo} g por dia comem ${r.data.consumoMaxKgPeriodoRebanho} kg de sal em ${dias} dias.${sacas}`,
      "calcular_sal",
    );
  }

  return responder(
    `Para ${animais} animais de ${peso} kg em ${dias} dias, a estimativa e de ${r.data.consumoMinKgPeriodoRebanho} a ${r.data.consumoMaxKgPeriodoRebanho} kg de sal mineral.${sacas} ` +
      "Se voce souber o consumo por animal que o rotulo do seu sal indica, me diga que eu refaco a conta.",
    "calcular_sal",
  );
};

/**
 * "Quero fazer 500 kg daquela racao de 65% milho, 29% soja e 6% nucleo".
 *
 * O classificador manda os ingredientes como lista de objetos, ou como texto.
 * As duas formas sao aceitas pelo mesmo motivo da Lista de Compra: exigir a
 * primeira jogaria fora a frase que o produtor de fato fala.
 */
function lerIngredientes(parameters: Record<string, unknown>): IngredienteEntrada[] {
  const bruto = parameters.ingredientes ?? parameters.receita ?? parameters.itens;

  if (Array.isArray(bruto)) {
    return bruto
      .map((linha): IngredienteEntrada | null => {
        if (typeof linha === "string") return lerIngredienteDeTexto(linha);
        if (linha && typeof linha === "object") {
          const obj = linha as Record<string, unknown>;
          const nome = str(obj.nome) ?? str(obj.ingrediente) ?? str(obj.produto);
          const percentual = lerNumeroBr(obj.percentual ?? obj.porcentagem ?? obj.percent);
          if (!nome || percentual === null) return null;
          return { nome, percentual };
        }
        return null;
      })
      .filter((i): i is IngredienteEntrada => i !== null);
  }

  const texto = str(bruto);
  if (!texto) return [];
  return texto
    .split(/,| e |;/)
    .map(lerIngredienteDeTexto)
    .filter((i): i is IngredienteEntrada => i !== null);
}

/** "65% milho" e "milho 65%" sao a mesma coisa para quem fala. */
function lerIngredienteDeTexto(texto: string): IngredienteEntrada | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const casa = limpo.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!casa) return null;
  const percentual = lerNumeroBr(casa[1]);
  const nome = limpo.replace(casa[0], "").replace(/\s+de\s+/i, " ").trim();
  if (percentual === null || !nome) return null;
  return { nome, percentual };
}

export const calcularRacaoWhatsapp: Handler = async ({ parameters }) => {
  const ingredientes = lerIngredientes(parameters);
  if (ingredientes.length === 0) {
    return ask("Quais sao os ingredientes da receita, e a porcentagem de cada um?");
  }

  const quantidade = numeroDe(parameters, "quantidade", "kg", "quantidade_final", "total");
  if (quantidade === null) return ask("Quantos quilos dessa mistura voce quer fazer?");

  const r = calcularMistura({ ingredientes, quantidadeFinalKg: quantidade });
  if (!r.ok) return ask(r.error);

  const linhas = r.data.ingredientes
    .map((i) => `- ${i.nome}: ${i.quantidadeKg} kg`)
    .join("\n");

  const custo = r.data.custoTotal !== null ? `\nCusto total: ${reaisBr(r.data.custoTotal)}` : "";

  return responder(`Para ${r.data.quantidadeFinalKg} kg dessa mistura:\n${linhas}${custo}`, "calcular_racao");
};
