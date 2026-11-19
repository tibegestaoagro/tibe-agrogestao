import "./_env-local";
import { papelDeFixture } from "./_emporio-papel";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório): as transações aguentam a distância entre a Vercel e o
 * Neon. Roda: `npm run test:m126`
 *
 * Em 18/11/2026 a Central do Milho não conseguiu trocar o fiado de uma venda por
 * cartão: "Erro interno". A edição (cancelar a antiga e gravar a nova numa
 * transação só) fazia umas 60 consultas, e a Vercel (Estados Unidos) fala com o
 * Neon (São Paulo) a uns 120 ms por consulta: a transação passava dos 5 s padrão
 * do Prisma e caía com "expired transaction". Nenhuma edição de venda tinha dado
 * certo em produção até então.
 *
 * Esta suíte põe 120 ms em cada consulta (a distância de produção) durante as
 * operações medidas e confere que elas terminam. Sem a correção, a seção 1 reprova.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
type Ator = { id: string; role: "OWNER" };

const DISTANCIA_MS = 120;
const DIA = 86_400_000;
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const meioDia = (s: string) => new Date(`${s}T12:00:00Z`);
const somaDias = (s: string, k: number) => new Date(meioDia(s).getTime() + k * DIA).toISOString().slice(0, 10);
const j = (x: unknown) => JSON.stringify(x);

let falhas = 0;
let total = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  total += 1;
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

/** Liga a distância só no trecho medido: a montagem do cenário roda sem atraso. */
const distancia = { ligada: false };
async function instalarDistancia() {
  const pg: Dado = await import("pg");
  const Cliente = (pg.default ?? pg).Client;
  const original = Cliente.prototype.query;
  Cliente.prototype.query = function (...args: Dado[]) {
    const r = original.apply(this, args);
    if (!distancia.ligada || !r || typeof r.then !== "function") return r;
    return r.then((v: Dado) => new Promise((ok) => setTimeout(() => ok(v), DISTANCIA_MS)));
  };
}

async function longe<T>(fn: () => Promise<T>): Promise<{ r: T | null; erro: string | null; ms: number }> {
  distancia.ligada = true;
  const t0 = Date.now();
  try {
    return { r: await fn(), erro: null, ms: Date.now() - t0 };
  } catch (e) {
    return { r: null, erro: e instanceof Error ? e.message.split("\n").find((l) => l.trim()) ?? e.message : String(e), ms: Date.now() - t0 };
  } finally {
    distancia.ligada = false;
  }
}

