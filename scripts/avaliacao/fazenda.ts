import {
  prisma,
  prismaForTenant,
  scoped,
  TENANT_SCOPED_MODELS,
  type TenantPrismaClient,
} from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { deleteTestTenants, createTestAnimal } from "../helpers/herd";
import { recordMovement } from "@/lib/actions/herd-ledger";
import { createConfinementSite, openConfinementStay } from "@/lib/actions/confinement";
import { ensureProductCategories, listProductCategories, createProduct } from "@/lib/actions/products";
import { recordStockMovement } from "@/lib/actions/stock-ledger";
import { createContact } from "@/lib/actions/contacts";
import { createWorker } from "@/lib/actions/workers";
import { createMachineAction } from "@/lib/actions/machines";
import { createMilkGroup } from "@/lib/actions/milk-groups";
import { criarItemAction } from "@/lib/actions/shopping-items";
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { findCategory } from "@/lib/herd/categories";
import { findUnit } from "@/lib/stock/units";
import type { ContactType } from "@/generated/prisma/client";
import { DOMINIOS, DESCRICAO_DOS_DOMINIOS, intencoesDoDominio } from "@/lib/agente/intencoes";

/**
 * A fazenda de avaliação (Fase 3, task 4): uma montagem única no Postgres
 * LOCAL, usada pelo executor de casos e descrita, em markdown, para quem
 * escreve caso sem acesso ao código.
 *
 * `FAZENDA` é a ÚNICA fonte dos nomes e números: `montarFazenda` cria exatamente
 * isto, e `descreverFazenda`/`descreverCatalogo` só formatam o que já existe
 * aqui e no registro de intenções. Duplicar os valores nos dois lugares foi
 * descartado de propósito: um autor lendo o briefing precisa ver os MESMOS
 * nomes que o executor vai encontrar no banco.
 */
export type DadosDaFazenda = {
  fazendas: { nome: string; pastos: { nome: string; area_ha: number }[] }[];
  rebanho: { fazenda: string; pasto: string; category_id: string; quantidade: number }[];
  animalIndividual: { ear_tag: string; categoria: string; sexo: "male" | "female" };
  vacinas: string[];
  confinamento: { nome: string; fazenda: string; pasto_de_origem: string; category_id: string; quantidade: number };
  estoque: { produto: string; categoria: string; unidade: string; quantidade: number }[];
  contatos: { nome: string; tipo: ContactType }[];
  maoDeObra: {
    nome: string;
    funcao: string;
    tipo: "fixo" | "eventual";
    frequencia: "mensal" | "diaria" | null;
    valor: number;
    dia: number | null;
  }[];
  prestador: { cliente: string; servico: string; maquina: string };
  leite: { fazenda: string; grupo: string };
  listaDeCompra: string[];
  financeiro: { categoria: string; valor: number; diaVencimento: number };
};

