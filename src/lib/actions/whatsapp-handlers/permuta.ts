import { createBarter, type LadoEntregue, type LadoRecebido } from "@/lib/actions/barters";
import {
  savePendingBarter,
  loadPendingBarter,
  clearPendingBarter,
  aplicarRespostaPermuta,
  type CampoPermuta,
} from "@/lib/actions/barter-pending";
import {
  resolverCategoria,
  resolverFazenda,
  nomeDaCategoria,
  conferirOndeEstaOSaldo,
  resolverPasto,
} from "./herd";
import { ask, failReply, str, type Handler } from "./shared";
import { lerDinheiro } from "./parsers";

/**
 * Permuta pelo WhatsApp (Módulo 31, missão 4, §18.5).
 *
 * O diálogo que o documento pede, literal:
 *
 *   Usuário: "Troquei 20 bois por um trator e paguei mais 30 mil."
 *   Tibé:    "Entendi a seguinte permuta: Entregou: 20 bois; Recebeu: 1
 *             trator; Diferença paga: R$ 30.000,00. Deseja registrar?"
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar completo). Esta intenção existe, é roteada e é
 * testada, e fica esperando o dia em que o classificador aprender a emiti-la.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado em
 *    `barter-pending.ts`, nunca o que o classificador remontou da própria
 *    resposta do assistente.
 * 3. **Confirmação sempre.** Uma permuta grava rebanho, estoque, máquina E
 *    dinheiro numa tacada, e desfazer exige cancelar a negociação inteira.
 *
 * ⚠️ LIMITAÇÃO DELIBERADA DA V1: pela conversa só entram os lados `animais` e
 * `descricao`. Máquina e produto exigem escolher um registro do catálogo, e o
 * handler de estoque já mostrou o estrago de adivinhar produto pela conversa
 * ("sal", "sal mineral" e "sal mineral 60" viram três saldos para a mesma
 * coisa). Quando o lado é máquina ou produto, o assistente manda o produtor
 * para o painel, em vez de chutar.
 */

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Lê um lado da frase. Devolve o lado montado, ou a razão de não conseguir.
 *
 * "20 bois" vira `animais`; qualquer outra coisa vira `descricao`, que é o
 * lado sem área no Tibé. As palavras de máquina e de estoque são recusadas de
 * propósito, e não caem em `descricao`: registrar "um trator" como texto
 * deixaria a máquina fora do cadastro sem ninguém perceber.
 */
const PALAVRAS_DE_MAQUINA = [
  "trator",
  "colheitadeira",
  "pulverizador",
  "implemento",
  "grade",
  "plantadeira",
  "roçadeira",
  "rocadeira",
  "caminhão",
  "caminhao",
  "camionete",
  "caminhonete",
];

/**
 * Os dois únicos formatos que a conversa monta. Os outros três (`produtos` e
 * `maquina`) exigem escolher um registro do catálogo, e por isso são recusados
 * com o motivo `catalogo` em vez de virarem descrição.
 */
type LadoDaConversa =
  | { kind: "animais"; category_id: string; quantity: number }
  | { kind: "descricao"; texto: string };

type LadoLido =
  | { ok: true; lado: LadoDaConversa }
  | { ok: false; motivo: "vazio" | "catalogo" | "categoria"; texto: string };

function lerLado(bruto: string | null): LadoLido {
  if (!bruto) return { ok: false, motivo: "vazio", texto: "" };

  const limpo = bruto.trim();
  const semAcento = limpo
    .normalize("NFD")
    // Escape explícito, não o caractere combinante cru: ele é invisível no
    // editor e some numa cópia distraída. Mesma convenção de `estoque.ts`.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (PALAVRAS_DE_MAQUINA.some((p) => semAcento.includes(p))) {
    return { ok: false, motivo: "catalogo", texto: limpo };
  }

  // "20 bois", "15 fêmeas de 13 a 24 meses": número na frente, categoria atrás.
  const comQuantidade = limpo.match(/^(\d+)\s+(.+)$/);
  if (comQuantidade) {
    const quantidade = Number(comQuantidade[1]);
    const categoria = resolverCategoria(comQuantidade[2]);
    if (categoria.ok && Number.isInteger(quantidade) && quantidade > 0) {
      return {
        ok: true,
        lado: { kind: "animais", category_id: categoria.categoria.id, quantity: quantidade },
      };
    }
    // Número com termo que não é categoria: pode ser "10 sacas de sal", e aí é
    // catálogo, não descrição.
    return { ok: false, motivo: "categoria", texto: limpo };
  }

  return { ok: true, lado: { kind: "descricao", texto: limpo } };
}

function descrever(lado: LadoEntregue | LadoRecebido): string {
  if (lado.kind === "animais") {
    const categoria = resolverCategoria(lado.category_id);
    const nome = categoria.ok
      ? nomeDaCategoria(categoria.categoria, lado.quantity)
      : "animais";
    return `${lado.quantity} ${nome}`;
  }
  if (lado.kind === "descricao") return lado.texto;
  return "item do catálogo";
}

