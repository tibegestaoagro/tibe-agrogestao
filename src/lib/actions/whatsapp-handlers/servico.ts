import type { TenantPrismaClient } from "@/lib/prisma";
import { createServiceJob } from "@/lib/actions/service-jobs";
import { listContacts } from "@/lib/actions/contacts";
import {
  savePendingService,
  loadPendingService,
  clearPendingService,
  aplicarRespostaServico,
  type CampoServico,
  type GestoServico,
} from "@/lib/actions/service-pending";
import { ask, failReply, str, type Handler, type RouterResult } from "./shared";
import { lerNumeroBr } from "./parsers";

/**
 * Serviço contratado pelo WhatsApp (Módulo 33, §32 do documento do cliente).
 *
 * Duas conversas, as duas do §32:
 *
 *   "Vieram 3 homens trabalhar na cerca por 4 dias, 150 a diária."
 *   "O Pedro fez a cerca por 6 mil."
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar revisado). As duas intenções existem, são
 * roteadas e são testadas, e ficam esperando o dia em que o classificador
 * aprender a emiti-las. Mesmo estado das três da mão de obra fixa, das quatro
 * do leite e das quatro do confinamento.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada de R$ 1.200.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado, nunca o
 *    que o classificador remontou da própria resposta do assistente.
 * 3. **Ambiguidade PERGUNTA**, nunca escolhe o primeiro. É o defeito que
 *    `resolverPasto` ainda tem (`dividas.md` §3.3), e este caminho nasce sem
 *    ele, como o de `mao-de-obra.ts`.
 */

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizar(termo: string): string {
  // Filtro por código numérico, não regex de caractere combinante: o próprio
  // caractere é invisível no editor e some numa cópia distraída.
  const semAcento = Array.from(termo.toLowerCase().normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim();
}

/**
 * Acha o prestador citado entre os contatos, sem inventar.
 *
 * ⚠️ AMBIGUIDADE PERGUNTA. Uma fazenda com "Pedro Cercador" e "Pedro
 * Tratorista" faria "o Pedro fez a cerca" cair no primeiro, em silêncio, e a
 * cerca iria para a ficha do tratorista.
 *
 * Nenhum achado NÃO é erro: o serviço aceita o nome digitado e cria o contato,
 * que é o que `createServiceJob` faz com `contact_name`. Recusar aqui obrigaria
 * o produtor a cadastrar antes de registrar, que é a fricção que o §5 do
 * Módulo 31 manda evitar.
 */
async function resolverPrestador(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ ok: true; nomeFinal: string } | { ok: false; resposta: RouterResult }> {
  const contatos = await listContacts(db, {});
  const alvo = normalizar(nome);
  const achados = contatos.filter((c) => normalizar(c.name).includes(alvo));

  if (achados.length > 1) {
    const nomes = achados.map((c) => `- ${c.name}`).join("\n");
    return {
      ok: false,
      resposta: ask(`Tenho mais de um contato com esse nome. Qual deles?\n${nomes}`),
    };
  }
  // Um achado: usa o nome exato do cadastro, para não criar duplicata de
  // grafia. Nenhum: usa o que o produtor disse, e o contato nasce junto.
  return { ok: true, nomeFinal: achados[0]?.name ?? nome };
}

async function cancelar(
  intent: string,
  tenantId: string,
  userId: string | undefined,
): Promise<RouterResult> {
  if (userId) await clearPendingService(tenantId, userId);
  return {
    reply_text: "Tudo bem, não registrei nada.",
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:cancelado`,
  };
}

/** A fazenda onde registrar. Sem nenhuma cadastrada, não há o que fazer. */
async function fazendaPadrao(
  db: TenantPrismaClient,
): Promise<{ ok: true; id: string } | { ok: false; resposta: RouterResult }> {
  const properties = await db.property.findMany({
    where: { archived_at: null },
    orderBy: { name: "asc" },
    take: 2,
  });
  if (properties.length === 0) {
    return {
      ok: false,
      resposta: ask(
        "Você ainda não tem fazenda cadastrada, então não sei onde registrar o serviço. " +
          "Cadastre em Minha Fazenda, no painel.",
      ),
    };
  }
  return { ok: true, id: properties[0].id };
}

async function abrirConversa(
  gesto: GestoServico,
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
      guardar: (aguardando: CampoServico) => Promise<void>;
      limpar: () => Promise<void>;
    }
> {
  const temMemoria = !!ctx.user_id;
  const pendente = temMemoria ? await loadPendingService(ctx.tenant_id, ctx.user_id!) : null;
  let parameters = ctx.parameters;

  if (ctx.confirmed) {
    if (!temMemoria) {
      return {
        parar: ask(
          "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
            "Me conte de novo qual foi o serviço.",
        ),
      };
    }
    if (pendente?.gesto === gesto && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return {
        parar: ask("Não tenho nenhum serviço esperando confirmação. Me conte de novo."),
      };
    }
  } else if (pendente?.gesto === gesto && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaServico(pendente, ctx.parameters);
    if (juntos) parameters = juntos;
  }

  return {
    parameters,
    guardar: async (aguardando: CampoServico) => {
      if (temMemoria) {
        await savePendingService(ctx.tenant_id, ctx.user_id!, { parameters, aguardando, gesto });
      }
    },
    limpar: async () => {
      if (temMemoria) await clearPendingService(ctx.tenant_id, ctx.user_id!);
    },
  };
}

// ── §32: a diária ────────────────────────────────────────────────────────

/**
 * "Vieram 3 homens trabalhar na cerca por 4 dias, 150 a diária."
 *
 * A confirmação do §32 mostra o total de DIÁRIAS ("12 diárias, no total de
 * R$ 1.800"), que é o número que o produtor tem na cabeça, mesmo que a
 * quantidade gravada seja 4 dias.
 */
export const registrarDiaria: Handler = async (ctx) => {
  const intent = "registrar_diaria";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("diaria", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const servico = str(parameters.servico) ?? str(parameters.description);
  if (!servico) {
    await guardar("servico");
    return ask("Qual foi o serviço? (cerca, roçada, capina...)");
  }

  const valor = lerNumeroBr(parameters.valor ?? parameters.amount);
  if (valor === null || valor <= 0) {
    await guardar("valor");
    return ask("Quanto foi a diária?");
  }

  const dias = lerNumeroBr(parameters.quantidade ?? parameters.quantity);
  if (dias === null || dias <= 0) {
    await guardar("quantidade");
    return ask("Quantos dias eles trabalharam?");
  }

  // Sem pessoas, assume uma: o §13 fala de um trabalhador por diária, e o §14
  // é o caso de vários. Perguntar sempre atrapalharia o caso comum.
  const pessoas = lerNumeroBr(parameters.pessoas ?? parameters.worker_count) ?? 1;
  const total = dias * valor * pessoas;
  const diarias = dias * pessoas;

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Deseja registrar ${diarias} ${diarias === 1 ? "diária" : "diárias"}, ` +
        `no total de ${moeda(total)}, para serviço de ${servico}?`,
      requires_confirmation: true,
      auxiliary_data: { servico, valor, dias, pessoas, total },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const fazenda = await fazendaPadrao(ctx.db);
  if (!fazenda.ok) return fazenda.resposta;

  const quemDito = str(parameters.quem) ?? str(parameters.contact_name);
  let quem: string | null = null;
  if (quemDito) {
    const achado = await resolverPrestador(ctx.db, quemDito);
    if (!achado.ok) return achado.resposta;
    quem = achado.nomeFinal;
  }

  const res = await createServiceJob(ctx.db, {
    property_id: fazenda.id,
    occurred_at: new Date(),
    description: servico,
    pricing: "dia",
    unit_price: valor,
    quantity: dias,
    worker_count: pessoas,
    contact_name: quem,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ ${diarias} ${diarias === 1 ? "diária" : "diárias"} de ${servico} registradas, ` +
      `${moeda(res.data.total)} no total.\nFicou como conta a pagar.`,
    requires_confirmation: false,
    auxiliary_data: { service_job_id: res.data.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

// ── §32: o empreito ──────────────────────────────────────────────────────

/**
 * "O Pedro fez a cerca por 6 mil."
 *
 * Valor fechado: o §15 diz que o serviço "poderá ser contratado por valor
 * fechado", e o §16 do documento de Máquinas reforça que "o sistema não deverá
 * exigir cálculo por hora ou hectare". Então não se pergunta quantidade.
 */
export const registrarServicoContratado: Handler = async (ctx) => {
  const intent = "registrar_servico_contratado";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("empreito", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const servico = str(parameters.servico) ?? str(parameters.description);
  if (!servico) {
    await guardar("servico");
    return ask("Qual foi o serviço?");
  }

  const valor = lerNumeroBr(parameters.valor ?? parameters.amount);
  if (valor === null || valor <= 0) {
    await guardar("valor");
    return ask(`Quanto ficou o serviço de ${servico}?`);
  }

  const quemDito = str(parameters.quem) ?? str(parameters.contact_name);
  if (!quemDito) {
    await guardar("quem");
    return ask(`Quem fez o serviço de ${servico}?`);
  }

  const achado = await resolverPrestador(ctx.db, quemDito);
  if (!achado.ok) return achado.resposta;
  const quem = achado.nomeFinal;

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Deseja registrar um serviço terceirizado de ${servico} realizado por ${quem}, ` +
        `no valor de ${moeda(valor)}?`,
      requires_confirmation: true,
      auxiliary_data: { servico, valor, quem },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const fazenda = await fazendaPadrao(ctx.db);
  if (!fazenda.ok) return fazenda.resposta;

  const res = await createServiceJob(ctx.db, {
    property_id: fazenda.id,
    occurred_at: new Date(),
    description: servico,
    pricing: "fechado",
    agreed_amount: valor,
    contact_name: quem,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ Serviço de ${servico} por ${quem} registrado, ${moeda(res.data.total)}.` +
      "\nFicou como conta a pagar. Me avise quando pagar.",
    requires_confirmation: false,
    auxiliary_data: { service_job_id: res.data.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};