export const FAZENDA: DadosDaFazenda = {
  fazendas: [
    {
      nome: "Fazenda Boa Vista",
      pastos: [
        { nome: "Pasto da Sede", area_ha: 20 },
        { nome: "Pasto da Baixada", area_ha: 35 },
        { nome: "Piquete 3", area_ha: 5 },
      ],
    },
    { nome: "Sítio São José", pastos: [{ nome: "Pasto do Rio", area_ha: 15 }] },
  ],
  rebanho: [
    { fazenda: "Fazenda Boa Vista", pasto: "Pasto da Sede", category_id: "femea_36_mais", quantidade: 30 },
    { fazenda: "Fazenda Boa Vista", pasto: "Pasto da Sede", category_id: "femea_13_24", quantidade: 25 },
    { fazenda: "Fazenda Boa Vista", pasto: "Pasto da Sede", category_id: "macho_25_36", quantidade: 20 },
    { fazenda: "Fazenda Boa Vista", pasto: "Pasto da Sede", category_id: "bezerro_0_7", quantidade: 15 },
    { fazenda: "Sítio São José", pasto: "Pasto do Rio", category_id: "femea_36_mais", quantidade: 12 },
  ],
  animalIndividual: { ear_tag: "1234", categoria: "Vaca", sexo: "female" },
  vacinas: ["Aftosa", "Brucelose"],
  confinamento: {
    nome: "Confinamento Boa Vista",
    fazenda: "Fazenda Boa Vista",
    pasto_de_origem: "Pasto da Sede",
    category_id: "macho_25_36",
    quantidade: 10,
  },
  estoque: [
    { produto: "Sal mineral", categoria: "Sal mineral", unidade: "saca", quantidade: 20 },
    { produto: "Ração de engorda", categoria: "Ração", unidade: "saca", quantidade: 50 },
    { produto: "Diesel", categoria: "Combustível", unidade: "litro", quantidade: 500 },
    { produto: "Ivermectina", categoria: "Medicamentos", unidade: "frasco", quantidade: 10 },
  ],
  contatos: [
    { nome: "João do Leilão", tipo: "leilao" },
    { nome: "Frigorífico Bom Boi", tipo: "frigorifico" },
  ],
  maoDeObra: [
    { nome: "Pedro", funcao: "Diarista", tipo: "eventual", frequencia: "diaria", valor: 150, dia: null },
    { nome: "Zé Carlos", funcao: "Mensalista", tipo: "fixo", frequencia: "mensal", valor: 2200, dia: 5 },
  ],
  prestador: { cliente: "Agropecuária Santa Fé", servico: "Gradagem", maquina: "Trator New Holland" },
  leite: { fazenda: "Fazenda Boa Vista", grupo: "Vacas em Lactação" },
  listaDeCompra: ["Arame farpado"],
  financeiro: { categoria: "Energia", valor: 480, diaVencimento: 20 },
};

export type FazendaMontada = {
  tenantId: string;
  userId: string;
  telefone: string;
  db: TenantPrismaClient;
  limpar(): Promise<void>;
};

/**
 * Dígitos determinísticos derivados de `sufixo`, para dar a duas montagens no
 * MESMO milissegundo (`Promise.all` de duas conversas, o caso da próxima
 * tarefa) uma diferença que `Date.now()` sozinho não dá: até o primeiro
 * `await`, duas chamadas de `montarFazenda` rodam de forma síncrona, e
 * `Date.now()` tem resolução de 1 ms.
 */
function digitosDoSufixo(sufixo: string, quantidade: number): string {
  let n = 0;
  for (const ch of sufixo) n = (n * 31 + ch.charCodeAt(0)) % 10 ** quantidade;
  return String(n).padStart(quantidade, "0");
}

function exigirOk<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(`fixture da avaliação: ${r.message}`);
  return r.data;
}

/**
 * Desfaz a montagem inteira. Segue a ordem das chaves estrangeiras: apaga
 * primeiro o que `deleteTestTenants` não cobre (estoque, máquina, lote de
 * leite, estadia e confinamento, pasto), na ordem que libera os `Restrict`
 * contra `Property`, e só então chama `deleteTestTenants`, que cuida do
 * livro-razão do rebanho e do tenant. Cada `deleteMany` é seguro mesmo sem
 * linha nenhuma, o que é o que permite chamar esta função depois de uma
 * montagem que quebrou no meio.
 */
function criarLimpar(tenantId: string, db: TenantPrismaClient): () => Promise<void> {
  return async function limpar() {
    await db.herdMovement.deleteMany({});
    await db.stockMovement.deleteMany({});
    // O que os handlers gravam numa conversa e aponta com Restrict para fazenda, contato ou catálogo.
    await db.milkMovement.deleteMany({});
    await db.milkCharge.deleteMany({});
    await db.milkProduction.deleteMany({});
    await db.lactationEntry.deleteMany({});
    await db.serviceJob.deleteMany({});
    await db.serviceOrder.deleteMany({});
    await db.milkSite.deleteMany({});
    await db.worker.deleteMany({});
    await db.plot.deleteMany({});
    await db.animalVaccination.deleteMany({});
    await db.animalMovement.deleteMany({});
    await db.animalWeightLog.deleteMany({});
    await db.animalBatch.deleteMany({});
    await db.product.deleteMany({});
    await db.productCategory.deleteMany({});
    await db.machine.deleteMany({});
    await db.milkGroup.deleteMany({});
    await db.herdStay.deleteMany({});
    await db.confinementSite.deleteMany({});
    await db.pasture.deleteMany({});
    await deleteTestTenants([tenantId]);
  };
}

