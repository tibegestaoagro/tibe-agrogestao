import type { LactationEntryType } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import { listMilkGroups } from "@/lib/actions/milk-groups";
import { recordMilkProduction } from "@/lib/actions/milk-production";
import { contagemAtual, recordLactationEntry } from "@/lib/actions/milk-lactation";
import {
  savePendingMilk,
  loadPendingMilk,
  clearPendingMilk,
  aplicarRespostaLeite,
  type CampoLeite,
  type GestoLeite,
} from "@/lib/actions/leite-pending";
import { resolverFazenda, descreverData } from "./herd";
import { ask, failReply, str, type Handler, type RouterResult } from "./shared";
import { lerData, lerNumeroBr } from "./parsers";

/**
 * Área Leite pelo WhatsApp (Módulo 32, fase 1, §36 do documento do cliente).
 *
 * Duas conversas: produção ("tirei 480 litros hoje", "300 de manhã e 180 à
 * tarde") e lactação ("estou com 32 vacas dando leite", "entraram mais 4",
 * "sequei 3"). As duas reusam `recordMilkProduction` e
 * `recordLactationEntry`: nada aqui recalcula contagem nem soma litros por
 * fora, e os dois contadores continuam sendo derivados (invariante 2).
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar revisado). As três intenções existem, são
 * roteadas e são testadas, e ficam esperando o dia em que o classificador
 * aprender a emiti-las. Mesmo estado de `evento.ts`, `permuta.ts` e
 * `confinamento.ts`.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado em
 *    `leite-pending.ts`, nunca o que o classificador remontou da própria
 *    resposta do assistente.
 * 3. **Confirmação sempre**, nas duas conversas: o §36 mostra o TIBÉ
 *    perguntando "Deseja registrar" em todos os exemplos do leite, e a
 *    contagem de vacas é o divisor da média, então um número errado
 *    contamina todo o histórico até alguém notar.
 */

const TURNOS = ["manha", "tarde", "noite"] as const;
type Turno = (typeof TURNOS)[number];

const NOME_DO_TURNO: Record<Turno, string> = {
  manha: "de manhã",
  tarde: "à tarde",
  noite: "à noite",
};

function litrosBr(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} litros`;
}

async function cancelar(
  intent: string,
  tenantId: string,
  userId: string | undefined,
): Promise<RouterResult> {
  if (userId) await clearPendingMilk(tenantId, userId);
  return {
    reply_text: "Tudo bem, não registrei nada.",
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:cancelado`,
  };
}

