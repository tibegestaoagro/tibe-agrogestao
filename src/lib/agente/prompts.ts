import { createHash } from "node:crypto";
import { DESCRICAO_DOS_DOMINIOS, DOMINIOS, intencoesDoDominio, type CampoDef, type Dominio, type IntencaoDef } from "./intencoes";

/**
 * Prompts gerados do registro de intenções (`src/lib/agente/intencoes/`), não
 * escritos à mão: um domínio, uma intenção ou um campo novo no registro entra
 * aqui sem editar este arquivo. Os três prompts são internos (classificação),
 * não conversam com o produtor.
 */

/**
 * Moldes do texto do usuário nas chamadas de domínio e extração
 * (`classificar.ts` monta o texto final com eles). Entram na
 * `VERSAO_DO_PROMPT` porque mudar o molde também muda o que o modelo lê.
 */
export const MOLDE_PERFIS_ATIVOS = "perfis ativos: ";
export const MOLDE_CURRENT_DATE = "current_date: ";

/**
 * Campos de todas as intenções de um domínio, sem repetir nome (o classificador extrai todos de uma vez).
 *
 * Quando o mesmo nome tem descrições diferentes em duas intenções, a descrição
 * do schema junta as duas, cada uma marcada com a intenção a que pertence.
 * Antes ficava só a PRIMEIRA, e ela chegava a contradizer a outra sem que se
 * pudesse ver isso lendo o registro: em `financeiro`, `tipo` era "receita
 * quando o dinheiro ENTROU, vazio quando é despesa", e `gerar_relatorio` saía
 * sem a área pedida nas duas medições da Fase 3; em `servicos`, `quem` era "o
 * nome de quem trabalhou", e as quatro intenções de andamento perdiam o
 * cliente.
 */
export function camposDoDominio(dominio: Dominio): CampoDef[] {
  const porNome = new Map<string, { campo: CampoDef; porDescricao: Map<string, string[]> }>();
  for (const intencao of intencoesDoDominio(dominio)) {
    for (const campo of intencao.campos) {
      const atual = porNome.get(campo.nome) ?? { campo, porDescricao: new Map<string, string[]>() };
      atual.porDescricao.set(campo.descricao, [...(atual.porDescricao.get(campo.descricao) ?? []), intencao.intent]);
      porNome.set(campo.nome, atual);
    }
  }
  return [...porNome.values()].map(({ campo, porDescricao }) =>
    porDescricao.size === 1
      ? campo
      : {
          ...campo,
          descricao: [...porDescricao].map(([descricao, intents]) => `em ${intents.join(", ")}: ${descricao}`).join("; "),
        },
  );
}