export async function montarFazenda(sufixo: string): Promise<FazendaMontada> {
  const stamp = Date.now();
  // `.slice(-N)`, sempre a partir do FIM do timestamp: é a parte que muda a
  // cada milissegundo. Cortar do começo (como `\`AV${stamp}\`.slice(0, 14)`
  // fazia) descarta justamente os dígitos que diferenciam duas montagens
  // próximas, e `document` é `@unique` em `Tenant`.
  const telefone = `31${String(stamp).slice(-7)}${digitosDoSufixo(sufixo, 2)}`;
  const documento = `AV${String(stamp).slice(-8)}${digitosDoSufixo(sufixo, 4)}`;

  const tenant = await prisma.tenant.create({
    data: { name: `Avaliação ${sufixo}`, document: documento, plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);
  const limpar = criarLimpar(tenant.id, db);

  try {
    await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
    await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "prestador", active: true } });

    const owner = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Dono da Avaliação",
        // Mesmo motivo de `documento` acima: `email` é `@unique` em `User`.
        email: `avaliacao-${stamp}-${digitosDoSufixo(sufixo, 6)}@teste.local`,
        password_hash: "x",
        role: "OWNER",
        active: true,
        phone: telefone,
      },
    });

    // Contato já existente: sem isto, o primeiro passo de toda conversa
    // simulada seria a saudação de primeiro contato, não a intenção do caso.
    await db.whatsAppContact.create({
      data: scoped({ phone: normalizePhone(telefone), user_id: owner.id, last_interaction_at: new Date() }),
    });

    // Fazendas e pastos.
    const propriedades = new Map<string, { id: string }>();
    const pastos = new Map<string, { id: string }>();
    for (const fazenda of FAZENDA.fazendas) {
      const propriedade = await db.property.create({ data: scoped({ name: fazenda.nome }) });
      propriedades.set(fazenda.nome, propriedade);
      for (const pasto of fazenda.pastos) {
        const criado = await db.pasture.create({
          data: scoped({ property_id: propriedade.id, name: pasto.nome, area_hectares: pasto.area_ha }),
        });
        pastos.set(pasto.nome, criado);
      }
    }

    // Rebanho, pelo livro-razão (invariante 2: saldo nunca é gravado).
    for (const linha of FAZENDA.rebanho) {
      const propriedade = propriedades.get(linha.fazenda);
      const pasto = pastos.get(linha.pasto);
      if (!propriedade || !pasto) throw new Error(`fixture da avaliação: fazenda ou pasto desconhecido em ${JSON.stringify(linha)}`);
      const r = await recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity: linha.quantidade,
        to: { category_id: linha.category_id, property_id: propriedade.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
      });
      exigirOk(r);
    }

    // Animal individual, por brinco.
    const categoriaVaca = await db.animalCategory.create({ data: scoped({ name: FAZENDA.animalIndividual.categoria }) });
    const propriedadeDoAnimal = propriedades.get(FAZENDA.fazendas[0].nome)!;
    await createTestAnimal(db, tenant.id, {
      ear_tag: FAZENDA.animalIndividual.ear_tag,
      property_id: propriedadeDoAnimal.id,
      sex: FAZENDA.animalIndividual.sexo,
      category_id: categoriaVaca.id,
    });

    // Catálogo de vacinas.
    for (const nome of FAZENDA.vacinas) {
      await db.vaccine.create({ data: scoped({ name: nome }) });
    }

    // Confinamento: um lote aberto, saído do pasto onde o rebanho já está.
    const propriedadeDoConfinamento = propriedades.get(FAZENDA.confinamento.fazenda)!;
    const pastoDeOrigem = pastos.get(FAZENDA.confinamento.pasto_de_origem)!;
    const site = exigirOk(
      await createConfinementSite(db, { name: FAZENDA.confinamento.nome, type: "proprio", property_id: propriedadeDoConfinamento.id }),
    );
    exigirOk(
      await openConfinementStay(db, {
        confinement_site_id: site.id,
        category_id: FAZENDA.confinamento.category_id,
        quantity: FAZENDA.confinamento.quantidade,
        pasture_id: pastoDeOrigem.id,
      }),
    );

    // Estoque: catálogo de produtos e o saldo de cada um, como movimentação
    // de entrada (invariante 2: nunca um campo de quantidade).
    await ensureProductCategories(db);
    const categoriasDeProduto = await listProductCategories(db);
    const propriedadeDoEstoque = propriedades.get(FAZENDA.fazendas[0].nome)!;
    for (const item of FAZENDA.estoque) {
      const categoria = categoriasDeProduto.find((c) => c.name === item.categoria);
      if (!categoria) throw new Error(`fixture da avaliação: categoria de estoque desconhecida "${item.categoria}"`);
      const produto = exigirOk(await createProduct(db, { name: item.produto, category_id: categoria.id, unit: item.unidade }));
      exigirOk(
        await recordStockMovement(db, {
          product_id: produto.id,
          property_id: propriedadeDoEstoque.id,
          movement_type: "compra",
          quantity: item.quantidade,
          occurred_at: new Date(),
        }),
      );
    }

    // Contatos de negociação.
    for (const contato of FAZENDA.contatos) {
      exigirOk(await createContact(db, { name: contato.nome, type: contato.tipo }));
    }

    // Mão de obra.
    for (const trabalhador of FAZENDA.maoDeObra) {
      exigirOk(
        await createWorker(db, {
          name: trabalhador.nome,
          role: trabalhador.funcao,
          type: trabalhador.tipo,
          pay_frequency: trabalhador.frequencia,
          pay_amount: trabalhador.valor,
          pay_day: trabalhador.dia,
        }),
      );
    }

    // Prestador: cliente e serviço do catálogo de Ordens de Serviço (Módulo
    // 2). Sem action própria (a rota cria direto, como aqui): ver
    // src/app/api/v1/service-clients e /services.
    await db.serviceClient.create({ data: scoped({ name: FAZENDA.prestador.cliente }) });
    // `PricingType` (hour/day/fixed) não tem opção "por hectare": "day" é a
    // mais próxima disponível para um serviço que não é fechado. Ver o
    // relatório da task 4 (DONE_WITH_CONCERNS).
    await db.service.create({ data: scoped({ name: FAZENDA.prestador.servico, pricing_type: "day", unit_price: 180 }) });
    // A máquina existe como cadastro do Módulo 26 (Máquinas): o catálogo de
    // Ordens de Serviço do prestador não tem `machine_id` para vinculá-la.
    exigirOk(
      await createMachineAction(db, { property_id: propriedadeDoEstoque.id, name: FAZENDA.prestador.maquina, type: "trator" }),
    );

    // Leite: o lote mínimo para "tirei 120 litros hoje" aceitar um nome, sem
    // exigir local de coleta (a produção não pede tanque nenhum).
    const propriedadeDoLeite = propriedades.get(FAZENDA.leite.fazenda)!;
    exigirOk(await createMilkGroup(db, { property_id: propriedadeDoLeite.id, name: FAZENDA.leite.grupo }));

    // Lista de compra.
    for (const descricao of FAZENDA.listaDeCompra) {
      exigirOk(await criarItemAction(db, { description: descricao }));
    }

    // Financeiro: conta a pagar, vencendo no dia combinado do mês corrente.
    const hoje = new Date();
    const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), FAZENDA.financeiro.diaVencimento);
    exigirOk(
      await createManualEntryAction(db, {
        entry_type: "expense",
        category: FAZENDA.financeiro.categoria,
        amount: FAZENDA.financeiro.valor,
        due_date: vencimento,
      }),
    );

    return { tenantId: tenant.id, userId: owner.id, telefone, db, limpar };
  } catch (e) {
    await limpar().catch(() => {});
    throw e;
  }
}

