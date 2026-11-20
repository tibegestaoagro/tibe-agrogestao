import "./_env-local";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";

/**
 * Monta, no banco LOCAL, o cenario do balcao rapido do Meu Emporio (frente D, Q357 a Q361) para o roteiro
 * `scripts/navegador/emporio-balcao-rapido.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Br ". Cria loja, produtos, usuario e a configuracao do balcao em estado
 * conhecido:
 *   - "Br Loja 1" com o turno do Caixa 1 aberto;
 *   - "Br Milho" (estoque a granel): "Pacote 1 kg" (R$ 10,00, a padrao: a de menor quantidade) com o codigo
 *     7891000100103 e "Saco 25 kg" (R$ 200,00) com o codigo 5901234123457; os dois sao EAN-13 oficiais;
 *   - "Br Americano": "Unidade" com o UPC-A 036000291452 gravado como 0036000291452 (R$ 7,00);
 *   - "Br Caro": "Unidade" com codigo e SEM preco na loja;
 *   - "Br Cadastro": "Pacote 1 kg" sem codigo (o roteiro cadastra apresentacoes novas nele);
 *   - para as etiquetas: "Br Etq Oficial" (EAN-13 4006381333931, R$ 12,90), "Br Etq Gerada" (codigo "20..." gerado
 *     pelo servidor, R$ 89,90), "Br Etq Curto" (EAN-8 96385074, R$ 5,50), "Br Etq Sem Preco" (com codigo, sem
 *     preco) e "Br Etq Sem Codigo" (com preco, sem codigo, R$ 3,00);
 *   - o cliente "Br Maria";
 *   - br-gestor@teste.local (Gestor da Br Loja 1, sem a chave `conta`).
 *
 * Mexe nas CONFIGURACOES DO EMPORIO da conta (atalhos e medidas das etiquetas): guarda os valores de antes em
 * `tibe-br-config-original.json` (na pasta temporaria, so na primeira vez) e os poe nos padroes da spec; o `--limpar`
 * devolve o que guardou. Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Br ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAIL_GESTOR = "br-gestor@teste.local";
const EMAIL_CAIXA = "br-caixa@teste.local";
const COPIA = join(tmpdir(), "tibe-br-config-original.json");

const CAMPOS_DA_CONFIG = [
  "shortcut_product",
  "shortcut_customer",
  "shortcut_seller",
  "shortcut_payment",
  "shortcut_close",
  "show_shortcut_legend",
  "label_default_format",
  "label_a4_columns",
  "label_a4_rows",
  "label_a4_width",
  "label_a4_height",
  "label_a4_margin_top",
  "label_a4_margin_left",
  "label_a4_gap_x",
  "label_a4_gap_y",
  "label_roll_width",
  "label_roll_height",
  "label_roll_columns",
  "label_roll_gap_x",
] as const;

/** Os padroes da spec (os mesmos do `@default` do schema). */
const PADROES = {
  shortcut_product: "F2",
  shortcut_customer: "F4",
  shortcut_seller: "F8",
  shortcut_payment: "F9",
  shortcut_close: "Ctrl+Enter",
  show_shortcut_legend: true,
  label_default_format: "a4",
  label_a4_columns: 3,
  label_a4_rows: 7,
  label_a4_width: 63.5,
  label_a4_height: 38.1,
  label_a4_margin_top: 15.15,
  label_a4_margin_left: 7.2,
  label_a4_gap_x: 2.5,
  label_a4_gap_y: 0,
  label_roll_width: 40,
  label_roll_height: 25,
  label_roll_columns: 1,
  label_roll_gap_x: 2,
};

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

/** Guarda as configuracoes de antes (so se ainda nao guardou) e poe os padroes. Sem linha, so cria com os padroes. */
async function guardarEPorPadroes(tenant_id: string) {
  if (!existsSync(COPIA)) {
    const linha = await prisma.emporioSettings.findFirst({ where: { tenant_id } });
    const guardado = linha ? Object.fromEntries(CAMPOS_DA_CONFIG.map((c) => [c, (linha as Record<string, unknown>)[c]])) : null;
    writeFileSync(COPIA, JSON.stringify({ tenant_id, linha_existia: !!linha, guardado }), "utf8");
  }
  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: PADROES as never,
    create: { tenant_id, ...PADROES } as never,
  });
}