export const registrarPermuta: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_permuta";

  // Regra 1: a recusa vem primeiro, antes de qualquer pergunta.
  if (explicitNo) {
    if (user_id) await clearPendingBarter(tenant_id, user_id);
    return {
      reply_text: "Tudo bem, não registrei nada.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:cancelado`,
    };
  }

  const temMemoria = !!user_id;
  const pendente = temMemoria ? await loadPendingBarter(tenant_id, user_id!) : null;
  let parameters = parametrosDaMensagem;

  // Regra 2: o "sim" só vale para o que foi mostrado.
  if (confirmed) {
    if (!temMemoria) {
      return ask(
        "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
          "Me conte de novo o que você trocou.",
      );
    }
    if (pendente?.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return ask(
        "Não tenho nenhuma permuta esperando confirmação. Me conte de novo o que você trocou.",
      );
    }
  } else if (pendente && pendente.aguardando !== "confirmacao") {
    // O produtor está respondendo a pergunta: da mensagem nova entra SÓ o
    // campo perguntado, por cima do que já estava guardado.
    const juntos = aplicarRespostaPermuta(pendente, parametrosDaMensagem);
    if (juntos) parameters = juntos;
  }

  const guardar = async (aguardando: CampoPermuta) => {
    if (temMemoria) {
      await savePendingBarter(tenant_id, user_id!, { parameters, aguardando });
    }
  };

  const paraOPainel = (texto: string) =>
    ask(
      `"${texto}" é máquina ou produto do estoque, e preciso que você escolha o registro certo. ` +
        `Registre essa permuta pelo painel, em Negociações.`,
    );

  const brutoEntregue = str(parameters.entregue) ?? str(parameters.entreguei);
  const lidoEntregue = lerLado(brutoEntregue);
  if (!lidoEntregue.ok) {
    if (lidoEntregue.motivo === "vazio") {
      await guardar("entregue");
      return ask("O que você entregou na troca?");
    }
    return paraOPainel(lidoEntregue.texto);
  }

  const brutoRecebido = str(parameters.recebido) ?? str(parameters.recebi);
  const lidoRecebido = lerLado(brutoRecebido);
  if (!lidoRecebido.ok) {
    if (lidoRecebido.motivo === "vazio") {
      await guardar("recebido");
      return ask("E o que você recebeu?");
    }
    return paraOPainel(lidoRecebido.texto);
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) {
    await guardar("fazenda");
    return fazenda.resposta;
  }

  const pago = lerDinheiro(parameters, "diferenca_paga", "paguei", "diferenca");
  const recebido = lerDinheiro(parameters, "diferenca_recebida", "recebi_valor");
  const diferenca =
    pago != null
      ? { direcao: "paguei" as const, amount: pago }
      : recebido != null
        ? { direcao: "recebi" as const, amount: recebido }
        : null;

  const entregue = lidoEntregue.lado as LadoEntregue;
  const recebidoLado = lidoRecebido.lado as LadoRecebido;

  /**
   * O pasto faz parte da IDENTIDADE da posição, e a conversa não informa
   * pasto. Sem esta conferência, "troquei 20 bois" com os bois cadastrados no
   * Pasto A respondia "Existem apenas 0 animais nesta categoria", que mente
   * por omissão: existem, só em outro lugar. `conferirOndeEstaOSaldo` diz onde
   * eles estão e devolve a escolha ao produtor, em vez de tirar de um pasto
   * qualquer. Mesma guarda do handler de negócio de gado.
   */
  const pasto = await resolverPasto(
    db,
    fazenda.id,
    str(parameters.pasto) ?? str(parameters.pasture) ?? str(parameters.pasto_origem),
  );
  if (!pasto.ok) {
    await guardar("pasto");
    return pasto.resposta;
  }

  if (entregue.kind === "animais") {
    const categoria = resolverCategoria(entregue.category_id);
    if (categoria.ok) {
      const ondeEsta = await conferirOndeEstaOSaldo(
        db,
        categoria.categoria,
        fazenda.id,
        pasto.id,
        entregue.quantity,
      );
      if (ondeEsta) {
        await guardar("pasto");
        return ondeEsta;
      }
    }
    entregue.pasture_id = pasto.id;
  }
  if (recebidoLado.kind === "animais") {
    // O que ENTRA vai para o mesmo pasto de onde o outro saiu, quando o
    // produtor informou um. Sem pasto informado, entra sem pasto, como o
    // livro-razão já aceita.
    recebidoLado.pasture_id = pasto.id;
  }

  // Regra 3: confirmação sempre, com o resumo literal do §18.5.
  if (!confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Entendi a seguinte permuta:\n` +
        `Entregou: ${descrever(entregue)}\n` +
        `Recebeu: ${descrever(recebidoLado)}\n` +
        (diferenca
          ? `Diferença ${diferenca.direcao === "paguei" ? "paga" : "recebida"}: ${reais(diferenca.amount)}\n`
          : "") +
        `Deseja registrar?`,
      requires_confirmation: true,
      auxiliary_data: { entregue: descrever(entregue), recebido: descrever(recebidoLado) },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const resultado = await createBarter(db, {
    property_id: fazenda.id,
    entregue,
    recebido: recebidoLado,
    diferenca,
    pago: true,
    contact_name: str(parameters.contato) ?? str(parameters.pessoa),
    notes: str(parameters.observacao) ?? str(parameters.notes),
    recorded_by_user_id: user_id ?? null,
  });
  if (temMemoria) await clearPendingBarter(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  return {
    reply_text:
      `Pronto. Registrei a troca de ${descrever(entregue)} por ${descrever(recebidoLado)}` +
      (diferenca
        ? `, com ${reais(diferenca.amount)} ${diferenca.direcao === "paguei" ? "pagos" : "recebidos"}`
        : "") +
      `.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:ok:${resultado.data.id}`,
  };
};

/**
 * Exportado só para o teste. A leitura do lado é a parte que mais erra, e
 * testá-la direto é mais barato que montar uma conversa inteira para cada
 * formato de frase.
 */
export const _lerLado = lerLado;