/**
 * Conta `count()` de todo model de negócio de `TENANT_SCOPED_MODELS`, model a
 * model, para o executor detectar gravação indevida (o eliminatório da
 * avaliação): compara as contagens antes e depois de rodar um passo, e uma
 * pergunta que escreve é falha. Model a model porque o total sozinho só enxerga
 * linha NOVA: apagar uma e criar outra se anulam, e atualizar não mexe nele.
 * Fica de fora o que não é linha de negócio (perfil, usuário, contato,
 * histórico de conversa, alerta, cofre de sessão): a lista exata está na
 * brief da task 4.
 */
const FORA_DA_CONTAGEM = new Set<string>([
  "TenantProfile",
  "User",
  "WhatsAppContact",
  "AgentConversationLog",
  "AgentRequest",
  "AgentFlowState",
  "Alert",
  "AlertPreference",
  "EmailLog",
  "PasswordResetCode",
  "RefreshToken",
  "PushSubscription",
  "Subscription",
]);

type ClienteComContagem = Record<string, { count(args?: unknown): Promise<number> }>;

/**
 * Models de negócio que têm `updated_at`: neles, escrita indevida pode não criar
 * linha nenhuma (riscar item da lista, encerrar serviço, quitar conta), e só a
 * data de alteração denuncia. A lista sai do `schema.prisma`; model novo com
 * `updated_at` entra aqui.
 *
 * ponytail: `ServiceOrder`, `HerdStay` e `MilkGroup` também mudam de estado, mas
 * não têm `updated_at` no schema. As duas primeiras gravam a movimentação junto
 * (linha nova, já contada) e a terceira só muda ao arquivar; se um dia isso
 * mudar, o caminho é o campo no schema, não uma contagem especial aqui.
 */
