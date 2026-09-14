import { classificar, lerItensDoDia, type ItemDoDia } from "@/lib/actions/meu-dia";
import { saudacaoEmSaoPaulo } from "@/lib/dia-calendario";
import { reaisBr } from "@/lib/numero-br";
import type { Handler, RouterResult } from "./shared";

/**
 * O Meu Dia pelo WhatsApp (§38 a §40).
 *
 * "O que tenho para hoje?", "e amanhã?", "o que tenho essa semana?". As três
 * leem a MESMA consulta da tela, na mesma ordem do §50: o que o produtor lê no
 * celular não pode divergir do que ele vê no painel.
 *
 * ⚠️ **Só consultam** (decisão 38.3). Concluir e alterar tarefa por frase
 * ("já arrumei a cerca") ficam fora: casar texto com tarefa erra calado, e o
 * pasto ambíguo já mostrou o preço disso. Criar continua em `criar_tarefa`.
 *
 * ⚠️ **O classificador do n8n ainda NÃO emite estas três**, como as da
 * calculadora, da Lista de Compra, do evento e da permuta.
 */

/** Uma resposta curta de WhatsApp não é a tela: o resto está a um toque. */
const LIMITE_POR_BLOCO = 6;

function responder(texto: string, acao: string): RouterResult {
  return {
    reply_text: texto,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: acao,
  };
}

/** "Pagar João, R$ 2.500,00", "14:00, veterinário". Sem travessão: vírgula. */
function linha(item: ItemDoDia): string {
  const partes = [item.horario ? `${item.horario}, ${item.titulo}` : item.titulo];
  if (item.valor !== null) partes.push(reaisBr(item.valor));
  return `• ${partes.join(", ")}`;
}

function bloco(itens: ItemDoDia[]): string {
  const visiveis = itens.slice(0, LIMITE_POR_BLOCO).map(linha);
  const resto = itens.length - visiveis.length;
  if (resto > 0) visiveis.push(`• e mais ${resto} no painel`);
  return visiveis.join("\n");
}

function contagem(n: number): string {
  return n === 1 ? "1 coisa" : `${n} coisas`;
}

export const consultarMeuDia: Handler = async ({ db }) => {
  const dia = classificar(await lerItensDoDia(db));

  if (dia.hoje.length === 0 && dia.atencao.length === 0) {
    return responder(`${saudacaoEmSaoPaulo()}. Não tem nada marcado para hoje, e nada atrasado.`, "consultar_meu_dia");
  }

  const partes = [`${saudacaoEmSaoPaulo()}.`];
  if (dia.hoje.length > 0) {
    partes.push(`Hoje você tem ${contagem(dia.hoje.length)} para acompanhar:\n${bloco(dia.hoje)}`);
  } else {
    partes.push("Não tem nada marcado para hoje.");
  }
  /*
   * §45: atrasado é justamente o que não pode ficar de fora do resumo, mas vem
   * DEPOIS de hoje, para a mensagem não abrir com uma lista de cobrança.
   */
  if (dia.atencao.length > 0) {
    const verbo = dia.atencao.length === 1 ? "precisa" : "precisam";
    partes.push(`E ${contagem(dia.atencao.length)} ${verbo} de atenção:\n${bloco(dia.atencao)}`);
  }

  return responder(partes.join("\n\n"), "consultar_meu_dia");
};

export const consultarAmanha: Handler = async ({ db }) => {
  const dia = classificar(await lerItensDoDia(db));
  const amanha = dia.proximos.filter((i) => i.dias === 1);

  if (amanha.length === 0) {
    return responder("Não tem nada marcado para amanhã.", "consultar_amanha");
  }
  return responder(`Amanhã você tem ${contagem(amanha.length)}:\n${bloco(amanha)}`, "consultar_amanha");
};

const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

/**
 * §40: "o TIBÉ poderá organizar os principais compromissos por dia". Hoje
 * entra junto, porque "essa semana" inclui o dia de hoje para quem pergunta.
 */
export const consultarSemana: Handler = async ({ db }) => {
  const dia = classificar(await lerItensDoDia(db));
  const semana = [...dia.hoje, ...dia.proximos];

  if (semana.length === 0) {
    return responder("Não tem nada marcado para os próximos 7 dias.", "consultar_semana");
  }

  const porDia = new Map<number, ItemDoDia[]>();
  for (const item of semana) {
    if (item.dias === null) continue;
    const lista = porDia.get(item.dias) ?? [];
    lista.push(item);
    porDia.set(item.dias, lista);
  }

  const blocos = [...porDia.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dias, itens]) => {
      const nome =
        dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : DIA_DA_SEMANA.format(itens[0].data!).replace(/^./, (c) => c.toUpperCase());
      return `${nome}:\n${bloco(itens)}`;
    });

  return responder(`Nos próximos 7 dias:\n\n${blocos.join("\n\n")}`, "consultar_semana");
};
