import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { buildNavItems } from "@/lib/nav";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F0: liberação por conta e fundação.
 * Roda: `npm run test:m77`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, F0), sem ler a
 * implementação. A rota `GET /api/v1/emporio` NÃO é chamada aqui: o handler
 * depende de sessão do NextAuth e esta suíte não tem jeito confiável de
 * simulá-la. O 404 da API fica coberto pela regra que ela usa
 * (`isFeatureVisibleForUser`) e precisa de validação ao vivo.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🛍️  M77: Módulo 39 (Meu Empório), F0: liberação por conta e fundação\n");

type Item = { href?: string; show?: boolean; children?: Item[] };
function achar(itens: Item[], href: string): Item | undefined {
  for (const i of itens) {
    if (i.href === href) return i;
    if (i.children) {
      const f = achar(i.children, href);
      if (f) return f;
    }
  }
  return undefined;
}

console.log("1. buildNavItems: o menu por combinação de perfis");
{
  const cenarios = [
    { nome: "só fazenda", hasFazenda: true, hasEmporio: false, hasPrestador: false },
    { nome: "fazenda + empório", hasFazenda: true, hasEmporio: true, hasPrestador: false },
    { nome: "só empório", hasFazenda: false, hasEmporio: true, hasPrestador: false },
    { nome: "nenhum (com prestador)", hasFazenda: false, hasEmporio: false, hasPrestador: true },
  ];
  for (const c of cenarios) {
    const itens = buildNavItems({ role: "OWNER", ...c }) as unknown as Item[];
    const show = (h: string) => {
      const it = achar(itens, h);
      return it ? it.show === true : null;
    };
    console.log(`  (${c.nome})`);
    check("/emporio existe e show === hasEmporio", show("/emporio") === c.hasEmporio, String(show("/emporio")));
    const compartilhado = c.hasFazenda || c.hasEmporio;
    check("/contatos show === fazenda || empório", show("/contatos") === compartilhado, String(show("/contatos")));
    check("/lista-de-compra show === fazenda || empório", show("/lista-de-compra") === compartilhado, String(show("/lista-de-compra")));
    check("/rebanho (só fazenda) show === hasFazenda", show("/rebanho") === c.hasFazenda, String(show("/rebanho")));
    check("/estoque (só fazenda) show === hasFazenda", show("/estoque") === c.hasFazenda, String(show("/estoque")));
  }
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { isFeatureVisibleForUser, FEATURE_KEYS } = await import("@/lib/features");
  const { setTenantFeatureAction, listTenantFeaturesAction } = await import("@/lib/actions/platform-features");

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mk = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M77 ${rotulo} ${stamp}`, document: `M77${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
      });
      tenantIds.push(t.id);
      const owner = await prisma.user.create({
        data: { tenant_id: t.id, name: `M77 ${rotulo} Dono`, email: `m77-${rotulo}-o-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
      });
      const outro = await prisma.user.create({
        data: { tenant_id: t.id, name: `M77 ${rotulo} Op`, email: `m77-${rotulo}-u-${stamp}@teste.local`, password_hash: "x", role: "OPERADOR" },
      });
      return { t, owner, outro };
    };
    const A = await mk("A");
    const B = await mk("B");
    const ve = (tenant: string, user: string) => isFeatureVisibleForUser(tenant, user, "emporio");
    const perfil = (tenantId: string) =>
      prisma.tenantProfile.findUnique({ where: { tenant_id_profile_type: { tenant_id: tenantId, profile_type: "emporio" } } });

    console.log("\n2. Tenant que nunca ligou");
    {
      const l = await listTenantFeaturesAction(A.t.id);
      check("listTenantFeaturesAction ok", l.ok === true);
      if (l.ok) {
        check("uma entrada por FEATURE_KEYS", l.data.length === FEATURE_KEYS.length, String(l.data.length));
        const e = l.data.find((x: { feature_key: string }) => x.feature_key === "emporio");
        check("emporio vem enabled:false, user_ids:[]", !!e && e.enabled === false && e.user_ids.length === 0, JSON.stringify(e));
      }
      check("ninguém vê", !(await ve(A.t.id, A.owner.id)) && !(await ve(A.t.id, A.outro.id)));
    }

    console.log("\n3. Ligar sem lista: a conta inteira vê");
    {
      const r = await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: true });
      check("ok", r.ok === true, r.ok ? "" : r.message);
      if (r.ok) check("devolve user_ids vazio", r.data.user_ids.length === 0 && r.data.enabled === true);
      check("owner vê", await ve(A.t.id, A.owner.id));
      check("outro usuário vê", await ve(A.t.id, A.outro.id));
      const p = await perfil(A.t.id);
      check("perfil emporio criado e ativo", !!p && p.active === true);
    }

    console.log("\n4. Isolamento: ligar em A não liga em B");
    {
      check("usuário de B não vê", !(await ve(B.t.id, B.owner.id)));
      check("o usuário de A consultado com o tenant de B não vê", !(await ve(B.t.id, A.owner.id)));
      check("B não ganhou perfil emporio", (await perfil(B.t.id)) === null);
    }

    console.log("\n5. Ligar com lista [owner]: só ele vê (a lista substitui)");
    {
      const r = await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: true, user_ids: [A.owner.id] });
      check("ok", r.ok === true, r.ok ? "" : r.message);
      if (r.ok) check("devolve a lista", r.data.user_ids.length === 1 && r.data.user_ids[0] === A.owner.id);
      check("owner vê", await ve(A.t.id, A.owner.id));
      check("o outro usuário NÃO vê", !(await ve(A.t.id, A.outro.id)));
      const l = await listTenantFeaturesAction(A.t.id);
      const e = l.ok ? l.data.find((x: { feature_key: string }) => x.feature_key === "emporio") : undefined;
      check("list reflete a lista", !!e && e.user_ids.length === 1);
    }

    console.log("\n6. Lista vazia religa para todos (substitui, não acumula)");
    {
      const r = await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: true, user_ids: [] });
      check("ok", r.ok === true);
      check("o outro usuário volta a ver", await ve(A.t.id, A.outro.id));
      const n = await prisma.tenantFeatureUser.count({ where: { tenant_id: A.t.id } });
      check("nenhuma linha de TenantFeatureUser sobrou", n === 0, String(n));
    }

    console.log("\n7. user_ids de outro tenant: recusa e nada muda");
    {
      await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: true, user_ids: [A.owner.id] });
      const r = await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: true, user_ids: [B.owner.id] });
      check("VALIDATION_ERROR 422 em user_ids", !r.ok && r.code === "VALIDATION_ERROR" && r.status === 422 && r.field === "user_ids", JSON.stringify(r));
      check("a lista anterior continua valendo", (await ve(A.t.id, A.owner.id)) && !(await ve(A.t.id, A.outro.id)));
      const n = await prisma.tenantFeatureUser.count({ where: { user_id: B.owner.id } });
      check("usuário de B não foi gravado", n === 0);
      const rDesl = await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: false, user_ids: [B.owner.id] });
      check("recusa também ao desligar com lista inválida", !rDesl.ok);
      check("e o recurso segue ligado", await ve(A.t.id, A.owner.id));
    }

    console.log("\n8. Chave e tenant inexistentes");
    {
      const k = await setTenantFeatureAction({ tenantId: A.t.id, key: "inexistente", enabled: true });
      check("chave desconhecida: NOT_FOUND 404", !k.ok && k.code === "NOT_FOUND" && k.status === 404, JSON.stringify(k));
      const linhas = await prisma.tenantFeature.count({ where: { tenant_id: A.t.id, feature_key: "inexistente" } });
      check("nenhuma linha criada para a chave", linhas === 0);
      const t = await setTenantFeatureAction({ tenantId: `nao-existe-${stamp}`, key: "emporio", enabled: true });
      check("tenant inexistente: NOT_FOUND 404", !t.ok && t.code === "NOT_FOUND" && t.status === 404, JSON.stringify(t));
    }

    console.log("\n9. Desligar: ninguém vê, a linha fica");
    {
      const r = await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: false });
      check("ok", r.ok === true);
      check("owner não vê", !(await ve(A.t.id, A.owner.id)));
      check("outro não vê", !(await ve(A.t.id, A.outro.id)));
      const f = await prisma.tenantFeature.findUnique({ where: { tenant_id_feature_key: { tenant_id: A.t.id, feature_key: "emporio" } } });
      check("a linha de TenantFeature continua, enabled=false", !!f && f.enabled === false);
      const p = await perfil(A.t.id);
      check("perfil emporio continua e fica inativo", !!p && p.active === false);
      const l = await listTenantFeaturesAction(A.t.id);
      const e = l.ok ? l.data.find((x: { feature_key: string }) => x.feature_key === "emporio") : undefined;
      check("list devolve enabled:false", !!e && e.enabled === false);
    }

    console.log("\n10. Perfil inativo esconde mesmo com a feature habilitada");
    {
      await setTenantFeatureAction({ tenantId: A.t.id, key: "emporio", enabled: true });
      check("ligado: vê", await ve(A.t.id, A.owner.id));
      await prisma.tenantProfile.update({ where: { tenant_id_profile_type: { tenant_id: A.t.id, profile_type: "emporio" } }, data: { active: false } });
      check("perfil emporio inativo: não vê, apesar do TenantFeature enabled", !(await ve(A.t.id, A.owner.id)));
    }

    console.log("\n11. CHECK do StockMovement: exatamente um entre property_id e establishment_id");
    {
      const db = prismaForTenant(A.t.id);
      const cat = await db.productCategory.create({ data: scoped({ name: "M77 categoria" }) });
      const prod = await db.product.create({ data: scoped({ name: "M77 produto", category_id: cat.id, unit: "saca" }) });
      const fazenda = await db.property.create({ data: scoped({ name: "M77 fazenda" }) });
      const estab = await db.establishment.create({ data: scoped({ name: "M77 loja", kind: "central" }) });
      const base = { product_id: prod.id, movement_type: "compra" as const, quantity: 1, occurred_at: new Date() };
      const tenta = async (extra: Record<string, unknown>) => {
        try {
          await db.stockMovement.create({ data: scoped({ ...base, ...extra }) });
          return true;
        } catch {
          return false;
        }
      };
      check("nenhum dos dois: recusado pelo banco", (await tenta({})) === false);
      check("os dois: recusado pelo banco", (await tenta({ property_id: fazenda.id, establishment_id: estab.id })) === false);
      check("só property_id: passa", (await tenta({ property_id: fazenda.id })) === true);
      check("só establishment_id: passa", (await tenta({ establishment_id: estab.id })) === true);
      const total = await prisma.stockMovement.count({ where: { tenant_id: A.t.id } });
      check("só as duas válidas foram gravadas", total === 2, String(total));
    }

    console.log("\n12. O estoque da fazenda não enxerga o da loja (spec 4.3)");
    {
      const { getStockBalance, listStockMovements } = await import("@/lib/actions/stock-ledger");
      const { listProductsWithBalance } = await import("@/lib/actions/products");
      const { historicoDoDia } = await import("@/lib/actions/meu-dia");
      const { gerarAlertasDeEstoqueMinimo } = await import("@/lib/actions/alerts");

      const C = await mk("C");
      const db = prismaForTenant(C.t.id);
      const cat = await db.productCategory.create({ data: scoped({ name: "M77 cat sal" }) });
      const fazenda = await db.property.create({ data: scoped({ name: "M77 fazenda F" }) });
      const loja = await db.establishment.create({ data: scoped({ name: "M77 loja L", kind: "central" }) });
      const sal15 = await db.product.create({ data: scoped({ name: "M77 Sal 15", category_id: cat.id, unit: "saca", minimum_stock: 15 }) });
      const sal12 = await db.product.create({ data: scoped({ name: "M77 Sal 12", category_id: cat.id, unit: "saca", minimum_stock: 12 }) });
      const quando = new Date();
      for (const p of [sal15, sal12]) {
        await prisma.stockMovement.create({
          data: { tenant_id: C.t.id, product_id: p.id, movement_type: "compra", quantity: 10, occurred_at: quando, property_id: fazenda.id },
        });
        await prisma.stockMovement.create({
          data: { tenant_id: C.t.id, product_id: p.id, movement_type: "compra", quantity: 7, occurred_at: quando, establishment_id: loja.id, property_id: null },
        });
      }

      const todas = await getStockBalance(db, {});
      check("getStockBalance sem filtro: uma posição por produto, nenhuma da loja", todas.length === 2 && todas.every((x) => x.property_id === fazenda.id && x.quantity === 10), JSON.stringify(todas));
      const doProduto = await getStockBalance(db, { product_id: sal15.id });
      check("getStockBalance por produto: uma posição, da fazenda, quantidade 10", doProduto.length === 1 && doProduto[0].property_id === fazenda.id && doProduto[0].quantity === 10, JSON.stringify(doProduto));

      const lista = await listStockMovements(db, {});
      check("listStockMovements sem filtro: só as 2 movimentações da fazenda", lista.total === 2 && lista.items.length === 2, `total=${lista.total}`);
      const listaProd = await listStockMovements(db, { product_id: sal15.id });
      check("listStockMovements por produto: total 1", listaProd.total === 1, `total=${listaProd.total}`);

      const prods = await listProductsWithBalance(db);
      const p15 = prods.find((x) => x.id === sal15.id);
      const p12 = prods.find((x) => x.id === sal12.id);
      check("saldo_total 10 (a loja não soma)", p15?.saldo_total === 10 && p12?.saldo_total === 10, `${p15?.saldo_total}/${p12?.saldo_total}`);
      check("saldo_no_tenant 10", p15?.saldo_no_tenant === 10 && p12?.saldo_no_tenant === 10);
      check("saldo_por_fazenda: só F, sem entrada nula", !!p15 && p15.saldo_por_fazenda.length === 1 && p15.saldo_por_fazenda[0].property_id === fazenda.id && p15.saldo_por_fazenda.every((x) => x.property_id != null), JSON.stringify(p15?.saldo_por_fazenda));
      check("mínimo 15: abaixo_do_minimo (10 < 15)", p15?.abaixo_do_minimo === true);
      check("mínimo 12: abaixo_do_minimo (10 < 12; com a loja seria 17 e não alertaria)", p12?.abaixo_do_minimo === true);

      const hist = await historicoDoDia(db, {});
      const deEstoque = hist.filter((r) => r.chave.toLowerCase().includes("estoque") || r.href.includes("estoque"));
      check("historicoDoDia sem fazenda: 2 registros de estoque (os da fazenda), nenhum da loja", hist.length === 2 && deEstoque.length === 2, `total=${hist.length} estoque=${deEstoque.length} ${JSON.stringify(hist.map((r) => r.chave))}`);

      const criados = await gerarAlertasDeEstoqueMinimo(db, new Date());
      check("alerta de estoque mínimo: 2 alertas (10 < 15 e 10 < 12); com a loja o de 12 sumiria", criados === 2, String(criados));
    }
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.alert.deleteMany({ where: { tenant_id: id } });
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
        await prisma.financialEntry.deleteMany({ where: { tenant_id: id } });
        await prisma.tenantFeatureUser.deleteMany({ where: { tenant_id: id } });
        await prisma.tenantFeature.deleteMany({ where: { tenant_id: id } });
        await prisma.establishment.deleteMany({ where: { tenant_id: id } });
        await prisma.product.deleteMany({ where: { tenant_id: id } });
        await prisma.productCategory.deleteMany({ where: { tenant_id: id } });
        await prisma.property.deleteMany({ where: { tenant_id: id } });
        await prisma.tenant.delete({ where: { id } });
      } catch (e) {
        console.log(`  (limpeza do tenant ${id} falhou: ${e instanceof Error ? e.message : String(e)})`);
      }
    }
    await prisma.$disconnect();
  }
}

comBanco()
  .catch((e) => {
    falhas += 1;
    console.log(`  ❌ a suíte quebrou: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(() => {
    console.log(falhas === 0 ? "\n✅ M77 verde" : `\n❌ M77: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
