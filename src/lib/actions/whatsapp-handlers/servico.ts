import type { ServicePricing } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import {
  createServiceJob,
  setServiceJobStatus,
  addServiceJobLog,
  getServiceJobDetail,
} from "@/lib/actions/service-jobs";
import { recordServiceFuel } from "@/lib/actions/service-costs";
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
 * Serviço pelo WhatsApp: as duas conversas do §32 do Módulo 33 e as cinco do
 * §42 do documento de Máquinas.
 *
 *   "Vieram 3 homens trabalhar na cerca por 4 dias, 150 a diária."
 *   "O Pedro fez a cerca por 6 mil."
 *   "Amanhã vou gradear 20 hectares para o João a 180 reais o hectare."
 *   "Comecei a gradagem do João hoje."
 *   "Fiz 8 hectares hoje."
 *   "Gastei 60 litros de diesel hoje nesse serviço."
 *   "Terminei o serviço do João."
 *
 * A terceira do §32 é a que INVERTE o sinal do dinheiro: ela gera conta a
 * receber, e exige a máquina. As quatro últimas não criam serviço nenhum:
 * elas ACHAM um serviço `prestado` já em andamento e o atualizam, e é aí que
 * mora o risco novo: o produtor diz "o serviço do João", não um id.
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar revisado). As sete intenções deste arquivo
 * existem, são roteadas e são testadas, e ficam esperando o dia em que o
 * classificador aprender a emiti-las. Mesmo estado das três da mão de obra
 * fixa, das quatro do leite e das quatro do confinamento.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada de R$ 1.200.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado, nunca o
 *    que o classificador remontou da própria resposta do assistente.
 * 3. **Ambiguidade PERGUNTA**, nunca escolhe o primeiro. É o defeito que
 *    `resolverPasto` ainda tem (`dividas.md` §3.3), e este caminho nasce sem
 *    ele, como o de `mao-de-obra.ts` e, agora, o de
 *    `resolverServicoEmAndamento` abaixo: dois serviços em andamento e nenhum
 *    nome dito é PERGUNTA, listando os dois, nunca o primeiro em silêncio.
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

/**
 * Acha a máquina citada, e NUNCA a inventa.
 *
 * ⚠️ A diferença para `resolverPrestador` é o caso "nenhum achado". Um contato
 * novo nasce do nome dito (`createServiceJob` faz isso com `contact_name`), mas
 * uma máquina não: ela tem tipo, horímetro, custo de aquisição e manutenção, e
 * criar uma casca a partir de "Massey" encheria a tela de Máquinas de fantasmas
 * que ninguém cadastrou. Então aqui NÃO ACHAR é pergunta, não criação.
 *
 * ⚠️ E ambiguidade também pergunta. Duas máquinas com "Trator" no nome fariam o
 * histórico do §32 ir para a errada, em silêncio: a ficha da outra mostraria
 * horas que ela nunca rodou.
 */