/** Devolve o que `guardarEPorPadroes` guardou e apaga a copia. Sem copia, nao mexe em nada. */
async function devolverConfiguracoes() {
  if (!existsSync(COPIA)) {
    console.log("Nenhuma copia das configuracoes guardada: nada a devolver.");
    return;
  }
  const c = JSON.parse(readFileSync(COPIA, "utf8")) as { tenant_id: string; linha_existia: boolean; guardado: Record<string, unknown> | null };
  if (c.guardado) await prisma.emporioSettings.updateMany({ where: { tenant_id: c.tenant_id }, data: c.guardado as never });
  else await prisma.emporioSettings.updateMany({ where: { tenant_id: c.tenant_id }, data: PADROES as never });
  rmSync(COPIA);
  console.log(c.linha_existia ? "Configuracoes do Emporio devolvidas ao que eram." : "A conta nao tinha linha de configuracoes: ficaram nos padroes.");
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const apresentacoes = (
    await prisma.productPresentation.findMany({ where: { tenant_id, emporio_product_id: { in: emporio } }, select: { id: true } })
  ).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] }, select: { id: true } })
  ).map((l) => l.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { sale_id: { in: vendas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas, ...emporio, ...apresentacoes] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { presentation_id: { in: apresentacoes } }] } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, id: { in: apresentacoes } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await limparTaxasDeCenario(prisma, { tenant_id, establishment_ids: lojas });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);
  if (process.argv.includes("--limpar")) {
    await devolverConfiguracoes();
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id);
    await prisma.$disconnect();
    return;
  }

  await guardarEPorPadroes(tenant_id);

  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], emporio_role: "gestor" as const, emporio_only: false };
  const gestor = await prisma.user.upsert({
    where: { email: EMAIL_GESTOR },
    update: dados,
    create: { ...dados, email: EMAIL_GESTOR, name: "Br Gestor", password_hash: SENHA_INUTIL },
  });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` } as never), "loja") as { id: string }).id;
  const caixa = await prisma.user.upsert({
    where: { email: EMAIL_CAIXA },
    update: { ...dados, emporio_role: "caixa" as const },
    create: { ...dados, emporio_role: "caixa" as const, email: EMAIL_CAIXA, name: "Br Caixa", password_hash: SENHA_INUTIL },
  });
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor.id, establishment_id: loja },
      { tenant_id, user_id: caixa.id, establishment_id: loja },
    ],
  });

  const produto = async (nome: string, unidade: "quilograma" | "unidade") =>
    (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: unidade } as never), nome) as { id: string }).id;
  const apresentacao = async (produto_id: string, nome: string, base_qty: number, barcode: string | null, preco: number | null) => {
    const corpo: Record<string, unknown> = { name: nome, base_qty, is_sealed_package: false };
    if (barcode) corpo.barcode = barcode;
    const id = (exigir(await cat.criarApresentacaoAction(db, dono, produto_id, corpo as never), `${nome} (${barcode ?? "sem codigo"})`) as { id: string }).id;
    if (preco !== null) exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: id, price: preco }), "preco");
    return id;
  };

  const milho = await produto("Milho", "quilograma");
  await apresentacao(milho, "Pacote 1 kg", 1, "7891000100103", 10);
  await apresentacao(milho, "Saco 25 kg", 25, "5901234123457", 200);
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: milho, sealed: [], loose_qty: 100000, unit_cost: 4 } as never), "estoque");

  await apresentacao(await produto("Americano", "unidade"), "Unidade", 1, "0036000291452", 7);
  await apresentacao(await produto("Caro", "unidade"), "Unidade", 1, "9780201379624", null);
  await apresentacao(await produto("Cadastro", "quilograma"), "Pacote 1 kg", 1, null, null);

  await apresentacao(await produto("Etq Oficial", "unidade"), "Unidade", 1, "4006381333931", 12.9);
  const gerado = exigir(await cat.gerarCodigoDeBarrasAction(db, dono), "gerar codigo").barcode;
  await apresentacao(await produto("Etq Gerada", "unidade"), "Unidade", 1, gerado, 89.9);
  await apresentacao(await produto("Etq Curto", "unidade"), "Unidade", 1, "96385074", 5.5);
  await apresentacao(await produto("Etq Sem Preco", "unidade"), "Unidade", 1, "9788535902778", null);
  await apresentacao(await produto("Etq Sem Codigo", "unidade"), "Unidade", 1, null, 3);

  // Desarquivar com o codigo tomado: "Saco antigo" (arquivada) tinha 7891000200117; outra apresentacao ativa ficou com ele.
  const tomado = await produto("Tomado", "unidade");
  const antiga = await apresentacao(tomado, "Saco antigo", 1, "7891000200117", null);
  exigir(await cat.arquivarApresentacaoAction(db, dono, antiga, true), "arquivar a apresentacao antiga");
  await apresentacao(tomado, "Saco novo", 1, "7891000200117", null);

  await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Maria`, person_kind: "pf", phone: "34990000096" } as never });
  await abrirTurnoDeTeste(db, dono, loja);

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja, "Gestor:", EMAIL_GESTOR, "Codigo gerado para a Br Etq Gerada:", gerado);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