const COM_DATA_DE_ALTERACAO = new Set<string>([
  "AnimalBatch",
  "Machine",
  "Task",
  "Product",
  "FinancialEntry",
  "Worker",
  "ServiceJob",
  "ShoppingItem",
]);

/** `porModel`: uma chave por model, mais `Model#alterado` quando `desde` é informada. */
export type ContagemDeNegocio = { total: number; porModel: Record<string, number> };

export async function contarLinhasDeNegocio(db: TenantPrismaClient, desde?: Date): Promise<ContagemDeNegocio> {
  const cliente = db as unknown as ClienteComContagem;
  const porModel: Record<string, number> = {};
  let total = 0;
  for (const modelo of TENANT_SCOPED_MODELS) {
    if (FORA_DA_CONTAGEM.has(modelo)) continue;
    const delegate = modelo.charAt(0).toLowerCase() + modelo.slice(1);
    const linhas = await cliente[delegate].count();
    porModel[modelo] = linhas;
    total += linhas;
    if (desde && COM_DATA_DE_ALTERACAO.has(modelo)) {
      porModel[`${modelo}#alterado`] = await cliente[delegate].count({ where: { updated_at: { gte: desde } } });
    }
  }
  return { total, porModel };
}

/** Qualquer model que mudou de contagem, para mais ou para menos, ou que teve linha alterada. */
export function algumaEscritaEntre(antes: ContagemDeNegocio, depois: ContagemDeNegocio): boolean {
  return Object.keys(depois.porModel).some((chave) => depois.porModel[chave] !== (antes.porModel[chave] ?? 0));
}