function normalizar(termo: string): string {
  // Filtro por código numérico, não regex de caractere combinante: o próprio
  // caractere é invisível no editor e some numa cópia distraída (armadilha que
  // este projeto já pagou para aprender).
  const semAcento = Array.from(termo.toLowerCase().normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim();
}

/**
 * Acha o lote leiteiro citado, sem inventar. Sem nome, não há lote: o §6 o
 * declara opcional, e cadastrar um lote por uma frase de WhatsApp criaria
 * lote novo a cada erro de digitação.
 */
async function resolverLote(
  db: TenantPrismaClient,
  propertyId: string,
  nome: string | null,
): Promise<{ ok: true; id: string | null } | { ok: false; resposta: RouterResult }> {
  if (!nome) return { ok: true, id: null };

  const lotes = await listMilkGroups(db, { property_id: propertyId });
  const alvo = normalizar(nome);
  const achados = lotes.filter((l) => normalizar(l.name).includes(alvo));

  if (achados.length === 0) {
    if (lotes.length === 0) {
      return {
        ok: false,
        resposta: ask(
          `Você ainda não tem lote leiteiro cadastrado, então não consigo registrar em "${nome}". ` +
            "Cadastre no painel, em Leite, ou me diga sem o lote.",
        ),
      };
    }
    const nomes = lotes.map((l) => `- ${l.name}`).join("\n");
    return {
      ok: false,
      resposta: ask(`Não achei o lote "${nome}". Os que você tem:\n${nomes}`),
    };
  }
  if (achados.length > 1) {
    const nomes = achados.map((l) => `- ${l.name}`).join("\n");
    return { ok: false, resposta: ask(`Qual lote?\n${nomes}`) };
  }
  return { ok: true, id: achados[0].id };
}

/**
 * Prepara o pedido: aplica o cancelamento, recupera o pendente quando o
 * produtor disse "sim", e junta a resposta quando ele respondeu uma pergunta.
 *
 * Compartilhado pelas duas conversas porque a sequência é idêntica e já
 * divergiu entre handlers deste projeto quando foi copiada.
 */
async function abrirConversa(
  gesto: GestoLeite,
  intent: string,
  ctx: {
    tenant_id: string;
    user_id?: string;
    parameters: Record<string, unknown>;
    confirmed: boolean;
  },
): Promise<
  | { parar: RouterResult }
  | {
      parameters: Record<string, unknown>;
      guardar: (aguardando: CampoLeite) => Promise<void>;
      limpar: () => Promise<void>;
    }
> {
  const temMemoria = !!ctx.user_id;
  const pendente = temMemoria ? await loadPendingMilk(ctx.tenant_id, ctx.user_id!) : null;
  let parameters = ctx.parameters;

  if (ctx.confirmed) {
    if (!temMemoria) {
      return {
        parar: ask(
          "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
            "Me conte de novo o que aconteceu com o leite.",
        ),
      };
    }
    if (pendente?.gesto === gesto && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return {
        parar: ask(
          "Não tenho nenhum registro de leite esperando confirmação. Me conte de novo o que aconteceu.",
        ),
      };
    }
  } else if (pendente?.gesto === gesto && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaLeite(pendente, ctx.parameters);
    if (juntos) parameters = juntos;
  }

  return {
    parameters,
    guardar: async (aguardando: CampoLeite) => {
      if (temMemoria) {
        await savePendingMilk(ctx.tenant_id, ctx.user_id!, { parameters, aguardando, gesto });
      }
    },
    limpar: async () => {
      if (temMemoria) await clearPendingMilk(ctx.tenant_id, ctx.user_id!);
    },
  };
}

// ── §36: produção ────────────────────────────────────────────────────────

/**
 * "Tirei 480 litros hoje" e "tirei 300 de manhã e 180 à tarde" (§36, §9).
 *
 * As duas formas do §9 chegam pela MESMA intenção, porque para o produtor é a
 * mesma frase com mais detalhe. Turno informado manda: com `manha`/`tarde`/
 * `noite` presentes, `litros` é ignorado, e não somado, pelo mesmo motivo que
 * a rota recusa as duas juntas (500 do dia mais 300 da manhã não são 800).
 */
export const registrarProducaoLeite: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_producao_leite";
  if (explicitNo) return cancelar(intent, tenant_id, user_id);

  const aberta = await abrirConversa("producao", intent, {
    tenant_id,
    user_id,
    parameters: parametrosDaMensagem,
    confirmed,
  });
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) {
    await guardar("fazenda");
    return fazenda.resposta;
  }
  parameters.fazenda = fazenda.nome;

  const porTurno: Partial<Record<Turno, number>> = {};
  for (const turno of TURNOS) {
    const valor = lerNumeroBr(parameters[turno]);
    if (valor != null && valor > 0) porTurno[turno] = valor;
  }
  const turnosInformados = TURNOS.filter((t) => porTurno[t] != null);

  const litrosDoDia =
    turnosInformados.length > 0
      ? null
      : lerNumeroBr(parameters.litros ?? parameters.liters ?? parameters.quantidade);

  if (turnosInformados.length === 0 && (litrosDoDia == null || litrosDoDia <= 0)) {
    await guardar("litros");
    return ask("Quantos litros você tirou?");
  }

  const data = lerData(parameters, "data", "date");
  if (data.tipo === "invalida") {
    await guardar("data");
    return ask(`Não entendi a data "${data.bruto}". Qual foi o dia?`);
  }
  const quando = data.tipo === "ok" ? data.data : new Date();

  const loteResolvido = await resolverLote(
    db,
    fazenda.id,
    str(parameters.lote) ?? str(parameters.group),
  );
  if (!loteResolvido.ok) {
    await guardar("lote");
    return loteResolvido.resposta;
  }

  const total = turnosInformados.reduce((soma, t) => soma + (porTurno[t] ?? 0), 0) || litrosDoDia || 0;
  const detalhe =
    turnosInformados.length > 0
      ? ` (${turnosInformados
          .map((t) => `${litrosBr(porTurno[t] ?? 0)} ${NOME_DO_TURNO[t]}`)
          .join(", ")})`
      : "";

  if (!confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: `Deseja registrar uma produção total de ${litrosBr(total)} ${descreverData(quando)}${detalhe}?`,
      requires_confirmation: true,
      auxiliary_data: { litros: total, fazenda: fazenda.id },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const resultado = await recordMilkProduction(db, {
    property_id: fazenda.id,
    recorded_at: quando,
    dia: turnosInformados.length > 0 ? null : litrosDoDia,
    manha: porTurno.manha ?? null,
    tarde: porTurno.tarde ?? null,
    noite: porTurno.noite ?? null,
    group_id: loteResolvido.id,
    recorded_by_user_id: user_id ?? null,
  });
  await limpar();
  if (!resultado.ok) return failReply(intent, resultado);

  const vacas = await contagemAtual(db, fazenda.id, quando);
  const media =
    vacas && vacas > 0
      ? ` Média de ${(total / vacas).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} litros por vaca.`
      : "";

  return {
    reply_text: `✅ Produção de ${litrosBr(total)} registrada ${descreverData(quando)} em ${fazenda.nome}.${media}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

// ── §36: vacas em lactação ───────────────────────────────────────────────

/**
 * Os três gestos do §4 e do §7, numa fábrica só: "estou com 32 vacas dando
 * leite" (`definir`), "entraram mais 4 no leite" (`entrada`) e "sequei 3"
 * (`saida`).
 *
 * Três intenções e não uma com o tipo em `parameters` porque as frases são
 * gramaticalmente distintas e o discriminador seria justamente a parte que o
 * classificador erra: "entraram 4" e "estou com 4" viram o mesmo número, e
 * confundir os dois troca a contagem inteira da fazenda por quatro.
 */
function fabricarLactacao(tipo: LactationEntryType, intent: string): Handler {
  return async ({ db, tenant_id, user_id, parameters: parametrosDaMensagem, confirmed, explicitNo }) => {
    if (explicitNo) return cancelar(intent, tenant_id, user_id);

    const aberta = await abrirConversa("lactacao", intent, {
      tenant_id,
      user_id,
      parameters: parametrosDaMensagem,
      confirmed,
    });
    if ("parar" in aberta) return aberta.parar;
    const { parameters, guardar, limpar } = aberta;

    const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
    if (!fazenda.ok) {
      await guardar("fazenda");
      return fazenda.resposta;
    }
    parameters.fazenda = fazenda.nome;

    const quantidade = lerNumeroBr(parameters.quantidade ?? parameters.quantity ?? parameters.vacas);
    // Zero só é afirmação legítima em `definir` ("não tenho mais nenhuma"),
    // e a action recusa nos outros dois. Perguntar antes evita a recusa seca.
    const zeroValido = tipo === "definir" && quantidade === 0;
    if (quantidade == null || quantidade < 0 || (quantidade === 0 && !zeroValido)) {
      await guardar("quantidade");
      return ask(
        tipo === "definir" ? "Quantas vacas estão em lactação?" : "Quantas vacas?",
      );
    }
    if (!Number.isInteger(quantidade)) {
      await guardar("quantidade");
      return ask(`${quantidade} vaca não dá. Quantas vacas exatamente?`);
    }

    const data = lerData(parameters, "data", "date");
    if (data.tipo === "invalida") {
      await guardar("data");
      return ask(`Não entendi a data "${data.bruto}". Qual foi o dia?`);
    }
    const quando = data.tipo === "ok" ? data.data : new Date();

    const loteResolvido = await resolverLote(
      db,
      fazenda.id,
      str(parameters.lote) ?? str(parameters.group),
    );
    if (!loteResolvido.ok) {
      await guardar("lote");
      return loteResolvido.resposta;
    }

    if (!confirmed) {
      await guardar("confirmacao");
      const pergunta =
        tipo === "definir"
          ? `Deseja atualizar para ${quantidade} o número de vacas em lactação em ${fazenda.nome}?`
          : tipo === "entrada"
            ? `Deseja acrescentar ${quantidade} vaca(s) ao lote de animais em lactação em ${fazenda.nome}?`
            : `Deseja retirar ${quantidade} vaca(s) da quantidade em lactação em ${fazenda.nome}?`;
      return {
        reply_text: pergunta,
        requires_confirmation: true,
        auxiliary_data: { quantidade, tipo, fazenda: fazenda.id },
        report_url: null,
        action_taken: `${intent}:aguardando_confirmacao`,
      };
    }

    const resultado = await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: tipo,
      quantity: quantidade,
      recorded_at: quando,
      group_id: loteResolvido.id,
      recorded_by_user_id: user_id ?? null,
    });
    await limpar();
    if (!resultado.ok) return failReply(intent, resultado);

    const agora = await contagemAtual(db, fazenda.id, quando);
    const total = agora === null ? "" : ` Agora são ${agora} em lactação.`;

    return {
      reply_text: `✅ Registrado ${descreverData(quando)} em ${fazenda.nome}.${total}`,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:ok`,
    };
  };
}

export const definirVacasEmLactacao = fabricarLactacao("definir", "definir_vacas_em_lactacao");
export const registrarEntradaLactacao = fabricarLactacao("entrada", "registrar_entrada_lactacao");
export const registrarSaidaLactacao = fabricarLactacao("saida", "registrar_saida_lactacao");
