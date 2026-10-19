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
import { ask, failReply, semPreposicaoInicial, str, type Handler, type RouterResult } from "./shared";
import { lerDinheiro } from "./parsers";
import { juntarRespostaDoPrazo, lerPrazo } from "./negociacao";
import { reaisBr as reais } from "@/lib/numero-br";

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
  | { ok: false; motivo: "vazio" | "catalogo" | "categoria"; texto: string }
  /** "3 novilhas": é gado, mas a categoria tem mais de uma faixa de idade. */
  | { ok: false; motivo: "ambigua"; texto: string; resposta: RouterResult; candidatos: string[] };

/** `candidatos`: as faixas já oferecidas para este lado, para a resposta cruzar com elas. */
function lerLado(bruto: string | null, candidatos?: string[]): LadoLido {
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
    const categoria = resolverCategoria(comQuantidade[2], false, candidatos);
    if (categoria.ok && Number.isInteger(quantidade) && quantidade > 0) {
      return {
        ok: true,
        lado: { kind: "animais", category_id: categoria.categoria.id, quantity: quantidade },
      };
    }
    // "3 novilhas" respondia "é máquina ou produto do estoque" (canário, 16/10).
    if (!categoria.ok && categoria.candidatosOferecidos.length > 0) {
      return {
        ok: false,
        motivo: "ambigua",
        texto: limpo,
        resposta: categoria.resposta,
        candidatos: categoria.candidatosOferecidos,
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
  } else if (pendente?.aguardando === "vencimento") {
    parameters = juntarRespostaDoPrazo(pendente.parameters, parametrosDaMensagem);
  } else if (pendente?.aguardando === "categoria") {
    // "13 a 24 meses", respondendo a "3 novilhas": a quantidade fica, e a
    // faixa cruza com as candidatas guardadas em `lerLado`.
    const lado = pendente.parameters._categoria_lado === "recebido" ? "recebido" : "entregue";
    const resposta =
      str(parametrosDaMensagem.categoria) ?? str(parametrosDaMensagem.category) ?? str(parametrosDaMensagem.resposta);
    const quantidade = str(pendente.parameters[lado])?.match(/^\d+/)?.[0];
    parameters = { ...pendente.parameters };
    // "3 fêmeas de 13 a 24 meses" já é o lado inteiro; "13 a 24 meses" também
    // começa com número, e por isso o teste é ler, não olhar o primeiro caractere.
    const lida = resposta ? lerLado(resposta) : null;
    const ladoInteiro = lida?.ok === true && lida.lado.kind === "animais";
    if (resposta) parameters[lado] = ladoInteiro || !quantidade ? resposta : `${quantidade} ${resposta}`;
  } else if (pendente && pendente.aguardando !== "confirmacao") {
    // O produtor está respondendo a pergunta: da mensagem nova entra SÓ o
    // campo perguntado, por cima do que já estava guardado.
    const juntos = aplicarRespostaPermuta(pendente, parametrosDaMensagem);
    if (juntos) parameters = juntos;
    // "Bezerros", respondendo a "Não reconheci 5 B's erros" (áudio, canário
    // 16/10): a quantidade da frase guardada fica, se com ela vira gado.
    const lado = pendente.aguardando;
    if (juntos && (lado === "entregue" || lado === "recebido")) {
      const quantidade = str(pendente.parameters[lado])?.match(/^\d+/)?.[0];
      const resposta = str(juntos[lado]);
      if (quantidade && resposta && !/^\d/.test(resposta)) {
        const comQuantidade = lerLado(`${quantidade} ${resposta}`);
        if ((comQuantidade.ok && comQuantidade.lado.kind === "animais") || (!comQuantidade.ok && comQuantidade.motivo === "ambigua")) {
          parameters = { ...juntos, [lado]: `${quantidade} ${resposta}` };
        }
      }
    }
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

  const candidatosDoLado = (lado: "entregue" | "recebido") =>
    parameters._categoria_lado === lado && Array.isArray(parameters._categoria_candidatos)
      ? parameters._categoria_candidatos.filter((v): v is string => typeof v === "string")
      : undefined;

  /** O que fazer com um lado que não leu: perguntar, ou mandar ao painel. */
  const responderLado = async (lado: "entregue" | "recebido", lido: Exclude<LadoLido, { ok: true }>) => {
    if (lido.motivo === "vazio") {
      await guardar(lado);
      return ask(lado === "entregue" ? "O que você entregou na troca?" : "E o que você recebeu?");
    }
    if (lido.motivo === "ambigua") {
      parameters = { ...parameters, _categoria_lado: lado, _categoria_candidatos: lido.candidatos };
      await guardar("categoria");
      return lido.resposta;
    }
    if (lido.motivo === "categoria") {
      await guardar(lado);
      return ask(
        `Não reconheci "${lido.texto}" como animais do rebanho. Se for gado, diga a quantidade, o sexo e a idade, ` +
          `por exemplo "3 fêmeas de 13 a 24 meses". Se for máquina ou produto do estoque, registre essa permuta pelo painel, em Negociações.`,
      );
    }
    return paraOPainel(lido.texto);
  };

  const brutoEntregue = str(parameters.entregue) ?? str(parameters.entreguei);
  const lidoEntregue = lerLado(brutoEntregue, candidatosDoLado("entregue"));
  if (!lidoEntregue.ok) return responderLado("entregue", lidoEntregue);

  const brutoRecebido = str(parameters.recebido) ?? str(parameters.recebi);
  const lidoRecebido = lerLado(brutoRecebido, candidatosDoLado("recebido"));
  if (!lidoRecebido.ok) return responderLado("recebido", lidoRecebido);

  // Os dois lados leram: as faixas oferecidas não decidem mais nada. O lado
  // de gado é regravado pelo id da categoria, que se lê sozinho: guardado como
  // "3 13 a 24 meses", a pergunta seguinte (vencimento) reabria "macho ou
  // fêmea?" sem as candidatas (canário, 19/10).
  parameters = { ...parameters };
  delete parameters._categoria_lado;
  delete parameters._categoria_candidatos;
  if (lidoEntregue.lado.kind === "animais") {
    parameters.entregue = `${lidoEntregue.lado.quantity} ${lidoEntregue.lado.category_id}`;
    delete parameters.entreguei;
  }
  if (lidoRecebido.lado.kind === "animais") {
    parameters.recebido = `${lidoRecebido.lado.quantity} ${lidoRecebido.lado.category_id}`;
    delete parameters.recebi;
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

  // Dívida 5.9 (decisão do usuário, 14/10): a diferença em dinheiro gravava
  // sempre como já paga. Agora pergunta, como o negócio de gado.
  let quitada = true;
  let vencimento: Date | null = null;
  if (diferenca) {
    const verbo = diferenca.direcao === "paguei" ? "pagou" : "recebeu";
    const prazo = lerPrazo(parameters);
    if (prazo.tipo === "invalida") {
      await guardar("vencimento");
      return ask(`Não entendi o vencimento "${prazo.bruto}". Diga por exemplo "dia 10" ou "10/12/2026", ou diga que já ${verbo}.`);
    }
    if (prazo.tipo === "perguntar") {
      await guardar("vencimento");
      return ask(
        `Você já ${verbo} os ${reais(diferenca.amount)} da diferença, ou vai ${diferenca.direcao === "paguei" ? "pagar" : "receber"} depois? ` +
          'Se for depois, me diga o vencimento, por exemplo "dia 10".',
      );
    }
    quitada = prazo.tipo === "pago";
    vencimento = prazo.tipo === "vence" ? prazo.data : null;
  }
  // O rótulo diz o estado que vai ser GRAVADO (achado do Codex): "Diferença
  // paga" só quando ela entra quitada; a prazo, "a pagar", com o vencimento.
  const paguei = diferenca?.direcao === "paguei";
  const rotulo = quitada ? (paguei ? "paga" : "recebida") : paguei ? "a pagar" : "a receber";
  const noPrazo = vencimento ? `, vence em ${vencimento.toLocaleDateString("pt-BR")}` : "";

  // Regra 3: confirmação sempre, com o resumo literal do §18.5.
  if (!confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Entendi a seguinte permuta:\n` +
        `Entregou: ${descrever(entregue)}\n` +
        `Recebeu: ${descrever(recebidoLado)}\n` +
        (diferenca
          ? `Diferença ${rotulo}: ${reais(diferenca.amount)}${noPrazo}\n`
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
    pago: quitada,
    due_date: vencimento,
    contact_name: semPreposicaoInicial(str(parameters.contato) ?? str(parameters.pessoa)),
    notes: str(parameters.observacao) ?? str(parameters.notes),
    recorded_by_user_id: user_id ?? null,
  });
  if (temMemoria) await clearPendingBarter(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  return {
    reply_text:
      `Pronto. Registrei a troca de ${descrever(entregue)} por ${descrever(recebidoLado)}` +
      (diferenca
        ? quitada
          ? `, com ${reais(diferenca.amount)} ${diferenca.direcao === "paguei" ? "pagos" : "recebidos"}`
          : `, com ${reais(diferenca.amount)} ${rotulo}${noPrazo}`
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