async function main() {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await instalarDistancia();
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const K: Dado = await import("@/lib/actions/emporio-cartoes");
  const Tu: Dado = await import("@/lib/actions/emporio-turno");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { corpoDaVendaSchema, chaveDeOperacao } = await import("@/lib/emporio/venda-schema");
  const { z } = await import("zod");

  console.log(`🌎 M126: Módulo 39 (Meu Empório), transações com ${DISTANCIA_MS} ms por consulta (Vercel nos EUA, Neon em São Paulo)\n`);

  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M126 ${stamp}`, document: `M126${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M126 dono", email: `m126-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const dono: Ator = { id: u.id, role: "OWNER" };
    const db = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M126 categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M126 Loja", kind: "ponto_venda" })).data;
    const turno1 = await abrirTurnoDeTeste(db, dono, loja.id);
    const conta = (await X.criarContaAction(db, dono, { name: `M126 Conta ${stamp}`, bank: "B" })).data.id;

    // Como na Central do Milho: saca fechada de 20 kg.
    const produtos: { id: string; apresentacao: string }[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const p = (await C.criarProdutoEmporioAction(db, dono, { name: `M126 Milho ${i} ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
      const ap = p.presentations[0].id as string;
      await C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: 52 });
      await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: p.id, sealed: [], loose_qty: 50, unit_cost: 44.91 });
      produtos.push({ id: p.id, apresentacao: ap });
    }
    const stone = (await K.criarAdquirenteAction(db, dono, { name: "STONE" })).data.id;
    const HOJE = brDia(new Date());
    const DIA_DA_VENDA = somaDias(HOJE, -2);
    // A taxa da Central: só valia nos dias das vendas antigas (já encerrada hoje).
    const rTaxa = await K.criarTaxaAction(db, dono, {
      establishment_id: loja.id, acquirer_id: stone, brand: "visa_master", kind: "debito", installments_from: 1, installments_to: 1,
      fee_pct: 1.67, days: 1, bank_account_id: conta, valid_from: meioDia(somaDias(HOJE, -4)), valid_to: meioDia(DIA_DA_VENDA),
    });
    if (!rTaxa.ok) throw new Error(`taxa: ${j(rTaxa)}`);
    const cliente = await db.emporioCustomer.create({ data: scoped({ name: "M126 Paulo" }) });
    const um = produtos[0];
    const rVenda = await V.venderAction(db, dono, {
      operation_key: `m126-venda-${stamp}`, establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno1.cash_register_id,
      sold_at: new Date(`${DIA_DA_VENDA}T18:37:00Z`),
      items: [{ emporio_product_id: um.id, presentation_id: um.apresentacao, quantity: 1 }],
      payments: [{ kind: "fiado", amount: 52, due_date: meioDia(somaDias(HOJE, 28)) }],
    });
    if (!rVenda.ok) throw new Error(`venda fiado: ${j(rVenda)}`);
    // O turno da venda já fechou; a edição acontece num turno novo, como em produção.
    const { saldoDoCaixa } = await import("@/lib/actions/emporio-caixa");
    const rEnc = await Tu.encerrarTurnoAction(db, dono, turno1.id, {
      operation_key: `m126-enc-${stamp}`, counted: (await saldoDoCaixa(db, turno1.cash_register_id)) / 100, malote_amount: 0,
    });
    if (!rEnc.ok) throw new Error(`encerrar turno: ${j(rEnc)}`);
    const turno2 = await abrirTurnoDeTeste(db, dono, loja.id);

    console.log("1. Editar a venda: fiado vira débito (o caso da Central do Milho)");
    // O corpo exatamente como o balcão manda, passado pelo schema da rota.
    const schema = corpoDaVendaSchema.extend({
      franchisee_id: z.string().nullish(), franchisee_credit: z.number().nullish(), operation_key: chaveDeOperacao, reason: z.string().trim().nullish(),
    });
    const corpo = schema.parse({
      operation_key: `m126-editar-${stamp}`, customer_id: cliente.id,
      items: [{ emporio_product_id: um.id, presentation_id: um.apresentacao, quantity: 1, unit_price: 52 }],
      payments: [{ kind: "debito", amount: 52, due_date: null, brand: "visa_master", acquirer_id: stone }],
      freight_amount: 0, origin: "balcao", seller_user_id: dono.id, notes: null, cash_register_id: turno2.cash_register_id,
    });
    const ed = await longe(() => V.editarVendaAction(db, dono, rVenda.data.id, corpo));
    check("a edição termina sem exceção (nada de \"expired transaction\")", ed.erro === null, ed.erro ?? "");
    check("a edição devolve ok", !!ed.r && (ed.r as Dado).ok, j(ed.r));
    const nova = ed.r && (ed.r as Dado).ok ? (ed.r as Dado).data : null;
    if (nova) {
      const antiga = await db.emporioSale.findFirst({ where: { id: rVenda.data.id }, select: { status: true, canceled_reason: true } });
      check("a antiga fica cancelada, substituída pela nova", antiga?.status === "cancelada" && (antiga?.canceled_reason ?? "").startsWith("Substituída pela venda nº"), j(antiga));
      const pag = await db.emporioSalePayment.findFirst({ where: { sale_id: nova.id }, select: { kind: true, fee_pct: true } });
      check("a nova é no débito, com a taxa de 1,67% do dia da venda", pag?.kind === "debito" && Number(pag?.fee_pct) === 1.67, j(pag));
    }
    console.log(`     (levou ${ed.ms} ms com ${DISTANCIA_MS} ms por consulta)`);

    console.log("\n2. Vender com 8 linhas na mesma distância");
    const itens = produtos.flatMap((p) => [
      { emporio_product_id: p.id, presentation_id: p.apresentacao, quantity: 1 },
      { emporio_product_id: p.id, presentation_id: p.apresentacao, quantity: 2 },
    ]);
    const vg = await longe(() =>
      V.venderAction(db, dono, {
        operation_key: `m126-grande-${stamp}`, establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno2.cash_register_id,
        items: itens, payments: [{ kind: "fiado", amount: 52 * 12 }],
      }),
    );
    check("a venda de 8 linhas termina sem exceção", vg.erro === null, vg.erro ?? "");
    check("a venda de 8 linhas devolve ok", !!vg.r && (vg.r as Dado).ok, j(vg.r));
    console.log(`     (levou ${vg.ms} ms)`);

    console.log("\n3. Cancelar a venda de 8 linhas na mesma distância");
    const idGrande = vg.r && (vg.r as Dado).ok ? (vg.r as Dado).data.id : null;
    if (idGrande) {
      const cg = await longe(() => V.cancelarVendaAction(db, dono, idGrande, { reason: "M126", cash_register_id: turno2.cash_register_id }));
      check("o cancelamento termina sem exceção", cg.erro === null, cg.erro ?? "");
      check("o cancelamento devolve ok", !!cg.r && (cg.r as Dado).ok, j(cg.r));
      console.log(`     (levou ${cg.ms} ms)`);
    } else {
      check("o cancelamento roda (precisa da venda da seção 2)", false);
    }
  } catch (e) {
    check("a suíte terminou sem exceção", false, e instanceof Error ? e.message : String(e));
  } finally {
    const por = { where: { tenant_id: t.id } };
    const cru = prisma as Dado;
    await cru.emporioSale.updateMany({ ...por, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
    for (const m of ["emporioPaymentRequest", "cashMovement", "cashCount", "cashHandover", "cardAnticipation", "productionEntry", "stockTransfer"]) {
      await cru[m].deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    await prisma.$disconnect();
  }
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M126 (Módulo 39, Empório): transações na distância de produção passou." : `\n❌ M126 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