function reaisBr(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function nomeDaCategoria(id: string): string {
  return findCategory(id)?.plural ?? id;
}

/**
 * Markdown para quem escreve caso, sem acesso ao código: todos os nomes e
 * números que a fazenda de avaliação tem, para o autor citar exatamente o que
 * o executor vai encontrar no banco.
 */
export function descreverFazenda(): string {
  const linhas: string[] = ["# Fazenda de avaliação", ""];

  linhas.push("## Fazendas e pastos", "");
  for (const fazenda of FAZENDA.fazendas) {
    linhas.push(`- ${fazenda.nome}`);
    for (const pasto of fazenda.pastos) linhas.push(`  - ${pasto.nome}: ${pasto.area_ha} ha`);
  }

  linhas.push("", "## Rebanho", "");
  for (const fazenda of FAZENDA.fazendas) {
    const linhasDaFazenda = FAZENDA.rebanho.filter((l) => l.fazenda === fazenda.nome);
    if (linhasDaFazenda.length === 0) continue;
    const partes = linhasDaFazenda.map((l) => `${l.quantidade} ${nomeDaCategoria(l.category_id)} (${l.pasto})`);
    linhas.push(`- ${fazenda.nome}: ${partes.join(", ")}`);
  }

  linhas.push(
    "",
    "## Animal individual",
    `- Brinco ${FAZENDA.animalIndividual.ear_tag} (${FAZENDA.animalIndividual.categoria})`,
    "",
    "## Vacinas cadastradas",
    ...FAZENDA.vacinas.map((v) => `- ${v}`),
    "",
    "## Confinamento",
    `- ${FAZENDA.confinamento.nome}, em ${FAZENDA.confinamento.fazenda}: lote de ${FAZENDA.confinamento.quantidade} ${nomeDaCategoria(FAZENDA.confinamento.category_id)}`,
    "",
    "## Estoque",
    ...FAZENDA.estoque.map((i) => `- ${i.produto}: ${i.quantidade} ${findUnit(i.unidade)?.plural ?? i.unidade}`),
    "",
    "## Contatos de negócio",
    ...FAZENDA.contatos.map((c) => `- ${c.nome}`),
    "",
    "## Mão de obra",
    ...FAZENDA.maoDeObra.map((t) => `- ${t.nome} (${t.funcao.toLowerCase()})`),
    "",
    "## Prestador",
    `- Cliente: ${FAZENDA.prestador.cliente}`,
    `- Serviço: ${FAZENDA.prestador.servico}`,
    `- Máquina: ${FAZENDA.prestador.maquina}`,
    "",
    "## Leite",
    `- ${FAZENDA.leite.fazenda}, lote ${FAZENDA.leite.grupo}`,
    "",
    "## Lista de compra",
    ...FAZENDA.listaDeCompra.map((i) => `- ${i}`),
    "",
    "## Financeiro",
    `- Conta a pagar: ${FAZENDA.financeiro.categoria}, ${reaisBr(FAZENDA.financeiro.valor)}, vencimento dia ${FAZENDA.financeiro.diaVencimento}`,
    "",
  );

  return linhas.join("\n");
}

/**
 * Markdown do catálogo de intenções: domínio, intenção, descrição e campos
 * (com subcampos de lista). SEM exemplos e SEM vizinhas de propósito: são a
 * parte do registro que serve para o classificador, não para o autor de caso,
 * e copiar um exemplo do prompt para o caso invalidaria a avaliação.
 */
export function descreverCatalogo(): string {
  const linhas: string[] = ["# Catálogo de intenções do agente", ""];

  for (const dominio of DOMINIOS) {
    linhas.push(`## ${dominio}`, "", DESCRICAO_DOS_DOMINIOS[dominio], "");
    for (const def of intencoesDoDominio(dominio)) {
      linhas.push(`### ${def.intent}`, "", def.descricao, "");
      for (const campo of def.campos) {
        linhas.push(`- ${campo.nome} (${campo.tipo}): ${campo.descricao}`);
        for (const sub of campo.itens ?? []) {
          linhas.push(`  - ${sub.nome} (${sub.tipo}): ${sub.descricao}`);
        }
      }
      linhas.push("");
    }
  }

  return linhas.join("\n");
}
