import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F6a: produto (saca, fardo, conteúdo, dados) e fim do tipo.
 * Roda: `npm run test:m86`
 *
 * Escrita da spec (docs/specs/module-39-meu-emporio.md, "F6a: contrato", Q121 a Q125),
 * sem ler a implementação. Chama as actions direto, sem rota.
 *
 * Suposições onde a spec não fecha o formato:
 * - `listarProdutosEmporioAction(db, ator, { q, species })`: `species` é UM id, `q` é texto.
 * - A leitura da apresentação é o `data` de `criarApresentacaoAction` e a lista
 *   `presentations` do detalhe (`lerProdutoEmporioAction`); `content_equivalent` é conferido
 *   nos dois lugares onde existir.
 * - `species` no produto é lista de ids (`["cao", "gato"]`), na entrada e na saída.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
type R = { ok: true; data: Dado } | { ok: false; code: string; message: string; status: number; field?: string };
type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
type Ator = { id: string; role: Role };
type Acao = (...args: unknown[]) => Promise<R>;

const perto = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.0005;
const recusa = (r: R, code: string, status: number, field?: string) =>
  !r.ok && r.code === code && r.status === status && (field === undefined || r.field === field);
const j = (x: unknown) => JSON.stringify(x);

console.log("🛍️  M86: Módulo 39 (Meu Empório), F6a: produto e fim do tipo\n");

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const caminhoAcoes = "@/lib/actions/emporio-catalogo";
  const A = (await import(caminhoAcoes)) as Record<string, Acao>;

  const stamp = Date.now();
  const tenantIds: string[] = [];
  try {
    const mkTenant = async (rotulo: string) => {
      const t = await prisma.tenant.create({
        data: { name: `M86 ${rotulo} ${stamp}`, document: `M86${rotulo}${stamp}`.slice(0, 14), plan: "fazenda", status: "trial", trial_ends_at: new Date(Date.now() + 86_400_000) },
      });
      tenantIds.push(t.id);
      const u = await prisma.user.create({
        data: { tenant_id: t.id, name: `M86 ${rotulo} own`, email: `m86-${rotulo}-own-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
      });
      return { t, owner: { id: u.id, role: "OWNER" } as Ator };
    };
    const TA = await mkTenant("A");
    const TB = await mkTenant("B");
    const owner = TA.owner;
    const db = prismaForTenant(TA.t.id);
    const dbB = prismaForTenant(TB.t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M86 categoria" }) });
    const catB = await dbB.productCategory.create({ data: scoped({ name: "M86 categoria B" }) });

    const chamar = (nome: string, ...args: unknown[]) => {
      const f = A[nome];
      if (typeof f !== "function") return Promise.reject(new Error(`action ausente: ${nome}`));
      return f(db, ...args);
    };
    const chamarB = (nome: string, ...args: unknown[]) => A[nome](dbB, ...args);
    const dados = (r: R): Dado => (r.ok ? r.data : undefined);
    const lista = (d: Dado): Dado[] => (Array.isArray(d) ? d : (d?.items ?? []));
    const criar = (input: Dado) => chamar("criarProdutoEmporioAction", owner, { category_id: cat.id, ...input });
    const detalhe = async (pid: string): Promise<Dado> => dados(await chamar("lerProdutoEmporioAction", owner, pid));
    const apresentacoes = async (pid: string): Promise<Dado[]> => (await detalhe(pid))?.presentations ?? [];
    let n = 0;
    const nome = (s: string) => `M86 ${s} ${++n}`;

    console.log("1. Unidade-base: saca e fardo entram, o resto continua fora");
    const rSaca10 = await criar({ name: nome("saca10"), base_unit: "saca", content_qty: 10, content_unit: "quilograma" });
    check("saca aceita", rSaca10.ok, j(rSaca10));
    const rFardo = await criar({ name: nome("fardo"), base_unit: "fardo", content_qty: 12, content_unit: "unidade" });
    check("fardo aceita", rFardo.ok, j(rFardo));
    check("fora da lista (caixa) é 422 no base_unit", recusa(await criar({ name: nome("caixa"), base_unit: "caixa" }), "VALIDATION_ERROR", 422, "base_unit"));
    check("quilograma continua aceita", (await criar({ name: nome("kg"), base_unit: "quilograma" })).ok);

    console.log("\n2. Conteúdo: quando é obrigatório, permitido ou proibido");
    check("saca sem conteúdo: 422 em content_qty", recusa(await criar({ name: nome("s"), base_unit: "saca" }), "VALIDATION_ERROR", 422, "content_qty"));
    check("saca em unidade: 422 em content_unit", recusa(await criar({ name: nome("s"), base_unit: "saca", content_qty: 10, content_unit: "unidade" }), "VALIDATION_ERROR", 422, "content_unit"));
    check("saca em litro aceita", (await criar({ name: nome("sl"), base_unit: "saca", content_qty: 20, content_unit: "litro" })).ok);
    check("fardo em unidade aceita", rFardo.ok);
    check("fardo em quilograma aceita", (await criar({ name: nome("fk"), base_unit: "fardo", content_qty: 5, content_unit: "quilograma" })).ok);
    check("fardo sem conteúdo: 422 em content_qty", recusa(await criar({ name: nome("f"), base_unit: "fardo" }), "VALIDATION_ERROR", 422, "content_qty"));
    check("unidade com conteúdo em kg aceita", (await criar({ name: nome("uk"), base_unit: "unidade", content_qty: 0.5, content_unit: "quilograma" })).ok);
    check("unidade sem conteúdo aceita", (await criar({ name: nome("us"), base_unit: "unidade" })).ok);
    check("quilograma com conteúdo: 422 em content_qty", recusa(await criar({ name: nome("q"), base_unit: "quilograma", content_qty: 1, content_unit: "quilograma" }), "VALIDATION_ERROR", 422, "content_qty"));
    check("litro com conteúdo: 422 em content_qty", recusa(await criar({ name: nome("l"), base_unit: "litro", content_qty: 1, content_unit: "litro" }), "VALIDATION_ERROR", 422, "content_qty"));
    check("content_qty zero: 422 em content_qty", recusa(await criar({ name: nome("z"), base_unit: "saca", content_qty: 0, content_unit: "quilograma" }), "VALIDATION_ERROR", 422, "content_qty"));
    check("content_qty negativo: 422 em content_qty", recusa(await criar({ name: nome("neg"), base_unit: "saca", content_qty: -5, content_unit: "quilograma" }), "VALIDATION_ERROR", 422, "content_qty"));
    check("fardo em unidade fracionado: 422 em content_qty", recusa(await criar({ name: nome("ff"), base_unit: "fardo", content_qty: 12.5, content_unit: "unidade" }), "VALIDATION_ERROR", 422, "content_qty"));

    console.log("\n3. Conteúdo é fixo depois de criado");
    const saca10 = dados(rSaca10);
    const rEdC = await chamar("editarProdutoEmporioAction", owner, saca10.id, { content_qty: 20 });
    check("editar com content_qty: 422 em content_qty", recusa(rEdC, "VALIDATION_ERROR", 422, "content_qty"), j(rEdC));
    check("o conteúdo segue 10", Number((await detalhe(saca10.id))?.content_qty) === 10);

    console.log("\n4. Apresentação automática");
    const pSaca = await apresentacoes(saca10.id);
    check("saca cria exatamente 1 apresentação", pSaca.length === 1, String(pSaca.length));
    check("ela é fechada com base_qty 1", pSaca[0]?.is_sealed_package === true && perto(Number(pSaca[0]?.base_qty), 1), j(pSaca[0]));
    const fardo = dados(rFardo);
    const pFardo = await apresentacoes(fardo.id);
    check("fardo cria exatamente 1 apresentação fechada com base_qty 1", pFardo.length === 1 && pFardo[0]?.is_sealed_package === true && perto(Number(pFardo[0]?.base_qty), 1), j(pFardo));
    const kg = dados(await criar({ name: nome("semauto"), base_unit: "quilograma" }));
    check("quilograma não ganha apresentação automática", (await apresentacoes(kg.id)).length === 0);

    console.log("\n5. Apresentação pelo conteúdo (Q125)");
    const rGranel = await chamar("criarApresentacaoAction", owner, saca10.id, { name: "1 kg", content_qty: 1, is_sealed_package: false });
    check("saca de 10 kg: content_qty 1 aceito", rGranel.ok, j(rGranel));
    check("base_qty vira 0,1", perto(Number(dados(rGranel)?.base_qty), 0.1), j(dados(rGranel)));
    const eqCriar = dados(rGranel)?.content_equivalent;
    const eqLer = (await apresentacoes(saca10.id)).find((p) => p.id === dados(rGranel)?.id)?.content_equivalent;
    check("content_equivalent = 1 (na leitura)", perto(Number(eqLer), 1), j({ eqCriar, eqLer }));
    const rBoth = await chamar("criarApresentacaoAction", owner, saca10.id, { name: "Ambos", content_qty: 1, base_qty: 0.1, is_sealed_package: false });
    check("content_qty e base_qty juntos: 422", !rBoth.ok && rBoth.status === 422, j(rBoth));

    const saca30 = dados(await criar({ name: nome("saca30"), base_unit: "saca", content_qty: 30, content_unit: "quilograma" }));
    check("saca de 30 kg: 1 kg (0,0333) é 422 em content_qty", recusa(await chamar("criarApresentacaoAction", owner, saca30.id, { name: "1 kg", content_qty: 1, is_sealed_package: false }), "VALIDATION_ERROR", 422, "content_qty"));
    check("saca de 30 kg: 5 kg (0,1667) também é 422 em content_qty", recusa(await chamar("criarApresentacaoAction", owner, saca30.id, { name: "5 kg", content_qty: 5, is_sealed_package: false }), "VALIDATION_ERROR", 422, "content_qty"));
    const r15 = await chamar("criarApresentacaoAction", owner, saca30.id, { name: "15 kg", content_qty: 15, is_sealed_package: false });
    check("saca de 30 kg: 15 kg aceito com base_qty 0,5", r15.ok && perto(Number(dados(r15)?.base_qty), 0.5), j(r15));
    check("nada foi gravado pelas recusas (1 automática + 15 kg)", (await apresentacoes(saca30.id)).length === 2);

    const rKgBase = await chamar("criarApresentacaoAction", owner, kg.id, { name: "Meio quilo", base_qty: 0.5, is_sealed_package: false });
    check("produto sem conteúdo aceita base_qty", rKgBase.ok, j(rKgBase));
    const eqNulo = dados(rKgBase)?.content_equivalent;
    const eqNuloLer = (await apresentacoes(kg.id)).find((p) => p.id === dados(rKgBase)?.id)?.content_equivalent;
    check("content_equivalent nulo quando o produto não tem conteúdo", (eqNulo ?? null) === null && (eqNuloLer ?? null) === null, j({ eqNulo, eqNuloLer }));

    console.log("\n6. Dados do produto (Q124)");
    const rDados = await criar({ name: nome("dados"), base_unit: "unidade", brand: "MarcaZ86", manufacturer: "FabricaZ86", internal_code: `COD-${stamp}`, species: ["cao", "gato"] });
    check("cria com marca, fabricante, código e espécie", rDados.ok, j(rDados));
    const pd = dados(rDados);
    const lido = await detalhe(pd.id);
    check("leitura devolve os quatro", lido?.brand === "MarcaZ86" && lido?.manufacturer === "FabricaZ86" && lido?.internal_code === `COD-${stamp}` && j([...(lido?.species ?? [])].sort()) === j(["cao", "gato"]), j(lido));
    const rEd = await chamar("editarProdutoEmporioAction", owner, pd.id, { brand: "Outra86", manufacturer: "Outra Fab", internal_code: `COD2-${stamp}`, species: ["bovino"] });
    check("edita os quatro", rEd.ok, j(rEd));
    const lido2 = await detalhe(pd.id);
    check("e a leitura reflete", lido2?.brand === "Outra86" && lido2?.manufacturer === "Outra Fab" && lido2?.internal_code === `COD2-${stamp}` && j(lido2?.species) === j(["bovino"]), j(lido2));
    const rDup = await criar({ name: nome("dup"), base_unit: "unidade", internal_code: `COD2-${stamp}` });
    check("código repetido na conta: 409 DUPLICATE_CODE no internal_code", recusa(rDup, "DUPLICATE_CODE", 409, "internal_code"), j(rDup));
    const outro = dados(await criar({ name: nome("outro"), base_unit: "unidade", internal_code: `OUTRO-${stamp}` }));
    const rDupEd = await chamar("editarProdutoEmporioAction", owner, outro.id, { internal_code: `COD2-${stamp}` });
    check("editar para código repetido: 409 DUPLICATE_CODE", recusa(rDupEd, "DUPLICATE_CODE", 409, "internal_code"), j(rDupEd));
    const rAparado = await criar({ name: nome("aparado"), base_unit: "unidade", internal_code: `  COD2-${stamp}  ` });
    check("o código é aparado antes de comparar (repetido mesmo com espaços)", recusa(rAparado, "DUPLICATE_CODE", 409, "internal_code"), j(rAparado));
    const rB = await A["criarProdutoEmporioAction"](dbB, TB.owner, { name: nome("outraconta"), category_id: catB.id, base_unit: "unidade", internal_code: `COD2-${stamp}` });
    check("o mesmo código em OUTRA conta é aceito", rB.ok, j(rB));
    check("espécie fora da lista: 422 em species", recusa(await criar({ name: nome("esp"), base_unit: "unidade", species: ["dragao"] }), "VALIDATION_ERROR", 422, "species"));
    check("espécie fora da lista na edição: 422 em species", recusa(await chamar("editarProdutoEmporioAction", owner, pd.id, { species: ["dragao"] }), "VALIDATION_ERROR", 422, "species"));
    check("marca com mais de 80 caracteres: 422 em brand", recusa(await criar({ name: nome("longa"), base_unit: "unidade", brand: "x".repeat(81) }), "VALIDATION_ERROR", 422, "brand"));

    console.log("\n7. Busca e filtro de espécie");
    const rAc = await criar({ name: `M86 Ração Acentuada ${stamp}`, base_unit: "unidade", brand: `Marquinha${stamp}`, manufacturer: `Fabricante${stamp}`, internal_code: `ZZ-${stamp}`, species: ["equino"] });
    const ac = dados(rAc);
    const achar = async (filtro: Dado) => lista(dados(await chamar("listarProdutosEmporioAction", owner, filtro))).map((p) => p.id);
    check("q acha pelo nome sem acento (racao acentuada)", (await achar({ q: `racao acentuada ${stamp}` })).includes(ac.id));
    check("q acha pela marca", (await achar({ q: `marquinha${stamp}` })).includes(ac.id));
    check("q acha pelo fabricante", (await achar({ q: `fabricante${stamp}` })).includes(ac.id));
    check("q acha pelo código interno", (await achar({ q: `zz-${stamp}` })).includes(ac.id));
    check("q que não casa não devolve o produto", !(await achar({ q: `inexistente${stamp}` })).includes(ac.id));
    const filtrados = await achar({ species: "equino" });
    check("species filtra: traz o equino", filtrados.includes(ac.id));
    check("species filtra: não traz quem é de bovino", !filtrados.includes(pd.id));
    check("sem filtro traz os dois", (await achar({})).includes(pd.id));

    console.log("\n8. Estabelecimento sem tipo (Q121)");
    const rE = await chamar("criarEstabelecimentoAction", owner, { name: "M86 Loja sem tipo" });
    check("criar sem kind funciona", rE.ok, j(rE));
    const rEk = await chamar("criarEstabelecimentoAction", owner, { name: "M86 Loja com tipo", kind: "central" });
    check("mandar kind é ignorado, não é erro", rEk.ok, j(rEk));
    const lidaE = dados(await chamar("lerEstabelecimentoAction", owner, dados(rEk)?.id));
    check("a leitura não devolve kind", lidaE && !("kind" in lidaE), j(lidaE));
    check("a criação não devolve kind", !("kind" in (dados(rEk) ?? {})), j(dados(rEk)));
    const rEdE = await chamar("editarEstabelecimentoAction", owner, dados(rE)?.id, { name: "M86 Loja renomeada", kind: "ponto_venda" });
    check("editar com kind é ignorado, não é erro", rEdE.ok, j(rEdE));
    const lidaE2 = dados(await chamar("lerEstabelecimentoAction", owner, dados(rE)?.id));
    check("e a leitura segue sem kind", lidaE2?.name === "M86 Loja renomeada" && !("kind" in lidaE2), j(lidaE2));
    const naLista = lista(dados(await chamar("listarEstabelecimentosAction", owner)));
    check("a lista também não devolve kind", naLista.length > 0 && naLista.every((e) => !("kind" in e)));
    const gravado = await prisma.establishment.findFirst({ where: { id: dados(rEk)?.id } });
    check("e nada foi gravado no banco (kind nulo)", gravado !== null && ((gravado as Dado).kind ?? null) === null, j((gravado as Dado)?.kind));
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
        await prisma.presentationPrice.deleteMany({ where: { tenant_id: id } });
        await prisma.productPresentation.deleteMany({ where: { tenant_id: id } });
        await prisma.userEstablishment.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioProduct.deleteMany({ where: { tenant_id: id } });
        await prisma.product.deleteMany({ where: { tenant_id: id } });
        await prisma.establishment.deleteMany({ where: { tenant_id: id } });
        await prisma.productCategory.deleteMany({ where: { tenant_id: id } });
        await prisma.property.deleteMany({ where: { tenant_id: id } });
        await prisma.tenant.delete({ where: { id } });
      } catch (e) {
        falhas += 1;
        console.log(`  ❌ limpeza do tenant ${id} falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
    check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
    await prisma.$disconnect();
  }
}

comBanco()
  .catch((e) => {
    falhas += 1;
    console.log(`  ❌ a suíte quebrou: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(() => {
    console.log(falhas === 0 ? "\n✅ M86 verde" : `\n❌ M86: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