async function resolverMaquina(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ ok: true; id: string; nome: string } | { ok: false; resposta: RouterResult }> {
  const maquinas = await db.machine.findMany({
    where: { status: { in: ["active", "maintenance"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (maquinas.length === 0) {
    return {
      ok: false,
      resposta: ask(
        "Você ainda não tem máquina cadastrada, e o serviço prestado precisa de uma. " +
          "Cadastre em Máquinas, no painel.",
      ),
    };
  }

  const alvo = normalizar(nome);
  const achados = maquinas.filter((m) => normalizar(m.name).includes(alvo));

  if (achados.length === 1) return { ok: true, id: achados[0].id, nome: achados[0].name };

  const lista = (achados.length > 1 ? achados : maquinas).map((m) => `- ${m.name}`).join("\n");
  return {
    ok: false,
    resposta: ask(
      achados.length > 1
        ? `Tenho mais de uma máquina com esse nome. Qual delas?\n${lista}`
        : `Não achei essa máquina. Qual você usou?\n${lista}`,
    ),
  };
}

/**
 * Acha o serviço PRESTADO já em andamento a que a frase se refere, sem
 * inventar (§42: "comecei", "fiz X hoje", "gastei", "terminei").
 *
 * Procura entre os NÃO CONCLUÍDOS (`agendado` ou `em_andamento`, sem
 * cancelamento): "fiz 8 hectares hoje" é sobre algo em curso, não sobre um
 * serviço já fechado. Com o nome do cliente dito, filtra por ele; sem nome,
 * só resolve sozinho se houver exatamente UM serviço nesse estado.
 *
 * ⚠️ DOIS EM ANDAMENTO E NENHUM NOME É PERGUNTA, listando os dois, nunca o
 * primeiro escolhido em silêncio. É o defeito que `resolverPasto` ainda tem
 * (`dividas.md` §3.3): um "fiz 8 hectares hoje" que caísse no primeiro
 * serviço poria a produção no cliente errado, e o horímetro do §32 iria para
 * a máquina errada junto.
 */
async function resolverServicoEmAndamento(
  db: TenantPrismaClient,
  cliente: string | null,
): Promise<
  | { ok: true; job: { id: string; description: string } }
  | { ok: false; resposta: RouterResult }
> {
  const jobs = await db.serviceJob.findMany({
    where: {
      direction: "prestado",
      canceled_at: null,
      status: { in: ["agendado", "em_andamento"] },
    },
    include: { contact: { select: { name: true } } },
    orderBy: { occurred_at: "desc" },
  });

  const listar = (lista: typeof jobs) =>
    lista.map((j) => `- ${j.description}${j.contact ? ` para ${j.contact.name}` : ""}`).join("\n");

  if (jobs.length === 0) {
    return {
      ok: false,
      resposta: ask("Não encontrei nenhum serviço em andamento para atualizar."),
    };
  }

  if (cliente) {
    const alvo = normalizar(cliente);
    const achados = jobs.filter((j) => j.contact && normalizar(j.contact.name).includes(alvo));
    if (achados.length === 1) {
      return { ok: true, job: { id: achados[0].id, description: achados[0].description } };
    }
    if (achados.length > 1) {
      return {
        ok: false,
        resposta: ask(
          `Tenho mais de um serviço em andamento para esse cliente. Qual deles?\n${listar(achados)}`,
        ),
      };
    }
    return {
      ok: false,
      resposta: ask(
        `Não achei serviço em andamento para esse cliente. Qual destes é?\n${listar(jobs)}`,
      ),
    };
  }

  if (jobs.length === 1) {
    return { ok: true, job: { id: jobs[0].id, description: jobs[0].description } };
  }

  return {
    ok: false,
    resposta: ask(`Tenho mais de um serviço em andamento. Qual deles?\n${listar(jobs)}`),
  };
}

/**
 * Acha o produto do combustível no estoque, quando existir (§21).
 *
 * ⚠️ Diferença de propósito para `resolverMaquina`: NÃO ACHAR não é pergunta.
 * O §21 é literal, "SE o diesel existir no estoque", e o custo entra do mesmo
 * jeito, sem baixar nada. Ambiguidade CONTINUA pergunta: escolher entre dois
 * produtos em silêncio arriscaria baixar o estoque errado.
 */
async function resolverProdutoOpcional(
  db: TenantPrismaClient,
  nome: string,
): Promise<{ id: string; unit: string | null } | { pergunta: RouterResult } | null> {
  const produtos = await db.product.findMany({
    where: { archived_at: null },
    select: { id: true, name: true, unit: true },
  });
  const alvo = normalizar(nome);
  const achados = produtos.filter((p) => normalizar(p.name).includes(alvo));

  if (achados.length === 1) return { id: achados[0].id, unit: achados[0].unit };
  if (achados.length > 1) {
    const lista = achados.map((p) => `- ${p.name}`).join("\n");
    return {
      pergunta: ask(`Tenho mais de um produto parecido no estoque. Qual deles é?\n${lista}`),
    };
  }
  return null;
}

/**
 * A unidade falada, por `pricing`.
 *
 * ⚠️ Cópia deliberada do `PRICING_UNIDADE` de `components/servicos/labels.ts`:
 * aquele arquivo é da tela e importar dali arrastaria o kit de componentes
 * para dentro do agente, que é servidor puro. Mesmo motivo de
 * `SERVICOS_MECANIZADOS` já viver duplicado entre os dois arquivos.
 */
const UNIDADE_FALADA: Record<ServicePricing, string> = {
  hora: "horas",
  hectare: "hectares",
  dia: "diárias",
  viagem: "viagens",
  tonelada: "toneladas",
  metro: "metros",
  quilometro: "quilômetros",
  cabeca: "cabeças",
  fechado: "unidades",
};

/** "gradagem de João Vizinho", ou só "gradagem" quando não há cliente. */
function comCliente(descricao: string, cliente: string | null): string {
  const base = descricao.toLowerCase();
  return cliente ? `${base} de ${cliente}` : base;
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

// ── §42: o serviço PRESTADO com máquina própria ──────────────────────────

/**
 * As unidades que o produtor fala, mapeadas para o `pricing` do banco.
 *
 * Aceita singular e plural porque a frase do §42 diz "20 hectares" e "180 o
 * hectare" na MESMA frase, e o classificador manda o que ouviu. `Record`
 * completo do lado do enum não cabe aqui: o mapa é de fala para valor, e a fala
 * tem mais entradas que o enum.
 */
const UNIDADES: Record<string, ServicePricing> = {
  hora: "hora",
  horas: "hora",
  hectare: "hectare",
  hectares: "hectare",
  ha: "hectare",
  dia: "dia",
  dias: "dia",
  diaria: "dia",
  diarias: "dia",
  viagem: "viagem",
  viagens: "viagem",
  tonelada: "tonelada",
  toneladas: "tonelada",
  metro: "metro",
  metros: "metro",
  quilometro: "quilometro",
  quilometros: "quilometro",
  km: "quilometro",
  cabeca: "cabeca",
  cabecas: "cabeca",
  fechado: "fechado",
  empreito: "fechado",
};

/**
 * "Amanhã vou gradear 20 hectares para o João a 180 reais o hectare." (§42)
 *
 * A confirmação mostra o TOTAL PREVISTO, que é o número que o §42 pede em
 * letra: "total previsto de R$ 3.600". E fala em RECEBER, nunca em pagar: o
 * dinheiro entra.
 *
 * ⚠️ A máquina é obrigatória (§17), então ela é perguntada como qualquer outro
 * campo que falte, e resolvida por `resolverMaquina`, que não inventa nem
 * escolhe sozinho.
 */
export const registrarServicoPrestado: Handler = async (ctx) => {
  const intent = "registrar_servico_prestado";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("prestado", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const servico = str(parameters.servico) ?? str(parameters.description);
  if (!servico) {
    await guardar("servico");
    return ask("Qual serviço você fez? (gradagem, roçada, colheita...)");
  }

  const maquinaDita = str(parameters.maquina) ?? str(parameters.machine);
  if (!maquinaDita) {
    await guardar("maquina");
    return ask(`Qual máquina você usou na ${servico.toLowerCase()}?`);
  }
  const maquina = await resolverMaquina(ctx.db, maquinaDita);
  if (!maquina.ok) {
    // A pergunta volta ao mesmo campo: a resposta é o nome da máquina de novo,
    // e sem isto o pedido ficaria esperando um campo que ninguém perguntou.
    await guardar("maquina");
    return maquina.resposta;
  }

  const unidadeDita = str(parameters.unidade) ?? str(parameters.pricing);
  const pricing = unidadeDita ? UNIDADES[normalizar(unidadeDita)] : undefined;
  if (!pricing) {
    await guardar("unidade");
    return ask("Cobrou por hora, por hectare, por diária, ou foi valor fechado?");
  }

  const valor = lerNumeroBr(parameters.valor ?? parameters.amount);
  if (valor === null || valor <= 0) {
    await guardar("valor");
    return ask(
      pricing === "fechado"
        ? `Quanto ficou o serviço de ${servico}?`
        : `Quanto você cobrou por ${pricing}?`,
    );
  }

  // No empreito não se pergunta quantidade: o §16 diz que o sistema não deve
  // exigir cálculo por hora ou hectare quando o valor é fechado.
  let quantidade: number | null = null;
  if (pricing !== "fechado") {
    quantidade = lerNumeroBr(parameters.quantidade ?? parameters.quantity);
    if (quantidade === null || quantidade <= 0) {
      await guardar("quantidade");
      return ask(`Quantos ${pricing === "hora" ? "horas" : pricing + "s"} foram?`);
    }
  }

  const quemDito = str(parameters.quem) ?? str(parameters.contact_name);
  if (!quemDito) {
    await guardar("quem");
    return ask(`Para quem você fez a ${servico.toLowerCase()}?`);
  }
  const cliente = await resolverPrestador(ctx.db, quemDito);
  if (!cliente.ok) {
    await guardar("quem");
    return cliente.resposta;
  }

  const total = pricing === "fechado" ? valor : valor * (quantidade ?? 0);

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Deseja registrar ${servico} para ${cliente.nomeFinal} com o ${maquina.nome}, ` +
        `total previsto de ${moeda(total)}?`,
      requires_confirmation: true,
      auxiliary_data: { servico, pricing, valor, quantidade, quem: cliente.nomeFinal, total },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const fazenda = await fazendaPadrao(ctx.db);
  if (!fazenda.ok) return fazenda.resposta;

  const res = await createServiceJob(ctx.db, {
    direction: "prestado",
    property_id: fazenda.id,
    occurred_at: new Date(),
    description: servico,
    pricing,
    unit_price: pricing === "fechado" ? null : valor,
    agreed_amount: pricing === "fechado" ? valor : null,
    quantity: quantidade,
    machine_id: maquina.id,
    contact_name: cliente.nomeFinal,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ ${servico} para ${cliente.nomeFinal} registrada, ${moeda(res.data.total)}.` +
      "\nFicou como conta a receber. Me avise quando receber.",
    requires_confirmation: false,
    auxiliary_data: { service_job_id: res.data.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

// ── §42: começar, acrescentar produção, lançar combustível, encerrar ────

/**
 * "Comecei a gradagem do João hoje." (§42)
 */
export const iniciarServico: Handler = async (ctx) => {
  const intent = "iniciar_servico";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("iniciar", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const clienteDito = str(parameters.quem) ?? str(parameters.contact_name);
  const achado = await resolverServicoEmAndamento(ctx.db, clienteDito);
  if (!achado.ok) {
    await guardar("quem");
    return achado.resposta;
  }

  const detalhe = await getServiceJobDetail(ctx.db, achado.job.id);
  if (!detalhe.ok) return failReply(intent, detalhe);
  const alvo = comCliente(detalhe.data.description, detalhe.data.contact_name);

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: `Vou marcar o serviço de ${alvo} como iniciado. Confirma?`,
      requires_confirmation: true,
      auxiliary_data: { service_job_id: achado.job.id },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await setServiceJobStatus(ctx.db, {
    service_job_id: achado.job.id,
    status: "em_andamento",
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text: `✅ Serviço de ${comCliente(res.data.description, res.data.contact_name)} iniciado.`,
    requires_confirmation: false,
    auxiliary_data: { service_job_id: achado.job.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

/**
 * "Fiz 8 hectares hoje." (§42, §19 e §20)
 *
 * A confirmação mostra "acrescentar X <unidade> ao serviço de <descrição>",
 * com a unidade do `pricing` do serviço resolvido (hectares, horas...), não um
 * genérico "unidades".
 */
export const registrarProducaoServico: Handler = async (ctx) => {
  const intent = "registrar_producao_servico";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("producao", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const clienteDito = str(parameters.quem) ?? str(parameters.contact_name);
  const achado = await resolverServicoEmAndamento(ctx.db, clienteDito);
  if (!achado.ok) {
    await guardar("quem");
    return achado.resposta;
  }

  const detalhe = await getServiceJobDetail(ctx.db, achado.job.id);
  if (!detalhe.ok) return failReply(intent, detalhe);
  const alvo = comCliente(detalhe.data.description, detalhe.data.contact_name);
  const unidade = UNIDADE_FALADA[detalhe.data.pricing] ?? "unidades";

  const quantidade = lerNumeroBr(parameters.quantidade ?? parameters.quantity);
  if (quantidade === null || quantidade <= 0) {
    await guardar("quantidade");
    return ask(`Quanto foi feito no serviço de ${alvo}?`);
  }

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: `Deseja acrescentar ${quantidade} ${unidade} ao serviço de ${alvo}?`,
      requires_confirmation: true,
      auxiliary_data: { service_job_id: achado.job.id, quantidade },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await addServiceJobLog(ctx.db, {
    service_job_id: achado.job.id,
    quantity: quantidade,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ Produção registrada. Total do serviço agora: ${res.data.quantidade} ${unidade}, ` +
      `${moeda(res.data.total)}.`,
    requires_confirmation: false,
    auxiliary_data: { service_job_id: achado.job.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

/**
 * "Gastei 60 litros de diesel hoje nesse serviço." (§42, §21 e §22)
 *
 * O produto é OPCIONAL (§21: "SE existir no estoque"): sem achar, o custo
 * entra do mesmo jeito, sem baixar nada. `recordServiceFuel` é quem decide.
 */
export const registrarCombustivelServico: Handler = async (ctx) => {
  const intent = "registrar_combustivel_servico";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("combustivel_servico", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const clienteDito = str(parameters.quem) ?? str(parameters.contact_name);
  const achado = await resolverServicoEmAndamento(ctx.db, clienteDito);
  if (!achado.ok) {
    await guardar("quem");
    return achado.resposta;
  }

  const detalhe = await getServiceJobDetail(ctx.db, achado.job.id);
  if (!detalhe.ok) return failReply(intent, detalhe);
  const alvo = comCliente(detalhe.data.description, detalhe.data.contact_name);

  const produtoDito = str(parameters.produto) ?? str(parameters.product);
  if (!produtoDito) {
    await guardar("produto");
    return ask(`Qual combustível ou produto foi usado no serviço de ${alvo}?`);
  }

  const quantidade = lerNumeroBr(parameters.quantidade ?? parameters.quantity);
  if (quantidade === null || quantidade <= 0) {
    await guardar("quantidade");
    return ask(`Quanto de ${produtoDito.toLowerCase()} foi gasto?`);
  }

  const produto = await resolverProdutoOpcional(ctx.db, produtoDito);
  if (produto && "pergunta" in produto) {
    await guardar("produto");
    return produto.pergunta;
  }

  const valor = lerNumeroBr(parameters.valor ?? parameters.amount);

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    const unidadeTexto = produto?.unit ? `${produto.unit} de ` : "";
    return {
      reply_text:
        `Deseja registrar ${quantidade} ${unidadeTexto}${produtoDito.toLowerCase()} ` +
        `no serviço de ${alvo}${valor !== null ? `, ${moeda(valor)}` : ""}?`,
      requires_confirmation: true,
      auxiliary_data: { service_job_id: achado.job.id, produto: produtoDito, quantidade, valor },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await recordServiceFuel(ctx.db, {
    service_job_id: achado.job.id,
    product_id: produto?.id ?? null,
    description: produto ? null : produtoDito,
    quantity: quantidade,
    unit: produto?.unit ?? null,
    amount: valor,
    user_id: ctx.user_id,
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  return {
    reply_text:
      `✅ ${quantidade} de ${produtoDito.toLowerCase()} registrado no serviço de ${alvo}.` +
      (res.data.baixou_estoque ? " Baixei do estoque." : ""),
    requires_confirmation: false,
    auxiliary_data: { service_job_id: achado.job.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

/**
 * "Terminei o serviço do João." (§42)
 *
 * A resposta traz os três itens que o §42 pede em letra: quantidade, valor
 * total e situação do pagamento. Concluir NÃO mexe no dinheiro: quitar aqui
 * inventaria um recebimento que ninguém confirmou.
 */
export const encerrarServico: Handler = async (ctx) => {
  const intent = "encerrar_servico";
  if (ctx.explicitNo) return cancelar(intent, ctx.tenant_id, ctx.user_id);

  const aberta = await abrirConversa("encerrar", ctx);
  if ("parar" in aberta) return aberta.parar;
  const { parameters, guardar, limpar } = aberta;

  const clienteDito = str(parameters.quem) ?? str(parameters.contact_name);
  const achado = await resolverServicoEmAndamento(ctx.db, clienteDito);
  if (!achado.ok) {
    await guardar("quem");
    return achado.resposta;
  }

  const detalhe = await getServiceJobDetail(ctx.db, achado.job.id);
  if (!detalhe.ok) return failReply(intent, detalhe);
  const alvo = comCliente(detalhe.data.description, detalhe.data.contact_name);

  if (!ctx.confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: `Vou marcar o serviço de ${alvo} como concluído. Confirma?`,
      requires_confirmation: true,
      auxiliary_data: { service_job_id: achado.job.id },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const res = await setServiceJobStatus(ctx.db, {
    service_job_id: achado.job.id,
    status: "concluido",
  });
  await limpar();
  if (!res.ok) return failReply(intent, res);

  const unidade = UNIDADE_FALADA[res.data.pricing] ?? "unidades";
  const situacao =
    res.data.a_receber > 0
      ? `faltam ${moeda(res.data.a_receber)} a receber`
      : "já está tudo recebido";

  return {
    reply_text:
      `✅ Serviço de ${comCliente(res.data.description, res.data.contact_name)} concluído. ` +
      `Total: ${res.data.quantidade} ${unidade}, ${moeda(res.data.total)}. ${situacao}.`,
    requires_confirmation: false,
    auxiliary_data: { service_job_id: achado.job.id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};