function objetoFechado(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

/** O tipo JSON Schema de cada `TipoDeCampo`, para o modo estrito da OpenAI. */
function schemaDeCampo(campo: CampoDef): Record<string, unknown> {
  switch (campo.tipo) {
    case "texto":
    case "data":
      return { type: ["string", "null"], description: campo.descricao };
    case "numero":
      return { type: ["string", "number", "null"], description: campo.descricao };
    case "sim_nao":
      return { type: ["boolean", "string", "null"], description: campo.descricao };
    case "lista": {
      if (!campo.itens || campo.itens.length === 0) {
        return { type: ["array", "null"], description: campo.descricao, items: { type: "string" } };
      }
      const properties: Record<string, unknown> = {};
      for (const sub of campo.itens) properties[sub.nome] = schemaDeCampo(sub);
      return {
        type: ["array", "null"],
        description: campo.descricao,
        items: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
      };
    }
  }
}

function textoDoCampo(campo: CampoDef): string {
  if (campo.tipo === "lista" && campo.itens) {
    return `${campo.nome} (lista de {${campo.itens.map((s) => s.nome).join(", ")}}): ${campo.descricao}`;
  }
  return `${campo.nome} (${campo.tipo}): ${campo.descricao}`;
}

function textoDaIntencao(intencao: IntencaoDef): string {
  const linhas = [
    `- ${intencao.intent}: ${intencao.descricao}`,
    `  campos: ${intencao.campos.map(textoDoCampo).join("; ")}`,
    `  exemplos: ${intencao.exemplos.join(" | ")}`,
  ];
  if (intencao.vizinhas) linhas.push(`  vizinhas: ${intencao.vizinhas}`);
  return linhas.join("\n");
}

export function promptDeDominio(): { sistema: string; schema: Record<string, unknown> } {
  const listaDeDominios = Object.entries(DESCRICAO_DOS_DOMINIOS)
    .map(([dominio, descricao]) => `- ${dominio}: ${descricao}`)
    .join("\n");
  const sistema = [
    "Você separa a mensagem do produtor em pedidos: um pedido por AÇÃO pedida, mesmo quando duas ações são do mesmo domínio, na ordem em que aparecem na mensagem.",
    'Exemplo com duas ações do mesmo domínio: "vendi 10 bois e morreram 2 vacas" são DOIS pedidos de rebanho, não um.',
    "",
    "O que NÃO abre pedido novo, e por isso fica DENTRO do trecho da ação:",
    "- valor, custo, frete, comissão, diferença de troca, desconto, prazo ou data de pagamento ditos junto com a ação.",
    '- a mesma ação sobre várias coisas ("anota sal e dois vermífugos na lista", "nasceram 4 machos e 3 fêmeas"): é UM pedido só.',
    "- consulta sobre o mesmo dia ou período, mesmo citando assuntos diferentes (tarefa, conta, vacina): é UM pedido só; períodos diferentes são pedidos diferentes.",
    "- de onde os animais saíram, para onde foram e o que houve com eles (venderam, morreram, voltaram ao pasto), com o valor: é UMA movimentação só. Sair do LEITE é a exceção: vaca que parou de dar leite é um pedido, e o lugar para onde ela foi é outro.",
    '- pedido que ele desfaz ou adia NA MESMA MENSAGEM ("anota 5 metros de corda na lista, não, depois eu vejo"): esse pedido não vira pedido nenhum, e o resto da mensagem continua valendo.',
    '- desistir de algo que ele pediu numa mensagem ANTERIOR não apaga o que ele pede agora: quando a mesma mensagem emenda um pedido novo, esse pedido vale normalmente, mesmo emendado por "mas" ou "só que".',
    '- corrigir o número, o nome ou a data logo depois de falar ("foram 30, quer dizer 40") NÃO desfaz nada: é o mesmo pedido, com o último valor que ele falou.',
    "",
    "Domínios possíveis:",
    listaDeDominios,
    "",
    "Para cada pedido, informe o domínio e o trecho literal da mensagem que corresponde a ele. O trecho é sempre um recorte literal da mensagem do produtor, nunca um resumo.",
    'Parte que o Tibé não faz (previsão do tempo, achar comprador, conselho): ignore quando a mensagem tem outro pedido válido. Só quando NADA na mensagem é pedido do Tibé devolva um pedido único, com domínio "nenhum".',
    'Pergunta sobre o que ele já fez num período ("quantos nasceram no ano passado", "quanto de adubo saiu em julho", "será que já acertei com o veterinário"): as consultas do Tibé só dizem como as coisas estão HOJE, então ela vai com domínio "nenhum". Saldo ou caixa do mês, relatório, e quanto um CLIENTE dele deve ou já pagou são a exceção: esses existem.',
  ].join("\n");
  const schema = objetoFechado({
    pedidos: {
      type: "array",
      items: objetoFechado({
        dominio: { type: "string", enum: [...DOMINIOS, "nenhum"] },
        trecho: { type: "string" },
      }),
    },
  });
  return { sistema, schema };
}

export function promptDeExtracao(dominio: Dominio): { sistema: string; schema: Record<string, unknown> } {
  const intencoes = intencoesDoDominio(dominio);
  const sistema = [
    `Você extrai a intenção e os campos de um pedido do produtor sobre ${dominio}.`,
    "",
    "Intenções possíveis:",
    intencoes.map(textoDaIntencao).join("\n\n"),
    "",
    "Regras:",
    "- Extraia só o que o produtor disse; nunca invente brinco, cliente ou valor.",
    '- Repasse número e data como o produtor falou, sem calcular ("60 mil" continua "60 mil"; "dia 10", "hoje" e "ontem" continuam do jeito que ele falou, nunca viram uma data calculada).',
    '- Só o que ele falou por extenso vira algarismo, com o mesmo valor e nada mais: "quinze" é 15, "mil e duzentos" é 1200, "dia dez" é "dia 10", e o brinco "setenta e nove" é 79.',
    '- current_date é só contexto para você entender expressões relativas; nunca use current_date para preencher ou converter um campo de data.',
    "- Use \"ambigua\" quando o pedido não corresponde a nenhuma intenção listada.",
  ].join("\n");
  const campos = camposDoDominio(dominio);
  const parametros: Record<string, unknown> = {};
  for (const campo of campos) parametros[campo.nome] = schemaDeCampo(campo);
  const schema = objetoFechado({
    intent: { type: "string", enum: [...intencoes.map((i) => i.intent), "ambigua"] },
    parametros: objetoFechado(parametros),
  });
  return { sistema, schema };
}

export function promptDeResposta(): { sistema: string; schema: Record<string, unknown> } {
  const sistema = [
    "Você decide se a mensagem do produtor responde à pergunta em aberto ou muda de assunto.",
    "",
    '"responde": a MENSAGEM INTEIRA é a resposta ao campo esperado, nada mais.',
    '"outro_assunto": a mensagem traz qualquer pedido novo, mesmo que também responda à pergunta junto.',
    "Confirmação (sim ou não) não se decide aqui: isso é outra etapa.",
    "",
    '"valor": só o trecho da mensagem que responde ao campo esperado, copiado literalmente, sem corrigir nem completar; null quando é "outro_assunto".',
  ].join("\n");
  const schema = objetoFechado({
    tipo: { type: "string", enum: ["responde", "outro_assunto"] },
    valor: { type: ["string", "null"] },
  });
  return { sistema, schema };
}

function calcularVersaoDoPrompt(): string {
  const partes: string[] = [MOLDE_PERFIS_ATIVOS, MOLDE_CURRENT_DATE];
  const dominio = promptDeDominio();
  partes.push(dominio.sistema, JSON.stringify(dominio.schema));
  const resposta = promptDeResposta();
  partes.push(resposta.sistema, JSON.stringify(resposta.schema));
  for (const d of DOMINIOS) {
    const extracao = promptDeExtracao(d);
    partes.push(extracao.sistema, JSON.stringify(extracao.schema));
  }
  return createHash("sha256").update(partes.join("\n")).digest("hex").slice(0, 12);
}

/** sha256 dos prompts de todos os domínios, 12 primeiros caracteres. Muda quando o registro muda. */
export const VERSAO_DO_PROMPT: string = calcularVersaoDoPrompt();
